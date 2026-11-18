# js/vendor — 本地内置的第三方库

## supabase.min.js

| 项 | 值 |
|---|---|
| 包 | `@supabase/supabase-js` |
| 版本 | **2.119.0**（锁定，不再随 `@2` 漂移） |
| 构建 | **ESM 单文件 bundle**（自包含，无任何外部 `import`） |
| 下载源 | `https://esm.sh/@supabase/supabase-js@2.119.0/es2022/supabase-js.bundle.mjs` |
| 体积 | 251.2 KB（原始） / 约 65–70 KB（gzip） |
| 许可 | MIT（上游 https://github.com/supabase/supabase-js ） |
| SHA-256 | `AC15807A58D84E5A59D1261F8A18F5D8036D58D6024D64A5C8F5CE773B54B1C5` |
| 本地处理 | 仅删除了末尾一行 `//# sourceMappingURL=…`（避免线上多一次 404 请求），其余未改 |

### 为什么放本地

原先 `index.html` 的 import map 指向 `https://esm.sh/@supabase/supabase-js@2`，
该地址位于**首屏关键路径**上：`type="module"` 的启动脚本必须先跨网取到 esm.sh
才能开始执行，之后才会动态加载 30+ 个业务脚本。国内访问 esm.sh 经常慢或超时，
表现为"打开网页长时间白屏 / 卡顿"。

本地化后：

- 首屏**不再有任何第三方域请求**（只剩自己的 html/css/js 与 Supabase API）；
- 版本**锁定**，不会因为上游发新版而行为突变；
- 加载方式保持不变（import map + `import { createClient } from '@supabase/supabase-js'`），
  只是把 import map 的目标换成本地文件 `./js/vendor/supabase.min.js`。

> 与上一版（UMD + 经典 `<script>`）相比：ESM 方式代码改动更小、无需恢复 `window.supabase`
> 的隐式注入，且能继续使用 import map 的统一出口。二者功能等价，本版为最终采用方案。

### 升级方式

```bash
# 1) 下载新的自包含 ESM bundle（版本号替换下方 <NEW_VERSION>）
curl -L -o /tmp/sb.mjs \
  https://esm.sh/@supabase/supabase-js@<NEW_VERSION>/es2022/supabase-js.bundle.mjs

# 2) 去掉 sourceMappingURL 行，再覆盖 vendor 文件
grep -v '^//# sourceMappingURL=' /tmp/sb.mjs > js/vendor/supabase.min.js

# 3) 自包含性自检：应为 0
grep -c 'from"' js/vendor/supabase.min.js

# 4) 本地起静态服务器验证控制台无报错，再更新本文件里的版本与 SHA-256
```

> 注意：`sw.js` 里有 `VERSION` 常量。**升级 vendor / 发版时必须同步 bump `VERSION`**，
> 否则 Service Worker 会继续返回旧缓存。升级后用户强刷（Ctrl+Shift+R）即可拿到新包。
