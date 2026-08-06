# DialFactory V1 — Page Baseline

## 1. Page Information

| 项目 | 内容 |
|------|------|
| **Page** | P5 Route List |
| **Route** | `#/routes` |
| **Status** | **BASELINED** |
| **Phase** | Phase 1-C-3 D-1 |
| **Version** | V1.0 |
| **Created** | 2026-08-06 |
| **Module** | `js/pages/route-list.js` |

---

## 2. Purpose

查看工厂当前使用的工艺路线模板。

**V1 能力：**
- 只读展示所有启用路线
- 展示每条路线的工序步骤（顺序、编号、名称、类型、是否必修）
- 不提供路线 CRUD（预置数据，管理员通过 Supabase Dashboard 维护）

**V1 限制：**
- 不创建/修改/删除路线
- 不修改路线步骤
- 不提供路线版本对比

---

## 3. Data Dependency

### Tables Used

| Table | Access | Purpose |
|-------|:------:|---------|
| `process_routes` | SELECT | 路线列表（`is_active = true`） |
| `route_steps` | SELECT | 路线步骤（JOIN processes） |
| `processes` | SELECT | 工序名称、类型、是否必修 |

### Read / Write

| 操作 | 状态 |
|------|:----:|
| SELECT | ✅ |
| INSERT | ❌ |
| UPDATE | ❌ |
| DELETE | ❌ |

**Read-only page. No data mutation.**

---

## 4. Data Flow

```
User clicks nav "路线" (or navigates to #/routes)
    │
    ▼
Router: hashchange → match '/routes'
    │
    ▼
RouteListPage.render()
    │
    ├── [Loading] Skeleton.cards(3)
    │
    ▼
ProcessesAPI.listRoutes()
    │
    ├── DB.call( supabase.from('process_routes')
    │     .select('*')
    │     .eq('is_active', true)
    │     .order('created_at', { ascending: false }) )
    │
    ├── DB.call( supabase.from('route_steps')
    │     .select('id, seq, route_id,
    │              process:processes!inner(code, name, type, is_required)')
    │     .in('route_id', routeIds)
    │     .order('seq', { ascending: true }) )
    │
    ▼
Assemble: routes[] with nested steps[] (grouped by route_id)
    │
    ├── [Error]  → Error card + retry button
    ├── [Empty]  → Empty state ("暂无工艺路线")
    └── [Success] → Route cards with step rows
```

---

## 5. API Layer

### Module: `js/data/processes.js`

| Method | Query | Returns |
|--------|-------|---------|
| `listRoutes()` | `process_routes` + `route_steps` with `processes` JOIN | `{ ok, data: Route[] }` |
| `getRouteWithSteps(id)` | Single route + steps + departments JOIN | `{ ok, data: Route }` |
| `listProcesses()` | `processes` WHERE `is_active = true` | `{ ok, data: Process[] }` |

### Route Data Structure

```javascript
{
  id: UUID,
  name: "标准太阳纹+银白路线",
  is_active: true,
  created_at: "2026-08-06T...",
  steps: [
    {
      id: UUID,
      seq: 1,
      code: "P01",
      name: "冲压成型",
      type: "加工",
      is_required: false
    },
    // ...
  ]
}
```

---

## 6. Components

### Page Component

| File | Export | Role |
|------|--------|------|
| `js/pages/route-list.js` | `RouteListPage.render()` | Page orchestrator |

### Internal Render Functions

| Function | Output |
|----------|--------|
| `renderRouteCard(route)` | Card with route name + step count badge |
| `renderStepRow(step)` | Row with seq, code, name, type, required badge |
| `escapeHTML(str)` | XSS-safe text rendering |

### Shared Components Used

| Component | Usage |
|-----------|-------|
| `Skeleton.cards(3)` | Loading state |
| `.badge` | Step count, required marker |
| `.empty-state` | No routes message |
| `.card` | Route container |

---

## 7. User Interactions

| 用户行为 | 系统响应 |
|---------|---------|
| 点击导航 "路线" | 导航到 `#/routes`，加载路线列表 |
| 页面加载中 | 显示 3 个骨架卡片 |
| 数据加载成功 | 显示路线卡片，每条路线显示步骤列表 |
| 数据加载失败 | 显示错误提示 + 重试按钮 |
| 无路线数据 | 显示空状态提示 |
| 点击其他导航 | 离开页面，状态不保留 |

---

## 8. States

### Loading

```
┌──────────────────────────────┐
│ 工艺路线                      │
├──────────────────────────────┤
│ ████████████████░░░  (shimmer)
│ ██████████░░░░░░░░░
│ ██████████████░░░░░
└──────────────────────────────┘
```

- Display: `Skeleton.cards(3)`
- Duration: ~200-500ms (depending on network)

### Success

```
┌──────────────────────────────┐
│ 工艺路线           3 条路线   │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ 标准太阳纹+银白路线  6道 │ │
│ │ 1 P01 冲压成型   加工    │ │
│ │ 2 P03 太阳纹加工 加工    │ │
│ │ ...                      │ │
│ └──────────────────────────┘ │
│ ┌─ CD纹+金色路线 ──── 5道 ─┐ │
│ │ ...                      │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- Each route card shows: name, step count badge, ordered step rows
- Required steps show "必修" badge
- Routes sorted by `created_at DESC`

### Empty

```
┌──────────────────────────────┐
│ 工艺路线                      │
├──────────────────────────────┤
│           🗺️                 │
│       暂无工艺路线             │
│  路线模板尚未创建。           │
│  请联系管理员添加。           │
└──────────────────────────────┘
```

- Trigger: `process_routes` table has 0 active rows

### Error

```
┌──────────────────────────────┐
│ 工艺路线                      │
├──────────────────────────────┤
│           ⚠️                 │
│   加载失败：[error message]    │
│        [重试]                │
└──────────────────────────────┘
```

- Trigger: Supabase query fails (network / permission / server error)
- Retry button calls `RouteListPage.render()` again

---

## 9. Validation Checklist

| # | Check | Result |
|:--|-------|:------:|
| 1 | 页面通过 `/routes` 路由正常访问 | ✅ |
| 2 | 数据通过 `ProcessesAPI.listRoutes()` 正常读取 | ✅ |
| 3 | Loading 状态存在（Skeleton） | ✅ |
| 4 | Error 处理存在（错误提示 + 重试） | ✅ |
| 5 | Empty 处理存在（空状态提示） | ✅ |
| 6 | 无直接 Supabase 调用（全部通过 ProcessesAPI → DB.call） | ✅ |
| 7 | 所有用户文本经过 escapeHTML() 处理 | ✅ |
| 8 | 路线按 `created_at DESC` 排序 | ✅ |
| 9 | 步骤按 `seq ASC` 排序 | ✅ |
| 10 | `is_required` 步骤显示 "必修" 标记 | ✅ |

---

## 10. Freeze Compliance

### Schema

| Check | Status |
|-------|:------:|
| 是否修改数据库表结构 | **NO** |
| 是否新增字段 | **NO** |
| 是否修改 FK 策略 | **NO** |
| 查询表：`process_routes`, `route_steps`, `processes` | 仅 SELECT |

### ADL

| ID | Check | Status |
|----|-------|:------:|
| ADL-001 | 路线模板展示（只读，不修改模板） | ✅ PASS |
| ADL-002 | 不涉及返工逻辑 | ✅ N/A |
| ADL-003 | 不涉及节点状态 | ✅ N/A |

### ADP

| ID | Check | Status |
|----|-------|:------:|
| ADP-001~005 | 不涉及规格/多层/挪用/物料/QC | ✅ N/A |

### New Entity

| Check | Status |
|-------|:------:|
| 是否新增表 | **NO** |
| 是否新增字段 | **NO** |

### Final

```
Freeze Status: PASS
```

---

## 11. Known Limitations

| # | Limitation | Reason | Target |
|:--|-----------|--------|:------:|
| 1 | 不支持创建/修改/删除路线 | V1 预置数据，管理员通过 Supabase Dashboard 维护 | V1.5 |
| 2 | 不支持路线版本对比 | V1 路线数量少（3-5条），无需版本管理 | V2 |
| 3 | 不支持步骤拖拽排序 | V1 只读 | V2 |
| 4 | 不支持实时更新（需手动刷新） | V1 无 Supabase Realtime | V1.5 |
| 5 | 不显示路线创建/修改时间 | 当前数据模型不追踪路线变更 | V1.5 |

---

## 12. Future Extension

| Capability | Phase | Notes |
|-----------|:-----:|-------|
| Realtime subscription | V1.5 | `supabase.channel()` 监听 `process_routes` 变更 |
| Route CRUD UI | V1.5 | 管理员界面，需 Change Proposal |
| Route version history | V2 | 新增 `route_versions` 表（需 Change Proposal） |
| Step drag-to-reorder | V2 | 需 `route_steps.seq` 批量更新 API |
| Visual route comparison | V2 | 并排展示两条路线差异 |

---

> **Baseline established. Any future modification to P5 must reference this document.**
