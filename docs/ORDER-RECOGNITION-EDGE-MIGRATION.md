# 订单图片识别服务 → Supabase Edge Function 迁移设计

> 状态：**第一阶段（骨架 + 设计）已完成**，第二/三阶段待执行。
> 目标：把本地 `localhost:3100` 订单图片识别迁移为公网可访问的识别接口，
>       使手机/平板通过 GitHub Pages 访问时也能使用 AI 识别。
> 硬约束：不改数据库 / 不改订单字段 / 不改 batch 模块 / 不重构业务 / 不直接大范围编码。

---

## 1. 当前架构问题

```
浏览器 (GitHub Pages · HTTPS)
   │  POST multipart/form-data（字段名 file）
   │  CONFIG.RECOGNIZE_URL = http://localhost:3100/api/extract
   ▼
本机 Node 服务 (dialfactory-server.js · 端口 3100)  ← 只在开发机
   │  手动解析 multipart → 落临时文件 → fs 读图 → base64
   ▼
DashScope 兼容接口 (qwen3-vl-flash)
   ▼
返回 6 字段 JSON → 浏览器
```

| # | 问题 | 后果 |
|---|------|------|
| 1 | 服务绑定本机 | 手机/平板的 `localhost` 指向自己，`ERR_CONNECTION_REFUSED` |
| 2 | HTTP vs HTTPS 混合内容 | GitHub Pages 是 HTTPS，浏览器拦截 `http://` 请求（混合内容 / Private Network Access） |
| 3 | API Key 靠本机 `.env.txt` | 无法安全提供给公网部署 |

结论：要公网可用，识别服务必须搬到 **HTTPS 公网端点**。前端本来就连 Supabase，Edge Function 是最顺的选择。

---

## 2. 关键路径与可迁移性

6 字段识别路径已和 18 字段 DrawingFacts 管线**彻底解耦**（extractor.js 顶部注释明确），迁移面很小。

| 文件（本地服务） | 作用 | 迁移性 |
|------------------|------|--------|
| `order-extract/extractor.js` | Prompt + 调 DashScope + 抽 6 字段 | **大部分迁移**（Prompt/抽取逻辑纯函数；`fs` 读图改由调用方提供字节） |
| `order-extract/dialfactory-server.js` | HTTP + multipart + 字段映射 | **部分迁移**（`toContractFields` 原样搬；`http`/`parseMultipart`/临时文件删，Deno 用 `req.formData()`） |
| `vision/openai-vision-provider.js` | 复用工具 | **部分迁移**（`buildRequestBody`/`extractText`/`parseJson` 原样搬；`detectMediaType` 改 MIME 入参；proxy/envelope/18 字段无关） |

**明确不迁移**：`envelope.js`、`qwen-vision-provider.js` 类、`normalize/*`、`rules/*`、`schema/*`、`pipeline.js`、`validate/*`、`workbench/*`、`evaluation/*`、`scripts/*`。

---

## 3. 推荐迁移架构

```
浏览器 (GitHub Pages · HTTPS)
   │  POST multipart/form-data（字段名 file）
   │  CONFIG.RECOGNIZE_URL = https://wzfkmwrqnvjegunjueka.supabase.co/functions/v1/recognize-order
   ▼
Supabase Edge Function（Deno · 零依赖）
   │  req.formData() → 取 file → arrayBuffer → base64
   │  detectMediaType({ mimeType, filename })
   │  extractOrderFields({ apiKey, mediaType, imageData })   ← 共享核心
   │  toContractFields(result.fields)                        ← 共享核心
   │  CORS 头 → 200 JSON（6 字段扁平）
   ▼
DashScope (qwen3-vl-flash)  ← Bearer 来自 Supabase Secret DASHSCOPE_API_KEY
   ▼
浏览器回填订单表单
```

### 共享核心（抽离识别核心逻辑）

```
             order-extract-core.js（单一事实来源，纯 ESM，运行环境无关）
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   Node 本地服务                     Supabase Edge Function
   (extractor.js 后续 import)       (recognize-order/index.ts 已 import)
```

核心只含：`ORDER_FIELDS`、`buildOrderExtractPrompt()`、`detectMediaType()`、`buildRequestBody()`、`extractText()`、`parseJson()`、`extractOrderFields()`、`toContractFields()`。
不含：读文件（fs）、HTTP 服务、multipart 解析 —— 由调用方负责。

---

## 4. 代码迁移清单

### 移动（进 Edge Function，已完成）
| 内容 | 来源 |
|------|------|
| 6 字段 Prompt `buildOrderExtractPrompt()` | `extractor.js`（逐字） |
| 字段清单 `ORDER_FIELDS` / `FIELD_KEYS` | `extractor.js`（逐字） |
| DashScope 调用 + finish_reason 检查 + 6 字段抽取 | `extractor.js`（改：`imagePath` → `mediaType`+`imageData`） |
| `buildRequestBody` / `extractText` / `parseJson` | `openai-vision-provider.js`（逐字） |
| MIME 校验 `detectMediaType` | 改写为 MIME/文件名入参，输出值一致 |
| `toContractFields` 字段映射 | `dialfactory-server.js`（逐字） |
| CORS 头 + 错误码（400/413/503/500）语义 | `dialfactory-server.js` |

### 保持（不动）
| 内容 | 文件 |
|------|------|
| 前端识别调用 `RecognizeAPI.extract(file)` | `js/data/recognize.js`（完全不变） |
| 前端配置 `RECOGNIZE_URL` | `js/config.js`（**第三阶段**才改这一行） |
| 订单创建逻辑 | `js/domain/order-create.js`、`js/pages/order-create.js` |
| 数据库 schema / 订单字段 | `supabase/migrations/*`、`orders` 表 |
| batch 模块 | 不动 |
| DrawingFacts 模型 | `图纸模型` 项目 |
| 本地识别服务 | `图纸模型` 项目（当前暂不改，后续 import 共享核心） |

---

## 5. 修改文件列表

### 新增（第一阶段已完成）
| 文件 | 说明 |
|------|------|
| `supabase/functions/_shared/order-extract-core.js` | 共享抽取核心（单一事实来源） |
| `supabase/functions/recognize-order/index.ts` | Edge Function 骨架 |

### 配置（不进代码，第二阶段执行）
| 操作 | 说明 |
|------|------|
| `supabase secrets set DASHSCOPE_API_KEY=<key>` | API Key 存为 Supabase Secret（绝不进代码/前端/git） |
| `supabase functions deploy recognize-order` | 部署到项目 `wzfkmwrqnvjegunjueka` |

### 修改（第三阶段执行，仅一行）
| 文件 | 改动 |
|------|------|
| `js/config.js` | `RECOGNIZE_URL` 改为 `https://wzfkmwrqnvjegunjueka.supabase.co/functions/v1/recognize-order` |

---

## 6. 实施步骤

| 步骤 | 内容 | 状态 |
|------|------|------|
| 第一步 | 创建 Edge Function 骨架 + 迁移设计 | ✅ 完成（本阶段） |
| 第二步 | 部署测试接口（`supabase secrets set` + `functions deploy`，curl 验证 6 字段一致） | ⏳ 待执行 |
| 第三步 | 确认返回字段一致后，改 `js/config.js` 的 `RECOGNIZE_URL` | ⏳ 待执行 |

---

## 7. 风险点

| # | 风险 | 说明与对策 |
|---|------|-----------|
| 1 | API Key 泄露 | 只用 `Deno.env.get('DASHSCOPE_API_KEY')`，存 Secret，不写代码/前端/git |
| 2 | 接口公网滥用 | Edge Function URL 公开，任何人可调烧额度。第一阶段按约束不加鉴权；后续可选 JWT |
| 3 | 请求体大小上限 | 本函数 20MB 上限与本地一致；Supabase 平台请求体默认上限可能更低（约几 MB），可能需在部署时调高，否则超大图在网关层即被拒 |
| 4 | 超时 | Qwen 调用几秒 + 冷启动 1–3s，函数 wall-clock 与前端 30s 超时均够 |
| 5 | Deno vs Node 差异 | `req.formData()` / `Deno.env.get()` 替代 `http.Server`/`process.env`；base64 用分块避免堆爆 |
| 6 | 6 字段契约必须一字不改 | `order_number→customer_order_no`、`production_number→order_no`；改名会打爆前端 `applyRecognition` |
| 7 | 本地服务不能误删 | Edge 是「加」，不是「替」；本地服务仍用于评估/调试 |
| 8 | CORS | 返回 `Access-Control-Allow-Origin: *`（与本地一致） |
| 9 | 部署前置 | 需 `supabase` CLI 登录 + `supabase link` + 项目开通 Edge Functions |

---

## 8. 后续建议（本次不做，备查）

- **加鉴权**：Edge Function 用 JWT 校验登录态，前端 `RecognizeAPI.extract` 补 `Authorization` 头，堵公网滥用。
- **加限流/配额**：按调用方或 IP 限速，控制 DashScope 成本。
- **透传 evidence**：6 字段之外可把 `evidence` 一并透传，供人工核对。
- **本地服务收编**：让 `图纸模型 order-extract/extractor.js` 改为 import 本共享核心，彻底消除两套 Prompt。
