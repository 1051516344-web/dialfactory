# DialFactory Phase 1-C-3 · Frontend Development Setup

> **状态：** D-0 Infrastructure Complete
> **阶段：** Phase 1-C-3 — Frontend Development Setup
> **前置：** [11-Frontend-Implementation-Plan.md](11-Frontend-Implementation-Plan.md)
> **日期：** 2026-08-06

---

## 1. 项目目录结构 (Created)

```
dialfactory/
├── index.html                    ✅ SPA entry
│
├── css/
│   ├── reset.css                 ✅ CSS reset
│   ├── variables.css             ✅ Custom properties (colors, spacing, fonts)
│   ├── layout.css                ✅ Grid, page shell, nav, card, form, button base
│   ├── components.css            ✅ Badge, progress bar, dialog, empty state, skeleton, toast
│   ├── flow.css                  ✅ Process flow: node cards, arrows, rework, exception cards
│   └── pages.css                 ✅ Nav bar, dashboard, order cards, route steps, responsive
│
├── js/
│   ├── config.js                 ✅ CONFIG object: Supabase URL/Key, constants, presets
│   ├── app.js                    ✅ App.init(): DB connect, nav mount, router start
│   │
│   ├── data/
│   │   └── client.js             ✅ DB singleton: init(), get(), call() wrapper
│   │
│   ├── components/
│   │   ├── nav-bar.js            ✅ Nav bar: 5 links, active state, mount/refresh
│   │   └── skeleton.js           ✅ Loading skeleton: card(), cards(n), page()
│   │
│   └── utils/
│       ├── router.js             ✅ Hash-based SPA: on(), navigate(), start()
│       ├── dom.js                ✅ DOM helpers: create(), $(), $$(), render(), show(), hide()
│       └── format.js             ✅ Formatters: date(), dueDays(), stalledSince(), number(), percent()
│
├── js/pages/                     ⬜ D-1~D-5: Page modules
├── js/domain/                    ⬜ D-2~D-3: Business logic
│
└── supabase/migrations/          ✅ (Phase 1-B output, unchanged)
```

### 1.1 File Count

| Category | Created | Remaining |
|----------|:-------:|:---------:|
| HTML | 1 | — |
| CSS | 6 | — |
| JS · Infrastructure | 5 | — |
| JS · Data Layer | 1 | 4 (orders, processes, exceptions, customers) |
| JS · Domain | 0 | 4 (order-state, node-state, seq-calc, validation) |
| JS · Components | 2 | 5 (status-badge, progress-bar, confirm-dialog, empty-state, toast) |
| JS · Pages | 0 | 6 (D-1~D-5) |
| **Total** | **15** | **19** |

---

## 2. 技术方案确认

### 2.1 Module Pattern

全部 JS 文件使用 **IIFE (Immediately Invoked Function Expression)** 模式：

```javascript
const ModuleName = (() => {
  // private state

  function publicMethod() { ... }

  return { publicMethod };
})();
```

**选择理由：**
- 无打包工具。IIFE 在浏览器中直接可用
- 全局命名空间隔离（每个模块一个 `const` 变量）
- 加载顺序由 `<script>` 标签顺序控制

### 2.2 Supabase SDK 加载方案

```
index.html
  │
  ├── <link> CSS × 6             ← 同步加载
  ├── <script> config.js         ← CONFIG 对象
  ├── <script> utils/*.js        ← DOM, Format, Router
  ├── <script> components/*.js   ← Skeleton, NavBar
  │
  └── <script type="module">     ← 动态 import Supabase SDK
        │
        ├── import { createClient } from CDN
        ├── window.supabase = { createClient }
        │
        ├── load js/data/client.js
        └── load js/app.js → App.init()
```

**关键设计：**
- Supabase SDK 通过 ES Module 动态 `import()` 加载
- 加载完成后设置 `window.supabase` 全局变量
- 然后按序加载 `client.js` → `app.js`
- 避免 CDN 加载竞态条件

### 2.3 CSS Strategy

- **variables.css:** 所有颜色、间距、字号定义在 `:root` 中
- **reset.css:** 最小化 reset（box-sizing, margin, font）
- **layout.css:** 布局、栅格、卡片、按钮、表单基础类
- **components.css:** 可复用组件样式
- **flow.css:** 流程图专用样式
- **pages.css:** 页面级样式覆盖 + responsive

**无 CSS 框架。** 全部手写，~400 行总计。

---

## 3. Supabase JS 初始化方案

### 3.1 Client Singleton

```javascript
// js/data/client.js
const DB = (() => {
  let client = null;

  function init() {
    if (client) return client;
    const { createClient } = window.supabase;
    client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    return client;
  }

  function get() { return client || init(); }

  async function call(promise) {
    try {
      const { data, error } = await promise;
      if (error) throw error;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { init, get, call };
})();
```

### 3.2 API Call Pattern

所有 Supabase 查询通过 `DB.call()` 包装：

```javascript
// Success: { ok: true, data: [...] }
// Error:   { ok: false, error: "message" }
const result = await DB.call(
  DB.get().from('departments').select('*')
);
```

**统一错误处理：** `call()` 捕获所有异常，返回 `{ ok, data/error }` 结构。页面层只检查 `ok` 字段。

---

## 4. Router 设计

### 4.1 Route Table

| Pattern | Page | Phase |
|---------|------|:-----:|
| `/` | Dashboard | D-2 |
| `/orders` | Order List | D-2 |
| `/orders/new` | Order Create | D-4 |
| `/orders/:id` | Order Detail | D-3 |
| `/routes` | Route List | D-1 |
| `/exceptions` | Exception List | D-5 |

### 4.2 Router API

```javascript
// Register
Router.on('/orders/:id', async ({ params }) => {
  const page = await OrderDetail.render(params.id);
  return { cleanup: () => page.destroy() };
});

// Navigate
Router.navigate('/orders/abc-123');

// Start (called once in App.init())
Router.start();
```

### 4.3 Lifecycle

```
hashchange → match route → extract params
  → currentPage.cleanup()  (if exists)
  → newPage.render(params)
  → NavBar.refresh()
```

---

## 5. API Layer 骨架

### 5.1 已创建

| Module | File | Status |
|--------|------|:------:|
| Client Singleton | `js/data/client.js` | ✅ |
| Config | `js/config.js` | ✅ |

### 5.2 待创建 (Phase D-1~D-5)

| Module | File | Signature |
|--------|------|-----------|
| Orders | `js/data/orders.js` | `list()`, `getById()`, `create()`, `updateNode()`, `insertNode()` |
| Processes | `js/data/processes.js` | `listRoutes()`, `getRouteWithSteps()`, `listProcesses()` |
| Exceptions | `js/data/exceptions.js` | `listByOrder()`, `listAll()`, `create()` |
| Customers | `js/data/customers.js` | `list()`, `search()` |

---

## 6. 开发验收标准

### 6.1 D-0 Acceptance

| # | Criterion | Method | Status |
|:--|-----------|--------|:------:|
| 1 | `index.html` loads without console errors | Browser DevTools | ⬜ |
| 2 | Hash router navigates between all 6 routes | Click nav links | ⬜ |
| 3 | Nav bar renders with 5 links + brand | Visual | ⬜ |
| 4 | Nav active state updates on navigation | Click different links | ⬜ |
| 5 | CSS variables applied (check `--color-active` etc.) | DevTools computed styles | ⬜ |
| 6 | Supabase connects: `departments` query returns 5 rows | Console log | ⬜ |
| 7 | Skeleton shows on initial load, then replaced | Visual | ⬜ |
| 8 | Error state shows when DB unreachable | Disconnect network | ⬜ |

### 6.2 D-0 Test Script

```javascript
// 1. Open index.html in browser
// 2. Open DevTools Console

// Check: No red errors

// Check config
console.log(CONFIG.SUPABASE_URL);
// → 'https://wzfkmwrqnvjegunjueka.supabase.co'

// Check DB connection
const db = DB.get();
const r = await DB.call(db.from('departments').select('*'));
console.log(r.ok, r.data?.length);
// → true, 5

// Check router
Router.navigate('/routes');
// → URL hash changes to #/routes

Router.navigate('/orders');
// → URL hash changes to #/orders

Router.navigate('/orders/abc-123');
// → URL hash changes to #/orders/abc-123
```

---

## 7. 即时发现问题

### 7.1 无

D-0 基础设施按计划创建。未发现阻塞问题。

### 7.2 风险提示

| Risk | Mitigation |
|------|-----------|
| Supabase CDN 加载失败 | App.init() 中检测 `window.supabase`，显示错误提示 |
| 浏览器不支持 ES Module | `<script type="module">` 在不支持时静默跳过。V1 目标：现代浏览器 |
| GitHub Pages 部署路径 | 当前使用绝对路径（`/css/`, `/js/`）。确认部署在根路径 |

---

## 8. 下一阶段

### Phase D-1: P5 Route List

**入口条件：** D-0 全部验收通过

**创建文件：**
```
js/data/processes.js
js/pages/route-list.js
```

**注册路由：**
```javascript
Router.on('/routes', async () => {
  const html = await RouteList.render();
  DOM.render('#page-container', html);
});
```

---

> **Phase 1-C-3 D-0 Complete. 15 files created. Ready for D-1 after verification.**
