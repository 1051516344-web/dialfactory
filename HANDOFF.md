# DialFactory V1 · 工作交接文档

> **更新日期：2026-11-20**
> **当前 HEAD：以 `git log -1 --oneline` 为准**（最后更新：本次提交）
> **线上地址：https://1051516344-web.github.io/dialfactory/**
>
> 本文档面向「换一台电脑接手开发」的场景：读完 §1-§6 即可开工，§7-§10 是规范与近期变更，
> §11 是待办，§12 是每次发版后的验收清单。
>
> **2026-11-20 补充**：迁移 **017 / 019 已确认执行**（见 §6 台账）；
> 接手前请先读 `AI_CONTEXT/13-升级版上下文.md`（当前状态快照）与
> `AI_CONTEXT/15-过期决策清单.md`（已废弃、会误导的做法）。

---

## 1. 项目概览

**DialFactory** — 广州表盘厂的生产追踪单页应用（SPA）。管理订单、工序流转、生产记录、异常事件、
路线模板、分批、巡检。目前处于**试运行阶段**，实际用户在工厂内 3~5 台终端上使用（手机 + 台式机）。

**当前状态：可用、稳定**。近期完成了一轮「稳定性排雷 + 死代码清理」，未引入任何构建工具，
仍是纯原生零配置架构。

---

## 2. 技术栈（刻意保持简单）

| 项目 | 说明 |
|---|---|
| 前端 | 原生 HTML / CSS / JS，**无框架、无构建工具、无 npm 依赖** |
| 模块模式 | IIFE 单例：`const Xxx = (() => { ... return {...}; })();` |
| 路由 | 自研 hash 路由（`js/utils/router.js`），`#/orders/:id` 风格 |
| 后端 | Supabase（PostgreSQL + PostgREST + Auth + Storage） |
| 第三方库 | 仅 `@supabase/supabase-js`，**已本地内置**（`js/vendor/supabase.min.js`，见 §10.1） |
| 部署 | GitHub Actions → GitHub Pages（推送 `main` 自动部署，约 1~2 分钟） |

---

## 3. 关键连接信息

| 项 | 值 |
|---|---|
| Supabase 项目 ref | `wzfkmwrqnvjegunjueka`（**ap-northeast-1 东京区**） |
| Supabase 控制台 | https://supabase.com/dashboard/project/wzfkmwrqnvjegunjueka |
| GitHub 仓库 | https://github.com/1051516344-web/dialfactory （分支 `main`，**公开仓库**） |
| 线上地址 | https://1051516344-web.github.io/dialfactory/ |
| Supabase URL / anon key | 在 `js/config.js`（anon key 是公开密钥，可提交，**不是** service_role） |

### 3.1 需要人工确认的凭证（仓库里没有）

- **登录账号**：`App.init()` 用 Supabase Auth 邮箱+密码登录。仓库里**没有**账号密码；
  若丢失，去 Supabase → **Authentication → Users** 重置密码或新建用户。
- **Edge Function Secrets**（OCR 相关，在 Supabase → Edge Functions → Secrets）：
  `ALIYUN_ACCESS_KEY_ID` / `ALIYUN_ACCESS_KEY_SECRET` / `DASHSCOPE_API_KEY` /
  `OCR_PROXY_URL` / `OCR_PROXY_KEY`。**绝不要写进前端代码**（已核查：仓库无云厂商密钥泄漏）。
- **Cloudflare Worker**（OCR 代理）：源码在 `cloudflare/ocr-proxy-worker.js`（只是代理，不含密钥；
  `PROXY_KEY` 通过 Worker 环境变量设置）。

> ⚠️ 迁移 SQL **不会自动执行**，必须在 **Supabase Dashboard → SQL Editor** 手动运行（见 §6）。

---

## 4. 在另一台电脑上 5 分钟跑起来

```bash
git clone https://github.com/1051516344-web/dialfactory.git
cd dialfactory
```

1. **本地预览**（必须用 HTTP，不要 `file://`，否则 import map / 模块会异常）
   ```bash
   npx serve .            # 或 python -m http.server 8080
   ```
   打开提示的地址（`npx serve` 默认 3000，`python -m http.server` 默认 8000），用 Supabase 账号登录。
   > **没有 Node 的机器**（例如 macOS）直接用 `python3 -m http.server 8080 --bind 127.0.0.1`，效果等价。
   > 原 Windows 机器上的 `serve.js` 是本地小工具，已在 `.gitignore` 中，**未入库**——克隆后没有这个文件属正常。

2. **确认凭证**：`js/config.js` 已含 URL + anon key，克隆后即可用。

3. **确认数据库迁移**：见 §6 台账 —— 017/019 已确认执行；018 已作废，**不要执行**。

4. **改代码 → 提交 → 自动部署**
   ```bash
   git add -A && git commit -m "..." && git push
   ```
   GitHub Actions（`.github/workflows/deploy.yml`）会：
   `checkout` → 只暂存 `index.html css js sw.js` 到 `_site` → 校验关键资源存在 → 推送 `gh-pages`。
   **注意**：发布白名单是刻意设计的（不发布 `docs/`、`supabase/`、`tools/`、`AI_CONTEXT/`）。
   若新增了需要发布的根级文件，必须同步改 `deploy.yml`。

5. **等待 1~2 分钟后**，用 **Ctrl+Shift+R 强刷**线上页面验证（Pages 有 10 分钟 HTTP 缓存，
   弱网/缓存问题 90% 是没强刷）。

---

## 5. 代码库结构（关键文件）

```
dialfactory/
├── index.html                 # 入口：6 个 CSS + 6 个静态 JS + import map(vendor) + 动态加载 31 个 JS
├── js/
│   ├── config.js              # Supabase URL/anon key、业务常量（状态标签、暂停原因…）
│   ├── app.js                 # 启动引导：DB.init → 鉴权 → startApp()（路由注册/Nav/Router.start）
│   ├── vendor/supabase.min.js # 本地内置的 supabase-js 2.119.0（ESM，见 README.md）
│   ├── utils/                 # dom.js（仅 escapeHtml）、format.js、router.js
│   ├── data/                  # 数据层：所有 SQL 请求都经 DB.call() 规范化
│   │   ├── client.js          # DB 单例 + 网络错误分类 + 安全鉴权订阅
│   │   ├── orders.js          # 订单/节点/巡检 API
│   │   ├── production-records.js、batches.js、customers.js、exceptions.js、
│   │   ├── processes.js、route-templates.js、storage.js、recognize.js
│   ├── domain/                # 纯业务逻辑（无 DOM）
│   │   ├── node-state.js      # 节点状态机 waiting/active/done/paused
│   │   ├── node-actions.js    # advance/pause/resume/activate/rework/append/undo/removeNode
│   │   ├── order-state.js     # orders.status 由节点派生（derive）
│   │   ├── seq-calc.js、validation.js、batch-state.js、order-create.js
│   ├── components/            # toast / confirm-dialog / empty-state / progress-bar /
│   │                          # skeleton / status-badge / nav-bar / login
│   └── pages/                 # dashboard(首页今日待办) / order-list / order-create /
│                              # order-detail / route-templates / exception-list / batch-detail
├── css/                       # reset / variables / layout / components / flow / pages
├── sw.js                      # ⚠️ 仅为「Kill Switch」：清旧 SW 缓存并注销自身，不缓存任何东西
├── manifest.webmanifest       # PWA 遗留文件（已不发布、index.html 不再引用）
├── icons/                     # PWA 图标遗留（已不发布）
├── supabase/migrations/       # 001~019（手动执行，见 §6）
├── supabase/functions/        # Edge Functions（OCR 识别）
├── cloudflare/ocr-proxy-worker.js  # 阿里云 OCR 的 Cloudflare 代理
├── tools/                     # Python 数据工具（⚠️ factory_data_reset.py 会清空数据，慎用）
└── .github/workflows/deploy.yml
```

**数据流约定**：页面 → `XxxAPI`（data 层）→ `DB.call()` → Supabase REST。
`DB.call()` 统一返回 `{ ok: true, data, count }` 或 `{ ok: false, error }`，**不抛异常**。

---

## 6. 数据库迁移台账（务必对照 Supabase 实际情况）

**所有迁移都要手动在 SQL Editor 执行**。文件位置统一在 `supabase/migrations/`。
状态说明：✅ 已确认执行 / ❓ **执行状态待确认** / ⛔ 已废弃

| 迁移 | 内容 | 状态 |
|---|---|---|
| 001 | 初始 schema（9 张表 + 索引 + 宽松 RLS） | ✅ |
| 002 | customers.short_name | ✅ |
| 003 | production_records | ✅ |
| 004 | process_route_templates | ✅ |
| 005 | 生产记录 duration_minutes | ✅ |
| 006 | 模板 route_signature / associated_orders | ✅ |
| 007 | orders 状态增加 cancelled | ✅ |
| 008 | drawings 私有桶 + Storage 策略（仅 authenticated） | ✅ |
| 009 | **安全收口**：DROP 001/003/004 的 `USING (true)` 宽松策略，重建为 `TO authenticated` | ✅ |
| 010 | 约束与触发器（`trg_orders_updated_at`、`trg_order_nodes_updated_at`、业务 CHECK） | ✅ |
| 011 | production_records.node_id | ✅ |
| 012 | production_batches / batch_relations（含 RLS） | ✅ |
| 013 | 客户数据（TIF/SHY） | ✅ |
| 014 | 外包/采购工序 P36–P42（type=辅助） | ✅ |
| 015 | **order_inspections 巡检表**（独立表，不污染 orders.updated_at） | ✅ |
| 016 | P43 切窗（制一 · 加工） | ✅ |
| **017** | `017_single_active_node_guard.sql`：**单 active 唯一索引** `ux_order_nodes_one_active`（P0 兜底） | ✅ 已执行（2026-11-20 核对：索引存在，且无重复 active 数据） |
| 018 | `018_add_painting_processes.sql`：P44 喷金油（已作废，仅历史记录） | ⛔ 不要执行 |
| **019** | `019_rename_dipping_to_gold_oil.sql`：删除 P44 + 把制二「打底」改名为「喷金油」 | ✅ 已执行（2026-11-20 核对：P17=喷金油，P44 不存在） |

### 6.1 017 的检查与执行（重要，P0 级）

```sql
-- ① 先查是否存在「双 active」异常（预期 0 行）
SELECT order_id, count(*) AS active_cnt
FROM order_nodes WHERE status = 'active'
GROUP BY order_id HAVING count(*) > 1;

-- ② 若无异常，创建部分唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_nodes_one_active
  ON order_nodes (order_id) WHERE status = 'active';

NOTIFY pgrst, 'reload schema';
```

### 6.2 019 的效果（工序字典）

- 制二 **P17 打底 → 喷金油**（只改 name，编码与顺序都不变）
- P18 喷漆 / P19 消光 保持不变
- 若曾执行 018，先删除 P44 再改名

```sql
-- 验证（预期：P17 喷金油 | P18 喷漆 | P19 消光）
SELECT p.code, p.name, d.name AS dept
FROM processes p LEFT JOIN departments d ON d.id = p.default_dept_id
WHERE p.code BETWEEN 'P16' AND 'P19' ORDER BY p.code;
```

### 6.3 关键设计决策（别乱改）

1. **巡检不进 orders 表**：`orders` 上有 `trg_orders_updated_at`，任何 UPDATE 都会把 `updated_at`
   刷成 now()，会破坏首页/列表页按 `updated_at` 升序的「未推进时长」排序。故用独立表
   `order_inspections`（`markInspected()` 只 INSERT，不写 orders）。
2. **orders.status 是派生值**：`OrderState.derive(nodes, currentStatus)` 由节点状态推导。
   调用时**必须传 `currentStatus`**（否则 cancelled 终态会被"复活"）。
3. **节点序列模型**：同一订单同一时刻**只能有一个 `active` 节点**。前端三层守卫
   （`activate` / `resume` / `undo` 共用 `guardSingleActive()`）+ DB 部分唯一索引（017）。
4. **RLS**：所有表对 `authenticated` 全权限、`anon` 零权限；Storage `drawings` 桶同为 authenticated。
5. **编码不重编号**：`processes.code`（P01…P43）与 `order_nodes.process_code` 历史快照绑定，
   新工序一律**顺延分配**；绝不重排既有编码。

---

## 7. 功能现状（已完成）

- **首页「今日待办」**：在产/暂停订单清单，按「今日未巡检优先 > `updated_at` 升序」排序；
  汇总行（在产/已暂停/逾期/今日完成工序/今日已巡检 X/Y）；交期临近；最近生产动态。
- **订单列表**：状态/客户/工序筛选、分页、加载更多；卡片显示客户、规格、当前工序、进度、停滞天数。
- **新建订单**：OCR 识别客户订单图（阿里云 OCR 经 Edge Function + Cloudflare 代理）、
  客户归档/复活、两步式建单（信息 → 选工序建路线）、图纸上传（Storage）。
- **订单详情**：页头信息、工序时间线、节点操作（开始/完成/暂停/恢复/返工/追加工序/移除/撤销）、
  异常登记、分批、图纸查看、**确认巡检**、取消订单、试运行清理（删除订单）。
- **路线模板**：自动沉淀 + 按 `route_signature` 去重 + 行内改名。
- **异常列表**、**批次详情**。
- **弱网容错**：网络失败不再误报"订单不存在"或"密码错误"（见 §8）。

---

## 8. 本轮关键变更（2026-11-19）

### 8.1 弱网容错（auth 相关，全部在 `js/data/client.js` / `js/app.js` / `js/components/login.js`）

- `DB.isNetworkError(err)`：识别 `Failed to fetch` / `AuthRetryableFetchError` / `TimeoutError` / offline。
- `DB.getUserState()`：返回 `{ user, error, networkError }`，**把"确实未登录"与"弱网校验失败"分开**。
  （原 `getUser()` 丢弃 error，导致弱网误判"未登录"把人踢回登录页。）
- `DB.onAuthStateChangeSafe()`：弱网误发的 `SIGNED_OUT` 若本地仍有会话则**忽略**；真登出才回登录页。
- 登录页：网络类错误 → 「网络连接异常，无法连接服务器，请检查网络」；仅
  `Invalid login credentials` 才提示「账号或密码错误」。
- 鉴权失败且网络异常时渲染「网络连接异常」落地面 + 重新连接按钮，**不再显示登录页**。
- **首屏不再被 cross-border 鉴权阻塞**：`app.js` 只 `await DB.awaitSession()`（读本地会话，毫秒级），
  有会话就立刻 `startApp()` 渲染，token 校验改为**后台异步**（`getUserState().then(...)`）。
  首屏因此少一个到东京的 RTT（实测 ttfb ≈ 0.32s，弱网可达数秒）。

### 8.2 单 active 守卫 + DB 兜底（P0）

- `node-actions.js` 新增唯一实现 `guardSingleActive(order, nodeId)`，`activate()` / `resume()` / `undo()`
  三处共用。修复了可复现缺陷：**暂停 A → 激活 B → 恢复 A** 会得到两个 active 且无任何报错。
- 7 处 `OrderState.derive(nodes)` 补传 `order.status`（现 9/9 处全部传入），`cancelled` 不再被复活。
- 迁移 017 提供 DB 级部分唯一索引（见 §6.1）。
- 行为回放测试 20/20 通过（含 P0 三步复现、正常推进不回归）。

### 8.3 死代码清理（净减 322 行）

- 删除 0 引用函数：`getProductionOverview`(7 查询聚合) / `getStalled` / `getProcessGrouped` /
  `saveRouteTemplate`；`js/utils/dom.js` 只保留 `escapeHtml`（删掉 create/$/$$/render/show/hide）。
- `OrdersAPI.getById` 的 select **去掉 `route_snapshot`**（前端只写不读的大 JSONB）。
- 验证方式：node --check + 35/35 模块装载 + 全仓 `XxxAPI.foo(` 悬空引用扫描（0 处）+ 三页面 render 冒烟。

### 8.4 工序字典

- 需求：「喷漆」后的细化工序，名为「喷金油」「消光」，型号/参数写进订单备注。
- 事实核对后：`P43` 已被 016「切窗」占用（`processes.code` 是 UNIQUE，编码只顺延）；
  制二**已存在 P19 消光**；故最终方案 = **把 P17 打底改名为喷金油**（迁移 019），
  **不新增编码、不重排顺序**。
- 前端：新建订单「备注」框下方提示 `注：若含喷金油/消光，请在备注写明具体型号/要求。`

---

## 9. 开发规范与踩坑记录（血泪教训）

### 9.1 改「结构相似」的领域函数后必须跑行为测试

`node-actions.js` 里 `rework()` 与 `append()` 的插入片段几乎相同（只有 `process_id` 取值不同）。
做文本锚点替换时曾把 `initialStatus` 的声明落在 `rework`、使用落在 `append`，
**`node --check` 完全看不出**（语法合法），运行时才 `ReferenceError`。

规范：

1. **锚点唯一性**：替换前统计 old 片段出现次数，**必须恰好 1 次**；锚点要含能区分的行。
2. **行为验证**：用 mock 依赖跑真实函数（mock 必须返回新对象、不改入参内存），断言改动落在正确分支。
3. **导出闭环**：页面 `onclick="XxxPage.onFoo()"` 与 IIFE 末尾 `return {...}` 的键比对，**差集必须为空**
   （曾漏 `onActivate` 导出 → 按钮"点不动"、无提示）。
4. **删代码前先 grep 证明 0 引用**（含 `index.html`）；删除后跑"模块装载 + 跨模块引用扫描"。

### 9.2 Windows / PowerShell 踩坑（这台机器上反复出现过）

- 仓库内多数文件是 **CRLF**，个别是 LF。**不要整文件归一化**；
  脚本里做多行锚点拼接必须按文件实际 EOL（`src.includes('\r\n') ? '\r\n' : '\n'`），
  否则锚点 0 命中（本次清理就这样失败过一次）。
- **提交信息含中文必须用 `git commit -F <文件>`**（PowerShell 5.1 会把 `-m` 里的中文搞乱）。
  写消息文件要用**无 BOM** 的 UTF-8（PowerShell `Set-Content -Encoding UTF8` 会加 BOM，
  曾导致提交主题行首出现 ``）。推荐用 `[System.IO.File]::WriteAllText(path, text, UTF8Encoding($false))`。
- `Invoke-WebRequest` 对 GitHub Pages 的 **HEAD 请求会误报 404**，验证线上文件请用 `GET`。
- 用 `node --check` 检查 ESM 语法的 `.js` 会误报（仓库无 `"type":"module"`）→ 复制成 `.mjs` 再查。
- `git push` 偶发 `Failed to connect to github.com:443` → 直接重试即可。

### 9.3 其它

- **不要破坏零构建架构**：不引入打包器/npm 依赖；新增静态文件必须同步 `deploy.yml` 白名单。
- **业务数据绝不缓存**：若将来再做 PWA，SW 只能缓存同源静态资源，
  `supabase.co` 请求必须 network-only（见 §10.2 回滚教训）。
- **别信"改了没生效"**：Pages 有 10 分钟缓存，先强刷再看；确认线上文件是否真是新版可 `curl` 比对。

---

## 10. 历史变更摘要

### 10.1 2026-11-18 · 国内加载优化 P0（保留）

- `js/vendor/supabase.min.js`：`@supabase/supabase-js` **2.119.0** 的 ESM 单文件 bundle（251.2 KB，
  0 外部 import；仅删掉末尾 sourceMappingURL）。`index.html` import map 指向它。
- 收益：首屏**不再有任何第三方域请求**（原先 `esm.sh` 卡住会阻塞全部业务脚本），版本锁定不漂移。
- 版本/来源/SHA-256/升级步骤见 `js/vendor/README.md`。

### 10.2 2026-11-18 · PWA 上线后回滚（教训）

- 引入 Service Worker 缓存静态资源（同源 cache-first、Supabase network-only）。
- **上线后国内反而更卡**（SW 拦截 + 缓存写入开销 > 收益）→ 当日回滚。
- 回滚要点（重要）：旧 SW 对**导航请求**也是 cache-first，会一直返回缓存的旧 `index.html`，
  导致新页面（含注销脚本）永远执行不到 → **不能简单删掉 `sw.js`**，必须发布「自杀式」
  Kill Switch（`activate` 时清空缓存 + `unregister()` 自身）。现在仓库里的 `sw.js` 就是这个用途，
  等确认所有客户端都清理完毕后（约 1~2 周）再删除它与 `deploy.yml` 中的拷贝项。
- 页面侧：`index.html` 已无 SW 注册，只有 `getRegistrations().unregister()` + 清空 Cache Storage。
- 若将来重新启用 PWA：**每次发版必须 bump `sw.js` 的 `VERSION`**，否则用户永远看旧缓存。

### 10.3 2026-10-29 · 巡检功能 + 性能修复

- 迁移 015 `order_inspections`（独立表，理由见 §6.3）；
  首页「今日待办」排序与巡检标记；详情页「确认巡检」。
- OCR 客户建档：查重扩到停用客户并自动复活；订单 `specs.customer_name_raw` 兜底。
- 修复 `list.map(renderTodoRow)` 隐式传 index 导致首页白屏；`getById` 改 `maybeSingle()` 修 406；
  31 个脚本改 `Promise.all` 并行加载。

---

## 11. 待办 / 已知问题（按优先级）

### 高优先（仍未做）

1. **乐观锁缺失**：`updateNode` / `updateStatus` 都是 `.eq('id')` 盲写（last-write-wins）。
   多终端并发会覆盖；与"双 active"叠加有风险（前端守卫 + 017 索引已挡住最坏情况）。
   建议：`UPDATE ... WHERE id = ? AND updated_at = ?`，影响 0 行则提示「他人已更新，请刷新」。
2. **首屏请求数**：44 个请求（6 CSS + 37 JS/vendor）、无 `preload`、31 个 JS 全量加载
   （含 50 KB 的 order-detail.js）。可做：CSS 合并 1 个、`rel=preload` vendor、按路由懒加载。
3. **仓库是公开的**：`AI_CONTEXT/`、`HANDOFF.md`、迁移 SQL、tools 全部公开（无密钥泄漏，
   但暴露数据模型与内部规划）。建议转私有或移除 `AI_CONTEXT/`。

### 中低优先

4. `escapeHTML` 在 10 个页面文件里各重复定义一份（转调 `DOM.escapeHtml`）→ 可收敛。
5. `bumpSeq()` 是 N+1（1 SELECT + N UPDATE）；`deleteOrder()` 7 个串行查询且**无事务**。
6. `order_inspections.inspected_by` 从未写入 → 无法追溯"谁巡检"。
7. 首页/列表页切页重复拉取（无会话内缓存）。
8. `removeNode` 删到没有非 done 节点时可能让订单直接变 `completed`（语义待确认）。
9. `sw.js` Kill Switch 与 `manifest.webmanifest`、`icons/` 是回滚遗留，1~2 周后可清理（见 §10.2）。
10. `tools/factory_data_reset.py` 会**清空并重建**业务数据（⚠️ 慎用）；
    `tools/` 与 `AI_CONTEXT/` 是本地工具/资料，**不参与部署**。

---

## 12. 每次发版后的验收清单（手测 5 分钟）

1. **强刷**线上页面（Ctrl+Shift+R），Console 无报错。
2. **首页** `#/`：清单、汇总行、交期临近、动态正常。
3. **订单列表** `#/orders`：卡片/进度条/筛选正常。
4. **订单详情**：打开一个在产订单 → 推进/暂停/恢复按钮可用；**测一次双 active 守卫**
   （暂停当前 → 激活下一道 → 回去点"恢复"，应提示「已有进行中的工序…」）。
5. **新建订单** `#/orders/new`：备注框下方提示文案可见；第二步能选到新工序（如「喷金油」）。
6. 断网刷新 → 应显示「网络连接异常」而非登录页；恢复网络后重新连接可正常进入。

---

## 13. 快速自检命令（Windows PowerShell）

```powershell
cd C:\Users\Administrator\dialfactory

# 1) 语法检查（改动过哪些文件就查哪些）
$f='js/app.js','js/domain/node-actions.js'; foreach($p in $f){ $t="$env:TEMP\c.mjs"; Copy-Item $p $t -Force; node --check $t; Write-Host "$p exit=$LASTEXITCODE"; Remove-Item $t -Force }

# 2) 死代码/悬空引用粗查（举例：确认某函数确实 0 引用）
Select-String -Path js\**\*.js -Pattern 'getStalled' -SimpleMatch

# 3) 线上文件是否为最新版（GET，不要用 HEAD）
$ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
(Invoke-WebRequest "https://1051516344-web.github.io/dialfactory/js/app.js?cb=$ts").

# 4) 仓库状态/最近提交
git status --short; git log --oneline -5
```

---

## 14. 接手后建议的第一步

1. `git pull` → 读 §6 台账（017/019 已确认执行）+ `AI_CONTEXT/13-升级版上下文.md` 的现状快照。
2. 本地 `npx serve .` 起服务，登录跑一遍 §12 清单，确认基线健康。
3. 再挑 §11 里的事项继续（建议先做「乐观锁」，它是多人协同的最后一块短板）。
