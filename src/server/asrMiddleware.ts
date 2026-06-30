import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { env, pipeline } from '@xenova/transformers';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

type Transcriber = (input: unknown, options?: Record<string, unknown>) => Promise<unknown>;

type WhisperOutput = {
  text?: string;
  chunks?: Array<{
    text?: string;
    timestamp?: [number | null, number | null];
    timestamps?: [number | null, number | null];
  }>;
};

type UploadedFile = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

type MultipartData = {
  fields: Record<string, string>;
  file?: UploadedFile;
};

const WHISPER_MODEL = process.env.LOCAL_ASR_MODEL || 'Xenova/whisper-tiny';
const REMOTE_MODEL_HOST = process.env.LOCAL_ASR_REMOTE_HOST || 'https://hf-mirror.com/';
const TARGET_SAMPLE_RATE = 16000;
const MAX_UPLOAD_BYTES = Number(process.env.LOCAL_ASR_MAX_UPLOAD_MB || 512) * 1024 * 1024;
const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'transformers');

let transcriberPromise: Promise<Transcriber> | null = null;

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const formatTimestamp = (seconds?: number | null) => {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const restSeconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
};

const normalizeTranscriptText = (text: string) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？；：,.!?;:])/g, '$1')
    .trim();

const mapLanguageMode = (languageMode?: string) => {
  if (languageMode === 'zh') return 'chinese';
  if (languageMode === 'en') return 'english';
  return undefined;
};

const configureTransformersRuntime = () => {
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.remoteHost = REMOTE_MODEL_HOST;
  env.useFSCache = true;
  env.cacheDir = CACHE_DIR;
};

const getTranscriber = async () => {
  if (!transcriberPromise) {
    configureTransformersRuntime();
    transcriberPromise = pipeline('automatic-speech-recognition', WHISPER_MODEL, {
      quantized: true
    }).catch((error) => {
      transcriberPromise = null;
      throw error;
    }) as Promise<Transcriber>;
  }
  return transcriberPromise;
};

const readRequestBody = async (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_UPLOAD_BYTES) {
        reject(new Error(`上传文件超过本地 ASR 限制 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB。`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const getMultipartBoundary = (contentType = '') => {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] || match?.[2] || '';
};

const parseContentDisposition = (header = '') => {
  const name = header.match(/name="([^"]+)"/i)?.[1] || '';
  const filename = header.match(/filename="([^"]*)"/i)?.[1] || '';
  return { name, filename };
};

const parseMultipart = (body: Buffer, boundary: string): MultipartData => {
  const result: MultipartData = { fields: {} };
  const boundaryText = `--${boundary}`;
  const bodyText = body.toString('latin1');
  let cursor = 0;

  while (cursor < bodyText.length) {
    const boundaryIndex = bodyText.indexOf(boundaryText, cursor);
    if (boundaryIndex === -1) break;

    let partStart = boundaryIndex + boundaryText.length;
    if (bodyText.slice(partStart, partStart + 2) === '--') break;
    if (bodyText.slice(partStart, partStart + 2) === '\r\n') partStart += 2;

    const headerEnd = bodyText.indexOf('\r\n\r\n', partStart);
    if (headerEnd === -1) break;

    const nextBoundary = bodyText.indexOf(`\r\n${boundaryText}`, headerEnd + 4);
    if (nextBoundary === -1) break;

    const headers = bodyText.slice(partStart, headerEnd);
    const content = body.subarray(headerEnd + 4, nextBoundary);
    const disposition = headers.match(/^content-disposition:\s*(.+)$/im)?.[1] || '';
    const contentType = headers.match(/^content-type:\s*(.+)$/im)?.[1]?.trim() || 'application/octet-stream';
    const { name, filename } = parseContentDisposition(disposition);

    if (name) {
      if (filename) {
        result.file = {
          filename,
          contentType,
          buffer: content
        };
      } else {
        result.fields[name] = content.toString('utf8').trim();
      }
    }

    cursor = nextBoundary + 2;
  }

  return result;
};

const decodeToPcm = async (file: UploadedFile) => {
  const tempDir = path.join(os.tmpdir(), 'knowledge-asr');
  await mkdir(tempDir, { recursive: true });

  const extension = path.extname(file.filename).replace(/[^.\w-]/g, '') || '.media';
  const inputPath = path.join(tempDir, `${randomUUID()}${extension}`);
  await writeFile(inputPath, file.buffer);

  try {
    const pcmBuffer = await new Promise<Buffer>((resolve, reject) => {
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const child = spawn(ffmpegInstaller.path, [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vn',
        '-acodec',
        'pcm_f32le',
        '-ac',
        '1',
        '-ar',
        String(TARGET_SAMPLE_RATE),
        '-f',
        'f32le',
        'pipe:1'
      ], { windowsHide: true });

      child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdout));
          return;
        }
        reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `ffmpeg 解码失败，退出码 ${code}`));
      });
    });

    const alignedLength = pcmBuffer.byteLength - (pcmBuffer.byteLength % 4);
    const arrayBuffer = pcmBuffer.buffer.slice(pcmBuffer.byteOffset, pcmBuffer.byteOffset + alignedLength);
    return new Float32Array(arrayBuffer);
  } finally {
    await rm(inputPath, { force: true });
  }
};

const buildSegmentsFromChunks = (chunks: WhisperOutput['chunks'] = []) =>
  chunks
    .map((chunk, index) => {
      const timestamp = chunk.timestamp || chunk.timestamps || [index * 30, null];
      const startSeconds = typeof timestamp[0] === 'number' ? timestamp[0] : index * 30;
      const endSeconds = typeof timestamp[1] === 'number' ? timestamp[1] : undefined;
      return {
        time: formatTimestamp(startSeconds),
        startSeconds,
        endSeconds,
        text: normalizeTranscriptText(chunk.text || '')
      };
    })
    .filter(segment => segment.text);

const buildApproxSegments = (text: string, durationSeconds: number) => {
  const normalized = normalizeTranscriptText(text);
  if (!normalized) return [];

  const parts = normalized
    .split(/(?<=[。！？.!?])\s*/)
    .map(part => part.trim())
    .filter(Boolean);
  const segments = parts.length > 0 ? parts : [normalized];
  const stepSeconds = Math.max(6, Math.floor(durationSeconds / Math.max(segments.length, 1)));

  return segments.map((segment, index) => ({
    time: formatTimestamp(index * stepSeconds),
    startSeconds: index * stepSeconds,
    endSeconds: Math.min(durationSeconds, (index + 1) * stepSeconds),
    text: segment
  }));
};

const runAsr = async (file: UploadedFile, languageMode?: string) => {
  const waveform = await decodeToPcm(file);
  const durationSeconds = waveform.length / TARGET_SAMPLE_RATE;

  if (waveform.length === 0 || durationSeconds < 0.1) {
    throw new Error('没有从文件中读取到可识别的音频轨道。');
  }

  const transcriber = await getTranscriber();
  const language = mapLanguageMode(languageMode);
  const output = await transcriber(waveform, {
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(language ? { language } : {})
  }) as WhisperOutput;

  const text = normalizeTranscriptText(output.text || '');
  const chunkSegments = buildSegmentsFromChunks(output.chunks);
  const segments = chunkSegments.length > 0 ? chunkSegments : buildApproxSegments(text, durationSeconds);

  return {
    text: text || segments.map(segment => segment.text).join(' '),
    segments,
    durationSeconds
  };
};

const handleAsrRequest = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      model: WHISPER_MODEL,
      remoteHost: REMOTE_MODEL_HOST,
      message: '本地 ASR 服务已启动。'
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { message: '仅支持 POST 上传音视频文件。' });
    return;
  }

  const boundary = getMultipartBoundary(req.headers['content-type']);
  if (!boundary) {
    sendJson(res, 400, { message: '请求缺少 multipart boundary。' });
    return;
  }

  const body = await readRequestBody(req);
  const multipart = parseMultipart(body, boundary);
  if (!multipart.file) {
    sendJson(res, 400, { message: '没有读取到上传的音视频文件。' });
    return;
  }

  const result = await runAsr(multipart.file, multipart.fields.languageMode);
  if (!result.text && result.segments.length === 0) {
    sendJson(res, 200, {
      text: '',
      segments: [],
      message: 'ASR 已执行，但没有识别到清晰语音内容。'
    });
    return;
  }

  sendJson(res, 200, {
    text: result.text,
    segments: result.segments,
    message: `本地 ASR 已完成转写，生成 ${result.segments.length} 个时间片段。`
  });
};

export const asrDevMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
  if (!req.url?.startsWith('/api/asr')) {
    next();
    return;
  }

  void handleAsrRequest(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : String(error || 'ASR 转写失败。');
    console.error('[local-asr]', message);
    sendJson(res, 500, {
      message: `ASR 转写失败：${message}`
    });
  });
};
