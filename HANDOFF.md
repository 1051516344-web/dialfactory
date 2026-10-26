# DialFactory V1 工作交接总结

> 更新日期：2026-08-12

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

## 7. 如何在台式电脑继续

1. **克隆仓库**：
   ```bash
   git clone https://github.com/1051516344-web/dialfactory.git
   ```
2. **确认 Supabase 凭证** — 看 `js/config.js`（已经提交到仓库里，克隆后即有）
3. **执行未跑的迁移** — 见上一步
4. **本地预览** — 用任意静态服务器（如 VS Code Live Server）打开，或直接访问线上网址
5. 改完代码 `git commit` + `git push`，GitHub Actions 自动部署到 Pages

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

