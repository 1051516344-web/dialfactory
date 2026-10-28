# DialFactory OCR 接入手册

> 本文档记录订单图纸 OCR 识别能力的接入现状与已知问题。
> 相关实现：`supabase/functions/recognize-order-ocr/`、`supabase/functions/_shared/ocr/`

## 已知问题

### 网络超时（已缓解，2026-10-12 记录 / 2026-10-26 增补中转方案）
- 现象：偶发 500，错误为 `OCR 请求超时（25s）` 或 `SignatureDoesNotMatch`
- 根因：Supabase 东京节点 → 阿里云杭州端点（ocr-api.cn-hangzhou.aliyuncs.com）出站不稳定
- 临时缓解：刷新重试，多数情况 2–3 次可成功
- 长期方案：
  - A. 换阿里云国际站端点（如账号支持）— **未实施**
  - B. 加香港/新加坡中转（Cloudflare Workers）— **已实施** ✅，见下方「网络中转方案」
  - C. 换东京/新加坡可直连的 OCR（Google Vision / AWS Textract）— **未实施**
- 相关文件：supabase/functions/_shared/ocr/aliyun-ocr.ts

## 网络中转方案（Cloudflare Worker）

### 背景

Supabase Edge Function 部署在**东京**（ap-northeast-1），阿里云 OCR 端点在**杭州**
（`ocr-api.cn-hangzhou.aliyuncs.com`）。跨境直连时常出现：

- `OCR 请求超时（25s）` —— 出站被阻断/黑洞，SSE 长时间无响应
- `SignatureDoesNotMatch` —— 偶发，多为中间网络干扰导致

因此引入 Cloudflare Worker 做「东京 → Cloudflare → 杭州」中转：
Worker 部署在 Cloudflare 全球边缘网络，出境到阿里云的链路比 Supabase 东京直连稳定得多。

### 架构

```
浏览器 / 前端
   │  Supabase JS → Edge Function
   ▼
Supabase Edge Function「recognize-order-ocr」（东京）
   │  POST 二进制图片 + ACS3 签名头
   │  目标地址取自 OCR_PROXY_URL（未配置则直连阿里云）
   ▼
Cloudflare Worker「cloudflare/ocr-proxy-worker.js」（就近边缘节点）
   │  原样透传请求体 + 白名单签名头；Host 由目标 URL 自动决定
   ▼
阿里云 OCR（杭州）ocr-api.cn-hangzhou.aliyuncs.com
```

### 签名关键点（务必理解，否则必然 SignatureDoesNotMatch）

- 阿里云使用 **ACS3-HMAC-SHA256**，`SignedHeaders` 里**包含 `host`**，且 `host` 参与签名计算。
- Edge Function 侧签名**始终**按 `ocr-api.cn-hangzhou.aliyuncs.com` 计算，走不走中转都一样。
- 阿里云校验时用**实际收到的 Host 头**重算签名 → 最终到达阿里云的 `Host` 必须是阿里云域名。
- Worker 里 `fetch('https://ocr-api.cn-hangzhou.aliyuncs.com/')` 的 Host 由 URL 自动决定，天然正确；
  **不要手工设置 `host` 头**（Workers 不允许，且会破坏签名）。
- 请求体必须**字节完全一致**（`x-acs-content-sha256` 是 body 的 SHA-256），
  Worker 用 `arrayBuffer()` 原样读取、原样转发，不做任何解析/重编码/压缩。
- 只透传参与签名的白名单头，**不要**透传 `host` / `cf-*` / `x-forwarded-*` / `x-proxy-key`。

### 环境变量配置

**① Cloudflare 侧**（Dashboard → Workers & Pages → 该 Worker → Settings → Variables and Secrets）：

| 名称 | 类型 | 值 |
|---|---|---|
| `PROXY_KEY` | Secret | 自己生成的一串随机长字符串（如 32 位） |

**② Supabase 侧**（Dashboard → Project Settings → Edge Functions → Secrets）：

| 名称 | 值 | 作用 |
|---|---|---|
| `OCR_PROXY_URL` | `https://<worker>.<子域>.workers.dev/ocr` | 中转开关；**留空/删除 = 回退直连** |
| `OCR_PROXY_KEY` | 与 Cloudflare 的 `PROXY_KEY` 完全一致 | Worker 侧鉴权 |

修改 Secret 后需重新部署 Edge Function：

```bash
npx supabase functions deploy recognize-order-ocr --project-ref wzfkmwrqnvjegunjueka
```

> 项目 ref 见 `HANDOFF.md`（`wzfkmwrqnvjegunjueka`，东京区）。
> `js/config.js`、数据库**均无需改动**；Worker 代码位于 `cloudflare/ocr-proxy-worker.js`，
> 不在 Pages 发布范围（Pages 只发布 `index.html` / `css/` / `js/`），也不参与 Supabase Functions 部署。

### 部署步骤（Cloudflare 纯网页端）

1. 打开 https://dash.cloudflare.com → 左侧 **Workers & Pages**
2. **Create** → **Workers** → **Create Worker**，名称填 `dialfactory-ocr-proxy`
3. **Edit code** → 全选删除 → 粘贴 `cloudflare/ocr-proxy-worker.js` 全文 → **Deploy**
4. 该 Worker → **Settings → Variables and Secrets → Add**：Secret `PROXY_KEY` → **Save and deploy**
5. 记下地址 `https://dialfactory-ocr-proxy.<你的子域>.workers.dev`
6. 在 Supabase 添加 `OCR_PROXY_URL` / `OCR_PROXY_KEY` 两个 Secret → 重新部署 Edge Function

### 回滚

删除 Supabase 的 `OCR_PROXY_URL` Secret（或置空）→ 下次调用自动回到直连阿里云，**无需改代码**。

### 排错对照

| 现象 | 原因 | 处理 |
|---|---|---|
| `HTTP 401 invalid_proxy_key` | 两边密钥不一致 | 逐字符比对 `PROXY_KEY` / `OCR_PROXY_KEY` |
| `HTTP 500 proxy_key_not_configured` | Cloudflare 未加 Secret 或未 Save and deploy | 补 Secret 后重新部署 |
| `SignatureDoesNotMatch` | Worker 新增/篡改了签名头，或手工设置了 `host` | 只透传白名单头；不要设 `host` |
| `HTTP 504 upstream_timeout` | Cloudflare → 阿里云 20s 超时 | 换 Worker 区域，或回滚直连 |
| `OCR 请求超时（25s）…中转 Worker（url）` | Supabase → Worker 不通 | 用 curl 直接 POST Worker 验证可达性 |
| 识别结果正常但偶发失败 | 阿里云侧限流/抖动 | 保持重试逻辑 |
