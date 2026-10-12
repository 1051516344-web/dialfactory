/* ============================================================
   DialFactory OCR Edge Function · 阿里云 OCR 直连客户端

   用 Deno 原生 fetch + Web Crypto 实现 RecognizeGeneral（2021-07-07）
   的 ACS3-HMAC-SHA256 签名（Authorization 头），替代
   @alicloud/ocr-api20210707 Node SDK（SDK 内部即用 ACS3 签名）。
   图片字节直接从内存 POST，不落盘、不写文件。

   AccessKey 只能由调用方从 Deno.env.get() 读取后传入，绝不写死。
   返回归一后的 { Data: { prism_wordsInfo: [...] } }，
   与 aliyun-ocr-test 的 normalizeOcrResponse 结果对齐。

   注意：阿里云 SDK（openapi-core）使用 ACS3-HMAC-SHA256，而非
   RPC V1 的 HMAC-SHA1。此前按 V1 签名导致公网 546 超时失败，
   已改为 ACS3 并在本地验证（HTTP 200，OCR 数据完整）。
   ============================================================ */

const OCR_ENDPOINT = 'https://ocr-api.cn-hangzhou.aliyuncs.com/';

/** Uint8Array → 小写 hex */
function hex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

const encoder = new TextEncoder();

/** SHA-256 → hex */
async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return hex(new Uint8Array(digest));
}

/** HMAC-SHA-256(key, message) → hex */
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const keyData = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', keyData, encoder.encode(message));
  return hex(new Uint8Array(sig));
}

/** UTC 时间戳：YYYY-MM-DDTHH:mm:ssZ（与 SDK getTimestamp 一致） */
function utcTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface RecognizeOptions {
  accessKeyId: string;
  accessKeySecret: string;
}

/**
 * 调用 RecognizeGeneral，返回归一后的 { Data: { prism_wordsInfo: [...] } }。
 * 图片字节直接作为 HTTP body（Content-Type: application/octet-stream），
 * 用 ACS3-HMAC-SHA256 签名（Authorization 头）。
 */
export async function recognizeGeneral(
  imageBytes: Uint8Array,
  { accessKeyId, accessKeySecret }: RecognizeOptions,
): Promise<{ Data: Record<string, unknown> }> {
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('缺少 ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET');
  }

  const host = 'ocr-api.cn-hangzhou.aliyuncs.com';
  const action = 'RecognizeGeneral';
  const version = '2021-07-07';
  const nonce = crypto.randomUUID();
  const date = utcTimestamp();
  const payloadHash = await sha256Hex(imageBytes);

  // 参与签名的头（小写 key，按字典序）：content-type / host / x-acs-*
  const signed: Record<string, string> = {
    'content-type': 'application/octet-stream',
    'host': host,
    'x-acs-action': action,
    'x-acs-content-sha256': payloadHash,
    'x-acs-date': date,
    'x-acs-signature-nonce': nonce,
    'x-acs-version': version,
  };
  const signedKeys = Object.keys(signed).sort();
  const canonicalHeaders = signedKeys.map((k) => `${k}:${signed[k]}`).join('\n') + '\n';
  const signedHeadersStr = signedKeys.join(';');

  const canonicalRequest =
    `POST\n/\n\n${canonicalHeaders}\n${signedHeadersStr}\n${payloadHash}`;
  const hashedCanonicalRequest = await sha256Hex(encoder.encode(canonicalRequest));
  const stringToSign = `ACS3-HMAC-SHA256\n${hashedCanonicalRequest}`;
  const signature = await hmacSha256Hex(accessKeySecret, stringToSign);

  const authorization =
    `ACS3-HMAC-SHA256 Credential=${accessKeyId},SignedHeaders=${signedHeadersStr},Signature=${signature}`;

  // 显式超时：阿里云端点不可达时，fetch 会一直挂起直到 worker 被 150s 墙钟杀掉。
  // 加 AbortController 让它在 25s 内抛 AbortError，返回可读错误而非 546。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let response: Response;
  try {
    response = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'host': host,
        'x-acs-action': action,
        'x-acs-version': version,
        'x-acs-date': date,
        'x-acs-signature-nonce': nonce,
        'x-acs-content-sha256': payloadHash,
        'content-type': 'application/octet-stream',
        'accept': 'application/json',
        'authorization': authorization,
      },
      body: imageBytes,
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('OCR 请求超时（25s）：Edge Function 无法在 25s 内连通阿里云端点 ocr-api.cn-hangzhou.aliyuncs.com，疑似东京节点到该中国区端点的网络出站被阻断/黑洞');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const respText = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(respText);
  } catch {
    throw new Error(`OCR 响应不是合法 JSON（HTTP ${response.status}）：${respText.slice(0, 200)}`);
  }

  if (!response.ok) {
    const code = (parsed.Code ?? parsed.code ?? '') as string;
    const msg = (parsed.Message ?? parsed.message ?? respText.slice(0, 200)) as string;
    throw new Error(`OCR 请求失败（HTTP ${response.status}，Code=${code}）：${msg}`);
  }

  // 业务错误：阿里云可能在 HTTP 200 下返回 Code/Message 且无 Data
  if (parsed.Code && !parsed.Data) {
    throw new Error(`OCR 业务错误（Code=${parsed.Code}）：${parsed.Message ?? ''}`);
  }

  // 归一 Data：兼容 { Data: "..." }（字符串）/ { data: "..." } / { Data: {...} }
  let data: unknown = parsed.Data ?? parsed.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = {};
    }
  }
  if (
    data && typeof data === 'object' && !Array.isArray(data)
    && (data as Record<string, unknown>).Data
    && typeof (data as Record<string, unknown>).Data === 'object'
  ) {
    data = (data as Record<string, unknown>).Data;
  }

  return { Data: (data && typeof data === 'object' && !Array.isArray(data)) ? data as Record<string, unknown> : {} };
}
