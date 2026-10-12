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
// S01 修复：补繁体「底質 / 底紋」。样本 S01 图纸写的是繁体「底質處理：」，
// 原先只认简体，导致真标签漏判，而含「无底纹」的值块被子串误判成标签。
const LABEL_PATTERNS = ['底纹', '底质', '底砂', '底質', '底紋'];
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
    // S01 修复：容忍窗改为「字号基准 + 标签高度上限」。
    // 原为纯 0.5*label.height：标签被错认成长值块时（S01 为 286px）会撑到 ±143px，把远距离备注扫进来。
    // 上限取 2.0*h（h = 竖排字号 = label.width）：常见 4 字标签下 0.5*label.height ≈ 2.0*h 行为不变；
    // 超长「标签」则被收紧（S01 误判场景下 ±40px，仍排除中心距 85/100px 的备注）。
    const yTol = Math.min(0.5 * label.height, 2.0 * h);
    const yNear = Math.abs((wTop + wBottom) / 2 - labelCenterY) <= yTol;
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

/* ---------- 5b. S01 修复：标签选取加「形态」约束 ---------- */
/* 原先盲取 labels[0]：当值块自身含「底纹」时（S01 的「…/D无底纹」）会被当成标签，
   其超长 height 又把竖排容忍窗撑大，最终扫入旁边备注。这里按形态优先挑真标签。 */
function pickTextureLabel(labels, warnings) {
  if (!labels || labels.length === 0) return null;

  // 1) 最优先：以「处理 / 處理」结尾（真标签的典型形态）
  const withProcess = labels.filter((w) => /(处理|處理)[:：]?$/.test(normalize(w.word)));
  if (withProcess.length) {
    // 同为「处理」结尾时取最短的一个，避免把「喷砂处理」这类长值当作标签
    return withProcess.slice().sort(
      (a, b) => Math.max(a.width || 0, a.height || 0) - Math.max(b.width || 0, b.height || 0),
    )[0];
  }

  // 2) 其次：同 x 列内有明显更短的候选（值块通常远长于标签）
  const ref = labels[0];
  const colTol = 0.6 * Math.max(ref.width || 1, 1);
  const column = labels.filter((w) => Math.abs(w.x - ref.x) <= colTol);
  if (column.length >= 2) {
    const byLen = column.slice().sort(
      (a, b) => Math.max(a.width || 0, a.height || 0) - Math.max(b.width || 0, b.height || 0),
    );
    const shortest = Math.max(byLen[0].width || 0, byLen[0].height || 0);
    const next = Math.max(byLen[1].width || 0, byLen[1].height || 0);
    if (shortest < next) return byLen[0];
  }

  // 3) 兜底：退回 labels[0]，并记一条 warning（仅随 debug 返回，不影响字段值）
  if (warnings) {
    warnings.push('base_texture: 标签候选未命中形态规则，按原顺序回退 labels[0]=' + labels[0].word);
  }
  return labels[0];
}

/* ---------- 6. 核心规则 ---------- */
export function extractBaseTextureRaw(input, options) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const words = normalizeWords(input);
  const labelWarnings = [];   // S01 修复：标签选取告警，随 debug 返回

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
      debug: { labelCount: 0, candidateCount: 0, belowCount: 0, rightCount: 0, sourceIsBelow: false, options: opts, labelWarnings },
    };
  }

  // S01 修复：不再盲取 labels[0]，改为按「形态」挑选标签（见 pickTextureLabel）
  const label = mergeLabelFragments(words, pickTextureLabel(labels, labelWarnings));
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
      labelWarnings,
    },
  };
}

function fmtWord(w) {
  return { word: w.word, prob: w.prob, x: w.x, y: w.y, width: w.width, height: w.height, angle: w.angle };
}
