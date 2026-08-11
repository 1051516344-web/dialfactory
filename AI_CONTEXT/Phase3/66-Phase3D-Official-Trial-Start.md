# Phase 3-D · Official Trial Start

> **Date:** 2026-08-07 11:10
> **Status:** 🟢 TRIAL IN PROGRESS — Development FROZEN
> **Predecessor:** [65-Phase3D-Trial-Baseline-Cleanup.md](AI_CONTEXT/Phase3/65-Phase3D-Trial-Baseline-Cleanup.md)

---

## 1. Final Baseline Snapshot

```
Verified at 2026-08-07 11:10

  orders             0
  order_nodes        0
  exception_events   0
  customers         15  (active)
  processes         35
  departments        5
  process_routes     0
  route_steps        0

  Storage            drawings bucket — 0 files
  Schema             8 tables · 59 fields
  FK                 6 RESTRICT · 3 SET NULL · 1 NO FK · 0 CASCADE
  Code               Phase 3-D complete (7 files uncommitted)
```

---

## 2. First Order Procedure

跟单员打开 `index.html`，按以下步骤创建第一张真实订单：

```
Step 1 — 基本信息
  [ ] 订单编号    输入格式建议: {客户简称}-{日期}-{序号}  如 ACC-2026-0807-001
  [ ] 客户        从下拉列表选择 (15家，显示简称如 ACC, GQ, WEL)
  [ ] 订单数量    输入件数
  [ ] 交期        选择日期
  [ ] 底质纹理    输入或选择建议值 (无底纹 / 太阳纹 / 直线纹 / 自定义)
  [ ] 电镀颜色    自由输入，如 银白60s
  [ ] 板底颜色    选填，如 黑色喷漆、白底
  [ ] 客户图纸    选填，支持 PDF/PNG/JPEG，最大 10MB
  [ ] 备注        选填

  点击 "下一步：确认工序 →"

Step 2 — 建立生产路线
  [ ] 在清单中勾选需要的工序
  [ ] 用搜索框快速定位工序编号或名称
  [ ] 确认已选择数量

  点击 "创建订单 ✓"
```

**创建后：**
- 系统自动跳转到订单详情页
- 第一个节点已激活（绿色"进行中"）
- 如有图纸，显示在订单信息卡片中

---

## 3. Daily Operation Flow

```
早上一上班:
  1. 打开 DialFactory (index.html)
  2. 查看 Dashboard — 各卡片显示在產/暫停/完成的订单数
  3. 查看 Order List — 按状态/部门筛选，关注黄色"已停滞"预警

生产进行中:
  4. 打开订单详情
  5. 当前节点完成后 → 点击 ✓ 标记完成  (自动推进到下一节点)
  6. 遇到暂停 → 点击 ⏸ 并选择原因
  7. 质量问题 → 点击 记录异常，选类型+数量+处理方式
  8. 返工需求 → 点击 返工 / 段返工，选择目标节点/部门

下班前:
  9. 确认所有活跃节点状态正确
  10. 如有异常情况，记录到试运行记录表
```

---

## 4. Trial Rules Reminder

### ✅ Must Do

| 规则 | 说明 |
|------|------|
| 手工建路线 | 每次创建订单都要手工勾选工序，不要图快跳过 |
| 如实记录 | 选错了、写错了、漏了——都记下来，这是数据 |
| 填规格 | base_texture / plate_color 尽量填，哪怕不确定 |
| 记录返工 | 每次返工都要在系统中操作（不要线下处理不录入） |
| 记录异常 | 色差、划伤、电镀不良……每种异常都记 |
| 每周回顾 | 每周末汇总试运行记录表，发给 Claude 分析 |

### ❌ Must NOT Do

| 规则 | 说明 |
|------|------|
| 删除真实订单 | 试用清理按钮仅用于测试数据，不删真实订单 |
| 跳过系统 | 不要在纸上记、微信上沟通——全部走系统 |
| 担心"用错" | 没有"用错"——所有操作都是观察数据 |
| 要求新功能 | 试运行期间不开发，所有建议记下来等 Phase 4 |

---

## 5. Issue Recording Method

### 日常记录：试运行记录表

文件：[tools/试运行记录表-Trial-Log.csv](tools/试运行记录表-Trial-Log.csv)（UTF-8 BOM，可用 Excel 打开）

每天下班前花 3 分钟填写当天的观察。

**7 个记录区：**

| 区域 | 内容 | 示例 |
|:----:|------|------|
| 一 | 订单创建 | 日期、订单号、客户、规格、路线 |
| 二 | 工序执行 | 哪些工序顺利？哪些卡住了？ |
| 三 | 规格字段 | 底质纹理用了什么自定义值？ |
| 四 | 返工事件 | 类型(A/B/C)、原因、涉及工序 |
| 五 | 异常记录 | 类型、数量、处理方式 |
| 六 | 用户行为 | 搜索习惯、错误修正、困惑点 |
| 七 | 缺失信息 | 什么信息系统装不下？ |

### 紧急问题：直接告诉我

如果遇到系统 Bug（崩溃、数据丢失、无法操作），直接在这个对话告诉我。Bug 修复不受开发冻结限制。

---

## 6. First Week Goals

| Day | Target |
|:---:|--------|
| 1 | 创建第一张订单，熟悉 2 步创建流程 |
| 2 | 推进 3-5 个节点，体验完成→自动推进 |
| 3 | 遇到第一个需要暂停/返工的场景 |
| 4 | 独立完成一张订单的完整周期 |
| 5 | 创建 2-3 张不同路线的订单 |
| 6-7 | 稳定使用，开始记录观察数据 |

---

## 7. Contact

```
遇到 Bug:    直接在这个对话告诉我
每周回顾:    周五/周六发试运行记录表
紧急问题:    随时
```

---

> **试运行正式开始。第一张订单就是历史数据。**
> 
> **First review: 2026-08-14 (Week 1)**
