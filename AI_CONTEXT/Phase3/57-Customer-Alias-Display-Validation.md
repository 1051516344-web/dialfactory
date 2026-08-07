# Phase 3-D · Customer Display Alias — Validation Report

> **Status:** Code Complete — Awaiting SQL Execution
> **Change Proposal:** Phase 3-D Customer Display Alias
> **Freeze Impact:** 58 → 59 fields

---

## 1. Before / After

### Before
```
Order cards:    "ACCENDO HONG KONG LTD"  ← too long, tablet unreadable
Dropdown:       "冠球代理人有限公司"       ← too long
Order detail:   "三井表业有限公司"          ← too long
```

### After
```
Order cards:    "ACC"                      ← clean
Dropdown:       "GQ"                       ← matches code
Order detail:   "WEL"                      ← concise
```

---

## 2. Schema Change

```sql
ALTER TABLE customers ADD COLUMN short_name TEXT;
```

| Property | Value |
|----------|-------|
| Migration file | `supabase/migrations/002_add_customer_short_name.sql` |
| Fields before | 58 |
| Fields after | **59** |
| FK impact | None |
| RLS impact | None |
| ADL impact | None |
| Rollback | `ALTER TABLE customers DROP COLUMN short_name;` |

---

## 3. Data — 16 Customers

| Code | Full Name | short_name |
|:----:|-----------|:----------:|
| ACC | ACCENDO HONG KONG LTD | ACC |
| ATT | 艺时香港有限公司 | ATT |
| FAF | 俊光实业有限公司 | FAF |
| REN | Reniey Watch Manufacturing Co.Ltd | REN |
| OW | Oruebtak Wheel International | OW |
| GQ | 冠球代理人有限公司 | GQ |
| TSI | TIMER SHINE INDUSTRY,CO.LTD | TSI |
| TEL | 晶宝电子有限公司 | TEL |
| WEL | 三井表业有限公司 | WEL |
| THA | 深圳市金辰宇科技有限公司 | THA |
| GLB | 东莞高宝精密钟表制品有限公司 | GLB |
| PYX | 长安翡仕实业有限公司 | PYX |
| APW | 东莞亚太表业有限公司 | APW |
| JIP | 钦州金泰精密制造有限公司 | JIP |
| CES | 格致 | CES |
| HKG | 香港钟表 | HKG |

---

## 4. Code Changes

### API Layer (2 files)

| File | Change |
|------|--------|
| [js/data/customers.js](js/data/customers.js#L10) | `list()`, `search()` — add `short_name` to `.select()` |
| [js/data/customers.js](js/data/customers.js#L27) | +`displayName(customer)` helper |
| [js/data/orders.js](js/data/orders.js#L30) | `list()` — join `customer:customers(name, short_name)` |
| [js/data/orders.js](js/data/orders.js#L52) | `getById()` — join `customer:customers(name, short_name)` |

### UI Layer (3 files, 4 locations)

| File | Line | Change |
|------|:----:|--------|
| [js/pages/order-list.js](js/pages/order-list.js#L201) | 201 | `order.customer?.name` → `order.customer?.short_name \|\| order.customer?.name` |
| [js/pages/order-create.js](js/pages/order-create.js#L52) | 52 | `c.name` → `c.short_name \|\| c.name` |
| [js/pages/order-detail.js](js/pages/order-detail.js#L74) | 74 | `order.customer?.name` → `order.customer?.short_name \|\| order.customer?.name` |
| [js/pages/order-detail.js](js/pages/order-detail.js#L473) | 473 | Cleanup dialog — `currentOrder.customer?.name` → `short_name \|\| name` |

### Display Rule
```
show = customer.short_name || customer.name || '—'
```

---

## 5. Manual Step Required

**Anon key cannot execute DDL.** Run this once in Supabase SQL Editor:

```
https://supabase.com/dashboard/project/wzfkmwrqnvjegunjueka/sql/new
```

Paste and run:

```sql
ALTER TABLE customers ADD COLUMN short_name TEXT;

UPDATE customers SET short_name = 'ACC' WHERE code = 'ACC';
UPDATE customers SET short_name = 'ATT' WHERE code = 'ATT';
UPDATE customers SET short_name = 'FAF' WHERE code = 'FAF';
UPDATE customers SET short_name = 'REN' WHERE code = 'REN';
UPDATE customers SET short_name = 'OW'  WHERE code = 'OW';
UPDATE customers SET short_name = 'GQ'  WHERE code = 'GQ';
UPDATE customers SET short_name = 'TSI' WHERE code = 'TSI';
UPDATE customers SET short_name = 'TEL' WHERE code = 'TEL';
UPDATE customers SET short_name = 'WEL' WHERE code = 'WEL';
UPDATE customers SET short_name = 'THA' WHERE code = 'THA';
UPDATE customers SET short_name = 'GLB' WHERE code = 'GLB';
UPDATE customers SET short_name = 'PYX' WHERE code = 'PYX';
UPDATE customers SET short_name = 'APW' WHERE code = 'APW';
UPDATE customers SET short_name = 'JIP' WHERE code = 'JIP';
UPDATE customers SET short_name = 'CES' WHERE code = 'CES';
UPDATE customers SET short_name = 'HKG' WHERE code = 'HKG';
```

---

## 6. Verification Checklist

```
After running SQL:
  [ ] SELECT code, name, short_name FROM customers ORDER BY code;
      Expected: 16 rows, all with short_name populated.

After deploying code:
  [ ] Open Order List (#/orders)
      Verify: cards show "ACC" not "ACCENDO HONG KONG LTD"
  [ ] Open Order Create (#/orders/new)
      Verify: dropdown shows "GQ" not "冠球代理人有限公司"
  [ ] Open any Order Detail
      Verify: header shows short name
  [ ] Open trial cleanup dialog
      Verify: shows short name

  [ ] Customer without short_name (格致→CES)
      Verify: shows "CES" (short_name exists)
  [ ] Rollback test: SET short_name = NULL for one customer
      Verify: still shows full name (graceful fallback)
```

---

## 7. Freeze Compliance

```
Schema:     1 ALTER TABLE (approved via Change Proposal)
Migration:  1 file (002_add_customer_short_name.sql)
Fields:     58 → 59
FK:         6 RESTRICT, 3 SET NULL, 1 NO FK, 0 CASCADE  (unchanged)
ADL-001~003: No violation
ADP-001~005: No violation
```

---

> **Code complete. Run SQL in Supabase Dashboard. Push code. Verify.**
