import { env, pipeline } from '@xenova/transformers';
import ortWasm from 'onnxruntime-web/dist/ort-wasm.wasm?url';
import ortWasmSimd from 'onnxruntime-web/dist/ort-wasm-simd.wasm?url';

export interface ImageVisionLabel {
  label: string;
  score: number;
}

export interface ImageVisionResult {
  status: 'ready' | 'empty' | 'failed';
  labels: ImageVisionLabel[];
  caption?: string;
  message?: string;
  provider: 'configured-vlm' | 'local-vision' | 'browser-caption' | 'browser-vit' | 'unavailable';
}

type ImageClassificationOutput = Array<{
  label?: string;
  score?: number;
}>;

type ImageToTextOutput = Array<{
  generated_text?: string;
}> | {
  generated_text?: string;
};

type ImageVisionApiResponse = {
  caption?: string;
  description?: string;
  labels?: Array<{ label?: string; score?: number }>;
  message?: string;
};

const IMAGE_CLASSIFICATION_MODEL = 'Xenova/vit-base-patch16-224';
const IMAGE_CAPTION_MODEL = 'Xenova/vit-gpt2-image-captioning';
const IMAGE_VISION_TIMEOUT_MS = 30000;
const CONFIGURED_VISION_ENDPOINT = (import.meta.env.VITE_IMAGE_VISION_ENDPOINT || (import.meta.env.DEV ? '/api/image-vision' : '')).trim();

let classifierPromise: Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>> | null = null;
let captionerPromise: Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>> | null = null;

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

const normalizeVisionLabel = (label: string) =>
  label
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeCaption = (caption = '') =>
  caption
    .replace(/\s+/g, ' ')
    .trim();

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('图片识别模型加载或识别超时。')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

const getImageClassifier = async () => {
  if (typeof window === 'undefined') {
    throw new Error('当前运行环境不支持浏览器端图片识别。');
  }

  if (!classifierPromise) {
    configureTransformersRuntime();
    classifierPromise = pipeline('image-classification', IMAGE_CLASSIFICATION_MODEL, {
      quantized: true
    }).catch((error) => {
      classifierPromise = null;
      throw error;
    }) as Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>>;
  }

  return classifierPromise;
};

const getImageCaptioner = async () => {
  if (typeof window === 'undefined') {
    throw new Error('当前运行环境不支持浏览器端图片描述。');
  }

  if (!captionerPromise) {
    configureTransformersRuntime();
    captionerPromise = pipeline('image-to-text', IMAGE_CAPTION_MODEL, {
      quantized: true
    }).catch((error) => {
      captionerPromise = null;
      throw error;
    }) as Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>>;
  }

  return captionerPromise;
};

const runConfiguredVision = async (file: File): Promise<ImageVisionResult | null> => {
  if (!CONFIGURED_VISION_ENDPOINT) return null;

  const formData = new FormData();
  formData.append('file', file, file.name);
  const response = await fetch(CONFIGURED_VISION_ENDPOINT, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`图片理解接口返回 ${response.status}，请检查 VITE_IMAGE_VISION_ENDPOINT 配置。`);
  }

  const data = await response.json() as ImageVisionApiResponse;
  const labels = (data.labels || [])
    .map(item => ({
      label: normalizeVisionLabel(item.label || ''),
      score: Number(item.score || 0)
    }))
    .filter(item => item.label)
    .slice(0, 8);
  const caption = normalizeCaption(data.caption || data.description || '');

  if (!caption && labels.length === 0) {
    return {
      status: 'empty',
      labels: [],
      caption: '',
      message: data.message || '图片理解接口未返回可用描述。',
      provider: CONFIGURED_VISION_ENDPOINT.startsWith('/api/') ? 'local-vision' : 'configured-vlm'
    };
  }

  return {
    status: 'ready',
    labels,
    caption,
    message: data.message || '图片理解接口已返回可见内容描述。',
    provider: CONFIGURED_VISION_ENDPOINT.startsWith('/api/') ? 'local-vision' : 'configured-vlm'
  };
};

const getCaptionText = (output: ImageToTextOutput) => {
  if (Array.isArray(output)) {
    return normalizeCaption(output[0]?.generated_text || '');
  }
  return normalizeCaption(output.generated_text || '');
};

const getFailureMessage = (error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const lowerMessage = rawMessage.toLowerCase();
  if (/failed to fetch|load failed|network|err_|timeout|cors/.test(lowerMessage)) {
    return CONFIGURED_VISION_ENDPOINT
      ? '图片理解接口请求失败，请检查接口地址、跨域配置和服务状态。'
      : '图片理解模型下载失败。请配置 VITE_IMAGE_VISION_ENDPOINT 后端 VLM 接口，或确认当前电脑可以访问模型资源后重试。';
  }
  return rawMessage ? `图片理解失败：${rawMessage}` : '图片理解失败，请稍后重试。';
};

export const recognizeImageVisualContent = async (file: File): Promise<ImageVisionResult> => {
  if (!file.type.startsWith('image/') && !/\.(png|jpg|jpeg|bmp|webp)$/i.test(file.name)) {
    return {
      status: 'failed',
      labels: [],
      message: '当前文件不是可识别的图片格式。',
      provider: 'unavailable'
    };
  }

  let objectUrl = '';
  try {
    const apiResult = await runConfiguredVision(file);
    if (apiResult) return apiResult;

    objectUrl = URL.createObjectURL(file);
    const [captionResult, classifyResult] = await Promise.allSettled([
      withTimeout(getImageCaptioner().then(captioner => captioner(objectUrl, { max_new_tokens: 32 }) as Promise<ImageToTextOutput>), IMAGE_VISION_TIMEOUT_MS),
      withTimeout(getImageClassifier().then(classifier => classifier(objectUrl, { topk: 6 }) as Promise<ImageClassificationOutput>), IMAGE_VISION_TIMEOUT_MS)
    ]);

    const caption = captionResult.status === 'fulfilled' ? getCaptionText(captionResult.value) : '';
    const labels = classifyResult.status === 'fulfilled'
      ? (Array.isArray(classifyResult.value) ? classifyResult.value : [])
          .map(item => ({
            label: normalizeVisionLabel(item.label || ''),
            score: Number(item.score || 0)
          }))
          .filter(item => item.label && item.score >= 0.04)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
      : [];

    if (!caption && labels.length === 0) {
      const failedReason = captionResult.status === 'rejected'
        ? captionResult.reason
        : classifyResult.status === 'rejected'
          ? classifyResult.reason
          : null;
      return {
        status: 'empty',
        labels: [],
        caption: '',
        message: failedReason ? getFailureMessage(failedReason) : '图片识别模型未返回可靠的可见内容描述。',
        provider: 'browser-caption'
      };
    }

    return {
      status: 'ready',
      labels,
      caption,
      message: caption
        ? '已生成图片整图描述和主要可见内容。'
        : `已识别 ${labels.length} 个主要可见内容标签。`,
      provider: caption ? 'browser-caption' : 'browser-vit'
    };
  } catch (error) {
    return {
      status: 'failed',
      labels: [],
      caption: '',
      message: getFailureMessage(error),
      provider: 'unavailable'
    };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
};
