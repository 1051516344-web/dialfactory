/* ============================================================
   DialFactory OCR Edge Function · 底纹字段机械解析（texture-normalizer）

   从 aliyun-ocr-test/texture-normalizer.js 逐字移植（CommonJS → ESM）。
   解析规则 R1~R5 与 localhost:3200 版本完全一致，不改任何规则。

   R1 清理 OCR 噪声：去掉字符串开头的 '*#%@&^~!|' 等噪声字符
   R2 引用注释：出现 '<...>' 时，取值剥离该注释，记 contains_reference_note
   R3 分段：按 '/' 切分成多个候选段（同一字段可含多个位置/纹理）
   R4 段内解析：可选单字母位置码（A/B/C…）+ 纹理名
   R4b 码继承：无码段继承前一段的显式位置码
   R5 need_review：候选里出现 ≥2 个不同位置码时置 true

   纯函数，无 Node / Deno 专属 API。
   ============================================================ */

/* ---------- 常量 ---------- */
const LEADING_NOISE_RE = /^[*#%@&^~!|]+/;
const REFERENCE_NOTE_RE = /<[^<>]*>/g;
const CODE_PREFIX_RE = /^([A-Za-z])\s*(\S.*)$/;

/* ---------- R1 清理开头噪声 ---------- */
export function cleanOcrNoise(s) {
  return String(s == null ? '' : s).replace(LEADING_NOISE_RE, '');
}

/* ---------- R3 按 '/' 分段 ---------- */
export function splitSegments(s) {
  return String(s == null ? '' : s)
    .split('/')
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

/* ---------- R2 + R4 段内解析 ---------- */
export function parseSegment(seg) {
  const stripped = String(seg).replace(REFERENCE_NOTE_RE, '').trim();
  if (stripped === '') return { code: null, texture: '' };

  const m = stripped.match(CODE_PREFIX_RE);
  if (m) return { code: m[1], texture: m[2].trim() };
  return { code: null, texture: stripped };
}

/* ---------- 主入口 ---------- */
export function parseBaseTexture(raw) {
  const out = {
    raw: raw == null ? '' : String(raw),
    candidates: [],
    primary: null,
    need_review: false,
    warnings: [],
  };

  if (out.raw.trim() === '') {
    out.warnings.push('empty');
    return out;
  }

  let s = out.raw;
  const cleaned = cleanOcrNoise(s);
  if (cleaned !== s) {
    out.warnings.push('stripped_noise');
    s = cleaned;
  }

  if (s.includes('<')) {
    out.warnings.push('contains_reference_note');
  }

  const segments = splitSegments(s);

  let lastCode = null;
  for (const seg of segments) {
    const p = parseSegment(seg);
    if (p.texture === '') continue;
    if (p.code != null) lastCode = p.code;
    const candidate = {};
    if (lastCode != null) candidate.code = lastCode;
    candidate.texture = p.texture;
    out.candidates.push(candidate);
  }

  const codes = out.candidates.map((c) => c.code).filter((c) => c != null);
  out.need_review = new Set(codes).size >= 2;

  return out;
}
