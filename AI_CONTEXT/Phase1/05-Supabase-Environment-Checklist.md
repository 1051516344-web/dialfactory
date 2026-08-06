# DialFactory Phase 1-B-0 · Supabase Environment Checklist

> **状态：** Decisions Confirmed — 环境决策已确认
> **阶段：** Phase 1-B-0 — Environment Verification
> **前置：** Phase 1-A Schema Freeze (V1.0)
> **原则：** 禁止执行 SQL。仅检查环境就绪状态。
> **基于：** [01-Supabase-Schema-Plan.md](01-Supabase-Schema-Plan.md) §十·十一

---

## 〇、Factory Context（永久项目上下文）

以下信息作为所有技术决策的基准上下文。任何 AI 和开发者必须以工厂现场为第一优先级。

### 运行环境

| 属性 | 值 |
|------|-----|
| **Factory Location** | Guangzhou, China |
| **System Type** | Factory Digitalization / Production Tracking System |
| **Primary Users** | Factory internal users (跟单员, 部门负责人, QC) |
| **Primary Operation Location** | Guangzhou factory |
| **Business Core** | Order tracking · Production node management · Process tracking · Quality exception recording |

### 技术决策优先级

所有数据库 Region、网络方案、权限策略、数据访问设计、系统部署方案，必须优先考虑：

1. 工厂生产现场所在地
2. 高频系统使用人员所在地
3. 数据访问稳定性
4. 未来客户访问需求
5. 开发者所在地（最低优先级）

> **禁止以开发者个人所在地作为主要架构依据。**

---

## 一、Supabase Project

### 1.1 项目状态 — CONFIRMED

| 检查项 | 状态 | 值 / 说明 |
|--------|:----:|------|
| Supabase 账号 | ⬜ 待创建 | 需注册 [supabase.com](https://supabase.com) |
| Project 已创建 | ⬜ 待创建 | 新建 Project |
| Project Name | ✅ 已确定 | `dialfactory-v1` |
| Organization | ✅ 已确定 | 个人账户（V1 单用户） |
| Region | ✅ **已确定** | **`ap-southeast-1` (Singapore)** |
| PostgreSQL Version | ✅ 已确定 | Supabase 默认 15.x |
| Database Password | ⬜ | 创建时生成，记录在安全位置 |

### 1.2 Region 决策记录

**选定：** `ap-southeast-1` (Singapore)

| # | 理由 |
|:--|------|
| 1 | DialFactory 的主要运行地点为中国广州工厂 |
| 2 | 系统主要用户为广州工厂内部人员 |
| 3 | ap-southeast-1 对华南地区访问延迟和稳定性较优（~60-100ms） |
| 4 | 同时兼顾未来日本客户访问需求 |
| 5 | 避免中国大陆云服务备案、部署限制和复杂运维成本 |
| 6 | V1 阶段数据规模较小，Region 性能满足生产跟踪需求 |

### 1.2 Region 选择建议

| Region | 到中国大陆延迟 | 推荐度 |
|--------|:------------:|:------:|
| `ap-southeast-1` (Singapore) | ~60-100ms | ⭐⭐⭐ 推荐 |
| `ap-northeast-1` (Tokyo) | ~40-80ms | ⭐⭐⭐ 推荐 |
| `ap-southeast-2` (Sydney) | ~150-200ms | ⭐⭐ |
| `us-west-1` (California) | ~150-200ms | ⭐ |

> **注意：** Supabase Free Tier 仅限同一 Region 内创建 Project。选定后不可更改 Region。

### 1.3 Free Tier 限制确认

| 限制项 | Free Tier 上限 | V1 预估 | 余量 |
|--------|:------------:|:------:|:----:|
| 数据库容量 | 500 MB | < 10 MB (首年) | ✅ 充足 |
| 月活用户 (MAU) | 50,000 | 1-2 | ✅ 充足 |
| API 请求/月 | 2,000,000 | < 100,000 | ✅ 充足 |
| 数据库连接数 | 15 (Pooler: 15) | < 5 | ✅ 充足 |
| 项目暂停策略 | 1 周无活动暂停 | V1 每天使用 | ⚠️ 需注意 |

> **风险：** Free Tier 在 1 周无 API 请求后会暂停项目。Phase 1-B 建表后需持续使用。如需保持始终在线，升级至 Pro Tier ($25/月)。

---

## 二、Database Extension — CONFIRMED

### 2.1 pgcrypto

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| Extension 需要 | ✅ **pgcrypto** | V1 Schema 使用 `gen_random_uuid()` 作为统一 UUID PK 生成方式 |
| 启用命令 | ✅ | `CREATE EXTENSION IF NOT EXISTS pgcrypto;` |
| 验证命令 | ✅ | `SELECT gen_random_uuid();` — 应返回 UUID v4 格式 |

### 2.2 Extension DDL（Migration 文件首行）

```sql
-- 001_initial_schema.sql 第一句
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 验证
SELECT gen_random_uuid();  -- 预期: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## 三、SQL Migration Strategy — CONFIRMED

### 3.1 选定方案

```
方案 A — Supabase Migration 文件管理 ✅ CONFIRMED
```

### 3.2 规则

| # | 规则 |
|:--|------|
| 1 | 所有数据库结构变化必须通过 Migration 文件管理 |
| 2 | 每次 Schema Change 必须创建新 Migration 文件 |
| 3 | 每次 Change 必须更新 Change Log |
| 4 | 每次 Change 必须经过 Review |
| 5 | 如果影响 Freeze 基线，必须更新 Freeze Manifest |

### 3.3 禁止事项

| # | 禁止行为 |
|:--|---------|
| 1 | 直接线上修改数据库结构（Supabase Dashboard SQL Editor 手工操作） |
| 2 | SQL Editor 手工修改后不记录 Migration 文件 |
| 3 | 跳过 Migration 流程 |

### 3.4 目录结构

```
supabase/
└── migrations/
    ├── 001_initial_schema.sql    ← Phase 1-B-1 产出
    ├── 002_xxx.sql               ← 未来变更
    └── ...
```

---

## 四、Deployment Order

### 4.1 执行顺序（强制）

外键依赖决定了严格的执行顺序。不可并行，不可调换。

```
Phase 1: Tables (必须按此顺序)
─────────────────────────────────
Step 1   departments           (无依赖)
Step 2   customers             (无依赖)
Step 3   processes             (依赖 departments)
Step 4   process_routes        (无依赖)
Step 5   route_steps           (依赖 process_routes, processes)
Step 6   orders                (依赖 customers, process_routes)
Step 7   order_nodes           (依赖 orders, processes, departments)
Step 8   exception_events      (无 FK 依赖，逻辑关联 order_nodes)

Phase 2: Indexes
─────────────────────────────────
Step 9   idx_orders_status_created
Step 10  idx_orders_customer
Step 11  idx_orders_due_date
Step 12  idx_nodes_order_seq
Step 13  idx_nodes_dept_status
Step 14  idx_nodes_status
Step 15  idx_steps_route_seq
Step 16  idx_exceptions_node
Step 17  idx_exceptions_type_time

Phase 3: RLS
─────────────────────────────────
Step 18  ALTER TABLE ... ENABLE ROW LEVEL SECURITY  (8 条)
Step 19  CREATE POLICY "V1: full access" ...         (8 条)

Phase 4: Seed Data
─────────────────────────────────
Step 20  INSERT INTO departments (5 行预置数据)
```

### 4.2 循环依赖检查

```
departments ← processes ← route_steps ← (无循环)
customers ← orders ← order_nodes ← (无循环)
process_routes ← orders ← order_nodes ← (无循环)
process_routes ← route_steps ← (无循环)

✅ 无循环依赖。执行顺序可行。
```

### 4.3 事务策略

| 策略 | 说明 |
|------|------|
| 整体事务 | 8 张表 DDL 在单个事务中执行（Migration 文件默认行为）。任何一张失败 → 全部回滚 |
| 逐表提交 | 仅 SQL Editor 手动执行时可能。不推荐——可能留下半建状态 |

---

## 五、Pre-flight Risk Check

### 5.1 UUID 生成

| 检查项 | 风险 | 缓解 |
|--------|:----:|------|
| `gen_random_uuid()` 依赖 pgcrypto | 低 | DDL 首行执行 `CREATE EXTENSION IF NOT EXISTS` |
| Supabase 默认启用 pgcrypto | 低 | 但显式检查更安全 |
| UUID v4 碰撞概率 | 极低 | 2^122 空间，V1 数据量可忽略 |

**验证 SQL：**
```sql
-- 应在建表前执行
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SELECT gen_random_uuid();  -- 确认可以生成
```

### 5.2 RLS 策略

| 检查项 | 风险 | 缓解 |
|--------|:----:|------|
| RLS 默认拒访 | 中 | `ENABLE RLS` 后，无 Policy 时所有访问被拒 |
| Policy 执行顺序 | 低 | V1 仅 1 条 Policy per table，无顺序冲突 |
| `USING (true)` 安全性 | 低 | V1 受信内网用户，风险可接受 |
| anon key 权限范围 | 低 | 已通过 RLS 限定的 CRUD，Service Key 不暴露前端 |

**验证 SQL（建表 + RLS 后）：**
```sql
-- 确认 RLS 已启用
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('departments','customers','processes','process_routes',
                    'route_steps','orders','order_nodes','exception_events');
-- 预期：8 行，rowsecurity = true

-- 确认 Policy 已创建
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public';
-- 预期：8 行，policyname = 'V1: full access'
```

### 5.3 anon key 访问验证

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| anon key 已知 | ⬜ | Supabase Dashboard → Settings → API → `anon` `public` key |
| Service Key 已知 | ⬜ | Supabase Dashboard → Settings → API → `service_role` key |
| Service Key 不暴露前端 | ⬜ | 仅用于 Migration 执行和数据初始化脚本 |
| anon key 配置到前端 | — | Phase 1-D 应用层开发时配置 |

### 5.4 建表风险矩阵

| 风险 | 严重度 | 概率 | 缓解措施 |
|------|:------:|:----:|---------|
| pgcrypto 未启用 → UUID 生成失败 | 中 | 低 | DDL 首行显式启用 |
| FK 循环依赖 → 建表顺序错误 | 高 | **0** | §四已验证无循环 |
| ON DELETE CASCADE 残留 | 高 | **0** | §Final Review 已验证全部 RESTRICT/SET NULL/无 FK |
| RLS 未启用 → 表公开访问 | 低 | 低 | 验证步骤确认 |
| 忘记创建索引 → 查询性能差 | 低 | 低 | V1 数据量小，索引缺失不致命但需要补建 |
| 预置数据与 CHECK 冲突 | 低 | 低 | `departments.type` CHECK 与 INSERT 值一致 |

### 5.5 Schema Plan DDL 完整性交叉检查

| 检查项 | SP 行 | 预期 | 状态 |
|--------|:----:|------|:----:|
| 8 张表 CREATE TABLE | §十一 | 8 条 | ✅ |
| 9 条索引 CREATE INDEX | §十一 | 9 条 | ✅ |
| 8 条 RLS ENABLE | §十一 | 8 条 | ✅ |
| 8 条 RLS POLICY | §十一 | 8 条 | ✅ |
| 1 条 Seed INSERT | §十一 | 5 行 | ✅ |
| 0 条 CASCADE | 全文 | — | ✅ |
| 0 条 handing_off | 全文 | — | ✅ |
| 0 条 rework_strategy | 全文 | — | ✅ |

---

## 六、环境就绪判定

### 6.1 当前状态

| # | 检查项 | 状态 | 下一步 |
|:--|--------|:----:|------|
| 1 | Supabase 账号 | ⬜ 待创建 | 注册 [supabase.com](https://supabase.com) |
| 2 | Project 创建 | ⬜ 待创建 | 新建 `dialfactory-v1`，Region: `ap-southeast-1` |
| 3 | pgcrypto Extension | ✅ 已确认 | Migration 文件首行启用 |
| 4 | Migration 策略 | ✅ **方案 A** | Phase 1-B-1 生成 001_initial_schema.sql |
| 5 | 部署顺序确认 | ✅ | 无循环依赖，4 Phase / 20 Step |
| 6 | Pre-flight Risk | ✅ | 0 高风险，全部已缓解 |
| 7 | DDL 完整性 | ✅ | §十一包含全部内容 |

### 6.2 阻塞项

| 阻塞项 | 状态 | 解决方式 |
|--------|:----:|---------|
| Supabase Project 未创建 | ⬜ | 用户创建 Project 并回填信息 |
| ~~Region 未选定~~ | ✅ | `ap-southeast-1` (Singapore) |
| ~~Migration 策略未确认~~ | ✅ | 方案 A — Migration 文件管理 |

> **剩余 1 项由用户执行：创建 Supabase Project。其余决策全部确认。**

### 6.3 Phase 1-B-0 完成条件

- [ ] Supabase Project 已创建（用户操作）
- [x] Region 已选定：`ap-southeast-1`
- [x] PostgreSQL 版本已确认：15.x
- [x] pgcrypto Extension 策略已确认
- [x] Migration 策略已选定：方案 A
- [x] 部署顺序已确认
- [x] Pre-flight Risk 全部 Checked
- [x] Factory Context 已记录

---

## 七、下一步

### Phase 1-B-1: Migration 文件生成

**入口条件：** 本文档 §六.3 全部 Checked

**产出：**
- `supabase/migrations/YYYYMMDDHHMMSS_v1_initial_schema.sql`
- 或：SQL Editor 执行脚本

**禁止：**
- ❌ 在环境未就绪时执行 DDL
- ❌ 跳过 Migration 策略选定直接建表
- ❌ 修改 Schema Plan 的任何定义

---

> **Phase 1-B-0 定位：不是执行，是检查。确保环境、工具、策略全部就绪后再进入 Phase 1-B-1。**
