import { recognize } from 'tesseract.js';

export interface DocumentTextResult {
  content: string;
  parseNote: string;
}

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json'];
const PDF_OCR_MAX_PAGES = 8;
const PDF_OCR_RENDER_SCALE = 1.6;
const TEXT_ENCODING_CANDIDATES = ['utf-8', 'gb18030', 'gbk', 'big5', 'utf-16le', 'utf-16be'];

interface TextQuality {
  normalized: string;
  score: number;
  isLikelyGarbled: boolean;
}

const getFileExtension = (name?: string) => name?.split('.').pop()?.toLowerCase() || '';

const normalizeExtractedDocumentText = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const countMatches = (text: string, pattern: RegExp) => text.match(pattern)?.length || 0;

const countMojibakeFragments = (text: string) => {
  const patterns = [
    /(?:鏂囦欢|鍐呭|绗|椤|锛|銆|褰撳墠|娴忚|鐢熸垚|瑙勫垯|缂栫爜|璇诲彇|涓嶆槸|鏈夋晥|鍘嬬缉|鏃犳硶|瀹炵|棰勮||)/g,
    /(?:绯荤粺|浼氭|牴鎹|浼犳|柟寮|枃浠|鍏抽敭|璇嶃|墿灞|綉椤|湴鍧|鑷|姩鐢|熸垚|鏍囩|鐭ヨ瘑|搴撴|湡瀹|炶|鍙栧|唴瀹|瑰苟|鎸夌|収瑙|勫垯|鍒囩|娴嬭瘯|繖鏄|竴涓|骇鍝|璇存槑|妗ｃ)/g,
    /(?:Ã.|Â.|â€.|ä¸|æ–|çš|ï¼|ã€)/g
  ];
  return patterns.reduce((total, pattern) => total + countMatches(text, pattern), 0);
};

const getTextQuality = (text: string): TextQuality => {
  const normalized = normalizeExtractedDocumentText(text);
  if (!normalized) return { normalized: '', score: 0, isLikelyGarbled: false };

  const length = normalized.length;
  const replacementCount = countMatches(normalized, /\uFFFD/g);
  const privateUseCount = countMatches(normalized, /[\uE000-\uF8FF]/g);
  const controlCount = countMatches(normalized, /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g);
  const mojibakeCount = countMojibakeFragments(normalized);
  const cjkCount = countMatches(normalized, /[\u4e00-\u9fa5]/g);
  const latinCount = countMatches(normalized, /[A-Za-z]/g);
  const digitCount = countMatches(normalized, /\d/g);
  const punctuationCount = countMatches(normalized, /[，。！？；：、,.!?;:()[\]{}《》“”"'/_\-+@#%&=<>|]/g);
  const whitespaceCount = countMatches(normalized, /\s/g);
  const readableRatio = (cjkCount + latinCount + digitCount + punctuationCount + whitespaceCount) / length;
  const score =
    cjkCount * 2 +
    latinCount +
    digitCount +
    punctuationCount * 2 +
    whitespaceCount * 0.2 -
    replacementCount * 80 -
    privateUseCount * 80 -
    controlCount * 30 -
    mojibakeCount * 70 -
    Math.max(0, 0.55 - readableRatio) * length * 5;

  const isLikelyGarbled =
    replacementCount > Math.max(2, length * 0.005) ||
    privateUseCount > Math.max(2, length * 0.01) ||
    controlCount > Math.max(3, length * 0.01) ||
    mojibakeCount >= 2 ||
    (length > 30 && readableRatio < 0.45) ||
    (length > 80 && score < 0);

  return { normalized, score, isLikelyGarbled };
};

const getReadableScore = (text: string) => getTextQuality(text).score;

const assertReadableDocumentText = (text: string, label: string) => {
  const quality = getTextQuality(text);
  if (!quality.normalized) {
    throw new Error(`${label}内容为空，无法生成原文和切片。`);
  }
  if (quality.isLikelyGarbled) {
    throw new Error(`${label}内容疑似乱码，已停止入库。请将文件另存为 UTF-8 / GB18030 编码，或转换为 DOCX、可复制文本 PDF 后重新上传。`);
  }
  return quality.normalized;
};

const getUsableExtractedText = (text: string) => {
  const quality = getTextQuality(text);
  return quality.normalized && !quality.isLikelyGarbled ? quality.normalized : '';
};

const decodeBufferCandidates = (buffer: ArrayBuffer, encodings = TEXT_ENCODING_CANDIDATES) =>
  encodings.map((encoding, index) => {
    try {
      const decoded = new TextDecoder(encoding).decode(buffer);
      const quality = getTextQuality(decoded);
      return { encoding, text: decoded, normalized: quality.normalized, score: quality.score, isLikelyGarbled: quality.isLikelyGarbled, index };
    } catch {
      return { encoding, text: '', normalized: '', score: -Infinity, isLikelyGarbled: true, index };
    }
  }).sort((a, b) => {
    if (a.isLikelyGarbled !== b.isLikelyGarbled) return a.isLikelyGarbled ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

const readTextWithEncodingDetection = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const bomUtf8 = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const bomUtf16le = bytes[0] === 0xff && bytes[1] === 0xfe;
  const bomUtf16be = bytes[0] === 0xfe && bytes[1] === 0xff;
  const preferred = bomUtf8 ? ['utf-8'] : bomUtf16le ? ['utf-16le'] : bomUtf16be ? ['utf-16be'] : [];
  const encodings = Array.from(new Set([...preferred, ...TEXT_ENCODING_CANDIDATES]));

  const candidates = encodings.map((encoding, index) => {
    try {
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(buffer);
      const quality = getTextQuality(decoded);
      return {
        encoding,
        text: quality.normalized,
        score: quality.score,
        isLikelyGarbled: quality.isLikelyGarbled,
        index
      };
    } catch {
      return { encoding, text: '', score: -Infinity, isLikelyGarbled: true, index };
    }
  });

  return candidates.sort((a, b) => {
    if (a.isLikelyGarbled !== b.isLikelyGarbled) return a.isLikelyGarbled ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  })[0] || { encoding: 'utf-8', text: '', score: 0, isLikelyGarbled: true };
};

const decodeXmlEntities = (value: string) => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

const extractHtmlDocumentText = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, svg, canvas, iframe').forEach(node => node.remove());
  const title = doc.querySelector('title')?.textContent?.trim();
  const body = normalizeExtractedDocumentText(doc.body?.textContent || '');
  return normalizeExtractedDocumentText([title ? `# ${title}` : '', body].filter(Boolean).join('\n\n'));
};

const decodeRtfHexRuns = (rtf: string, encoding: string) =>
  rtf.replace(/(?:\\'[0-9a-fA-F]{2})+/g, (run) => {
    const bytes = new Uint8Array(Array.from(run.matchAll(/\\'([0-9a-fA-F]{2})/g)).map(match => Number.parseInt(match[1], 16)));
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch {
      return '';
    }
  });

const extractRtfDocumentText = (rtf: string, encoding: string) => {
  const decoded = decodeRtfHexRuns(rtf, encoding)
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => {
      const value = Number.parseInt(code, 10);
      return String.fromCharCode(value < 0 ? value + 65536 : value);
    })
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}/g, ' ')
    .replace(/\\(?:par|line)\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\[{}\\]/g, match => match.slice(1))
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, ' ');
  return normalizeExtractedDocumentText(decoded.replace(/[ \t]{2,}/g, ' '));
};

const decompressZipEntry = async (bytes: Uint8Array, method: number) => {
  if (method === 0) return bytes;
  if (method !== 8 || typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持读取该压缩格式的 Office 文件。');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readZipXmlEntries = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const minEocdOffset = Math.max(0, bytes.length - 0xffff - 22);
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= minEocdOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('文件结构不是有效的 Office Open XML 压缩包。');
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const entries: Record<string, string> = {};
  const decoder = new TextDecoder('utf-8');
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name.endsWith('.xml') && view.getUint32(localHeaderOffset, true) === 0x04034b50) {
      const localNameLength = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
      const decompressed = await decompressZipEntry(compressedBytes, method);
      entries[name] = decoder.decode(decompressed);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const getXmlElements = (root: Document | Element, tagName: string, localName: string) => {
  const direct = Array.from(root.getElementsByTagName(tagName));
  if (direct.length > 0) return direct;
  return Array.from(root.getElementsByTagNameNS('*', localName));
};

const getXmlAttribute = (element: Element, localName: string) =>
  element.getAttribute(`w:${localName}`) ||
  element.getAttribute(localName) ||
  element.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', localName) ||
  '';

const getFirstXmlAttribute = (root: Document | Element, tagName: string, localName: string, attributeName = 'val') =>
  getXmlElements(root, tagName, localName)
    .map(node => getXmlAttribute(node, attributeName))
    .find(Boolean) || '';

const getWordHeadingLevelFromText = (value: string) =>
  value.match(/(?:heading|标题|標題|h)\s*([1-6])/i)?.[1] ||
  value.match(/^([1-6])$/)?.[1] ||
  '';

interface DocxParagraphBlock {
  text: string;
  style: string;
  headingLevel: number;
  fontSize: number;
  bold: boolean;
}

const getDocxStyleHeadingLevels = (entries: Record<string, string>) => {
  const xml = entries['word/styles.xml'];
  if (!xml) return {};
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const styles = getXmlElements(doc, 'w:style', 'style');
  return Object.fromEntries(styles.map((style) => {
    const styleId = getXmlAttribute(style, 'styleId');
    const name = getXmlElements(style, 'w:name', 'name')
      .map(node => getXmlAttribute(node, 'val'))
      .find(Boolean) || '';
    const outlineLevel = getXmlElements(style, 'w:outlineLvl', 'outlineLvl')
      .map(node => getXmlAttribute(node, 'val'))
      .find(Boolean);
    const headingLevel = getWordHeadingLevelFromText(`${styleId} ${name}`) ||
      (outlineLevel !== undefined && outlineLevel !== '' ? String(Number(outlineLevel) + 1) : '');
    return styleId && headingLevel && Number(headingLevel) >= 1 && Number(headingLevel) <= 6
      ? [styleId, Number(headingLevel)]
      : null;
  }).filter(Boolean) as Array<[string, number]>);
};

const getDocxParagraphFontSize = (paragraph: Element) => {
  const sizes = getXmlElements(paragraph, 'w:sz', 'sz')
    .map(node => Number(getXmlAttribute(node, 'val')))
    .filter(value => Number.isFinite(value) && value > 0);
  if (sizes.length === 0) return 0;
  return Math.max(...sizes) / 2;
};

const inferDocxHeadingLevels = (blocks: DocxParagraphBlock[]) => {
  const bodySizes = blocks
    .filter(block => !block.headingLevel && block.text.length > 20 && block.fontSize > 0)
    .map(block => block.fontSize)
    .sort((a, b) => a - b);
  const bodyFontSize = bodySizes[Math.floor(bodySizes.length / 2)] || 12;
  const headingSizes = Array.from(new Set(blocks
    .filter(block =>
      !block.headingLevel &&
      block.fontSize > bodyFontSize &&
      block.text.length <= 80 &&
      !/[。；;，,]$/.test(block.text)
    )
    .map(block => block.fontSize)
    .sort((a, b) => b - a)));

  return blocks.map((block) => {
    if (block.headingLevel) return block;
    const sizeIndex = headingSizes.indexOf(block.fontSize);
    if (sizeIndex >= 0 && (block.bold || block.fontSize >= bodyFontSize + 1)) {
      return { ...block, headingLevel: Math.min(3, sizeIndex + 1) };
    }
    return block;
  });
};

const extractDocxTextFromEntries = (entries: Record<string, string>) => {
  const xml = entries['word/document.xml'];
  if (!xml) return '';
  const styleHeadingLevels = getDocxStyleHeadingLevels(entries);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = getXmlElements(doc, 'w:p', 'p');
  const blocks = paragraphs.map((paragraph) => {
    const text = getXmlElements(paragraph, 'w:t', 't')
      .map(node => node.textContent || '')
      .join('');
    if (!text.trim()) return null;
    const style = getFirstXmlAttribute(paragraph, 'w:pStyle', 'pStyle');
    const outlineLevel = getFirstXmlAttribute(paragraph, 'w:outlineLvl', 'outlineLvl');
    const headingLevel = getWordHeadingLevelFromText(style) ||
      (styleHeadingLevels[style] ? String(styleHeadingLevels[style]) : '') ||
      (outlineLevel !== undefined && outlineLevel !== '' ? String(Number(outlineLevel) + 1) : '');
    return {
      text,
      style,
      headingLevel: Number(headingLevel) || 0,
      fontSize: getDocxParagraphFontSize(paragraph),
      bold: getXmlElements(paragraph, 'w:b', 'b').length > 0
    };
  }).filter(Boolean) as DocxParagraphBlock[];
  return normalizeExtractedDocumentText(inferDocxHeadingLevels(blocks).map((block) =>
    block.headingLevel ? `${'#'.repeat(block.headingLevel)} ${block.text}` : block.text
  ).join('\n\n'));
};

const extractPptxTextFromEntries = (entries: Record<string, string>) => {
  const slideNames = Object.keys(entries)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/)?.[1] || 0));
  const slides = slideNames.map((name, index) => {
    const doc = new DOMParser().parseFromString(entries[name], 'application/xml');
    const text = getXmlElements(doc, 'a:t', 't')
      .map(node => node.textContent?.trim() || '')
      .filter(Boolean)
      .join('\n');
    return text ? `# 第 ${index + 1} 页\n\n${text}` : '';
  }).filter(Boolean);
  return normalizeExtractedDocumentText(slides.join('\n\n'));
};

interface PdfTextLine {
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

const getPdfItemFontSize = (item: { transform?: number[]; height?: number }) =>
  Math.abs(item.transform?.[3] || item.transform?.[0] || item.height || 0);

const getNumberedHeadingLevel = (text: string) => {
  const matched = text.match(/^((?:\d+|[一二三四五六七八九十]+)(?:[.、．]\d+){0,5}|第[一二三四五六七八九十\d]+[章节篇部分])[\s、.．-]+(.+)$/);
  if (!matched || !matched[2]?.trim() || text.length > 90) return 0;
  if (matched[1].startsWith('第')) return 1;
  return Math.min(6, matched[1].split(/[.．、]/).filter(Boolean).length);
};

const getPdfHeadingLevel = (line: PdfTextLine, bodyFontSize: number, maxFontSize: number) => {
  const text = line.text.trim();
  if (!text || /^第\s*\d+\s*页$/.test(text)) return 0;
  const numberedLevel = getNumberedHeadingLevel(text);
  if (numberedLevel) return numberedLevel;
  if (text.length > 80 || /[。；;，,]$/.test(text)) return 0;
  if (line.fontSize >= Math.max(bodyFontSize * 1.65, maxFontSize * 0.92)) return 1;
  if (line.fontSize >= bodyFontSize * 1.35) return 2;
  if (line.fontSize >= bodyFontSize * 1.18) return 3;
  return 0;
};

const extractPdfLinesFromItems = (items: unknown[]) => {
  const rawItems = items
    .map((item) => {
      const current = item as { str?: string; transform?: number[]; height?: number };
      const text = current.str?.replace(/\s+/g, ' ').trim() || '';
      if (!text) return null;
      return {
        text,
        x: current.transform?.[4] || 0,
        y: current.transform?.[5] || 0,
        fontSize: getPdfItemFontSize(current)
      };
    })
    .filter(Boolean) as PdfTextLine[];

  const lines: PdfTextLine[] = [];
  rawItems
    .sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x)
    .forEach((item) => {
      const line = lines.find(current => Math.abs(current.y - item.y) <= Math.max(2, Math.min(current.fontSize || item.fontSize || 10, 5)));
      if (!line) {
        lines.push({ ...item });
        return;
      }
      line.text = `${line.text}${item.x - line.x > 12 ? ' ' : ''}${item.text}`.replace(/\s{2,}/g, ' ').trim();
      line.x = Math.min(line.x, item.x);
      line.fontSize = Math.max(line.fontSize, item.fontSize);
    });
  return lines.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
};

const formatPdfPageLines = (lines: PdfTextLine[]) => {
  const fontSizes = lines.map(line => line.fontSize).filter(size => size > 0).sort((a, b) => a - b);
  const bodyFontSize = fontSizes[Math.floor(fontSizes.length / 2)] || 10;
  const maxFontSize = fontSizes[fontSizes.length - 1] || bodyFontSize;
  return lines.map((line) => {
    const headingLevel = getPdfHeadingLevel(line, bodyFontSize, maxFontSize);
    return headingLevel ? `${'#'.repeat(headingLevel)} ${line.text}` : line.text;
  }).join('\n');
};

const loadPdfDocument = async (file: File) => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  return pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    useWorkerFetch: true
  }).promise;
};

const extractPdfTextWithPdfJs = async (file: File) => {
  const pdf = await loadPdfDocument(file);
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = formatPdfPageLines(extractPdfLinesFromItems(content.items)).trim();
      if (pageText) pages.push(`--- 第 ${pageNumber} 页 ---\n\n${pageText}`);
    }
    return normalizeExtractedDocumentText(pages.join('\n\n'));
  } finally {
    pdf.cleanup();
  }
};

const extractPdfTextWithOcr = async (file: File) => {
  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持 PDF 页面 OCR。');
  }

  const pdf = await loadPdfDocument(file);
  const pages: string[] = [];
  try {
    const pageLimit = Math.min(pdf.numPages, PDF_OCR_MAX_PAGES);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_OCR_RENDER_SCALE });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: context, viewport, canvas } as never).promise;
        const result = await recognize(canvas, 'chi_sim+eng', { logger: () => {} });
        const pageText = getUsableExtractedText(result.data.text || '');
        if (pageText) pages.push(`# 第 ${pageNumber} 页\n\n${pageText}`);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    const limitNote = pdf.numPages > pageLimit
      ? `\n\n已对前 ${pageLimit} 页进行 OCR；当前浏览器端为避免卡顿，超过部分建议接入后端批量 OCR。`
      : '';
    return normalizeExtractedDocumentText(`${pages.join('\n\n')}${limitNote}`);
  } finally {
    pdf.cleanup();
  }
};

const decodePdfLiteralString = (value: string) =>
  decodeXmlEntities(value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\'));

const extractPdfPlainTextFallback = async (file: File) => {
  const raw = new TextDecoder('latin1').decode(await file.arrayBuffer());
  const parts: string[] = [];
  Array.from(raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)).forEach(match => {
    parts.push(decodePdfLiteralString(match[1]));
  });
  Array.from(raw.matchAll(/\[((?:.|\n)*?)\]\s*TJ/g)).forEach(match => {
    Array.from(match[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)).forEach(item => {
      parts.push(decodePdfLiteralString(item[1]));
    });
  });
  return normalizeExtractedDocumentText(parts.join(' ').replace(/\s{2,}/g, ' '));
};

const extractLegacyDocText = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      return extractDocxTextFromEntries(await readZipXmlEntries(file));
    } catch {
      return '';
    }
  }

  const decodedCandidates = decodeBufferCandidates(buffer, ['utf-8', 'gb18030', 'gbk', 'big5', 'utf-16le']);
  const htmlCandidate = decodedCandidates.find(candidate => /<html[\s>]|<body[\s>]|<\?xml|<meta[\s>]/i.test(candidate.text.slice(0, 5000)));
  if (htmlCandidate) {
    const htmlText = getUsableExtractedText(extractHtmlDocumentText(htmlCandidate.text));
    if (htmlText) return htmlText;
  }

  const rtfCandidate = decodedCandidates.find(candidate => candidate.text.trimStart().startsWith('{\\rtf'));
  if (rtfCandidate) {
    const rtfEncoding = /\\ansicpg936\b/i.test(rtfCandidate.text) ? 'gb18030' : /\\ansicpg950\b/i.test(rtfCandidate.text) ? 'big5' : 'utf-8';
    const rtfText = getUsableExtractedText(extractRtfDocumentText(rtfCandidate.text, rtfEncoding));
    if (rtfText) return rtfText;
  }

  const decoders = ['utf-16le', 'gb18030', 'gbk', 'utf-8'];
  const candidates = decoders.map((encoding) => {
    try {
      const decoded = new TextDecoder(encoding).decode(buffer);
      const readable = decoded
        .replace(/[^\u4e00-\u9fa5A-Za-z0-9\s，。！？；：、（）()《》【】\[\]_.\-/%@+]/g, '\n')
        .split(/\n+/)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(line => line.length >= 2 && /[\u4e00-\u9fa5A-Za-z]/.test(line))
        .filter(line => !/^[A-Za-z0-9_.\-/%@+\s]{2,12}$/.test(line))
        .join('\n');
      const quality = getTextQuality(readable);
      const chineseScore = countMatches(quality.normalized, /[\u4e00-\u9fa5]/g);
      const fieldScore = (readable.match(/[：:]/g) || []).length * 8;
      return {
        text: quality.isLikelyGarbled ? '' : quality.normalized,
        score: quality.isLikelyGarbled ? -Infinity : chineseScore + fieldScore + quality.score
      };
    } catch {
      return { text: '', score: 0 };
    }
  });
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best?.score > 30 ? best.text : '';
};

export const readUploadDocumentText = async (file: File): Promise<DocumentTextResult> => {
  const ext = getFileExtension(file.name);

  if (TEXT_EXTENSIONS.includes(ext)) {
    const { text, encoding } = await readTextWithEncodingDetection(file);
    const content = assertReadableDocumentText(text, '文件');
    return {
      content,
      parseNote: `已按 ${encoding.toUpperCase()} 编码读取文件原文，可按当前规则生成切片预览。`
    };
  }

  if (ext === 'docx' || ext === 'pptx') {
    const entries = await readZipXmlEntries(file);
    const text = ext === 'docx' ? extractDocxTextFromEntries(entries) : extractPptxTextFromEntries(entries);
    const content = assertReadableDocumentText(text, `${ext.toUpperCase()} 文件`);
    return {
      content,
      parseNote: `已读取 ${ext.toUpperCase()} 文件原文，可按当前规则生成切片预览。`
    };
  }

  if (ext === 'pdf') {
    let text = '';
    let usedOcr = false;
    try {
      text = getUsableExtractedText(await extractPdfTextWithPdfJs(file));
    } catch {
      text = '';
    }
    if (!text) {
      try {
        text = getUsableExtractedText(await extractPdfPlainTextFallback(file));
      } catch {
        text = '';
      }
    }
    if (!text) {
      try {
        text = assertReadableDocumentText(await extractPdfTextWithOcr(file), 'PDF OCR ');
        usedOcr = true;
      } catch {
        text = '';
      }
    }
    if (!text) {
      throw new Error('当前 PDF 未提取到有效文本。若这是扫描件，需要先走图片 OCR 或接入后端 PDF OCR 服务。');
    }
    return {
      content: text,
      parseNote: usedOcr
        ? '已通过 PDF 页面 OCR 识别文本内容，可按当前规则生成切片预览。'
        : '已通过 PDF 解析器读取文本内容，可按当前规则生成切片预览。'
    };
  }

  if (ext === 'doc') {
    const text = await extractLegacyDocText(file);
    const content = assertReadableDocumentText(text, 'DOC 文件');
    return {
      content,
      parseNote: '已尽量读取 DOC 文件真实文本，可按当前规则生成切片预览。'
    };
  }

  const displayExt = ext.toUpperCase() || 'FILE';
  throw new Error(`${displayExt} 文件当前无法在浏览器端直接读取真实内容，请上传 .txt、.md、.doc、.docx、.pdf、.pptx、.csv 或接入后端解析服务。`);
};
