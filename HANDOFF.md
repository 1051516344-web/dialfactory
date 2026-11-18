# DialFactory V1 工作交接总结

> 更新日期：2026-11-18
>
> 🔴🔴🔴 **每次改前端代码，都必须同步修改 `sw.js` 里的 `VERSION` —— 详见 §8.2【致命警告】**
>
> 历史变更见 §9「本轮关键变更（2026-10-29）」、§10「本轮关键变更（2026-11-18）」

## 1. 项目概览

**DialFactory** — 广州表盘厂的生产追踪单页应用（SPA），用于订单、工序、生产记录、异常、路线模板的管理。目前处于**试运行阶段**。

## 2. 技术栈

| 项目 | 说明 |
|------|------|
| 前端 | 原生 HTML/CSS/JS，**无框架**，hash 路由 |
| 架构 | IIFE 模块模式 `const Xxx = (() => {...})()` |
| 后端 | Supabase（PostgreSQL + REST API） |
| 部署 | GitHub Pages 自动部署 |

## 3. 关键连接信息

| 项 | 值 |
|----|----|
| **Supabase 项目** | `wzfkmwrqnvjegunjueka`（ap-northeast-1 东京区） |
| **GitHub 仓库** | `https://github.com/1051516344-web/dialfactory`（分支 `main`） |
| **线上网址** | `https://1051516344-web.github.io/dialfactory/` |
| **API 密钥** | 在 `js/config.js` 里（`CONFIG.SUPABASE_URL` / `CONFIG.SUPABASE_ANON_KEY`） |

> ⚠️ 迁移脚本（SQL）不会自动执行，需要你在 **Supabase Dashboard → SQL Editor** 手动运行。

## 4. 代码库结构（关键文件）

```
DialFactory/
├── index.html              # 入口，脚本按顺序链式加载
├── js/
│   ├── config.js           # Supabase URL + anon key
│   ├── app.js              # 路由注册（Router.on）
│   ├── data/               # 数据层（DB.call 封装）
│   │   ├── client.js       # DB 单例（init/get/call）
│   │   ├── orders.js
│   │   ├── production-records.js
│   │   ├── route-templates.js   # 路线模板 API（签名去重）
│   │   └── ...
│   ├── domain/             # 业务逻辑（order-state、node-state等）
│   ├── components/         # UI 组件（nav-bar、status-badge等）
│   └── pages/              # 页面（dashboard、order-create、route-templates等）
├── css/pages.css
└── supabase/migrations/    # 所有 SQL 迁移（需手动执行）
    ├── 004_route_templates.sql
    ├── 005_add_duration_minutes.sql
    └── 006_route_template_signature.sql
```

**核心 API 封装**：`DB.call(promise)` 把 Supabase 响应规范成 `{ ok, data, count }` 或 `{ ok: false, error }`。

## 5. 近期完成的工作（Phase 4）

1. **路线模板自动沉淀** — 创建订单时自动保存工序路线为模板
2. **签名去重优化** — 用 `route_signature`（如 `冲板-切窗-电镀-QC`）作为唯一标识，相同路线不新建模板，只 `used_count +1` + 追加关联订单
3. **模板名称可编辑** — 点击名称/✎ 行内编辑，`Enter` 保存，`Escape` 取消
4. **仪表盘改名** — "生产驾驶舱" → "生产明细"
5. **修复 duration_minutes 缺列** — migration 005
6. **数据清理** — 删除了误录的测试订单 #R46197 及其 14 条生产记录、Route-001 模板

## 6. ⚠️ 待办事项（重要）

在 Supabase SQL Editor 手动运行以下迁移（若尚未执行）：

**迁移 005**（修复生产完成报错）：
```sql
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
NOTIFY pgrst, 'reload schema';
```

**迁移 006**（路线模板签名）：
```sql
ALTER TABLE process_route_templates ADD COLUMN IF NOT EXISTS route_signature TEXT;
ALTER TABLE process_route_templates ADD COLUMN IF NOT EXISTS associated_orders JSONB DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS idx_route_signature ON process_route_templates(route_signature);
NOTIFY pgrst, 'reload schema';
```

**迁移 014**（新增 7 道采购/外发工序，P36–P42 —— **已执行** ✅）：

文件：`supabase/migrations/014_add_outsourcing_processes.sql`

内容：往 `processes` 表插入 7 条工序（制一 P36 采购粗胚 / P37 外发焊脚 / P38 外发车床 /
P39 外发批面；制二 P40 电镀外发；制三 P41 印刷外发；制四 P42 点夜光外发），
`type='辅助'`、`is_required=false`、`is_active=true`；逐行幂等（`WHERE NOT EXISTS (code)`）。

验证：`SELECT count(*) FROM processes WHERE is_active = true;` → 应为 **42**（原 35 + 7）。

**迁移 015**（巡检记录表 —— **已执行** ✅）：

文件：`supabase/migrations/015_add_order_inspections.sql`

内容：新建 `order_inspections`（巡检记录，独立于 `orders`，避免污染 `updated_at`）+ 2 个索引 +
RLS（与 009 一致，仅 authenticated 可读写）。

验证：`SELECT count(*) FROM order_inspections;` → 能正常返回（初期为 0）。

**迁移 016**（新增工序「切窗」—— **已执行** ✅）：

文件：`supabase/migrations/016_add_process_cut_window.sql`

内容：向 `processes` 新增 **P43 切窗**（制一 · 加工 · `is_required=false` · `is_active=true`）。
编码顺延至 P43（迁移 014 已用至 P42；`order_nodes.process_code` 存历史快照，一律不重编号）。
type 取「加工」而非「检验」，避免触发「完成节点必填产出数量」的强制校验。
前端零改动：新建订单第 2 步按 `default_dept_id` 自动归入「制一」分组。

验证：`SELECT count(*) FROM processes WHERE is_active = true;` → 应为 **43**（原 42 + 1）。

## 7. 如何在台式电脑继续

1. **克隆仓库**：
   ```bash
   git clone https://github.com/1051516344-web/dialfactory.git
   ```
2. **确认 Supabase 凭证** — 看 `js/config.js`（已经提交到仓库里，克隆后即有）
3. **执行未跑的迁移** — 见上一步
4. **本地预览** — 用任意静态服务器（如 VS Code Live Server）打开，或直接访问线上网址
5. 改完代码 `git commit` + `git push`，GitHub Actions 自动部署到 Pages
   ⚠️ **被 PWA 缓存接管后，发版流程多一步：先把 `sw.js` 里的 `VERSION` 改成新值**（见 §8.2）

## 8. 开发规范（踩坑记录）

### 8.1 改「结构相似」的领域函数后，必须跑行为测试

**背景（2026-10-26，订单 R46500 排查）**：`js/domain/node-actions.js` 中 `rework()` 与 `append()` 的
`Gap-based seq → insertNode({...})` 这一段**文本几乎完全相同**（唯一差别是 `process_id`
分别取 `parentNode.process_id` / `proc.id`）。用文本锚点做替换时，第一个匹配总是命中 `rework()`，
结果 `const initialStatus = ...` 落在了 `rework()` 里，而使用处 `status: initialStatus` 落在了
`append()` 里 —— **`node --check` 完全看不出问题**（语法合法），直到运行 `append()` 才抛
`ReferenceError: initialStatus is not defined`。

**规范（改领域层 / 批量替换时必须遵守）**：

1. **锚点唯一性**：替换前先统计每个 old 片段在文件中的出现次数，**必须恰好 1 次**（0 次或 >1 次直接报错停止）；
   锚点要包含能区分兄弟函数的行（如 `process_id:   proc.id` vs `parentNode.process_id`）。
2. **行为验证**：改完用 mock 依赖跑一遍真实函数（mock `OrdersAPI` / `ProcessesAPI`）。
   注意 mock 必须**返回新对象、不修改入参内存**，否则复现不出真实 bug。
   断言改动**落在正确的函数分支**里 —— 只有这样才发现"语法没错、但改错了函数"。
3. **导出闭环检查**：页面的 `onclick="XxxPage.onFoo(...)"` 与 IIFE 末尾 `return { ... }` 必须对照检查。
   曾漏掉 `onActivate` 导出，导致按钮点击直接 `TypeError`（表现为"按钮点不动"、无任何提示）。
   检查方法：正则收集 `XxxPage\.(\w+)\(` 的全部引用，与最后一个 `return {...};` 的键比对，**差集必须为空**。

### 🔴🔴🔴 8.2【致命警告】每次改前端代码，必须修改 `sw.js` 里的 `VERSION`

> # ⚠️ 发版必须 bump VERSION
>
> **由于引入了 PWA (Service Worker)，以后任何一次前端代码更新，必须修改 `sw.js` 中的
> `VERSION` 变量（例如从 `v2026-11-18-01` 改成 `v2026-11-18-02`）。**
>
> **否则用户的浏览器会永远从本地缓存加载旧代码，导致更新失效！**

**位置**：`sw.js` 顶部 ——

```js
const VERSION = 'v2026-11-18-01';   // ← 每次发版 +1（日期-序号 或 递增序号均可）
```

**为什么必须改**：Service Worker 对同源静态资源（html / css / js / vendor / icons）采用
**cache-first**。只有 `sw.js` 的字节发生变化，浏览器才会安装新 SW；新 SW 的 `activate`
阶段才会删除旧缓存并通知页面刷新。`VERSION` 不变 → 缓存名不变 → 旧缓存永远命中。

**正确发版流程（四步，缺一不可）**：

1. 改业务代码（js / css / index.html）
2. **把 `sw.js` 的 `VERSION` 改成新值**（例：`v2026-11-18-01` → `v2026-11-18-02`）
3. `git add` → `commit` → `push`（Actions 自动部署，约 1–2 分钟）
4. 用户下次打开：新 SW 接管 → 页面顶部提示「**系统已更新，请刷新页面**」→ 刷新即拿到新版本

**忘记 bump 的后果（极难排查）**：

- 用户在浏览器里看到的是**旧页面**，且**服务端没有任何报错**、Network 里甚至看不到新请求；
- 典型症状："我明明改了/推了，怎么线上没变化？" —— 先怀疑 VERSION，再怀疑部署。

**应急手段（临时让某个用户拿到新版）**：

- 强刷：`Ctrl + Shift + R`（Mac：`Cmd + Shift + R`）
- 或 F12 → **Application → Service Workers → Unregister**，再刷新
- 或 F12 → Application → Cache Storage → 删除 `dialfactory-*` 缓存后刷新

**发布清单自查（每次发版前问自己）**：

- [ ] `sw.js` 的 `VERSION` 改了吗？
- [ ] 若新增/改名了静态文件，`deploy.yml` 的 `cp -r …` 与 `Verify critical assets` 同步了吗？
- [ ] 本地（`node serve.js` / `npx serve`）验证过控制台无报错吗？

## 9. 本轮关键变更（2026-10-29）

### 9.1 新增巡检表（Migration 015）

- 新建 `order_inspections` 独立表（`order_id` / `inspected_at` / `inspected_by` / `note`），
  **刻意不与 `orders` 混为一张表**：`orders` 上有 `trg_orders_updated_at` 触发器，任何 UPDATE 都会把
  `updated_at` 刷成 now()。若把巡检时间写进 `orders`，"刚巡检"会立刻变成"刚更新"，
  直接破坏首页与订单列表页按 `updated_at` 升序的「未推进时长」排序。
- 迁移文件：`supabase/migrations/015_add_order_inspections.sql`（RLS 与 009 一致；`ON DELETE CASCADE` 随订单清理）。
- 详情页页头新增 ghost 按钮「确认巡检」→ 写入一行记录后按钮消失，改为灰色小字
  「上次巡检：今天 09:30」。**巡检只记录"看过了"这个动作，不改变物理推进时间**。

### 9.2 首页待巡检清单逻辑

- 排序：**今日未巡检优先 > 同组内 `updated_at` 升序**（停留最久排最前）。
- 今日已巡检的订单：整行置灰（`opacity: .5`）+ 右侧绿色小徽标 **`✓ HH:mm 已巡`**。
- 汇总行增加「**今日已巡检 X/Y**」。
- 行内时间列文案由「N 天未更新」改为「**N 天未推进**」（口径仍是 `orders.updated_at`）。
- 已巡检集合用 `Map<order_id, inspected_at>`（`.has()` / `.size` 与 Set 等价）；
  `renderTodoRow` 内做 `instanceof Map` 防御，误传非 Map 也不会白屏。

### 9.3 OCR 客户建档逻辑

- `CustomersAPI.create()`：按 `name / short_name / code` 精确去重（大小写不敏感）→ `deduped: true`。
- **查重范围扩大到已停用客户**（不再用只返回 `is_active=true` 的 `list()`）；命中停用档案时
  **自动复活**（`UPDATE is_active = true`）并返回 `revived: true`，解决「档案已存在但下拉框选不到」的死锁。
- 建单 Step1：OCR 未建档时显示「＋ 把「xxx」归档为新客户」，一键归档并自动选中；
  Toast 分三种（复活 / 已存在 / 新建）。
- 订单 `specs.customer_name_raw` 兜底保存 OCR 原文；订单列表与首页客户列回退显示
  `xxx（未建档）`，不再显示 `—`。

### 9.4 前端性能与报错修复

- 修复 `renderDueSoon` 中 `list.map(renderTodoRow)` 的隐式传参：`Array.map` 会把 `index` 作为第二参数
  传入，导致 `renderTodoRow` 的 `inspectedToday` 收到数字、调用 `.has()` 抛 `TypeError` 使首页白屏。
  改为 `list.map(o => renderTodoRow(o))`，并加注释说明该坑。
- 订单列表页：删除无效的 `CustomersAPI.list()` 请求（客户名来自 `list()` 的 `customer` join）；
  `OrdersAPI.getById` 改用 `maybeSingle()`，修复打开不存在订单时触发的 **406**（PGRST116）。
- 首屏：30 个 IIFE 脚本由链式串行加载改为 `Promise.all` 并行；删除启动时仅用于 `console.log` 的
  departments count 请求；订单详情页的异常 / 生产记录 / 批次三个请求改为并行。

## 10. 本轮关键变更（2026-11-18）：国内加载速度优化（P0 + P1）

### 10.1 P0 · 本地化第三方依赖（干掉 esm.sh）

- 新增 `js/vendor/supabase.min.js`：`@supabase/supabase-js` **2.119.0** 的 **ESM 单文件 bundle**
  （251.2 KB，0 个外部 import；仅删除了末尾 `sourceMappingURL` 一行）。版本/来源/SHA-256 见 `js/vendor/README.md`。
- `index.html` 的 import map 由 `https://esm.sh/@supabase/supabase-js@2` 改为 `./js/vendor/supabase.min.js`，
  启动脚本仍是 `import { createClient } from '@supabase/supabase-js'`。
- 收益：**首屏不再有任何第三方域请求**（原先 esm.sh 卡住会阻塞全部 30+ 个业务脚本）；版本锁定不再漂移。

### 10.2 P1 · PWA（Service Worker 静态缓存）

| 文件 | 作用 |
|---|---|
| `sw.js` | 同源静态资源 cache-first；**`supabase.co` 全部请求 network-only（业务数据绝不缓存）**；非 GET 直连 |
| `manifest.webmanifest` | PWA 清单（`start_url: ./#/`、`display: standalone`），手机可「添加到主屏幕」 |
| `icons/icon-192.png`、`icon-512.png` | PWA 图标 |
| `index.html` | head 引入 manifest/theme-color/apple-touch-icon；`load` 后注册 SW + `reg.update()` |
| `js/app.js` | `initServiceWorkerNotice()`：收到 `SW_UPDATED` 且非首装时 Toast「系统已更新，请刷新页面」 |
| `.github/workflows/deploy.yml` | 发布清单加入 `sw.js` / `manifest.webmanifest` / `icons`，并逐个校验 6 个关键资源 |

- 收益：**第二次及以后打开几乎不再请求 GitHub Pages**（静态资源全部本地命中）。
- ⚠️ **代价：每次发版必须 bump `sw.js` 的 `VERSION`，否则更新失效 —— 见 §8.2【致命警告】**。
- 已知边界：SW 只在 HTTPS 或 localhost 生效（`file://` 直接打开不生效）；首次访问仍需下载全部资源。
