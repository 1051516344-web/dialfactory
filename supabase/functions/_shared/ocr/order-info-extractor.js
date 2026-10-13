/* ============================================================
   DialFactory OCR Edge Function · 订单信息提取器（order-info-extractor）

   从 aliyun-ocr-test/order-info-extractor.js 逐字移植（CommonJS → ESM）。
   用「OCR 坐标定位 + 几何规则」替代 Vision 模型，识别 5 个订单字段：
     order_number        订单编号（客户 PO）
     production_number   生产编号（R / SA / SH 开头）
     customer_name       客户名称（生产编号同行左侧纯英文短代号）
     delivery_date       交货日期
     order_quantity      订单数量

   仅保留纯函数部分，删除 CLI / fs / path / process。
   识别规则、容差常量与 localhost:3200 版本完全一致，不改任何逻辑。

   注：底纹（base_texture）已按业务决定停用，本文件不再提取该字段。
   extract-base-texture.js / texture-normalizer.js 仍保留在仓库中（此文件不再调用）。
   ============================================================ */

import { normalizeWords, normalize } from './extract-base-texture.js';

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
  // S01：图纸上写的是繁体「訂單號碼：（值 INT-7087）」，旧规则只认简体 → 整个客户单号字段落空
  if (t.includes('訂單號碼') || t.includes('訂單編號') || t.includes('訂單號')) return true;
  return /(order\s*no|^po$|pono|p\.o\.)/i.test(t);
}
// S01：客户单号值允许带连字符（样本值 INT-7087）——仅用于在已有候选里优先挑选，不排斥其他写法
const ORDER_NO_VALUE_RE = /^[A-Za-z]{1,6}[-/]?\d{3,}$/;
// S03 兜底专用（收紧版）：OCR 会把直径符号 ⌀ 读成小写 o/p（如 "o3260"），
// 若沿用 [A-Za-z]，兜底会把尺寸误当单号返回；故兜底只认大写开头。
const FALLBACK_PO_RE = /^[A-Z]{1,6}[-/]?\d{3,}$/;
function isOrderQuantityLabel(t) {
  if (t.includes('订单数量')) return true;
  // S01：数量标签同样可能写成繁体「訂製数量 / 訂單数量 / 數量」
  if (t.includes('訂製数量') || t.includes('訂單数量') || t.includes('订制数量')) return true;
  if (t.includes('数量') && !t.includes('粗胚') && !t.includes('壳')) return true;
  if (t.includes('數量') && !t.includes('粗胚') && !t.includes('殼')) return true;
  return /(qty|pcs)/i.test(t);
}
// S01：容差数量写法「101+4%」（主数字 101 给 order_qty，原文整串保留回传由前端解析）
const QTY_TOL_RE = /^\d+(?:\.\d+)?\s*[+＋]\s*\d+(?:\.\d+)?\s*%?$/;
function isDeliveryLabel(t) {
  return t.includes('交货日期') || t.includes('交期') || t.includes('交货')
    // S01：交期标签为繁体「交貨日期：」
    || t.includes('交貨日期') || t.includes('交貨')
    || /(delivery|date)/i.test(t);
}
// S01：日期归一化 —— 「2026年09月02日」/「2026/9/2」/「2026.09.02」/「2026-09-02」→ YYYY-MM-DD
function normalizeDateToISO(text) {
  if (!text) return '';
  const m = String(text).match(/(\d{4})\s*[年\-\/.]\s*(\d{1,2})\s*[月\-\/.]\s*(\d{1,2})\s*日?/);
  if (!m) return '';
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function isProductionLabel(t) {
  return t.includes('生产编号') || t.includes('生产') || t.includes('型号')
    || /(model|item\s*no)/i.test(t);
}

/* ---------- 标签附近取值：右侧优先，下方兜底，中线对齐选最近 ---------- */
// S03：新增 opts（opt-in 参数）——仅当传入 fallbackShape 时才启用下面的形态兜底
function pickValue(words, label, opts) {
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

  // S03 兜底：右窗内无候选时（样本 S03 的值在标签右侧 153px，超出 6×fh=132），
  // 把右向范围放宽到 2 倍，并只保留「单号形态」的词，再按中线距离取最近。
  // opt-in：只有传了 fallbackShape 的字段才启用（当前仅客户单号），
  // 保证共用 pickValue 的交期 / 数量两个字段行为完全不变。
  if (!rightCands.length && opts && opts.fallbackShape) {
    const wideMax = right + TOL.RIGHT_MAX * 2 * fh;
    for (const w of words) {
      if (w === label) continue;
      if (w.x < right - TOL.EDGE * fh) continue;
      if (w.x > wideMax) continue;
      if (Math.abs(centerY(w) - lcy) > centerTol) continue;
      if (!isValueLike(w)) continue;
      if (!opts.fallbackShape.test(normalize(w.word))) continue;
      rightCands.push(w);
    }
    rightCands.sort((a, b) => Math.abs(centerY(a) - lcy) - Math.abs(centerY(b) - lcy) || a.x - b.x);
  }

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
  // S03：仅此一处传入 fallbackShape（交期 L322 / 数量 L355 两处调用保持 pickValue(words, label) 不变）
  const { rightCands, belowCands, primary, sameLine } = pickValue(words, label, { fallbackShape: FALLBACK_PO_RE });
  const candidates = rightCands.length ? rightCands : belowCands;

  const seen = new Set();
  const orderNumberCandidates = [];
  for (const w of rightCands.concat(belowCands)) {
    if (seen.has(w)) continue;
    seen.add(w);
    orderNumberCandidates.push(fmtWordCoords(w));
  }
  orderNumberCandidates.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  // S01：值允许带连字符（样本 INT-7087）——候选中若存在「字母+数字」形态的单号，优先采用它，
  //      候选集合与几何取值逻辑均不变
  const shaped = candidates.find((w) => ORDER_NO_VALUE_RE.test(normalize(w.word))) || null;
  const chosen = shaped || primary;
  const orderNumberJoined = joinRealOrderNumbers(chosen, orderNumberCandidates);

  return {
    value: chosen ? chosen.word : '',
    found: !!chosen,
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

/* ---------- 4. 交货日期（内联「交货日期：/交期：」优先，标签+值兜底，日期样式兜底） ---------- */
/* S01：按「日期样式」全表收集候选；给了标签就按与标签的中线距离排序 */
function collectDateLikeWords(words, label) {
  const lcy = label ? centerY(label) : null;
  const all = [];
  for (const w of words) {
    const iso = normalizeDateToISO(w.word);
    if (!iso) continue;
    all.push({ raw: String(w.word), iso, dist: lcy == null ? Number(w.y) : Math.abs(centerY(w) - lcy) });
  }
  all.sort((a, b) => a.dist - b.dist);
  const seen = new Set();
  const uniq = [];
  for (const x of all) {
    if (seen.has(x.iso)) continue;
    seen.add(x.iso);
    uniq.push(x);
  }
  return uniq;
}

export function extractDeliveryDate(words) {
  const inline = [];
  for (const w of words) {
    // S01：标签与值写在同一个词里时，兼容繁体标签与中文年月日
    const m = String(w.word).match(/(?:交货日期|交貨日期|交期|交货|交貨)\s*[:：]\s*(.+)/);
    if (m && m[1].trim()) {
      const raw = m[1].trim();
      inline.push({ word: w, value: normalizeDateToISO(raw) || raw });
    }
  }
  if (inline.length) {
    inline.sort((a, b) => a.word.y - b.word.y);
    return { value: inline[0].value, found: true, source: 'inline', candidates: inline.map((x) => x.value) };
  }
  const label = words.find((w) => isDeliveryLabel(normalize(w.word)));
  if (label) {
    const { rightCands, belowCands, primary, sameLine } = pickValue(words, label);
    if (primary) {
      const raw = primary.word;
      return {
        value: normalizeDateToISO(raw) || raw,
        found: true,
        source: 'label',
        candidates: wordsToStr(rightCands.length ? rightCands : belowCands),
        ambiguous: sameLine >= 2,
      };
    }
    // S01：「2026年09月02日」与「交貨日期：」的横向间距超出 RIGHT_MAX 取窗，几何取值落空 →
    //      退回按日期样式扫描，取离交期标签最近的一个日期，输出 YYYY-MM-DD
    const byDate = collectDateLikeWords(words, label);
    if (byDate.length) {
      return { value: byDate[0].iso, found: true, source: 'date-pattern', candidates: byDate.map((x) => x.raw) };
    }
    return { value: '', found: false, source: 'label', candidates: [], ambiguous: sameLine >= 2 };
  }
  // S01：标签为繁体、旧规则完全找不到标签时，也兜底扫一次日期样式
  const onlyDate = collectDateLikeWords(words, null);
  if (onlyDate.length) {
    return { value: onlyDate[0].iso, found: true, source: 'date-pattern', candidates: onlyDate.map((x) => x.raw) };
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
  if (primary) {
    return {
      value: primary.word,
      found: true,
      source: 'label',
      label: label.word,
      candidates: wordsToStr(candidates),
      ambiguous: sameLine >= 2,
    };
  }
  // S01：样本数量写作容差形式「101+4%」，且与「訂製数量：」的横向间距超出取窗，几何取值落空 →
  //      按容差样式扫描，取离数量标签最近的一个，原文整串回传（主数字 101 由前端解析进 order_qty）
  const tol = words
    .filter((w) => QTY_TOL_RE.test(normalize(w.word)))
    .map((w) => ({ w, dist: Math.abs(centerY(w) - centerY(label)) }))
    .sort((a, b) => a.dist - b.dist);
  if (tol.length) {
    return {
      value: tol[0].w.word,
      found: true,
      source: 'qty-pattern',
      label: label.word,
      candidates: tol.map((x) => x.w.word),
      ambiguous: false,
    };
  }
  return {
    value: '',
    found: false,
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

  if (on.ambiguous) warnings.push('order_number: 存在多个候选值（需人工确认）');
  if (oq.ambiguous) warnings.push('order_quantity: 存在多个候选值（需人工确认）');
  if (!cn.found && cn.candidates.length === 0) warnings.push('customer_name: ' + (cn.reason || '无候选'));

  return {
    order_number: on.value,
    order_number_joined: on.order_number_joined,
    production_number: pn.value,
    customer_name: cn.value,
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
