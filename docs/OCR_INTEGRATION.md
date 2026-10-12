# DialFactory OCR 接入手册

> 本文档记录订单图纸 OCR 识别能力的接入现状与已知问题。
> 相关实现：`supabase/functions/recognize-order-ocr/`、`supabase/functions/_shared/ocr/`

## 已知问题

### 网络超时（未解决，2026-10-12）
- 现象：偶发 500，错误为 `OCR 请求超时（25s）` 或 `SignatureDoesNotMatch`
- 根因：Supabase 东京节点 → 阿里云杭州端点（ocr-api.cn-hangzhou.aliyuncs.com）出站不稳定
- 临时缓解：刷新重试，多数情况 2–3 次可成功
- 长期方案（未实施）：
  - A. 换阿里云国际站端点（如账号支持）
  - B. 加香港/新加坡中转（Cloudflare Workers）
  - C. 换东京/新加坡可直连的 OCR（Google Vision / AWS Textract）
- 相关文件：supabase/functions/_shared/ocr/aliyun-ocr.ts
