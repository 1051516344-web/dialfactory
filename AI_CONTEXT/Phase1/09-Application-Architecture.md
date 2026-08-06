# DialFactory Phase 1-C-0 · Application Architecture

> **状态：** Design
> **阶段：** Phase 1-C-0 — Application Architecture Design
> **前置：** Phase 1-B Database Deployed & Verified
> **基准：** [DialFactory-V1-Freeze.md](../../docs/FREEZE/DialFactory-V1-Freeze.md) · [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) · [08-Database-Baseline-Report.md](08-Database-Baseline-Report.md)
> **原则：** 仅定义架构。不修改数据库。不写代码。

---

## §1 System Architecture

### 1.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    DialFactory V1                        │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Frontend │───▶│  Supabase JS │───▶│  Supabase    │  │
│  │ (Browser)│◀───│  Client      │◀───│  PostgreSQL  │  │
│  └──────────┘    └──────────────┘    └──────────────┘  │
│       │                                       │         │
│       │  State Management            RLS Policy         │
│       │  (in-memory)                 (USING true)       │
│       ▼                                       ▼         │
│  ┌──────────┐                         ┌──────────────┐  │
│  │  Domain  │                         │  Database    │  │
│  │  Logic   │                         │  8 Tables    │  │
│  └──────────┘                         └──────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  AI Layer (V1.5+) · Read-only · Advisory        │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Frontend** | HTML + CSS + Vanilla JS | V1 Scope: 不引入框架。单文件或少量文件。跟单员平板浏览器运行 |
| **Backend** | Supabase (BaaS) | 零自建服务器。PostgREST 自动生成 REST API |
| **Database** | PostgreSQL 17 (Supabase) | 8 Tables, UUID PK, RLS, JSONB |
| **API Client** | `@supabase/supabase-js` | 官方 JS SDK，前端直连 Supabase |
| **Auth** | Supabase Anon Key | V1: 1-2 跟单员共用。内网受信模式 |
| **Deploy** | GitHub Pages | 免费 HTTPS 托管，静态站点 |

### 1.3 Architecture Decision

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **No Backend Server** | Supabase BaaS | V1 不需要中间层。PostgREST 直接暴露 REST API |
| **No Frontend Framework** | Vanilla JS | V1 功能聚焦，不引入框架复杂度 |
| **No Offline Mode** | Online Only | 工厂 WiFi 覆盖。离线延后至 V1.5 |
| **No Build Tool** | Direct HTML/JS/CSS | 零构建步骤。GitHub Pages 直接部署 |
| **RLS as Security Boundary** | Supabase RLS | 数据库层安全。前端 anon key 可暴露 |

---

## §2 User Roles

### 2.1 V1 User (Current)

| Role | Users | Permissions | Auth Method |
|------|:-----:|------------|-------------|
| **跟单员** | 1-2 | 全部 CRUD | Supabase Anon Key + 内网受信 |

**V1 说明：** 工厂固定人员，1-2 个跟单员共用同一账号。不启用 Supabase Auth 用户管理。安全边界在网络层（内网 + 受信设备）。

### 2.2 Future Roles (V2)

| Role | Users | Permissions | Auth |
|------|:-----:|------------|------|
| **admin** | 系统管理员 | 全部 CRUD + 工艺管理 + 用户管理 | Supabase Auth |
| **worker** | 跟单员、部门负责人 | 本部门节点更新 + 异常记录 + 移交确认 | Supabase Auth |
| **viewer** | 管理层 | 全部只读（含统计） | Supabase Auth |

**V2 迁移路径：** RLS Policy 从 `USING (true)` 替换为角色条件。表结构不变。

---

## §3 Application Modules

### 3.1 Module Map

```
DialFactory V1
│
├── M1 · 订单管理 (Order Management)
│   ├── 订单列表 (Order List)
│   ├── 订单创建 (Order Create)
│   └── 订单搜索 (Order Search)
│
├── M2 · 订单详情 (Order Detail)
│   ├── 基本信息展示
│   ├── 路线快照展示
│   └── 规格信息展示
│
├── M3 · 工序追踪 (Process Tracking) ⭐ Core
│   ├── 流程图渲染 (Process Flow)
│   ├── 节点推进 (Node Advance)
│   ├── 节点暂停/恢复 (Node Pause/Resume)
│   ├── 快捷返工 (Quick Rework)
│   └── 动态追加节点 (Dynamic Node Insert)
│
├── M4 · 异常管理 (Exception Management)
│   ├── 异常记录 (Exception Record)
│   ├── 异常列表 (Exception List)
│   └── 节点关联展示
│
├── M5 · 路线管理 (Route Management)
│   ├── 路线模板列表
│   └── 路线步骤展示
│
└── M6 · 仪表盘 (Dashboard)
    ├── 卡顿预警 (Stalled Orders)
    ├── 交期预警 (Due Date Warning)
    └── 部门待办 (Department Queue)
```

### 3.2 Module Details

#### M1 · 订单管理

| 功能 | 数据表 | 说明 |
|------|--------|------|
| 订单列表 | `orders` + `customers` | 按状态/部门/客户筛选。卡顿订单自动置顶 |
| 订单创建 | `orders` + `order_nodes` | 选路线模板 → 确认/调整工序 → 生成节点 |
| 订单搜索 | `orders` | 按 `order_no` 搜索 |

**订单创建流程（ADL-001）：**
```
1. 选择客户 (customers)
2. 选择路线模板 (process_routes)
3. 系统展示路线包含的全部建议工序
4. 跟单员确认/调整:
   - is_required=true → 不可取消
   - is_required=false → 可取消
5. 快照到 orders.route_snapshot JSONB
6. 仅 confirmed=true 的工序展开为 order_nodes
7. 第一个节点 status=active，其余 waiting
```

#### M2 · 订单详情

| 功能 | 数据表 | 说明 |
|------|--------|------|
| 基本信息 | `orders` | 订单号、客户、数量、交期、规格 |
| 路线快照 | `orders.route_snapshot` | JSONB 展示原始路线 vs 实际节点对比 |
| 节点列表 | `order_nodes` | 按 seq 排序的全部节点 |

#### M3 · 工序追踪（核心模块）

| 功能 | 数据表 | 说明 |
|------|--------|------|
| 流程图渲染 | `order_nodes` | 纵向卡片，按 seq 排列。颜色映射状态 |
| 节点推进 | `order_nodes` | active → done。自动激活下游 waiting → active |
| 节点暂停 | `order_nodes` | active → paused。记录 `pause_reason` |
| 节点恢复 | `order_nodes` | paused → active |
| 快捷返工 | `order_nodes` | 同工序 rework_pass+1，插入原节点之后 |
| 动态追加 | `order_nodes` | 任选工序 + 插入位置。seq 自动重算 |

**流程图颜色映射：**
| status | 颜色 | 说明 |
|--------|------|------|
| `waiting` | #9CA3AF (灰) | 等待上游完成 |
| `active` | #3B82F6 (蓝) | 正在执行 |
| `done` | #10B981 (绿) | 已完成 |
| `paused` | #F59E0B (黄) | 暂停 |

**返工标记：**
| rework_pass | 背景色 | 说明 |
|:----------:|--------|------|
| 0 | 无 | 正常执行 |
| 1 | 浅橙 | 第 1 次返工 |
| 2 | 中橙 | 第 2 次返工 |
| ≥3 | 深橙 | 多次返工 |

#### M4 · 异常管理

| 功能 | 数据表 | 说明 |
|------|--------|------|
| 异常记录 | `exception_events` | 类型 + 数量 + 处理方式 |
| 异常列表 | `exception_events` + `order_nodes` | 按节点查看关联异常 |
| 节点关联 | `exception_events.node_id` | 无 FK 约束。节点删除后保留 |

**异常类型预设：** 色差 / 电镀不良 / 划伤 / 沙眼 / 变形 / 其他

**处理方式预设：** 返回电镀 / 返回磨板 / 重做 / 特采 / 报废

#### M5 · 路线管理

| 功能 | 数据表 | 说明 |
|------|--------|------|
| 路线模板列表 | `process_routes` | V1 预置 3-5 条，无 CRUD |
| 路线步骤展示 | `route_steps` + `processes` | 按 seq 排序的工序列表 |

#### M6 · 仪表盘

| 功能 | 数据表 | 说明 |
|------|--------|------|
| 卡顿预警 | `order_nodes` | 任一节点 active 超过 N 天自动标红 |
| 交期预警 | `orders` | `due_date < today()` 标红 |
| 部门待办 | `order_nodes` | 按 `dept_id` + `status=active` 统计 |

**V1 卡顿阈值：** 3 天（可配置）

---

## §4 Data Flow

### 4.1 Order Creation Flow

```
User Input
    │
    ├── customer_id    → orders.customer_id
    ├── order_no       → orders.order_no
    ├── order_qty      → orders.order_qty
    ├── due_date       → orders.due_date
    ├── specs          → orders.specs (JSONB)
    └── route_id       → orders.route_id
            │
            ▼
    Load route_steps (by route_id, order by seq)
            │
            ▼
    User confirms/cancels each step
            │
            ▼
    Write route_snapshot JSONB
    {
      route_id, route_name, snapshot_at,
      steps: [{seq, process_code, process_name, dept_name, is_required, confirmed}]
    }
            │
            ▼
    For each confirmed=true step:
      INSERT INTO order_nodes (
        order_id, process_id, process_name, process_code,
        dept_id, dept_name, seq,
        status = (first ? 'active' : 'waiting'),
        rework_pass = 0
      )
            │
            ▼
    orders.status = 'in_production' (derived)
```

### 4.2 Node Advancement Flow

```
User clicks "完成" on active node
    │
    ▼
Validate: current status = 'active' → target = 'done'
    │
    ▼
UPDATE order_nodes SET status = 'done', updated_at = now()
    │
    ▼
Find next waiting node (same order_id, seq = current.seq + 1)
    │
    ├── exists → UPDATE SET status = 'active'
    └── not exists → (last node, order may complete)
            │
            ▼
Recompute orders.status:
  - All nodes done → 'completed'
  - All non-done nodes paused → 'paused'
  - Otherwise → 'in_production'
```

### 4.3 Exception Recording Flow

```
User clicks "记录异常" on a node
    │
    ▼
INSERT INTO exception_events (
  node_id = current node UUID,
  type = selected from preset,
  qty = user input,
  resolution = selected from preset
)
    │
    ▼
(Optional) If user also pauses node:
  UPDATE order_nodes SET status = 'paused', pause_reason = (type)
```

### 4.4 Rework Flow

**方式 A — 快捷返工 (repeat_node)：**
```
User clicks "返工" on a done node
    │
    ▼
INSERT INTO order_nodes (
  order_id, process_id, process_name, process_code,
  dept_id, dept_name,
  seq = (inserted after current node),
  rework_pass = current.rework_pass + 1,
  status = 'active'
)
    │
    ▼
Recompute seq for all nodes after insertion point: seq += 1
```

**方式 B — 动态追加 (任意工序)：**
```
User clicks "追加工序" → selects process + insert position
    │
    ▼
INSERT INTO order_nodes (
  order_id, process_id, process_name, process_code,
  dept_id, dept_name,
  seq = N,
  rework_pass = 0,    ← 该工序首次执行
  status = 'active',
  note = reason
)
    │
    ▼
Recompute seq for all nodes with seq >= N: seq += 1
```

### 4.5 State Recalculation Trigger

| Trigger | Recalculation |
|---------|--------------|
| Node status changes | `orders.status` derived from all nodes |
| Node inserted (rework/append) | `seq` for affected nodes |
| Node deleted (undo) | `seq` for affected nodes + `orders.status` |

---

## §5 Supabase Integration

### 5.1 Client Configuration

```javascript
// Supabase JS Client — V1 唯一后端接口
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wzfkmwrqnvjegunjueka.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  // anon key
)
```

### 5.2 API Boundary

| Operation | Method | Endpoint | RLS |
|-----------|--------|----------|-----|
| List orders | `supabase.from('orders').select()` | `/rest/v1/orders` | `USING (true)` |
| Create order | `supabase.from('orders').insert()` | `/rest/v1/orders` | `USING (true)` |
| Update node | `supabase.from('order_nodes').update()` | `/rest/v1/order_nodes` | `USING (true)` |
| Insert exception | `supabase.from('exception_events').insert()` | `/rest/v1/exception_events` | `USING (true)` |
| Read processes | `supabase.from('processes').select()` | `/rest/v1/processes` | `USING (true)` |

**V1 API 策略：** 前端通过 Supabase JS SDK 直连 PostgREST。不设中间 API 层。

### 5.3 RLS Interaction

| Condition | RLS Behavior |
|-----------|-------------|
| Authenticated (anon key) | Full CRUD on all tables |
| Unauthenticated (no key) | `401 Unauthorized` |
| V2 Migration | Replace `USING (true)` with role-based conditions |

### 5.4 Environment Variables

| Variable | Value | Exposure |
|----------|-------|----------|
| `SUPABASE_URL` | `https://wzfkmwrqnvjegunjueka.supabase.co` | Public |
| `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` | Public (by design) |
| `SUPABASE_SERVICE_KEY` | (not used in frontend) | **Never exposed** |

### 5.5 Database Access Pattern

| Pattern | Implementation |
|---------|---------------|
| **Read** | `supabase.from(table).select('*').eq('field', value)` |
| **Write** | `supabase.from(table).insert([...]).select()` |
| **Update** | `supabase.from(table).update({...}).eq('id', uuid)` |
| **Filter** | `.eq()`, `.in()`, `.gte()`, `.order()` |
| **Pagination** | `.range(start, end)` |
| **Count** | `.select('*', { count: 'exact', head: true })` |

---

## §6 State Management

### 6.1 State Sources

| State Type | Source | Update Mechanism |
|-----------|--------|-----------------|
| **Order Status** | Derived from `order_nodes` | Recalculated on every node change |
| **Node Status** | `order_nodes.status` | User action → API update |
| **UI State** | In-memory (browser) | Component-level state |
| **Cache** | Supabase real-time subscription | Optional: subscribe to changes |

### 6.2 Order State Machine

```
                    ┌──────────────┐
                    │ in_production│◄──────────────────┐
                    └──────┬───────┘                   │
                           │                            │
              ┌────────────┼────────────┐               │
              ▼            ▼            ▼               │
         所有节点      任一节点      任一节点             │
         均为done     变为paused     恢复active          │
              │            │            │               │
              ▼            ▼            │               │
         ┌─────────┐ ┌─────────┐       │               │
         │completed│ │ paused  │───────┘               │
         └─────────┘ └─────────┘                       │
```

| Status | Rule |
|--------|------|
| `in_production` | 存在非 done 节点，且非全部 paused |
| `paused` | 所有非 done 节点 status = 'paused' |
| `completed` | 所有节点 status = 'done' |

### 6.3 Node State Machine (ADL-003 四态)

```
         ┌──────────┐
    ┌───►│  active  │◄───┐
    │    └────┬─────┘    │
    │         │          │
    │    ┌────┼────┐     │
    │    ▼    ▼    ▼     │
    │ ┌────┐┌──────┐     │
    │ │done││paused│     │
    │ └────┘└──┬───┘     │
    │     ▲    │         │
    │     │    │ resume  │
    │     │    └─────────┘
    │     │
    │  ┌──────┐
    └──│waiting│  ← 上游节点 done 后自动激活
       └──────┘
```

| From | To | Trigger |
|------|-----|--------|
| `waiting` | `active` | 上游节点 done（自动） |
| `active` | `done` | 跟单员点"完成" |
| `active` | `paused` | 跟单员点"暂停" + 选原因 |
| `paused` | `active` | 跟单员点"恢复" |
| `active` | `active` (new node) | 返工：创建 rework_pass+1 新节点 |

### 6.4 State Validation Rules (Domain Layer)

| Rule | Enforcement |
|------|------------|
| `waiting → done` | ❌ Illegal — 必须经过 active |
| `paused → done` | ❌ Illegal — 必须先恢复 |
| `done → any` | ❌ Illegal — 终态不可逆（只能创建返工新节点） |
| 检验节点 done 时 `qty_out` 为空 | ❌ Warning — 前端提示不阻塞 |

### 6.5 Derived State

| Derived Value | Calculation |
|---------------|------------|
| `orders.status` | Aggregated from `order_nodes.status` |
| "卡了多久" | `now() - order_nodes.updated_at` (where status = 'active') |
| "超期" | `now() > orders.due_date` |
| "返工次数" | `order_nodes.rework_pass` |

---

## §7 AI Integration Boundary

### 7.1 V1 Position

**V1: AI 不参与任何生产决策。** 所有 AI 能力延后至 V1.5+。

### 7.2 Future AI Capabilities (V1.5+)

| Capability | Input | Output | Constraint |
|-----------|-------|--------|-----------|
| **生产延迟预测** | `order_nodes` 历史 + 当前状态 | 预计完成日期 | 建议性，不自动调整交期 |
| **订单摘要** | `orders` + `order_nodes` | 自然语言订单状态摘要 | 只读 |
| **异常分析** | `exception_events` 历史 | 高频异常类型 + 趋势 | 只读 |
| **跟单助手** | 当前订单 + 历史数据 | 操作建议（如"该订单卡了5天"） | 只读 |

### 7.3 AI Constraints (Non-negotiable)

```
╔═══════════════════════════════════════════════╗
║                                               ║
║   AI MUST NOT:                                ║
║                                               ║
║   ❌ Directly modify production data           ║
║   ❌ Change order_nodes status                 ║
║   ❌ Create/delete order_nodes                 ║
║   ❌ Modify route_snapshot                     ║
║   ❌ Auto-assign due dates                     ║
║   ❌ Auto-route orders                         ║
║   ❌ Make decisions without human review       ║
║                                               ║
║   AI MAY:                                     ║
║                                               ║
║   ✅ Read all data for analysis                ║
║   ✅ Generate suggestions (display only)       ║
║   ✅ Flag anomalies (highlight in UI)          ║
║   ✅ Generate natural language summaries       ║
║                                               ║
╚═══════════════════════════════════════════════╝
```

### 7.4 AI Data Interface (Future)

```
AI Read Layer
    │
    ├── orders (all fields)
    ├── order_nodes (all fields)
    ├── exception_events (all fields)
    ├── processes (static reference)
    └── route_snapshot (JSONB)

AI Output Layer
    │
    ├── Suggestion Card (UI display only)
    ├── Anomaly Flag (highlight, not auto-action)
    └── Summary Text (natural language)
```

---

## §8 Development Rules

### 8.1 Database Mutation Rule

| Rule | Description |
|------|------------|
| **Migration First** | 任何 DDL 变更必须先创建 Migration 文件。禁止直接在线修改数据库结构 |
| **No Direct Mutation** | 前端不可绕过 Domain Layer 直接写数据库（Domain Layer 负责状态校验） |
| **RLS as Last Line** | RLS 是数据库层安全底线。应用层校验 + RLS 双重保障 |

### 8.2 Freeze Compliance

| Rule | Description |
|------|------------|
| **Read Freeze First** | 任何 AI 进入项目必须先读取 `docs/FREEZE/DialFactory-V1-Freeze.md` |
| **Change Proposal Required** | 任何对冻结内容的修改必须提交 Change Proposal |
| **Schema is Immutable** | 8 Tables · 44 Business Fields · FK Policy · ADL — 不可修改 |

### 8.3 Code Architecture Rules

| Rule | Description |
|------|------------|
| **Domain / Data / UI Separation** | 数据流单向: UI → Domain (validate) → Data (API) → Render |
| **No Cross-Component Communication** | 组件通过 state 间接耦合，不直接调用 |
| **Render on Data Change** | 渲染前比较新旧 state，避免重复渲染 |
| **Component Interface** | 每个组件暴露: `render(data)`, `update(data)`, `destroy()` |

### 8.4 Development Workflow

```
Feature Request
    │
    ▼
Check Freeze Baseline
    │
    ├── Within freeze → Proceed
    └── Conflicts → Change Proposal → Human Approval
    │
    ▼
Write Migration (if DDL change needed)
    │
    ▼
Implement Domain Logic
    │
    ▼
Implement UI
    │
    ▼
Test against Supabase Database
    │
    ▼
Deploy to GitHub Pages
```

### 8.5 Prohibited Actions

| # | Action | Reason |
|:--|--------|--------|
| 1 | Direct SQL on production database | Bypasses migration history |
| 2 | Modify ADL-001/002/003 | Architecture baseline frozen |
| 3 | Add table without Change Proposal | Freeze violation |
| 4 | Change FK ON DELETE behavior | Schema baseline frozen |
| 5 | Skip RLS policy | Security baseline |
| 6 | Hardcode Supabase Service Key in frontend | Security violation |

---

## §9 Frontend Module Structure (Preview)

### 9.1 File Organization

```
dialfactory/
├── index.html                    ← PWA entry point
├── css/
│   └── main.css                  ← Global styles + flowchart colors
├── js/
│   ├── app.js                    ← Init, global state
│   ├── config.js                 ← Supabase URL + Anon Key
│   │
│   ├── data/
│   │   └── api.js                ← Supabase read/write functions
│   │
│   ├── domain/
│   │   ├── order-state.js        ← orders.status derivation
│   │   ├── node-state.js         ← node status transition validation
│   │   └── validation.js         ← Business rule validation
│   │
│   ├── components/
│   │   ├── order-list.js         ← M1: 订单列表
│   │   ├── order-create.js       ← M1: 订单创建
│   │   ├── order-detail.js       ← M2: 订单详情
│   │   ├── process-flow.js       ← M3: 流程图渲染（核心组件）
│   │   ├── node-actions.js       ← M3: 节点操作（推进/暂停/返工/追加）
│   │   ├── exception-form.js     ← M4: 异常记录表单
│   │   ├── exception-list.js     ← M4: 异常列表
│   │   ├── route-selector.js     ← M5: 路线模板选择器
│   │   ├── dashboard.js          ← M6: 仪表盘
│   │   └── router.js             ← Page routing
│   │
│   └── utils/
│       ├── format.js             ← Date, duration formatting
│       └── constants.js          ← Enums, color maps, thresholds
```

### 9.2 Component Dependency Map

```
app.js
  ├── config.js
  ├── data/api.js
  │     └── Supabase JS SDK
  ├── domain/ (all)
  └── components/
        ├── router.js
        ├── order-list.js → order-detail.js
        ├── order-create.js → route-selector.js → process-flow.js (preview)
        ├── order-detail.js → process-flow.js → node-actions.js
        │                            └── exception-form.js
        │                            └── exception-list.js
        └── dashboard.js → order-list.js
```

---

## §10 Architecture Constraints Summary

| Constraint | Source | Binding |
|-----------|--------|:------:|
| 8 Tables only | Freeze V1.0 | ✅ |
| UUID PK + gen_random_uuid() | Schema Plan | ✅ |
| 0 CASCADE on FK | Review CRIT-001 | ✅ |
| TEXT + CHECK for enums | Schema Plan §六 | ✅ |
| RLS `USING (true)` for V1 | Schema Plan §八 | ✅ |
| No offline mode | V1 Scope §三.1 | ✅ |
| No backend server | V1 Scope §四 | ✅ |
| No frontend framework | V1 Scope §四 | ✅ |
| AI read-only until V1.5+ | §7.3 above | ✅ |

---

> **Phase 1-C-0 Complete. Architecture defined. No code written. Ready for Phase 1-C-1 implementation planning.**
