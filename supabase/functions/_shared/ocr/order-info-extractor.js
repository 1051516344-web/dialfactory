/* ============================================================
   DialFactory OCR Edge Function · 订单信息提取器（order-info-extractor）

   从 aliyun-ocr-test/order-info-extractor.js 逐字移植（CommonJS → ESM）。
   用「OCR 坐标定位 + 几何规则」替代 Vision 模型，识别 6 个订单字段：
     order_number        订单编号（客户 PO）
     production_number   生产编号（R / SA / SH 开头）
     customer_name       客户名称（生产编号同行左侧纯英文短代号）
     delivery_date       交货日期
     order_quantity      订单数量
     base_texture        底纹处理（复用 extract-base-texture + texture-normalizer）

   仅保留纯函数部分，删除 CLI / fs / path / process。
   识别规则、容差常量与 localhost:3200 版本完全一致，不改任何逻辑。
   ============================================================ */

import { normalizeWords, normalize, extractBaseTextureRaw } from './extract-base-texture.js';
import { parseBaseTexture } from './texture-normalizer.js';

/* ---------- 几何基础 ---------- */
function isVerticalBox(w) {
  return Math.abs(Number(w.angle) || 0) >= 60;
}
function fontH(w) {
  return isVerticalBox(w) ? Math.max(w.width, 1) : Math.max(w.height, 1);
}
function centerY(w) {
  return w.y + w.height / 2;
}

const TOL = {
  RIGHT_MAX: 6,
  BELOW_MAX: 2.5,
  CENTER_TOL: 0.75,
  HTOL: 2.0,
  EDGE: 0.3,
};

/* 边界标签（其它字段标签）——命中即不作为「值」被选中 */
const BOUNDARY = [
  '壳号', '订单号码', '订单编号', '订单号', '订单数量',
  '生产编号', '生产', '客户名称', '客户',
  '交货日期', '交期', '交货',
  '数量', '模号', '型号',
  '制图', '检图', '复图', '备注', '流程', '材料', '板厚', '颜色',
  '底纹', '底质', '粗胚', '印刷色', '网印色',
  '字钉', '直径', '外径', '足径', '开面', '表面', '时位', '图样', '日期', '号',
  '壳', '芯', '母', '机', '高', '中',
  '时针', '眼针', '分针', '粗胚', '板面',
];
function isBoundary(t) {
  return BOUNDARY.some((b) => t.includes(b));
}

/* ---------- 字段标签判定（normalize 后 contains 匹配） ---------- */
function isOrderNumberLabel(t) {
  if (t.includes('订单号') || t.includes('订单编号')) return true;
  return /(order\s*no|^po$|pono|p\.o\.)/i.test(t);
}
function isOrderQuantityLabel(t) {
  if (t.includes('订单数量')) return true;
  if (t.includes('数量') && !t.includes('粗胚') && !t.includes('壳')) return true;
  return /(qty|pcs)/i.test(t);
}
function isDeliveryLabel(t) {
  return t.includes('交货日期') || t.includes('交期') || t.includes('交货')
    || /(delivery|date)/i.test(t);
}
function isProductionLabel(t) {
  return t.includes('生产编号') || t.includes('生产') || t.includes('型号')
    || /(model|item\s*no)/i.test(t);
}

/* ---------- 标签附近取值：右侧优先，下方兜底，中线对齐选最近 ---------- */
function pickValue(words, label) {
  const fh = fontH(label);
  const vertical = isVerticalBox(label);
  const centerTol = vertical ? TOL.CENTER_TOL * label.height : 1.5 * fh;
  const right = label.x + label.width;
  const bottom = label.y + label.height;
  const left = label.x;
  const lcy = centerY(label);

  function isValueLike(w) {
    const t = normalize(w.word);
    if (t.length <= 1) return false;
    if (Math.max(w.width, w.height) > 6 * fh) return false;
    if (isBoundary(t)) return false;
    return true;
  }

  const rightCands = [];
  for (const w of words) {
    if (w === label) continue;
    if (w.x < right - TOL.EDGE * fh) continue;
    if (w.x > right + TOL.RIGHT_MAX * fh) continue;
    if (Math.abs(centerY(w) - lcy) > centerTol) continue;
    if (!isValueLike(w)) continue;
    rightCands.push(w);
  }
  rightCands.sort((a, b) => {
    const da = Math.abs(centerY(a) - lcy);
    const db = Math.abs(centerY(b) - lcy);
    if (da !== db) return da - db;
    return a.x - b.x;
  });

  const belowCands = [];
  for (const w of words) {
    if (w === label) continue;
    if (w.y < bottom - TOL.EDGE * fh) continue;
    if (w.y > bottom + TOL.BELOW_MAX * fh) continue;
    if (w.x + w.width < left - TOL.HTOL * fh) continue;
    if (w.x > right + TOL.HTOL * fh) continue;
    if (!isValueLike(w)) continue;
    belowCands.push(w);
  }
  belowCands.sort((a, b) => a.y - b.y);

  const sameLine = rightCands.filter((w) => Math.abs(centerY(w) - lcy) <= 0.6 * fh).length;

  return { rightCands, belowCands, primary: rightCands[0] || belowCands[0] || null, sameLine };
}

function wordsToStr(list) {
  return list.map((w) => w.word);
}

function fmtWordCoords(w) {
  return { word: w.word, prob: w.prob, x: w.x, y: w.y, width: w.width, height: w.height, angle: w.angle };
}

function shapeSig(str) {
  return String(str).replace(/[A-Za-z]/g, 'L').replace(/[0-9]/g, 'D');
}

function joinRealOrderNumbers(primary, candCoords) {
  if (!primary) return '';
  const sig = shapeSig(primary.word);
  const vertical = isVerticalBox(primary);
  const picked = [];
  for (const c of candCoords) {
    if (c.word === primary.word) continue;
    if (shapeSig(c.word) !== sig) continue;
    if (isVerticalBox(c) !== vertical) continue;
    picked.push(c);
  }
  picked.push({ word: primary.word, x: primary.x, y: primary.y });
  picked.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  return picked.map((w) => w.word).join(' / ');
}

/* ---------- 1. 订单编号 ---------- */
export function extractOrderNumber(words) {
  const label = words.find((w) => isOrderNumberLabel(normalize(w.word)));
  if (!label) {
    return { value: '', found: false, source: 'label', reason: '未找到「订单号码/订单号/PO」标签', candidates: [], order_number_candidates: [], order_number_joined: '' };
  }
  const { rightCands, belowCands, primary, sameLine } = pickValue(words, label);
  const candidates = rightCands.length ? rightCands : belowCands;

  const seen = new Set();
  const orderNumberCandidates = [];
  for (const w of rightCands.concat(belowCands)) {
    if (seen.has(w)) continue;
    seen.add(w);
    orderNumberCandidates.push(fmtWordCoords(w));
  }
  orderNumberCandidates.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  const orderNumberJoined = joinRealOrderNumbers(primary, orderNumberCandidates);

  return {
    value: primary ? primary.word : '',
    found: !!primary,
    source: 'label',
    label: label.word,
    candidates: wordsToStr(candidates),
    order_number_candidates: orderNumberCandidates,
    order_number_joined: orderNumberJoined,
    ambiguous: sameLine >= 2,
  };
}

/* ---------- 2. 生产编号（R/SA/SH 开头，右下角，优先模式匹配） ---------- */
const PROD_RE = /^(R|SA|SH|D)[-]?[0-9]{4,}$/i;
export function extractProductionNumber(words) {
  let pageTop = Infinity;
  let pageBottom = -Infinity;
  for (const w of words) {
    if (w.y < pageTop) pageTop = w.y;
    if (w.y + w.height > pageBottom) pageBottom = w.y + w.height;
  }
  const midY = pageTop + (pageBottom - pageTop) / 2;

  const cands = words.filter((w) => {
    const t = String(w.word).trim();
    if (!PROD_RE.test(t)) return false;
    if (/[，,单翻*]/.test(t)) return false;
    if (w.y + w.height < midY) return false;
    return true;
  });
  cands.sort((a, b) => b.y - a.y);

  let labelValue = null;
  const label = words.find((w) => isProductionLabel(normalize(w.word)));
  if (label) {
    const { primary } = pickValue(words, label);
    labelValue = primary ? primary.word : null;
  }

  const prodWord = cands[0] || null;
  const value = prodWord ? prodWord.word : (labelValue || '');
  return {
    value,
    found: !!value,
    source: prodWord ? 'pattern' : (labelValue ? 'label' : 'none'),
    candidates: cands.map((w) => w.word),
    reason: value ? undefined : '未找到 R/SA/SH/D 开头编号，也无「生产编号」标签',
  };
}

/* ---------- 3. 客户名称（无固定标签：生产编号附近短代号，仅候选不强行判断） ---------- */
export function extractCustomerName(words, prodWord) {
  const label = words.find((w) => normalize(w.word).includes('客户名称'));
  if (label) {
    const { primary } = pickValue(words, label);
    return { value: primary ? primary.word : '', found: !!primary, source: 'label', candidates: primary ? [primary.word] : [] };
  }
  if (!prodWord) {
    return { value: '', found: false, source: 'positional', candidates: [], reason: '无「客户名称」标签且无生产编号可定位' };
  }
  const fh = fontH(prodWord);
  const pcy = centerY(prodWord);
  const pcx = prodWord.x;
  const sameRowTol = 0.75 * fh;
  const leftGapMax = 8 * fh;
  const cands = [];
  for (const w of words) {
    if (w === prodWord) continue;
    const t = String(w.word).trim();
    if (!/^[A-Za-z]{2,6}$/.test(t)) continue;
    if (w.x + w.width > pcx + 0.5 * fh) continue;
    if (pcx - (w.x + w.width) > leftGapMax) continue;
    if (Math.abs(centerY(w) - pcy) > sameRowTol) continue;
    cands.push(w);
  }
  cands.sort((a, b) => (pcx - (a.x + a.width)) - (pcx - (b.x + b.width)));
  const primary = cands[0] || null;
  return {
    value: primary ? primary.word : '',
    found: !!primary,
    source: 'positional',
    candidates: cands.map((w) => w.word),
    reason: primary ? undefined : '无固定标签，且生产编号同行左侧无纯英文 2~6 位候选',
  };
}

/* ---------- 4. 交货日期（内联「交货日期：/交期：」优先，标签+值兜底） ---------- */
export function extractDeliveryDate(words) {
  const inline = [];
  for (const w of words) {
    const m = String(w.word).match(/(?:交货日期|交期)\s*[:：]\s*(.+)/);
    if (m && m[1].trim()) inline.push({ word: w, value: m[1].trim() });
  }
  if (inline.length) {
    inline.sort((a, b) => a.word.y - b.word.y);
    return { value: inline[0].value, found: true, source: 'inline', candidates: inline.map((x) => x.value) };
  }
  const label = words.find((w) => isDeliveryLabel(normalize(w.word)));
  if (label) {
    const { rightCands, belowCands, primary, sameLine } = pickValue(words, label);
    return {
      value: primary ? primary.word : '',
      found: !!primary,
      source: 'label',
      candidates: wordsToStr(rightCands.length ? rightCands : belowCands),
      ambiguous: sameLine >= 2,
    };
  }
  return { value: '', found: false, source: 'none', reason: '未找到「交货日期/交期」', candidates: [] };
}

/* ---------- 5. 订单数量 ---------- */
export function extractOrderQuantity(words) {
  const label = words.find((w) => isOrderQuantityLabel(normalize(w.word)));
  if (!label) {
    return { value: '', found: false, source: 'label', reason: '未找到「订单数量/数量/Qty」标签', candidates: [] };
  }
  const { rightCands, belowCands, primary, sameLine } = pickValue(words, label);
  const candidates = rightCands.length ? rightCands : belowCands;
  return {
    value: primary ? primary.word : '',
    found: !!primary,
    source: 'label',
    label: label.word,
    candidates: wordsToStr(candidates),
    ambiguous: sameLine >= 2,
  };
}

/* ---------- 主入口：输入 → 6 字段 + debug ---------- */
export function extractOrderInfo(input) {
  const words = normalizeWords(input);
  const warnings = [];

  const on = extractOrderNumber(words);
  const pn = extractProductionNumber(words);
  const cn = extractCustomerName(words, pn.found ? words.find((w) => w.word === pn.value) : null);
  const dd = extractDeliveryDate(words);
  const oq = extractOrderQuantity(words);

  let baseTexture = { raw: '', candidates: [] };
  try {
    const bt = extractBaseTextureRaw(input);
    if (bt && bt.found && bt.base_texture_raw) {
      const norm = parseBaseTexture(bt.base_texture_raw);
      baseTexture = { raw: bt.base_texture_raw, candidates: (norm && norm.candidates) || [] };
    }
  } catch (e) {
    warnings.push('base_texture: ' + ((e && e.message) ? e.message : String(e)));
  }

  if (on.ambiguous) warnings.push('order_number: 存在多个候选值（需人工确认）');
  if (oq.ambiguous) warnings.push('order_quantity: 存在多个候选值（需人工确认）');
  if (!cn.found && cn.candidates.length === 0) warnings.push('customer_name: ' + (cn.reason || '无候选'));

  return {
    order_number: on.value,
    order_number_joined: on.order_number_joined,
    production_number: pn.value,
    customer_name: cn.value,
    base_texture: baseTexture,
    delivery_date: dd.value,
    order_quantity: oq.value,
    debug: {
      warnings,
      customer_candidates: cn.candidates,
      order_number_candidates: on.order_number_candidates,
      order_number: on,
      production_number: pn,
      customer_name: cn,
      delivery_date: dd,
      order_quantity: oq,
    },
  };
}
