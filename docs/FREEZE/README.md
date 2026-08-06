# FREEZE — DialFactory Project Baseline

本目录存放 DialFactory 项目的版本冻结声明。

---

## AI 接入规则

任何 Claude / GPT / Cursor / 其他 AI 进入 DialFactory 项目时：

### Step 1（强制）

读取本目录的 `DialFactory-V1-Freeze.md`

### Step 2

对照 Freeze Manifest 中的 Frozen Documents 确认当前基线。

### Step 3

如果任务目标与 Freeze 内容冲突：

1. **停止执行**
2. **提出 Change Proposal**（参考 Freeze Manifest §Change Management Rule）
3. **等待人工审批**

### 禁止行为

| # | 行为 |
|:--|------|
| 1 | 跳过 Freeze 直接工作 |
| 2 | 绕过 Change Proposal 修改冻结内容 |
| 3 | 自行判断 "这个改动很小，不需要提案" |

---

## 当前冻结版本

| 属性 | 值 |
|------|-----|
| **Version** | V1.0 |
| **Status** | FROZEN |
| **Phase** | Phase 1-A Schema Design |
| **Date** | 2026-08-06 |
| **Schema** | 8 Tables · 58 Fields · 0 CASCADE |
| **Next Phase** | Phase 1-B Supabase Implementation |

---

## 文件索引

| 文件 | 说明 |
|------|------|
| `DialFactory-V1-Freeze.md` | **主文件。** 冻结声明 + Schema Baseline + ADL/ADP + Change Management |
| `README.md` | 本文件。AI 接入规则 |

---

> **最后更新：** 2026-08-06
