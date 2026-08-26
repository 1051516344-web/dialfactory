/* ============================================================
   订单信息抽取核心 —— 6 字段（客户名称/订单编号/生产编号/底纹处理/交货日期/订单数量）

   单一事实来源（Single Source of Truth）：
     · Supabase Edge Function（supabase/functions/recognize-order/）直接 import 本文件。
     · Node 本地服务（图纸模型 order-extract/extractor.js）后续应 import 本文件，
       以消除「本地服务 / Edge Function 两套 Prompt」的维护负担。
       （当前阶段按约束暂未改造本地服务，见 docs/ORDER-RECOGNITION-EDGE-MIGRATION.md）

   运行环境无关：纯 ESM，不 import node:*、不读 process.env、不用 Deno.*。
   本文件只负责「抽取核心」：Prompt、请求体组装、JSON 解析、6 字段抽取、契约字段映射。
   不负责：读文件（fs）、HTTP 服务（http / Deno.serve）、multipart 解析 —— 由调用方负责。

   铁律（沿用原 extractor.js / openai-vision-provider.js，逐字未改）：
     - AI 识别只是「建议」，最终以人工核对为准。
     - "UNKNOWN" 绝不静默当作「无」；识别不到就空着等人工填。
     - 解析失败即抛错，绝不把垃圾文本当作识别结果。
   ============================================================ */

const DEFAULT_MODEL = 'qwen3-vl-flash';        // 默认视觉模型（调用方可覆盖）
const DEFAULT_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MAX_TOKENS = 4096;                        // buildRequestBody 默认值；订单抽取会覆盖为 8000

// 订单字段定义（前端据此渲染表单，也是抽取器输出的字段清单）
export const ORDER_FIELDS = [
  { key: 'customer_name',     label: '客户名称', type: 'text' },
  { key: 'order_number',      label: '订单编号', type: 'text' },
  { key: 'production_number', label: '生产编号', type: 'text' },
  { key: 'base_texture',      label: '底纹处理', type: 'enum', values: ['无底纹', '太阳纹', '直线纹', '其他'] },
  { key: 'delivery_date',     label: '交货日期', type: 'text' },
  { key: 'order_quantity',    label: '订单数量', type: 'text' },
];

const FIELD_KEYS = ORDER_FIELDS.map((f) => f.key);

/**
 * 6 字段订单抽取 Prompt（system）。
 * 只让模型抽订单字段，明确「看不到就 UNKNOWN」、手写字迹看不清就 UNKNOWN。
 */
export function buildOrderExtractPrompt() {
  return [
    '你是一名手表表面（表盘）制造图纸的订单信息抽取助手。',
    '唯一任务：根据【图纸图片】上明确可见、明确标注的内容，抽取下面 6 个订单字段，只输出一个 JSON 对象。',
    '',
    '【铁律】',
    '1. 只根据图片上明确可见、明确标注的内容回答；看不到、看不清、歧义、无法确定 → 一律填 "UNKNOWN"。',
    '2. 绝不猜测，绝不按常识或「大概率」补全，绝不擅自替客户做选择。',
    '3. "UNKNOWN" 永远不等于 "无"。',
    '4. 只输出 JSON，不要输出任何解释、前言或 Markdown 代码块。',
    '5. 文字标注优先；手写字迹只有清晰可读才填，看不清一律填 "UNKNOWN"。',
    '6. 不要输出这 6 个字段以外的任何业务字段。',
    '7. 每个字段的 evidence 最多一句短句（只写「图上位置 + 原文」），禁止写推理过程、禁止自我纠错、禁止罗列多种可能、禁止解释为什么选这个值。',
    '8. 交货日期 / 订单数量：直接输出图上明确写出的那个值，禁止写任何计算过程或取舍说明。',
    '9. 整个输出必须精炼：字段值只写最终结果，禁止重复、禁止比较多种可能、禁止自我修正；evidence 每个字段不超过 20 个字。',
    '',
    '【6 个字段】',
    '- customer_name（客户名称）：图纸右下角「生产编号」那一格旁边一格里的字母/代号（即客户代号）。图上通常没有"客户名称"四个字的文字标签，不要去找"客户名称"字样。没有填 "UNKNOWN"。',
    '- order_number（订单编号）：图纸左上角的「订单号码」那一格里的内容（客人的订单编号）。注意：不要取「壳号」——"壳号"是另一个格子的内容，与"订单号码"不同，切勿混淆。没有填 "UNKNOWN"。',
    '- production_number（生产编号）：图纸右下角那一格里的编号，通常以 R 开头、或以 SA、SH 字样开头。没有填 "UNKNOWN"。',
    '- base_texture（底纹处理）：枚举 "无底纹"/"太阳纹"/"直线纹"/"其他"。默认填 "UNKNOWN"。禁止根据视觉纹理（如放射状、同心圆、条纹）判断底纹，只以文字标注为准。只有图上明确且单一地写出底纹类型文字时才填对应值（"无纹/光面/素面/光底/无底纹"→"无底纹"；"车CD纹/车唱片纹/多种组合"→"其他"；"太阳纹"→"太阳纹"；"直线纹"→"直线纹"）。若列出多档选项（如 A/B/C）、或没写、或看不清 → 一律填 "UNKNOWN"，让用户自己填，绝不擅自选一档。',
    '- delivery_date（交货日期）：图纸上明确的交货日期/交期。可能是手写，只有清晰可读才填；直接照抄图上文字，不要改写格式。没有填 "UNKNOWN"。',
    '- order_quantity（订单数量）：图纸上明确的订单总数量/数量。可能是手写，只有清晰可读才填。没有填 "UNKNOWN"。',
    '',
    '【输出格式】',
    '只输出一个 JSON 对象，结构如下（6 个字段必须全部出现）：',
    '{',
    '  "customer_name": "...",',
    '  "order_number": "...",',
    '  "production_number": "...",',
    '  "base_texture": "...",',
    '  "delivery_date": "...",',
    '  "order_quantity": "...",',
    '  "evidence": { "<字段名>": "一句话图上依据（位置+原文）；无依据填空字符串" }',
    '}',
    'evidence 是一个对象，逐字段用一句话说明取值依据；没有依据的字段填空字符串。',
    '只输出这一个 JSON 对象，除此之外一个字都不要多写。',
  ].join('\n');
}

/**
 * 依据 MIME 或文件名推断图片 media_type（仅支持常见位图格式）。
 * 运行环境无关版：不再依赖 node:path 的 extname，改由调用方传入 File.type / File.name。
 * 输出值与本地 detectMediaType(imagePath) 完全一致：image/png | image/jpeg | image/webp。
 */
export function detectMediaType({ mimeType = '', filename = '' } = {}) {
  const m = String(mimeType || '').toLowerCase();
  if (m === 'image/png') return 'image/png';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/webp') return 'image/webp';

  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';

  throw new Error('不支持的图片格式（仅支持 png/jpg/jpeg/webp）');
}

/**
 * 组装 DashScope / OpenAI 兼容 Chat Completions 请求体（image_url + data URL 格式）。
 */
export function buildRequestBody({ model, mediaType, imageData, systemPrompt }) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageData}` } },
          { type: 'text', text: '请抽取这张图纸的事实，严格按系统指令，只输出 JSON。' },
        ],
      },
    ],
  };
}

/**
 * 从 Chat Completions 响应里取出文本（message.content）。
 */
export function extractText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => b?.text || '').join('');
  return '';
}

/**
 * 把模型文本解析成 JSON（剥离可能的 Markdown 代码围栏）。
 * 解析失败即抛错——绝不让垃圾文本悄悄流进 Normalize 变成「全 UNKNOWN」假象。
 */
export function parseJson(text) {
  const t = (text ?? '').trim();
  if (!t) throw new Error('OpenAI 返回内容为空，无法解析 JSON');
  let cleaned = t;
  const fence = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`OpenAI 返回内容不是合法 JSON（前 200 字）：${cleaned.slice(0, 200)}`);
  }
}

/**
 * 调 Qwen3-VL-Flash 抽取 6 个订单字段。
 * 与原 extractor.js 的 extractOrderFields 逻辑一致，唯一区别：
 *   图片读取（fs）由调用方完成，这里只接收 mediaType + imageData（base64）。
 * @param {object} options
 *   apiKey     DashScope Key（必填，调用方从环境变量读取后传入）
 *   mediaType  图片 media_type（必填，如 image/png）
 *   imageData  图片 base64（必填，不含 data: 前缀）
 *   model / baseUrl  可选覆盖默认值
 *   fetchImpl  可选，注入 fetch（测试用，默认 globalThis.fetch）
 * @returns {Promise<object>}
 *   { fields: {6字段}, evidence: {...}, raw_output: {...}, usage: {...}|null }
 *   识别失败（JSON 解析失败）→ 抛错。
 */
export async function extractOrderFields({
  apiKey,
  model = DEFAULT_MODEL,
  baseUrl = DEFAULT_ENDPOINT,
  mediaType,
  imageData,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error('缺少 DASHSCOPE_API_KEY（API Key 只能从环境变量读取，禁止写入代码）');
  if (!mediaType) throw new Error('extractOrderFields 缺少 mediaType');
  if (!imageData) throw new Error('extractOrderFields 缺少图片数据（imageData）');

  const body = buildRequestBody({
    model,
    mediaType,
    imageData,
    systemPrompt: buildOrderExtractPrompt(),
  });
  // 覆盖默认 4096：6 字段 + 简短 evidence 本应只需几百 token，但给足余量，
  // 防止模型偶发啰嗦时被截断（finish_reason=length）。
  body.max_tokens = 8000;

  const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const respBody = await response.text();
    throw new Error(`Qwen API 请求失败（HTTP ${response.status}）：${respBody}`);
  }

  const data = await response.json();
  const finishReason = data?.choices?.[0]?.finish_reason;
  if (finishReason === 'length') {
    throw new Error('Qwen 输出被截断（finish_reason=length）');
  }
  if (finishReason === 'content_filter') {
    throw new Error('Qwen 输出被内容过滤器拦截（finish_reason=content_filter）');
  }

  // 解析模型 JSON。解析失败即抛错——绝不把垃圾文本当作识别结果回填。
  const rawOutput = parseJson(extractText(data));

  // 抽出 6 个字段（缺省补 UNKNOWN，但保留 evidence / raw_output 供人工核对）
  const fields = {};
  for (const key of FIELD_KEYS) {
    const v = rawOutput?.[key];
    fields[key] = v === undefined || v === null || v === '' ? 'UNKNOWN' : String(v);
  }

  return {
    fields,
    evidence: rawOutput?.evidence ?? {},
    raw_output: rawOutput,
    usage: data?.usage ?? null,
  };
}

/**
 * 把抽取器输出的 6 字段映射成 DialFactory 契约字段：
 *   order_number      → customer_order_no
 *   production_number → order_no
 *   其余同名；任何 UNKNOWN/空值 → null（绝不猜测、绝不返回假数据）。
 */
export function toContractFields(extractedFields) {
  const map = {
    customer_name: 'customer_name',
    order_number: 'customer_order_no',
    production_number: 'order_no',
    base_texture: 'base_texture',
    delivery_date: 'delivery_date',
    order_quantity: 'order_quantity',
  };
  const out = {};
  for (const [src, dst] of Object.entries(map)) {
    const v = extractedFields?.[src];
    out[dst] = (v === undefined || v === null || v === 'UNKNOWN' || v === '') ? null : String(v);
  }
  return out;
}
