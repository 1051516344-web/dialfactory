/* ============================================================
   DialFactory · 阿里云 OCR 反向代理（Cloudflare Worker）

   【为什么需要】
   Supabase Edge Function 运行在东京，直连阿里云 OCR（杭州）经常 25s 超时
   或 SignatureDoesNotMatch。本 Worker 做「东京 → Cloudflare → 杭州」中转。

   【部署步骤（纯网页端，无需装 CLI）】
   1. 打开 https://dash.cloudflare.com → 左侧 Workers & Pages
   2. Create → Workers → Create Worker
   3. 名称填 dialfactory-ocr-proxy（或任意）→ Deploy
   4. 点 Edit code → 全选删除 → 粘贴本文件全部内容 → Deploy
   5. 进入该 Worker → Settings → Variables and Secrets → Add
        Type: Secret   Name: PROXY_KEY   Value: <自己生成一串随机长字符串>
      Save and deploy
   6. 记下 Worker 地址：https://<名称>.<你的子域>.workers.dev
      （本脚本不校验路径，任意路径均可，例如 .../ocr）
   7. 到 Supabase → Project Settings → Edge Functions → Secrets 新增：
        OCR_PROXY_URL = https://<名称>.<子域>.workers.dev/ocr
        OCR_PROXY_KEY = <与上面完全相同的随机串>
   8. 重新部署 Edge Function（改 Secret 后必须 redeploy 才生效）

   【签名与 Host 的关键说明】
   - 阿里云 ACS3-HMAC-SHA256 的 SignedHeaders 里包含 host，且 host 参与签名。
     Edge Function 侧签名用的是 ocr-api.cn-hangzhou.aliyuncs.com（不变）。
   - 阿里云校验时，用「实际收到的 Host 头」重算签名。所以最终到达阿里云的
     请求，Host 必须是 ocr-api.cn-hangzhou.aliyuncs.com。
   - Worker 里 fetch(UPSTREAM) 的 Host 由 URL 自动决定 → 天然正确。
     ⚠️ 千万不要手工设置 host 头（Workers 不允许，且会破坏签名）。
   - 请求体必须字节完全一致（x-acs-content-sha256 是 body 的 SHA-256），
     所以用 arrayBuffer() 原样读取、原样转发，不做任何解析/编码。
   - 只透传参与签名的白名单头；不要透传 host / cf-* / x-forwarded-* / x-proxy-key。

   【安全性】
   - 只允许 POST + 强制 PROXY_KEY 校验，避免被当成开放代理白嫖。
   - 上游地址写死为阿里云 OCR 端点，不接受调用方指定任意 URL。
   ============================================================ */

const UPSTREAM = 'https://ocr-api.cn-hangzhou.aliyuncs.com/';

/** 允许透传给阿里云的请求头白名单（大小写不敏感）。 */
const FORWARD_REQ_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'x-acs-action',
  'x-acs-version',
  'x-acs-date',
  'x-acs-signature-nonce',
  'x-acs-content-sha256',
];

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers':
    'authorization, content-type, accept, x-proxy-key, x-acs-action, x-acs-version, x-acs-date, x-acs-signature-nonce, x-acs-content-sha256',
  'access-control-max-age': '86400',
};

const UPSTREAM_TIMEOUT_MS = 20000; // Edge Function 侧是 25s，这里留 5s 余量

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    // 1) CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'method_not_allowed', allow: 'POST' });
    }

    // 2) 简单鉴权：防止别人白嫖
    const expectedKey = env && env.PROXY_KEY;
    if (!expectedKey) {
      return jsonResponse(500, {
        error: 'proxy_key_not_configured',
        hint: 'Cloudflare → 该 Worker → Settings → Variables and Secrets → 添加 Secret: PROXY_KEY',
      });
    }
    if ((request.headers.get('x-proxy-key') || '') !== expectedKey) {
      return jsonResponse(401, { error: 'invalid_proxy_key' });
    }

    // 3) 原样读取请求体（签名要求字节完全一致）
    let body;
    try {
      body = await request.arrayBuffer();
    } catch {
      return jsonResponse(400, { error: 'body_read_failed' });
    }
    if (!body || body.byteLength === 0) {
      return jsonResponse(400, { error: 'empty_body' });
    }

    // 4) 组装转发头（白名单；Host 由 fetch(UPSTREAM) 自动设置）
    const headers = new Headers();
    for (const name of FORWARD_REQ_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }

    // 5) 转发到阿里云
    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return jsonResponse(timedOut ? 504 : 502, {
        error: timedOut ? 'upstream_timeout' : 'upstream_unreachable',
        detail: String((err && err.message) || err || ''),
      });
    }

    // 6) 原样回传 status + body；额外带上阿里云的 x-acs-* 便于排错
    const respHeaders = new Headers(CORS_HEADERS);
    const contentType = upstream.headers.get('content-type');
    if (contentType) respHeaders.set('content-type', contentType);
    for (const [key, value] of upstream.headers) {
      if (key.toLowerCase().startsWith('x-acs-')) respHeaders.set(key, value);
    }

    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  },
};
