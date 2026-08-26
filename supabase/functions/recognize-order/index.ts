/* ============================================================
   DialFactory · 订单图片识别 Edge Function（第一阶段骨架）
   ============================================================
   接口契约（与 js/data/recognize.js 严格对齐，替换本地 localhost:3100）：
     POST https://<project-ref>.supabase.co/functions/v1/recognize-order
       Content-Type: multipart/form-data
       字段名必须：file（图片文件）
       返回（6 字段扁平 JSON）：
         { "customer_name": "...", "customer_order_no": "...",
           "order_no": "...", "base_texture": "...",
           "delivery_date": "...", "order_quantity": "..." }
       识别不到 / AI 未识别 → 该字段为 null（绝不猜测、绝不返回假数据）。
       AI 调用本身失败（网络/解析/鉴权）→ HTTP 5xx + { error }。
     支持 OPTIONS 预检与 CORS 头（Access-Control-Allow-Origin: *）。

   与本地 Node 服务（dialfactory-server.js）行为对齐：
     · 复用同一套抽取核心（../_shared/order-extract-core.js），不维护两套 Prompt。
     · 上传图片不落盘，字节直接进内存 base64。
     · API Key 只从 Deno.env.get('DASHSCOPE_API_KEY')（Supabase Edge Function Secret）读取。

   第一阶段明确不做：JWT 鉴权 / 限流 / 新数据库表 / 日志系统。
   ============================================================ */

import {
  detectMediaType,
  extractOrderFields,
  toContractFields,
} from '../_shared/order-extract-core.js';

// 上传图片上限，与本地服务一致（20MB）
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** ArrayBuffer → base64（分块，避免大图 String.fromCharCode 参数过多撑爆调用栈） */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000; // 32 KB
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const method = req.method;

  // 预检请求：直接放行
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 健康检查（方便部署后确认函数在线）
  if (method === 'GET') {
    return text('Order Recognition Edge Function 运行中\nPOST multipart/form-data，字段名 file\n');
  }

  if (method !== 'POST') {
    return json({ error: 'not found' }, 404);
  }

  const apiKey = Deno.env.get('DASHSCOPE_API_KEY');
  if (!apiKey) {
    return json({ error: '未配置 DASHSCOPE_API_KEY（请在 Supabase 项目中设置 Edge Function Secret）' }, 503);
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return json({ error: '请求必须是 multipart/form-data，且字段名为 file' }, 400);
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return json({ error: '缺少 file 字段（multipart 字段名必须是 file）' }, 400);
    }

    if (file.size > MAX_BODY_BYTES) {
      return json({ error: '图片过大（超过 20MB 上限）' }, 413);
    }
    if (file.size === 0) {
      return json({ error: '图片数据为空' }, 400);
    }

    let mediaType: string;
    try {
      mediaType = detectMediaType({ mimeType: file.type, filename: file.name });
    } catch (e) {
      return json({ error: (e as Error)?.message || '不支持的图片格式' }, 400);
    }

    const imageData = toBase64(await file.arrayBuffer());
    const result = await extractOrderFields({ apiKey, mediaType, imageData });

    // 识别成功 → 返回 6 字段扁平 JSON（UNKNOWN/空 → null）
    return json(toContractFields(result.fields));
  } catch (e) {
    return json({ error: (e as Error)?.message || '服务器内部错误' }, 500);
  }
});
