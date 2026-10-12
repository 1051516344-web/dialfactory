/* ============================================================
   DialFactory OCR Edge Function · 「底质/底纹处理」原文提取

   从 aliyun-ocr-test/extract-base-texture.js 逐字移植（CommonJS → ESM）。
   仅保留纯函数部分（normalize / normalizeWords / extractBaseTextureRaw），
   删除 CLI / callOcr / fs / path / process（这些由 Edge Function 层负责）。
   提取规则、容差常量与 localhost:3200 版本完全一致，不改任何逻辑。

   输入：RecognizeGeneral 的 prism_wordsInfo（词数组或完整响应）
   输出：{ found, base_texture_raw, ... }
   ============================================================ */

/* ---------- 1. 文本归一化：去空白、去中英文冒号（只用于「匹配」，不影响原文输出） ---------- */
export function normalize(s) {
  return String(s == null ? '' : s)
    .replace(/\s+/g, '')
    .replace(/[:：]/g, '');
}

/* ---------- 2. 标签 / 排除词（normalize 后 contains 匹配） ---------- */
const LABEL_PATTERNS = ['底纹', '底质', '底砂'];
export function isTextureLabelWord(word) {
  const t = normalize(word);
  return LABEL_PATTERNS.some((p) => t.includes(p));
}

const BOUNDARY_LABEL_PATTERNS = [
  '订单号码', '订单编号', '订单号', '订单数量',
  '生产编号', '生产',
  '客户名称', '客户',
  '交货日期', '交期', '交货',
  '数量', '壳号',
  '制图', '检图', '复图',
  '备注', '流程', '材料', '板厚', '颜色', '网印色',
];
function isBoundaryLabelWord(word) {
  const t = normalize(word);
  return BOUNDARY_LABEL_PATTERNS.some((p) => t.includes(p));
}
export function isOtherLabelWord(word) {
  return isBoundaryLabelWord(word);
}

/* ---------- 3. 输入归一化：兼容「完整响应 / 裸词数组」 ---------- */
export function normalizeWords(input) {
  let arr;
  if (Array.isArray(input)) {
    arr = input;
  } else if (Array.isArray(input && input.Data && input.Data.prism_wordsInfo)) {
    arr = input.Data.prism_wordsInfo;
  } else if (Array.isArray(input && input.Data && input.Data.PrismWordsInfo)) {
    arr = input.Data.PrismWordsInfo;
  } else if (Array.isArray(input && input.data && input.data.prism_wordsInfo)) {
    arr = input.data.prism_wordsInfo;
  } else {
    throw new Error('未找到 prism_wordsInfo 词数组（请确认 JSON 是 RecognizeGeneral 响应或裸词数组）');
  }
  return arr
    .map((w) => ({
      word: String(w.word == null ? '' : w.word),
      prob: w.prob !== undefined ? w.prob : w.probability,
      x: Number(w.x || 0),
      y: Number(w.y || 0),
      width: Number(w.width || 0),
      height: Number(w.height || 0),
      angle: w.angle,
    }))
    .filter((w) => w.word.trim() !== '');
}

/* ---------- 4. 合并「处理」片段：标签词右侧同行的独立「处理」词并入标签框 ---------- */
function mergeLabelFragments(words, labelWord) {
  const h = Math.max(labelWord.height || 1, 1);
  const merged = {
    x: labelWord.x,
    y: labelWord.y,
    right: labelWord.x + labelWord.width,
    bottom: labelWord.y + labelWord.height,
    origin: labelWord,
    words: [labelWord],
  };
  for (const w of words) {
    if (w === labelWord) continue;
    if (normalize(w.word) !== '处理') continue;
    const sameRow = Math.abs(w.y - labelWord.y) < 0.6 * h;
    const rightSide = w.x >= labelWord.x + labelWord.width - 0.5 * h
      && w.x <= labelWord.x + labelWord.width + 2.5 * h;
    if (sameRow && rightSide) {
      merged.x = Math.min(merged.x, w.x);
      merged.y = Math.min(merged.y, w.y);
      merged.right = Math.max(merged.right, w.x + w.width);
      merged.bottom = Math.max(merged.bottom, w.y + w.height);
      merged.words.push(w);
    }
  }
  merged.width = merged.right - merged.x;
  merged.height = merged.bottom - merged.y;
  return merged;
}

/* ---------- 4b. 竖排标签判定 / 有效字号 / 内联值 / 右侧第一列 ---------- */
function isVerticalLabel(label) {
  const angle = label && label.origin && label.origin.angle;
  return Math.abs(Number(angle) || 0) >= 60;
}

function effectiveFontSize(label) {
  return isVerticalLabel(label)
    ? Math.max(label.width || 1, 1)
    : Math.max(label.height || 1, 1);
}

function extractInlineValue(labelText) {
  const m = String(labelText || '').match(/底[质纹砂](?:处理)?[:：]?(.*)$/);
  return m ? m[1] : '';
}

function collectVerticalRightColumn(words, label, opts) {
  const h = Math.max(label.width || 1, 1);
  const labelTop = label.y;
  const labelBottom = label.y + label.height;
  const labelCenterY = (labelTop + labelBottom) / 2;
  const labelRight = label.x + label.width;

  const candidates = [];
  for (const w of words) {
    if (w === label.origin || label.words.includes(w)) continue;
    const wTop = w.y;
    const wBottom = w.y + w.height;
    const wLeft = w.x;
    const toRight = wLeft >= labelRight - 0.3 * h;
    const yNear = Math.abs((wTop + wBottom) / 2 - labelCenterY) <= 0.5 * label.height;
    if (toRight && yNear && !isBoundaryLabelWord(w.word)) {
      candidates.push(w);
    }
  }
  if (!candidates.length) return [];

  const minX = Math.min(...candidates.map((w) => w.x));
  const firstColumn = candidates.filter((w) => w.x <= minX + opts.lineTolRows * h);
  firstColumn.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  return firstColumn;
}

/* ---------- 5. 收集候选词：下面（主）/ 右面（辅），相对标签高度做容差 ---------- */
export const DEFAULT_OPTIONS = {
  yAxisDown: true,
  belowMaxRows: 2.5,
  lineTolRows: 0.6,
  hTolRows: 2.0,
  rightTolRows: 3.0,
  rowTolRows: 0.6,
  horizontalJumpRows: 3.5,
};

function collectCandidates(words, label, opts) {
  const h = effectiveFontSize(label);
  const labelTop = label.y;
  const labelBottom = label.y + label.height;
  const labelLeft = label.x;
  const labelRight = label.x + label.width;

  const belowAll = [];
  const rightAll = [];

  for (const w of words) {
    if (w === label.origin || label.words.includes(w)) continue;

    const wTop = w.y;
    const wBottom = w.y + w.height;
    const wLeft = w.x;
    const wRight = w.x + w.width;

    if (!opts.yAxisDown) continue;

    const below = wTop >= labelBottom - 0.3 * h
      && wTop <= labelBottom + opts.belowMaxRows * h
      && wRight > labelLeft - opts.hTolRows * h
      && wLeft < labelRight + opts.hTolRows * h;
    const right = wLeft >= labelRight - 0.3 * h
      && wLeft <= labelRight + opts.rightTolRows * h
      && wTop < labelBottom + opts.rowTolRows * h
      && wBottom > labelTop - opts.rowTolRows * h;

    if (below) belowAll.push(w);
    else if (right) rightAll.push(w);
  }

  let belowFirstLine = [];
  if (belowAll.length) {
    const minTop = Math.min(...belowAll.map((w) => w.y));
    belowFirstLine = belowAll.filter((w) => w.y <= minTop + opts.lineTolRows * h);
  }

  return { below: belowFirstLine, right: rightAll };
}

/* ---------- 6. 核心规则 ---------- */
export function extractBaseTextureRaw(input, options) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const words = normalizeWords(input);

  const labels = words.filter((w) => isTextureLabelWord(w.word));
  if (labels.length === 0) {
    return {
      found: false,
      reason: '未找到「底质/底纹处理」标签',
      base_texture_raw: null,
      label: null,
      selected_words: [],
      rejected_boundary_words: [],
      raw_before_trim: '',
      raw_after_trim: '',
      below_words: [],
      right_words: [],
      all_candidates: [],
      debug: { labelCount: 0, candidateCount: 0, belowCount: 0, rightCount: 0, sourceIsBelow: false, options: opts },
    };
  }

  const label = mergeLabelFragments(words, labels[0]);
  const isVertical = isVerticalLabel(label);
  const h = effectiveFontSize(label);
  const labelText = label.words.map((w) => w.word).join('');
  const { below, right } = collectCandidates(words, label, opts);

  let sourceIsBelow;
  let sourceInline = false;
  let inlineValue = '';
  let source;
  if (isVertical) {
    inlineValue = extractInlineValue(labelText);
    if (inlineValue !== '') {
      sourceInline = true;
      sourceIsBelow = false;
      source = [];
    } else {
      sourceIsBelow = false;
      source = collectVerticalRightColumn(words, label, opts);
    }
  } else {
    sourceIsBelow = below.length > 0;
    source = (sourceIsBelow ? below : right).slice().sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  }

  const selected = [];
  const rejected = [];
  let raw_before_trim;
  let raw_after_trim;
  if (sourceInline) {
    raw_before_trim = inlineValue;
    raw_after_trim = inlineValue;
  } else {
    let stopped = false;
    let prevRight = null;
    for (const w of source) {
      if (stopped) { rejected.push(w); continue; }
      if (isBoundaryLabelWord(w.word)) { rejected.push(w); stopped = true; continue; }
      if (prevRight !== null && w.x - prevRight > opts.horizontalJumpRows * h) {
        rejected.push(w); stopped = true; continue;
      }
      selected.push(w);
      prevRight = Math.max(prevRight === null ? w.x + w.width : prevRight, w.x + w.width);
    }
    raw_before_trim = source.map((w) => w.word).join('');
    raw_after_trim = selected.map((w) => w.word).join('');
  }

  const ltIdx = raw_after_trim.indexOf('<');
  if (ltIdx !== -1) raw_after_trim = raw_after_trim.slice(0, ltIdx);
  const base_texture_raw = raw_after_trim !== '' ? raw_after_trim : null;

  return {
    found: true,
    base_texture_raw,
    label: {
      text: labelText,
      x: label.x, y: label.y, width: label.width, height: label.height,
    },
    selected_words: selected.map(fmtWord),
    rejected_boundary_words: rejected.map(fmtWord),
    raw_before_trim,
    raw_after_trim,
    below_words: sourceIsBelow ? selected.map(fmtWord) : [],
    right_words: !sourceIsBelow && !sourceInline ? selected.map(fmtWord) : [],
    all_candidates: source.map((w) => ({ ...fmtWord(w), region: sourceIsBelow ? 'below' : 'right', selected: selected.includes(w) })),
    debug: {
      labelCount: labels.length,
      candidateCount: source.length,
      belowCount: below.length,
      rightCount: right.length,
      sourceIsBelow,
      sourceInline,
      isVertical,
      options: opts,
    },
  };
}

function fmtWord(w) {
  return { word: w.word, prob: w.prob, x: w.x, y: w.y, width: w.width, height: w.height, angle: w.angle };
}
