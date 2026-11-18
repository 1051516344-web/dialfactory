# js/vendor — 本地内置的第三方库

## supabase.min.js

| 项 | 值 |
|---|---|
| 包 | `@supabase/supabase-js` |
| 版本 | **2.119.0**（锁定，不再随 `@2` 漂移） |
| 构建 | UMD（`dist/umd/supabase.js`，已压缩，**未做任何修改**） |
| 下载源 | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js` |
| 体积 | 214.7 KB（原始） / 约 60 KB（gzip） |
| 许可 | MIT（见上游仓库 https://github.com/supabase/supabase-js ） |
| SHA-256 | `A867EDBCFB029370AEEC7223DD6180B560B621FBE3BC64C6584FB0369D1B7BCE` |

### 为什么放本地

原先 `index.html` 用 import map 指向 `https://esm.sh/@supabase/supabase-js@2`，
该地址位于**首屏关键路径**上：`type="module"` 的启动脚本必须先跨网取到 esm.sh
才能开始执行，之后才会动态加载 31 个业务脚本。国内访问 esm.sh 经常慢或超时，
表现为"打开网页长时间白屏 / 卡顿"。

本地化后：

- 首屏**不再有任何第三方域请求**（只剩自己的 html/css/js 与 Supabase API）；
- 版本**锁定**，不会因为上游发新版而行为突变；
- 加载方式改为经典 `<script>`，UMD 构建会在全局注入 `window.supabase`
  （`window.supabase.createClient` 由 `js/data/client.js` 使用），
  因此 `index.html` 不再需要 import map，启动脚本也不再是 `type="module"`。

### 升级方式

```bash
# 1) 换新版本（同时更新本文件的版本、SHA-256 与下表）
curl -L -o js/vendor/supabase.min.js \
  https://cdn.jsdelivr.net/npm/@supabase/supabase-js@<NEW_VERSION>/dist/umd/supabase.js

# 2) 校验全局名仍是 var supabase=...（首行）
head -c 120 js/vendor/supabase.min.js

# 3) 本地起静态服务器验证控制台无报错，再提交
```

> 注意：升级后需要**强刷**（Ctrl+Shift+R）或等 CDN/浏览器缓存过期，否则用户可能仍用旧包。
