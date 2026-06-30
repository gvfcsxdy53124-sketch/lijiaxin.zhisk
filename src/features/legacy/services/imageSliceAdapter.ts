export type ImageFileKind = 'structured' | 'unstructured';

export interface ImageChunkBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageKnowledgeChunk {
  id: string;
  sourceImage: string;
  chunkType: string;
  title: string;
  content: string;
  bbox: ImageChunkBBox;
  metadata: Record<string, string | number | boolean>;
  rowIndex?: number;
  colIndex?: number;
  parentId?: string;
  referenceId?: string;
  tableMarkdown?: string;
}

export interface ImageAnalysisResult {
  imageType: ImageFileKind;
  sourceImage: string;
  chunks: ImageKnowledgeChunk[];
}

export interface ImageAnalysisInput {
  name: string;
  previewUrl?: string;
  ocrText?: string;
  ocrStatus?: 'ready' | 'empty' | 'failed' | 'pending';
  visionLabels?: Array<{ label: string; score: number }>;
  visionCaption?: string;
  visionStatus?: 'ready' | 'empty' | 'failed';
}

const IMAGE_SLICE_VERSION = 'semantic-vision-v3';
const DEFAULT_BBOX: ImageChunkBBox = { x: 0, y: 0, width: 1024, height: 768 };
const MAX_STRUCTURED_CHUNKS = 28;

const getBaseName = (name: string) => name.replace(/\.[^.]+$/, '');

const splitOcrLines = (ocrText = '') =>
  ocrText
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const uniqueLines = (lines: string[]) => {
  const seen = new Set<string>();
  return lines.filter(line => {
    const key = line.replace(/\s+/g, '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isUsefulOcrLine = (line: string) => {
  const compact = line.replace(/\s+/g, '');
  if (compact.length < 2) return false;
  if (/^[ivxlcdm|_\-.,;:!?\d]+$/i.test(compact)) return false;
  const readableChars = (compact.match(/[\u4e00-\u9fa5a-zA-Z0-9]/g) || []).length;
  return readableChars >= 3 || /[\u4e00-\u9fa5]/.test(compact);
};

const makeChunk = (
  sourceImage: string,
  id: string,
  chunkType: string,
  title: string,
  content: string,
  metadata: Record<string, string | number | boolean> = {},
  bbox: ImageChunkBBox = DEFAULT_BBOX
): ImageKnowledgeChunk => ({
  id,
  sourceImage,
  chunkType,
  title,
  content,
  bbox,
  metadata: {
    ...metadata,
    sliceVersion: IMAGE_SLICE_VERSION
  }
});

export const inferImageFileKind = (name: string): ImageFileKind => {
  const lowerName = name.toLowerCase();
  const structuredByName = /(table|form|invoice|receipt|contract|chart|flow|architecture|ui|screenshot|ppt|dashboard|report|data|diagram|resume|cv|id|license|表格|表单|发票|票据|合同|图表|流程|架构|截图|页面|报表|简历|证件)/i.test(lowerName);
  return structuredByName ? 'structured' : 'unstructured';
};

const splitTableCells = (line: string) => {
  const cleaned = line.trim().replace(/^\||\|$/g, '');
  const separator = cleaned.includes('|')
    ? /\s*\|\s*/
    : cleaned.includes('\t')
      ? /\t+/
      : /\s{2,}/;
  return cleaned
    .split(separator)
    .map(cell => cell.trim())
    .filter(Boolean);
};

const isTableLine = (line: string) => splitTableCells(line).length >= 3;

const extractKeyValuePairs = (line: string) => {
  const normalized = line.replace(/[|，,；;]/g, '  ');
  const matches = Array.from(normalized.matchAll(/([^:：\s]{2,18})\s*[:：]\s*([^:：]+?)(?=\s{2,}[^:：\s]{2,18}\s*[:：]|$)/g));
  return matches
    .map(match => ({
      key: match[1].trim(),
      value: match[2].trim()
    }))
    .filter(item => item.key && item.value);
};

const isStepLine = (line: string) =>
  /^\s*(?:\d{1,2}[.、)]|第[一二三四五六七八九十\d]+步|步骤\s*\d+|step\s*\d+)\s*/i.test(line);

const inferImageKindFromOcr = (name: string, ocrText?: string, visionCaption?: string): ImageFileKind => {
  const lines = splitOcrLines(ocrText);
  const joined = `${lines.join('\n')}\n${visionCaption || ''}`;
  const tableLikeLines = lines.filter(line => splitTableCells(line).length >= 3).length;
  const fieldLikeLines = lines.filter(line => extractKeyValuePairs(line).length > 0).length;
  const stepLikeLines = lines.filter(isStepLine).length;
  const hasStructuredText =
    tableLikeLines >= 2 ||
    fieldLikeLines >= 2 ||
    stepLikeLines >= 2 ||
    /(发票|金额|姓名|电话|邮箱|地址|日期|编号|合同|甲方|乙方|项目|部门|职位|教育|经历|技能|表格|表单|申请|资格|体检|流程|步骤|图表|指标|数量|单价|resume|invoice|table|form|chart|diagram|dashboard|screenshot)/i.test(joined);
  return inferImageFileKind(name) === 'structured' || hasStructuredText ? 'structured' : 'unstructured';
};

const isLikelyTitleLine = (line: string, index: number) => {
  const cleaned = line.trim();
  if (index > 3 || cleaned.length < 2 || cleaned.length > 42) return false;
  if (extractKeyValuePairs(cleaned).length > 0 || splitTableCells(cleaned).length >= 3 || isStepLine(cleaned)) return false;
  if (/^[\d\s.,，。:：;；|/\\-]+$/.test(cleaned)) return false;
  return true;
};

const createMarkdownTable = (rows: string[][]) => {
  if (rows.length === 0) return '';
  const columnCount = Math.max(...rows.map(row => row.length));
  const normalizeRow = (row: string[]) => Array.from({ length: columnCount }, (_, index) => row[index] || '');
  const normalizedRows = rows.map(normalizeRow);
  const [header, ...body] = normalizedRows;
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map(row => `| ${row.join(' | ')} |`)
  ].join('\n');
};

const getStepText = (line: string) =>
  line.replace(/^\s*(?:\d{1,2}[.、)]|第[一二三四五六七八九十\d]+步|步骤\s*\d+|step\s*\d+)\s*[:：-]?\s*/i, '').trim() || line.trim();

const isSectionHeading = (line: string) => {
  const cleaned = line.trim();
  if (cleaned.length < 2 || cleaned.length > 32) return false;
  if (extractKeyValuePairs(cleaned).length > 0 || isTableLine(cleaned) || isStepLine(cleaned)) return false;
  return /(信息|内容|说明|要求|配置|详情|总览|流程|结果|记录|模块|页面|概况|摘要|经历|教育|项目|技能)$/.test(cleaned);
};

const buildStructuredChunks = (sourceImage: string, ocrText?: string): ImageKnowledgeChunk[] => {
  const lines = uniqueLines(splitOcrLines(ocrText));
  if (lines.length === 0) {
    return [
      makeChunk(
        sourceImage,
        'structured-no-text',
        'document_summary',
        '结构化图片识别结果',
        '当前图片被识别为结构化图片，但 OCR 没有提取到清晰文字。请上传更清晰的表格、表单、票据、证件或截图；生产环境建议配置 VITE_OCR_ENDPOINT 或 VITE_IMAGE_VISION_ENDPOINT 后端识别服务。',
        { imageType: 'structured' }
      )
    ];
  }

  const chunks: ImageKnowledgeChunk[] = [];
  const usedLineIndexes = new Set<number>();
  const titleIndex = lines.findIndex(isLikelyTitleLine);

  if (titleIndex >= 0) {
    usedLineIndexes.add(titleIndex);
    chunks.push(makeChunk(
      sourceImage,
      'structured-title',
      'document_title',
      '标题',
      lines[titleIndex],
      { imageType: 'structured', lineIndex: titleIndex }
    ));
  }

  const tableRows = lines
    .map((line, index) => ({ index, cells: splitTableCells(line) }))
    .filter(row => row.cells.length >= 3);
  if (tableRows.length >= 2) {
    const rows = tableRows.map(row => row.cells);
    const [header, ...bodyRows] = rows;
    const tableMarkdown = createMarkdownTable(rows);
    tableRows.forEach(row => usedLineIndexes.add(row.index));

    chunks.push({
      ...makeChunk(
        sourceImage,
        'structured-table-summary',
        'table_summary',
        '表格摘要',
        [
          `识别到一个表格，共 ${bodyRows.length} 行数据、${header.length} 个字段。`,
          `字段：${header.join('、')}`,
          '',
          tableMarkdown
        ].join('\n'),
        { imageType: 'structured', tableRowCount: bodyRows.length, tableColumnCount: header.length }
      ),
      tableMarkdown
    });

    bodyRows.slice(0, 18).forEach((row, rowIndex) => {
      const values = header.map((field, colIndex) => `${field}：${row[colIndex] || '-'}`);
      chunks.push({
        ...makeChunk(
          sourceImage,
          `structured-table-row-${rowIndex + 1}`,
          'table_row',
          `表格第 ${rowIndex + 1} 行`,
          values.join('\n'),
          { imageType: 'structured', rowIndex: rowIndex + 1 }
        ),
        rowIndex: rowIndex + 1,
        tableMarkdown
      });
    });
  }

  lines.forEach((line, lineIndex) => {
    if (usedLineIndexes.has(lineIndex) || isTableLine(line)) return;
    const pairs = extractKeyValuePairs(line);
    pairs.forEach((pair, pairIndex) => {
      chunks.push(makeChunk(
        sourceImage,
        `structured-field-${lineIndex}-${pairIndex}`,
        'kv_field',
        pair.key,
        `${pair.key}：${pair.value}`,
        { imageType: 'structured', lineIndex }
      ));
    });
    if (pairs.length > 0) usedLineIndexes.add(lineIndex);
  });

  lines.forEach((line, lineIndex) => {
    if (usedLineIndexes.has(lineIndex) || !isStepLine(line)) return;
    usedLineIndexes.add(lineIndex);
    const stepOrder = chunks.filter(chunk => chunk.chunkType === 'step').length + 1;
    chunks.push(makeChunk(
      sourceImage,
      `structured-step-${stepOrder}`,
      'step',
      `步骤 ${stepOrder}`,
      getStepText(line),
      { imageType: 'structured', order: stepOrder, lineIndex }
    ));
  });

  let sectionBuffer: string[] = [];
  let sectionTitle = '';
  const flushSection = () => {
    const content = sectionBuffer.join('\n').trim();
    if (!content) return;
    const sectionIndex = chunks.filter(chunk => chunk.chunkType === 'text_section').length + 1;
    chunks.push(makeChunk(
      sourceImage,
      `structured-section-${sectionIndex}`,
      'text_section',
      sectionTitle || `版块 ${sectionIndex}`,
      content,
      { imageType: 'structured', sectionIndex }
    ));
    sectionBuffer = [];
    sectionTitle = '';
  };

  lines.forEach((line, lineIndex) => {
    if (usedLineIndexes.has(lineIndex) || isTableLine(line) || extractKeyValuePairs(line).length > 0 || isStepLine(line)) return;
    if (isSectionHeading(line)) {
      flushSection();
      sectionTitle = line;
      return;
    }
    sectionBuffer.push(line);
  });
  flushSection();

  if (chunks.length === 0) {
    chunks.push(makeChunk(
      sourceImage,
      'structured-readable-content',
      'text_section',
      '识别内容',
      lines.join('\n'),
      { imageType: 'structured' }
    ));
  }

  return chunks.slice(0, MAX_STRUCTURED_CHUNKS);
};

const formatVisionLabels = (visionLabels: Array<{ label: string; score: number }> = []) =>
  visionLabels
    .filter(item => item.label)
    .slice(0, 6)
    .map(item => `${item.label}${Number.isFinite(item.score) ? `（置信度 ${Math.round(item.score * 100)}%）` : ''}`);

const getPlainVisionLabels = (visionLabels: Array<{ label: string; score: number }> = []) =>
  visionLabels
    .filter(item => item.label)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .map(item => item.label);

const getUnstructuredObjectSentence = (labels: string[]) => {
  const names = Array.from(new Set(labels)).slice(0, 4);
  if (names.length === 0) return '';
  if (names.some(name => /水杯|保温杯|饮水瓶|瓶子|杯/.test(name))) {
    return `图片中可以看到${names.join('、')}，主体是杯类/瓶类产品，能看到杯盖、杯身等可见外观信息。`;
  }
  return `图片中可以看到${names.join('、')}等主要对象或场景。`;
};

const buildUnstructuredChunks = (
  baseName: string,
  sourceImage: string,
  ocrText?: string,
  visionLabels: Array<{ label: string; score: number }> = [],
  visionCaption = '',
  visionStatus?: 'ready' | 'empty' | 'failed'
): ImageKnowledgeChunk[] => {
  const lines = uniqueLines(splitOcrLines(ocrText)).filter(isUsefulOcrLine);
  const labelLines = formatVisionLabels(visionLabels);
  const plainLabels = getPlainVisionLabels(visionLabels);
  const objectSentence = getUnstructuredObjectSentence(plainLabels);
  const visibleContent: string[] = [];

  if (visionCaption.trim()) {
    visibleContent.push(`整图描述：${visionCaption.trim()}`);
  }
  if (objectSentence) {
    visibleContent.push(objectSentence);
  }
  if (labelLines.length > 0) {
    visibleContent.push(`主要可见对象/场景：${labelLines.join('、')}。`);
  }
  if (lines.length > 0) {
    visibleContent.push(`图片中可读文字：\n${lines.join('\n')}`);
  }
  if (visibleContent.length === 0) {
    visibleContent.push(
      visionStatus === 'failed'
        ? '当前没有识别到可读文字，图片理解模型也未成功返回结果。页面保留原图，不使用模板文案冒充图片内容。'
        : '当前没有识别到可读文字，也没有可用的主要对象识别结果。请上传更清晰图片，或配置 VITE_IMAGE_VISION_ENDPOINT 后端 VLM 服务生成整图描述。'
    );
  }

  const chunks: ImageKnowledgeChunk[] = [
    makeChunk(
      sourceImage,
      'image-description',
      'image_description',
      '整图描述',
      [`${baseName} 的可见内容：`, ...visibleContent].join('\n'),
      {
        imageType: 'unstructured',
        visionStatus: visionStatus || 'empty',
        ocrLineCount: lines.length,
        hasVisionCaption: Boolean(visionCaption.trim())
      }
    )
  ];

  if (labelLines.length > 0) {
    chunks.push(makeChunk(
      sourceImage,
      'visible-objects',
      'object',
      '主要对象/场景',
      [
        objectSentence || '图片中可见的主要内容包括：',
        ...labelLines.map(label => `- ${label}`),
        '',
        '这里只描述模型识别到的可见对象或场景，不补充图片里看不到的业务结论。'
      ].join('\n'),
      {
        imageType: 'unstructured',
        visionStatus: visionStatus || 'ready',
        objectCount: labelLines.length
      }
    ));
  }

  if (lines.length > 0) {
    chunks.push(makeChunk(
      sourceImage,
      'visible-ocr-text',
      'ocr_text',
      '可见文字',
      lines.join('\n'),
      {
        imageType: 'unstructured',
        ocrLineCount: lines.length
      }
    ));
  }

  return chunks;
};

export const isSemanticImageChunk = (chunk: Pick<ImageKnowledgeChunk, 'metadata'>) =>
  chunk.metadata?.sliceVersion === IMAGE_SLICE_VERSION;

export const getImageChunkTypeLabel = (chunkType: string) => {
  const labels: Record<string, string> = {
    image_description: '整图描述',
    document_summary: '整体摘要',
    document_title: '标题',
    ocr_text: '可见文字',
    kv_field: '字段和值',
    text_section: '版块内容',
    table_summary: '表格摘要',
    table_header: '表头',
    table_row: '表格行',
    chart_summary: '图表摘要',
    data_point: '数据点',
    relation: '关系',
    step: '编号步骤',
    object: '主要对象',
    area: '区域',
    state: '状态',
    ui_region: '模块区域',
    ui_control: '按钮/输入框'
  };
  return labels[chunkType] || '图片切片';
};

export const analyzeKnowledgeImage = ({ name, previewUrl, ocrText, visionLabels, visionCaption, visionStatus }: ImageAnalysisInput): ImageAnalysisResult => {
  const sourceImage = previewUrl || name;
  const baseName = getBaseName(name);
  const imageType = inferImageKindFromOcr(name, ocrText, visionCaption);
  return {
    imageType,
    sourceImage,
    chunks: imageType === 'structured'
      ? buildStructuredChunks(sourceImage, ocrText)
      : buildUnstructuredChunks(baseName, sourceImage, ocrText, visionLabels, visionCaption, visionStatus)
  };
};
