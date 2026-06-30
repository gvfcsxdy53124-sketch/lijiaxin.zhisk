import { env, pipeline } from '@xenova/transformers';
import ortWasm from 'onnxruntime-web/dist/ort-wasm.wasm?url';
import ortWasmSimd from 'onnxruntime-web/dist/ort-wasm-simd.wasm?url';

export interface AudioTranscriptSegment {
  time: string;
  text: string;
  startSeconds?: number;
  endSeconds?: number;
}

export interface AudioTranscriptionResult {
  status: 'processing' | 'ready' | 'empty' | 'failed';
  text: string;
  segments: AudioTranscriptSegment[];
  message?: string;
  provider: 'configured-api' | 'browser-whisper-tiny' | 'unavailable';
}

interface TranscribeOptions {
  languageMode?: string;
}

type WhisperOutput = {
  text?: string;
  chunks?: Array<{
    text?: string;
    timestamp?: [number | null, number | null];
    timestamps?: [number | null, number | null];
  }>;
};

type ApiTranscriptSegment = {
  time?: string;
  timestamp?: string;
  text?: string;
  start?: number;
  end?: number;
  startSeconds?: number;
  endSeconds?: number;
};

type ApiTranscriptionOutput = {
  text?: string;
  segments?: ApiTranscriptSegment[];
  message?: string;
};

const WHISPER_MODEL = 'Xenova/whisper-tiny';
const TARGET_SAMPLE_RATE = 16000;
const MAX_FAST_TRANSCRIBE_SECONDS = 180;
const CONFIGURED_ASR_ENDPOINT = (import.meta.env.VITE_ASR_ENDPOINT || (import.meta.env.DEV ? '/api/asr' : '')).trim();

let transcriberPromise: Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>> | null = null;

const normalizeTranscriptText = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？；：,.!?;:])/g, '$1')
    .trim();

const formatAsrTimestamp = (seconds?: number | null) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const restSeconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
};

const mapLanguageMode = (languageMode?: string) => {
  if (languageMode === 'zh') return 'chinese';
  if (languageMode === 'en') return 'english';
  return undefined;
};

const configureTransformersRuntime = () => {
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.wasmPaths = {
      'ort-wasm.wasm': ortWasm,
      'ort-wasm-simd.wasm': ortWasmSimd
    };
  }
};

const getBrowserTranscriber = async () => {
  if (typeof window === 'undefined') {
    throw new Error('当前运行环境不支持浏览器端音视频识别。');
  }

  if (!transcriberPromise) {
    configureTransformersRuntime();
    transcriberPromise = pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      quantized: true
    }).catch((error) => {
      transcriberPromise = null;
      throw error;
    }) as Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>>;
  }

  return transcriberPromise;
};

const resampleMonoTo16k = (audioBuffer: AudioBuffer) => {
  const maxFrameCount = TARGET_SAMPLE_RATE * MAX_FAST_TRANSCRIBE_SECONDS;
  const targetFrameCount = Math.min(maxFrameCount, Math.max(1, Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE)));
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index));
  const ratio = audioBuffer.sampleRate / TARGET_SAMPLE_RATE;
  const resampled = new Float32Array(targetFrameCount);

  for (let index = 0; index < targetFrameCount; index += 1) {
    const sourceIndex = Math.min(audioBuffer.length - 1, Math.floor(index * ratio));
    resampled[index] = channels.reduce((sum, channel) => sum + channel[sourceIndex], 0) / channels.length;
  }

  return resampled;
};

const decodeAudioToMono16k = async (file: File) => {
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error('当前浏览器不支持音频解码。');
  }

  const audioContext = new AudioContextCtor();
  try {
    const decodedBuffer = await audioContext.decodeAudioData(await file.arrayBuffer());
    return resampleMonoTo16k(decodedBuffer);
  } finally {
    void audioContext.close?.();
  }
};

const buildSegmentsFromWhisperChunks = (chunks?: WhisperOutput['chunks']) =>
  (chunks || [])
    .map((chunk, index) => {
      const text = normalizeTranscriptText(chunk.text || '');
      const timestamp = chunk.timestamp || chunk.timestamps || [index * 30, null];
      const startSeconds = typeof timestamp[0] === 'number' ? timestamp[0] : index * 30;
      const endSeconds = typeof timestamp[1] === 'number' ? timestamp[1] : undefined;
      return {
        time: formatAsrTimestamp(startSeconds),
        text,
        startSeconds,
        endSeconds
      };
    })
    .filter(segment => segment.text);

const buildApproxSegments = (text: string, totalSeconds = MAX_FAST_TRANSCRIBE_SECONDS): AudioTranscriptSegment[] => {
  const normalized = normalizeTranscriptText(text);
  if (!normalized) return [];

  const parts = normalized
    .split(/(?<=[。！？.!?])\s*/)
    .map(part => part.trim())
    .filter(Boolean);
  const segments = parts.length > 0 ? parts : [normalized];
  const stepSeconds = Math.max(6, Math.floor(Math.min(totalSeconds, MAX_FAST_TRANSCRIBE_SECONDS) / Math.max(segments.length, 1)));

  return segments.map((segment, index) => ({
    time: formatAsrTimestamp(index * stepSeconds),
    text: segment,
    startSeconds: index * stepSeconds,
    endSeconds: (index + 1) * stepSeconds
  }));
};

const mapApiSegments = (segments: ApiTranscriptSegment[] = []) =>
  segments
    .map((segment, index) => {
      const startSeconds =
        typeof segment.startSeconds === 'number'
          ? segment.startSeconds
          : typeof segment.start === 'number'
            ? segment.start
            : undefined;
      const endSeconds =
        typeof segment.endSeconds === 'number'
          ? segment.endSeconds
          : typeof segment.end === 'number'
            ? segment.end
            : undefined;
      return {
        time: segment.time || segment.timestamp || formatAsrTimestamp(startSeconds ?? index * 30),
        text: normalizeTranscriptText(segment.text || ''),
        startSeconds,
        endSeconds
      };
    })
    .filter(segment => segment.text);

const readResponseMessage = async (response: Response) => {
  try {
    const data = await response.json() as { message?: string; error?: string };
    return data.message || data.error || '';
  } catch {
    return '';
  }
};

const transcribeWithConfiguredApi = async (file: File, options: TranscribeOptions = {}) => {
  if (!CONFIGURED_ASR_ENDPOINT) return null;

  const formData = new FormData();
  formData.append('file', file, file.name);
  if (options.languageMode) formData.append('languageMode', options.languageMode);

  const response = await fetch(CONFIGURED_ASR_ENDPOINT, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(message || `ASR 接口返回 ${response.status}，请检查本地转写服务或 VITE_ASR_ENDPOINT 配置。`);
  }

  const data = await response.json() as ApiTranscriptionOutput;
  const text = normalizeTranscriptText(data.text || '');
  const segments = mapApiSegments(data.segments);
  const finalSegments = segments.length > 0 ? segments : buildApproxSegments(text);

  if (!text && finalSegments.length === 0) {
    return {
      status: 'empty',
      text: '',
      segments: [],
      message: data.message || 'ASR 接口没有返回可用的真实转写内容。',
      provider: 'configured-api'
    } satisfies AudioTranscriptionResult;
  }

  return {
    status: 'ready',
    text: text || finalSegments.map(segment => segment.text).join(' '),
    segments: finalSegments,
    message: data.message || `ASR 已完成转写，生成 ${finalSegments.length} 个时间片段。`,
    provider: 'configured-api'
  } satisfies AudioTranscriptionResult;
};

const getFailureMessage = (error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const lowerMessage = rawMessage.toLowerCase();
  if (/failed to fetch|load failed|network|err_|timeout|cors/.test(lowerMessage)) {
    return CONFIGURED_ASR_ENDPOINT
      ? 'ASR 接口请求失败，请检查本地开发服务是否已启动，或确认接口地址、跨域配置和服务状态。'
      : '浏览器端 ASR 模型下载失败。请配置 VITE_ASR_ENDPOINT 后端转写接口，或确认当前电脑可以访问模型资源后重试。';
  }
  if (/decode|encoding|audio|media|codec|format|demux|unable to decode/.test(lowerMessage)) {
    return '无法解码这个音视频文件。请上传 mp3、wav、m4a、mp4 等常见格式，或确认文件没有损坏。';
  }
  if (/memory|allocation|out of bounds|too large/.test(lowerMessage)) {
    return '音视频文件过大，当前本地 ASR 识别内存不足。请先上传较短片段测试，或接入正式后端 ASR 服务。';
  }
  return rawMessage ? `ASR 转写失败：${rawMessage}` : 'ASR 转写失败，请稍后重试。';
};

const runFastTranscriber = async (
  transcriber: (input: unknown, options?: Record<string, unknown>) => Promise<unknown>,
  input: unknown,
  languageMode?: string
) => {
  const language = mapLanguageMode(languageMode);
  return await transcriber(input, {
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(language ? { language } : {})
  }) as WhisperOutput;
};

export const transcribeAudioFile = async (file: File, options: TranscribeOptions = {}): Promise<AudioTranscriptionResult> => {
  if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !/\.(mp3|wav|m4a|amr|mp4|mov|avi)$/i.test(file.name)) {
    return {
      status: 'failed',
      text: '',
      segments: [],
      message: '当前文件不是可识别的音视频格式。',
      provider: 'unavailable'
    };
  }

  let objectUrl = '';
  try {
    const apiResult = await transcribeWithConfiguredApi(file, options);
    if (apiResult) return apiResult;

    const transcriber = await getBrowserTranscriber();
    let output: WhisperOutput | null = null;
    let decodeError: unknown = null;

    try {
      const pcmAudio = await decodeAudioToMono16k(file);
      output = await runFastTranscriber(transcriber, pcmAudio, options.languageMode);
    } catch (error) {
      decodeError = error;
    }

    if (!output) {
      objectUrl = URL.createObjectURL(file);
      try {
        output = await runFastTranscriber(transcriber, objectUrl, options.languageMode);
      } catch (error) {
        throw decodeError || error;
      }
    }

    const text = normalizeTranscriptText(output.text || '');
    const segments = buildSegmentsFromWhisperChunks(output.chunks);
    const finalSegments = segments.length > 0 ? segments : buildApproxSegments(text);

    if (!text && finalSegments.length === 0) {
      return {
        status: 'empty',
        text: '',
        segments: [],
        message: '没有识别到清晰语音内容，请上传包含清晰人声的音视频文件，或接入后端 ASR 服务重试。',
        provider: 'browser-whisper-tiny'
      };
    }

    return {
      status: 'ready',
      text: text || finalSegments.map(segment => segment.text).join(' '),
      segments: finalSegments,
      message: `已完成 ASR 转写，生成 ${finalSegments.length} 个时间片段。`,
      provider: 'browser-whisper-tiny'
    };
  } catch (error) {
    return {
      status: 'failed',
      text: '',
      segments: [],
      message: getFailureMessage(error),
      provider: 'unavailable'
    };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
};
