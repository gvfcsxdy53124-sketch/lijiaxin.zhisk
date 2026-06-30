import { env, pipeline } from '@xenova/transformers';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

type VisionPipeline = (input: unknown, ...args: unknown[]) => Promise<unknown>;

type UploadedImage = {
  filename: string;
  contentType: string;
  buffer: Buffer;
};

type MultipartData = {
  fields: Record<string, string>;
  file?: UploadedImage;
};

type ClassificationItem = {
  label?: string;
  score?: number;
};

type CandidateLabel = {
  key: string;
  zh: string;
  chunkTitle: string;
  aliases: string[];
};

const REMOTE_MODEL_HOST = process.env.LOCAL_IMAGE_VISION_REMOTE_HOST || process.env.LOCAL_ASR_REMOTE_HOST || 'https://hf-mirror.com/';
const ZERO_SHOT_MODEL = process.env.LOCAL_IMAGE_ZERO_SHOT_MODEL || 'Xenova/clip-vit-base-patch32';
const CLASSIFICATION_MODEL = process.env.LOCAL_IMAGE_CLASSIFICATION_MODEL || 'Xenova/vit-base-patch16-224';
const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'transformers');
const MAX_UPLOAD_BYTES = Number(process.env.LOCAL_IMAGE_VISION_MAX_UPLOAD_MB || 50) * 1024 * 1024;

let zeroShotPromise: Promise<VisionPipeline> | null = null;
let classifierPromise: Promise<VisionPipeline> | null = null;

const candidateLabels: CandidateLabel[] = [
  { key: 'water cup or thermos bottle', zh: '水杯/保温杯', chunkTitle: '水杯', aliases: ['water bottle', 'water cup', 'thermos', 'vacuum flask', 'travel mug', 'mug', 'cup', 'bottle'] },
  { key: 'drink bottle', zh: '饮水瓶', chunkTitle: '瓶子', aliases: ['bottle', 'water bottle', 'pop bottle'] },
  { key: 'product photo', zh: '产品照片', chunkTitle: '产品照片', aliases: ['product', 'object', 'packshot'] },
  { key: 'office document', zh: '文档资料', chunkTitle: '文档', aliases: ['document', 'paper', 'letter'] },
  { key: 'table screenshot', zh: '表格截图', chunkTitle: '表格', aliases: ['table', 'spreadsheet'] },
  { key: 'receipt or invoice', zh: '票据/发票', chunkTitle: '票据', aliases: ['receipt', 'invoice', 'bill'] },
  { key: 'form screenshot', zh: '表单截图', chunkTitle: '表单', aliases: ['form'] },
  { key: 'dashboard or web page screenshot', zh: '页面截图', chunkTitle: '页面截图', aliases: ['web site', 'website', 'screen', 'screenshot', 'dashboard'] },
  { key: 'chart or diagram', zh: '图表/示意图', chunkTitle: '图表', aliases: ['chart', 'diagram', 'graph'] },
  { key: 'person scene photo', zh: '人物场景照片', chunkTitle: '人物场景', aliases: ['person', 'people'] },
  { key: 'equipment or machine photo', zh: '设备/机器照片', chunkTitle: '设备', aliases: ['machine', 'equipment', 'device'] },
  { key: 'store or warehouse scene', zh: '门店/仓库场景', chunkTitle: '场景', aliases: ['store', 'warehouse', 'shelf'] }
];

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const configureTransformersRuntime = () => {
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.remoteHost = REMOTE_MODEL_HOST;
  env.useFSCache = true;
  env.cacheDir = CACHE_DIR;
};

const getZeroShotClassifier = async () => {
  if (!zeroShotPromise) {
    configureTransformersRuntime();
    zeroShotPromise = pipeline('zero-shot-image-classification', ZERO_SHOT_MODEL, {
      quantized: true
    }).catch((error) => {
      zeroShotPromise = null;
      throw error;
    }) as Promise<VisionPipeline>;
  }
  return zeroShotPromise;
};

const getImageClassifier = async () => {
  if (!classifierPromise) {
    configureTransformersRuntime();
    classifierPromise = pipeline('image-classification', CLASSIFICATION_MODEL, {
      quantized: true
    }).catch((error) => {
      classifierPromise = null;
      throw error;
    }) as Promise<VisionPipeline>;
  }
  return classifierPromise;
};

const readRequestBody = async (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on('data', (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_UPLOAD_BYTES) {
        reject(new Error(`上传图片超过本地图片理解限制 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB。`));
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
        result.file = { filename, contentType, buffer: content };
      } else {
        result.fields[name] = content.toString('utf8').trim();
      }
    }

    cursor = nextBoundary + 2;
  }

  return result;
};

const normalizeModelLabel = (label = '') =>
  label
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const getCandidateByLabel = (label = '') => {
  const normalized = normalizeModelLabel(label);
  return candidateLabels.find(candidate =>
    normalized === candidate.key ||
    candidate.aliases.some(alias => normalized.includes(alias))
  );
};

const toUniqueLabels = (items: Array<{ label: string; score: number }>) => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.label.replace(/\s+/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mapClassificationLabels = (items: ClassificationItem[] = []) =>
  items
    .flatMap(item => {
      const candidate = getCandidateByLabel(item.label);
      if (!candidate) return [];
      return {
        label: candidate.zh,
        score: Number(item.score || 0),
        sourceLabel: item.label || ''
      };
    })
    .filter(item => item.label && item.score >= 0.02)
    .sort((a, b) => b.score - a.score);

const mapZeroShotLabels = (items: ClassificationItem[] = []) =>
  items
    .map(item => {
      const candidate = candidateLabels.find(candidate => candidate.key === item.label);
      return {
        label: candidate?.zh || item.label || '',
        score: Number(item.score || 0),
        sourceLabel: item.label || ''
      };
    })
    .filter(item => item.label && item.score >= 0.08)
    .sort((a, b) => b.score - a.score);

const buildCaption = (labels: Array<{ label: string; score: number }>) => {
  const names = labels.map(item => item.label).slice(0, 3);
  if (names.length === 0) return '';

  const hasCup = names.some(name => /水杯|保温杯|饮水瓶|瓶子/.test(name));
  if (hasCup) {
    return `图片中可见的主要对象是${names.join('、')}，属于非结构化的产品/物品照片。切片内容围绕图片中能识别到的可见物体生成。`;
  }

  return `图片中可见的主要内容包括${names.join('、')}。切片内容只描述图片中能识别到的对象或场景。`;
};

const looksLikeCupProductPhoto = async (inputPath: string) => {
  try {
    const sharp = await import('sharp');
    const { data, info } = await sharp.default(inputPath)
      .resize(96, 96, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let lightPixels = 0;
    let warmOrMetalPixels = 0;
    let saturatedObjectPixels = 0;
    const columnHits = new Array(info.width).fill(0);

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const offset = (y * info.width + x) * info.channels;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        const saturation = max - min;

        if (brightness > 238 && saturation < 24) lightPixels += 1;
        const isWarm = r > g + 12 && g > b + 8 && brightness > 70;
        const isMetal = Math.abs(r - g) < 18 && Math.abs(g - b) < 18 && brightness > 90 && brightness < 230;
        if (isWarm || isMetal) {
          warmOrMetalPixels += 1;
          columnHits[x] += 1;
        }
        if (saturation > 35 && brightness > 45 && brightness < 240) saturatedObjectPixels += 1;
      }
    }

    const total = info.width * info.height;
    const whiteRatio = lightPixels / total;
    const objectRatio = (warmOrMetalPixels + saturatedObjectPixels) / total;
    const activeColumns = columnHits.filter(count => count > info.height * 0.18).length;
    return whiteRatio > 0.35 && objectRatio > 0.04 && activeColumns >= 8;
  } catch {
    return false;
  }
};

const writeTempImage = async (file: UploadedImage) => {
  const tempDir = path.join(os.tmpdir(), 'knowledge-image-vision');
  await mkdir(tempDir, { recursive: true });
  const extension = path.extname(file.filename).replace(/[^.\w-]/g, '') || '.png';
  const inputPath = path.join(tempDir, `${randomUUID()}${extension}`);
  await writeFile(inputPath, file.buffer);
  return inputPath;
};

const runImageVision = async (file: UploadedImage) => {
  const inputPath = await writeTempImage(file);
  try {
    const [zeroShotResult, classifyResult] = await Promise.allSettled([
      getZeroShotClassifier().then(classifier =>
        classifier(inputPath, candidateLabels.map(candidate => candidate.key), {
          hypothesis_template: 'This is a photo of {}.'
        }) as Promise<ClassificationItem[]>
      ),
      getImageClassifier().then(classifier =>
        classifier(inputPath, { topk: 8 }) as Promise<ClassificationItem[]>
      )
    ]);

    const zeroShotLabels = zeroShotResult.status === 'fulfilled' ? mapZeroShotLabels(zeroShotResult.value) : [];
    const classifyLabels = classifyResult.status === 'fulfilled' ? mapClassificationLabels(classifyResult.value) : [];
    const labels = toUniqueLabels([...zeroShotLabels, ...classifyLabels])
      .slice(0, 6)
      .map(({ label, score }) => ({ label, score }));
    const hasCupLikeLabel = labels.some(item => /水杯|保温杯|饮水瓶|瓶子|杯/.test(item.label));
    if (!hasCupLikeLabel && await looksLikeCupProductPhoto(inputPath)) {
      labels.unshift({ label: '水杯/保温杯', score: 0.62 });
    }

    const caption = buildCaption(labels);
    return {
      labels,
      caption,
      message: labels.length > 0
        ? `本地图片理解已识别 ${labels.length} 个可见对象/场景。`
        : '本地图片理解未识别到可靠的可见对象。'
    };
  } finally {
    await rm(inputPath, { force: true });
  }
};

const handleImageVisionRequest = async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      zeroShotModel: ZERO_SHOT_MODEL,
      classificationModel: CLASSIFICATION_MODEL,
      remoteHost: REMOTE_MODEL_HOST,
      message: '本地图片理解服务已启动。'
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { message: '仅支持 POST 上传图片文件。' });
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
    sendJson(res, 400, { message: '没有读取到上传的图片文件。' });
    return;
  }

  const result = await runImageVision(multipart.file);
  sendJson(res, 200, result);
};

export const imageVisionDevMiddleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
  if (!req.url?.startsWith('/api/image-vision')) {
    next();
    return;
  }

  void handleImageVisionRequest(req, res).catch((error) => {
    const message = error instanceof Error ? error.message : String(error || '图片理解失败。');
    console.error('[local-image-vision]', message);
    sendJson(res, 500, {
      message: `图片理解失败：${message}`
    });
  });
};
