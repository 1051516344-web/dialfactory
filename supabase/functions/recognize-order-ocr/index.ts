/* ============================================================
   DialFactory · 订单图片识别 Edge Function（OCR 坐标定位版）

   用阿里云 OCR + 坐标定位 + 规则提取，替代 Vision 模型（qwen-vl）。
   接口契约与 localhost:3200 的 /api/extract 完全一致：
     POST multipart/form-data，字段名必须：file
     返回 7 字段扁平 JSON：
       { "customer_name", "customer_order_no", "order_no",
         "delivery_date", "order_quantity",
         "customer_candidates", "order_number_candidates" }
   字段映射（契约一字不改，与本地 drawing-analyze-server.js 对齐）：
     order_number      → customer_order_no
     production_number → order_no
   注：底纹 base_texture 已按业务决定停用（图纸上传后现场直接看图），响应不再返回该字段。
   识别不到 → 该字段为 ''（空串），绝不猜测、绝不返回假数据。
   OCR 调用失败（网络/解析/鉴权）→ HTTP 5xx + { error }。
   支持 OPTIONS 预检与 CORS 头（Access-Control-Allow-Origin: *）。

   不修改数据库结构；不改变现有 OCR 字段识别规则；不改变多订单号处理；
   不改变 customer_name 识别逻辑；不删除 Vision 备用代码。

   AccessKey 只从 Deno.env.get('ALIYUN_ACCESS_KEY_ID/SECRET')
   （Supabase Edge Function Secret）读取，绝不写入代码/日志/前端。
   ============================================================ */

import { recognizeGeneral } from '../_shared/ocr/aliyun-ocr.ts';
import { extractOrderInfo } from '../_shared/ocr/order-info-extractor.js';

// 上传图片上限，与本地服务一致（20MB）
const MAX_BODY_BYTES = 20 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
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

Deno.serve(async (req) => {
  const method = req.method;

  // 预检请求：直接放行
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 健康检查（方便部署后确认函数在线）
  if (method === 'GET') {
    return text('Order OCR Recognition Edge Function 运行中\nPOST multipart/form-data，字段名 file\n');
  }

  if (method !== 'POST') {
    return json({ error: 'not found' }, 404);
  }

  const accessKeyId = Deno.env.get('ALIYUN_ACCESS_KEY_ID');
  const accessKeySecret = Deno.env.get('ALIYUN_ACCESS_KEY_SECRET');
  if (!accessKeyId || !accessKeySecret) {
    return json({ error: '未配置 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET（请在 Supabase 项目设置 Edge Function Secret）' }, 503);
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

    const imageBytes = new Uint8Array(await file.arrayBuffer());
    const ocr = await recognizeGeneral(imageBytes, { accessKeyId, accessKeySecret });
    const info = extractOrderInfo(ocr);

    return json({
      customer_name: info.customer_name || '',
      customer_order_no: info.order_number_joined || info.order_number || '',
      order_no: info.production_number || '',
      delivery_date: info.delivery_date || '',
      order_quantity: info.order_quantity || '',
      customer_candidates: (info.debug && info.debug.customer_candidates) || [],
      order_number_candidates: (info.debug && info.debug.order_number_candidates) || [],
    });
  } catch (e) {
    return json({ error: (e as Error)?.message || '服务器内部错误' }, 500);
  }
});
