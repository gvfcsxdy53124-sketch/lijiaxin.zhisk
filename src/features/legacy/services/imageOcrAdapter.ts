import { recognize } from 'tesseract.js';

export interface ImageOcrResult {
  status: 'ready' | 'empty' | 'failed';
  text: string;
  confidence?: number;
  message?: string;
  provider?: 'configured-api' | 'browser-tesseract';
}

type OcrApiResponse = {
  text?: string;
  confidence?: number;
  message?: string;
};

type OcrVariant = {
  name: string;
  image: File | Blob;
  pageSegMode?: string;
};

const CONFIGURED_OCR_ENDPOINT = import.meta.env.VITE_OCR_ENDPOINT || '';
const MAX_OCR_IMAGE_SIDE = 2600;
const MIN_OCR_IMAGE_SIDE = 1200;

export const getOcrLanguageCode = (mode = 'auto') => {
  if (mode === 'zh') return 'chi_sim';
  if (mode === 'en') return 'eng';
  return 'chi_sim+eng';
};

const normalizeOcrText = (value: string) =>
  value
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const splitLines = (value: string) =>
  normalizeOcrText(value)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

const uniqueLines = (texts: string[]) => {
  const seen = new Set<string>();
  return texts.flatMap(splitLines).filter(line => {
    const key = line.replace(/\s+/g, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const scoreOcrText = (text: string, confidence = 0) => {
  const normalized = normalizeOcrText(text);
  const lines = splitLines(normalized);
  const readableChars = (normalized.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g) || []).length;
  const garbledChars = (normalized.match(/[�□]/g) || []).length;
  return readableChars + lines.length * 18 + confidence * 2 - garbledChars * 20;
};

const transcribeWithConfiguredApi = async (file: File, languageMode = 'auto'): Promise<ImageOcrResult | null> => {
  if (!CONFIGURED_OCR_ENDPOINT) return null;

  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('languageMode', languageMode);

  const response = await fetch(CONFIGURED_OCR_ENDPOINT, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`OCR 接口返回 ${response.status}，请检查 VITE_OCR_ENDPOINT 配置。`);
  }

  const data = await response.json() as OcrApiResponse;
  const text = normalizeOcrText(data.text || '');
  if (!text) {
    return {
      status: 'empty',
      text: '',
      confidence: data.confidence,
      message: data.message || 'OCR 接口未返回可用文字。',
      provider: 'configured-api'
    };
  }

  return {
    status: 'ready',
    text,
    confidence: data.confidence,
    message: data.message || `OCR 接口已识别 ${text.length} 个字符。`,
    provider: 'configured-api'
  };
};

const createImageBitmapFromFile = async (file: File) => {
  if ('createImageBitmap' in window) {
    return await createImageBitmap(file);
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败。'));
    };
    image.src = url;
  });
};

const canvasToBlob = async (canvas: HTMLCanvasElement) =>
  await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('图片预处理失败。'));
    }, 'image/png', 0.96);
  });

const buildPreprocessedVariant = async (file: File, variant: 'contrast' | 'threshold'): Promise<Blob> => {
  const bitmap = await createImageBitmapFromFile(file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = longestSide < MIN_OCR_IMAGE_SIDE
    ? MIN_OCR_IMAGE_SIDE / longestSide
    : Math.min(1, MAX_OCR_IMAGE_SIDE / longestSide);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('当前浏览器不支持图片预处理。');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const enhanced = variant === 'threshold'
      ? (gray > 174 ? 255 : 0)
      : Math.max(0, Math.min(255, (gray - 128) * 1.55 + 128));
    data[index] = enhanced;
    data[index + 1] = enhanced;
    data[index + 2] = enhanced;
  }
  context.putImageData(imageData, 0, 0);
  return await canvasToBlob(canvas);
};

const buildOcrVariants = async (file: File): Promise<OcrVariant[]> => {
  const variants: OcrVariant[] = [
    { name: 'original-auto-layout', image: file, pageSegMode: '3' }
  ];

  try {
    const contrast = await buildPreprocessedVariant(file, 'contrast');
    variants.push({ name: 'contrast-single-block', image: contrast, pageSegMode: '6' });
  } catch {
    // Keep original OCR even if preprocessing is unavailable.
  }

  try {
    const threshold = await buildPreprocessedVariant(file, 'threshold');
    variants.push({ name: 'threshold-sparse-text', image: threshold, pageSegMode: '11' });
  } catch {
    // Keep available variants.
  }

  return variants;
};

const recognizeVariant = async (variant: OcrVariant, language: string) => {
  const result = await recognize(variant.image, language, {
    logger: () => {},
    tessedit_pageseg_mode: variant.pageSegMode,
    preserve_interword_spaces: '1'
  } as Record<string, unknown>);
  return {
    name: variant.name,
    text: normalizeOcrText(result.data.text || ''),
    confidence: result.data.confidence
  };
};

export const recognizeImageText = async (file: File, languageMode = 'auto'): Promise<ImageOcrResult> => {
  try {
    const apiResult = await transcribeWithConfiguredApi(file, languageMode);
    if (apiResult) return apiResult;

    const language = getOcrLanguageCode(languageMode);
    const variants = await buildOcrVariants(file);
    const results = await Promise.allSettled(variants.map(variant => recognizeVariant(variant, language)));
    const successfulResults = results
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof recognizeVariant>>> => result.status === 'fulfilled')
      .map(result => result.value)
      .filter(result => result.text);

    if (successfulResults.length === 0) {
      return {
        status: 'empty',
        text: '',
        message: '未识别到清晰文字。可以上传更清晰图片，或配置 VITE_OCR_ENDPOINT 使用后端 OCR 服务。',
        provider: 'browser-tesseract'
      };
    }

    const best = successfulResults
      .slice()
      .sort((a, b) => scoreOcrText(b.text, b.confidence) - scoreOcrText(a.text, a.confidence))[0];
    const mergedText = uniqueLines([best.text, ...successfulResults.map(result => result.text)]).join('\n');
    const finalText = scoreOcrText(mergedText, best.confidence) > scoreOcrText(best.text, best.confidence) * 1.08
      ? mergedText
      : best.text;

    return {
      status: 'ready',
      text: finalText,
      confidence: best.confidence,
      message: `OCR 已识别 ${finalText.length} 个字符，已使用图片增强和多轮识别提升效果。`,
      provider: 'browser-tesseract'
    };
  } catch (error) {
    return {
      status: 'failed',
      text: '',
      message: error instanceof Error ? error.message : 'OCR 识别失败，请稍后重试。',
      provider: CONFIGURED_OCR_ENDPOINT ? 'configured-api' : 'browser-tesseract'
    };
  }
};
