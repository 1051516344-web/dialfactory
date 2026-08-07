# Phase 3-C-1 · Factory Data Migration Validation

> **Status:** ✅ Complete
> **Date:** 2026-08-07
> **Scope:** Replace Phase 1-E demo data with real factory data

---

## 1. Migration Summary

| Table | Before | After | Expected | Status |
|-------|:------:|:-----:|:--------:|:------:|
| departments | 5 | **5** | 5 | ✅ |
| customers | 1 (SN demo) | **16** | 16 | ✅ |
| processes | 5 (demo P01/P03/P05/P07/P09) | **35** | 35 | ✅ |
| process_routes | 1 (demo route) | **0** | 0 | ✅ |
| route_steps | 5 (demo steps) | **0** | 0 | ✅ |
| orders | 0 | **0** | 0 | ✅ |
| order_nodes | 0 | **0** | 0 | ✅ |
| exception_events | 0 | **0** | 0 | ✅ |

---

## 2. Departments (5/5)

| Name | ID |
|------|----|
| 制一 | c9f07325-...ed2fae |
| 制二 | b2e7258d-...cf4a78a |
| 制三 | 9074d0c6-...58e872e |
| 制四 | 1bfddb7e-...14d0794 |
| 总QC | 00d2f633-...63f1bb |

---

## 3. Customers (16/16)

| Code | Name | Active |
|------|------|:------:|
| ACC | ACCENDO HONG KONG LTD | ✅ |
| ATT | 艺时香港有限公司 | ✅ |
| FAF | 俊光实业有限公司 | ✅ |
| REN | Reniey Watch Manufacturing Co.Ltd | ✅ |
| OW | Oruebtak Wheel International | ✅ |
| GQ | 冠球代理人有限公司 | ✅ |
| TSI | TIMER SHINE INDUSTRY,CO.LTD | ✅ |
| TEL | 晶宝电子有限公司 | ✅ |
| WEL | 三井表业有限公司 | ✅ |
| THA | 深圳市金辰宇科技有限公司 | ✅ |
| GLB | 东莞高宝精密钟表制品有限公司 | ✅ |
| PYX | 长安翡仕实业有限公司 | ❌ (inactive) |
| APW | 东莞亚太表业有限公司 | ✅ |
| JIP | 钦州金泰精密制造有限公司 | ✅ |
| CES | 格致 | ✅ |
| HKG | 香港钟表 | ✅ |

---

## 4. Processes (35/35)

### 制一 (P01-P11) — 11 processes
| Code | Name | Type |
|------|------|------|
| P01 | 冲板 | 加工 |
| P02 | 冲孔 | 加工 |
| P03 | 焊脚 | 加工 |
| P04 | 允窗 | 加工 |
| P05 | 平压 | 辅助 |
| P06 | 撕胶纸 | 辅助 |
| P07 | 车圈 | 加工 |
| P08 | 车窗 | 加工 |
| P09 | 车唱片纹 | 加工 |
| P10 | 倒喇叭孔 | 加工 |
| P11 | 磨毛刺 | 辅助 |

### 制二 (P12-P25) — 14 processes
| Code | Name | Type |
|------|------|------|
| P12 | 磨板 | 加工 |
| P13 | 喷砂 | 加工 |
| P14 | 刷直线纹 | 加工 |
| P15 | 刷太阳纹 | 加工 |
| **P16** | **电镀** | **加工** |
| P17 | 打底 | 加工 |
| P18 | 喷漆 | 加工 |
| P19 | 消光 | 加工 |
| P20 | 烤板 | 加工 |
| P21 | 洗板 | 辅助 |
| P22 | 抛光 | 加工 |
| P23 | QC板面 | 检验 |
| P24 | QC排版移交 | 检验 |
| P25 | QC接板移交 | 检验 |

### 制三 (P26-P27) — 2 processes
| Code | Name | Type |
|------|------|------|
| P26 | 网印 | 加工 |
| P27 | 球印 | 加工 |

### 制四 (P28-P34) — 7 processes
| Code | Name | Type |
|------|------|------|
| P28 | 穴修 | 辅助 |
| P29 | 装钉 | 加工 |
| P30 | 打胶 | 加工 |
| P31 | 调钉 | 辅助 |
| P32 | 点夜光 | 加工 |
| P33 | 贴UP | 加工 |
| P34 | 组装配件 | 辅助 |

### 总QC (P35) — 1 process
| Code | Name | Type |
|------|------|------|
| P35 | 总QC | 检验 |

---

## 5. Critical Verification: P16 电镀 → 制二

```
API: GET /processes?select=code,name,default_dept:departments(name)&code=eq.P16
Result: { "code": "P16", "name": "电镀", "default_dept": { "name": "制二" } }
Verdict: ✅ P16 电镀 is in 制二 (NOT 制三)
```

This was the #1 factory requirement — 电镀 happens in 制二, not 制三.

---

## 6. Audit Issues Resolved

| # | Issue | Status |
|:--|-------|:------:|
| I-2 | Demo customer (SN) removed | ✅ |
| I-3 | Demo processes replaced with 35 real | ✅ |
| I-4 | Demo route + steps removed | ✅ |
| I-5 | route-list.js "必修" badge removed | ✅ Fixed |
| I-6 | processes.js is_required in SELECT | Deferred (LOW, column exists) |

---

## 7. Freeze Compliance

```
Schema:     0 changes (8 tables, 58 fields)
Migration:  0 files
FK:         6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE
Strategy:   Data-only replacement via Supabase REST API
ADL-001~003: No violation
ADP-001~005: No violation
```

---

## 8. Trial Readiness

```
✅ All demo data purged
✅ 16 real customers inserted (PYX inactive)
✅ 35 real processes inserted (P01-P35, factory names)
✅ P16 电镀 confirmed in 制二
✅ All dept assignments verified
✅ No routes/steps — templates emerge from usage
✅ No orders/nodes/exceptions — clean trial start
✅ route-list.js "必修" badge removed
```

---

> **Factory trial can begin. Database is clean with real factory data.**
