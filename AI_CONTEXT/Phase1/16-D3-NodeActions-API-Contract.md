# DialFactory D-3 · NodeActions API Contract

> **状态：** Contract — Awaiting Approval
> **目的：** 定义 `js/domain/node-actions.js` 与调用方（Page 层）之间的精确接口契约
> **约束：** 不修改 Schema。不新增数据库字段。所有写操作经过 API Layer。

---

## 1. Method Inventory

| # | Method | Operation | Writes | Creates Node |
|:--|--------|-----------|:------:|:----------:|
| M1 | `advance()` | 完成: active → done | ✅ | — |
| M2 | `pause()` | 暂停: active → paused | ✅ | — |
| M3 | `resume()` | 恢复: paused → active | ✅ | — |
| M4 | `rework()` | 快捷返工 | ✅ | ✅ |
| M5 | `append()` | 动态追加 | ✅ | ✅ |
| M6 | `recordException()` | 记录异常 | ✅ | — |

---

## 2. Method Contracts

### M1 · advance(order, node, options?)

```
将节点从 active 推进到 done。
如果是检验类型节点，options.qtyOut 必填。
成功时自动激活下一个 waiting 节点。
```

#### Input

| Parameter | Type | Required | Description |
|-----------|------|:------:|-------------|
| `order` | `Object` | ✅ | 当前订单对象 `{ id, nodes[] }` |
| `node` | `Object` | ✅ | 当前节点 `{ id, seq, status, process: { type } }` |
| `options` | `Object` | ❌ | `{ qtyOut?: number }` |

#### Validation (Caller Responsibility: NONE — all internal)

| Step | Rule | Enforcement |
|------|------|------------|
| V1 | `node.status === 'active'` | `NodeState.validate('active', 'done')` |
| V2 | If `process.type === '检验'`, `qtyOut > 0` | `Validation.validateQtyOut()` |
| V3 | `qtyOut` is integer | `Number.isInteger(qtyOut) && qtyOut > 0` |

#### API Call Sequence

```
1. OrdersAPI.updateNode(node.id, {
     status: 'done',
     qty_out: options.qtyOut ?? null,
     updated_at: now()
   })
   → { ok, data: updatedNode }
   🔴 FAIL → return { ok: false, error, phase: 'primary' }

2. Find nextNode: order.nodes.find(n => n.seq > node.seq)
   If nextNode AND nextNode.status === 'waiting':
     OrdersAPI.updateNode(nextNode.id, {
       status: 'active',
       updated_at: now()
     })
     → { ok, data: activatedNode }
     🟡 FAIL → return { ok: true, ..., warning: 'downstream_activation_failed' }

3. newStatus = OrderState.derive(updatedNodes)
   OrdersAPI.updateStatus(order.id, newStatus)
   → 🟡 FAIL → return { ok: true, ..., warning: 'status_update_delayed' }
```

#### Return Format

```typescript
// Success
{
  ok: true,
  updatedNode: Node,            // the completed node
  activatedNode?: Node,         // the auto-activated next node (if any)
  newOrderStatus: string,       // 'in_production' | 'paused' | 'completed'
  warning?: 'downstream_activation_failed' | 'status_update_delayed'
}

// Failure
{
  ok: false,
  error: string,                // user-facing message
  phase: 'primary' | 'auto_activate' | 'status_update'
}
```

---

### M2 · pause(node, pauseReason)

```
将节点从 active 变更为 paused。
pauseReason 必须是预设值或自定义文本。
```

#### Input

| Parameter | Type | Required | Description |
|-----------|------|:------:|-------------|
| `node` | `Object` | ✅ | 当前节点 `{ id, status }` |
| `pauseReason` | `string` | ✅ | 暂停原因。预设值见 `CONFIG.PAUSE_REASONS` |

#### Validation

| Step | Rule | Enforcement |
|------|------|------------|
| V1 | `node.status === 'active'` | `NodeState.validate('active', 'paused')` |
| V2 | `pauseReason` is non-empty string | `typeof pauseReason === 'string' && pauseReason.length > 0` |

#### API Call Sequence

```
1. OrdersAPI.updateNode(node.id, {
     status: 'paused',
     pause_reason: pauseReason,
     updated_at: now()
   })
   → { ok, data: updatedNode }
   🔴 FAIL → return { ok: false, error, phase: 'primary' }

2. newStatus = OrderState.derive(updatedNodes)
   OrdersAPI.updateStatus(order.id, newStatus)
   → 🟡 FAIL → return { ok: true, ..., warning: 'status_update_delayed' }
```

#### Return Format

```typescript
// Success
{
  ok: true,
  updatedNode: Node,
  newOrderStatus: string,
  warning?: 'status_update_delayed'
}

// Failure
{
  ok: false,
  error: string,
  phase: 'primary' | 'status_update'
}
```

---

### M3 · resume(node)

```
将节点从 paused 恢复到 active。
pause_reason 字段自动清除。
```

#### Input

| Parameter | Type | Required | Description |
|-----------|------|:------:|-------------|
| `node` | `Object` | ✅ | 当前节点 `{ id, status }` |

#### Validation

| Step | Rule | Enforcement |
|------|------|------------|
| V1 | `node.status === 'paused'` | `NodeState.validate('paused', 'active')` |

#### API Call Sequence

```
1. OrdersAPI.updateNode(node.id, {
     status: 'active',
     pause_reason: null,
     updated_at: now()
   })
   → { ok, data: updatedNode }
   🔴 FAIL → return { ok: false, error, phase: 'primary' }

2. newStatus = OrderState.derive(updatedNodes)
   OrdersAPI.updateStatus(order.id, newStatus)
   → 🟡 FAIL → return { ok: true, ..., warning: 'status_update_delayed' }
```

#### Return Format

```typescript
// Success
{
  ok: true,
  updatedNode: Node,
  newOrderStatus: string,
  warning?: 'status_update_delayed'
}

// Failure
{
  ok: false,
  error: string,
  phase: 'primary' | 'status_update'
}
```

---

### M4 · rework(order, parentNode)

```
对已完成节点执行快捷返工。
创建新节点：同工序，rework_pass = parent.rework_pass + 1。
使用 gap-based seq 插入到 parent 之后。
新节点 status = 'active'。
```

#### Input

| Parameter | Type | Required | Description |
|-----------|------|:------:|-------------|
| `order` | `Object` | ✅ | 当前订单对象 `{ id, nodes[] }` |
| `parentNode` | `Object` | ✅ | 被返工的节点 `{ id, seq, status, process_id, process_name, process_code, dept_id, dept_name, rework_pass }` |

#### Validation

| Step | Rule | Enforcement |
|------|------|------------|
| V1 | `parentNode.status === 'done'` | `NodeState.canCreateChild('done')` |
| V2 | `parentNode.process_id` is not null | `!!parentNode.process_id` |

#### API Call Sequence

```
1. Compute seq: SeqCalc.gapInsertion(order.nodes, parentNode.seq)
   → { seq: number, needsBump: boolean, bumpFrom?: number }

2. OrdersAPI.insertNode({
     order_id:      order.id,
     process_id:    parentNode.process_id,
     process_name:  parentNode.process_name,
     process_code:  parentNode.process_code,
     dept_id:       parentNode.dept_id,
     dept_name:     parentNode.dept_name,
     seq:           computedSeq,
     rework_pass:   parentNode.rework_pass + 1,
     status:        'active',
     purpose:       'rework',
     parent_node_id: parentNode.id
   })
   → { ok, data: newNode }
   🔴 FAIL → return { ok: false, error, phase: 'primary' }

3. If needsBump:
     OrdersAPI.bumpSeq(order.id, bumpFrom, +GAP_STEP, newNode.id)
     → 🟡 FAIL → return { ok: true, ..., warning: 'seq_bump_failed' }

4. newStatus = OrderState.derive(updatedNodes)
   OrdersAPI.updateStatus(order.id, newStatus)
   → 🟡 FAIL → return { ok: true, ..., warning: 'status_update_delayed' }
```

#### Return Format

```typescript
// Success
{
  ok: true,
  newNode: Node,                // created node with DB-assigned UUID
  newSeq: number,               // computed insertion seq
  needsBump: boolean,           // whether seq bump was attempted
  newOrderStatus: string,
  warning?: 'seq_bump_failed' | 'status_update_delayed'
}

// Failure
{
  ok: false,
  error: string,
  phase: 'primary' | 'seq_bump' | 'status_update'
}
```

---

### M5 · append(order, parentNode, processId, reason?)

```
在指定节点之后动态追加新工序节点。
新节点：rework_pass = 0（该工序在此订单首次执行）。
使用 gap-based seq 插入。
新节点 status = 'active'。
```

#### Input

| Parameter | Type | Required | Description |
|-----------|------|:------:|-------------|
| `order` | `Object` | ✅ | 当前订单对象 `{ id, nodes[] }` |
| `parentNode` | `Object` | ✅ | 插入位置参照节点 `{ id, seq, status }` |
| `processId` | `string` (UUID) | ✅ | 要追加的工序 ID |
| `reason` | `string` | ❌ | 追加原因，存储在 `note` 字段 |

#### Validation

| Step | Rule | Enforcement |
|------|------|------------|
| V1 | `parentNode.status !== 'waiting'` | `NodeState.canCreateChild(parentNode.status)` |
| V2 | `processId` is valid UUID | API call will fail if process doesn't exist (FK) |

#### API Call Sequence

```
1. Fetch process details:
     ProcessesAPI.listProcesses() → find by processId
     → { id, code, name, type, default_dept_id }
   (V1 optimization: processes cached in page, passed as option)

2. Resolve dept name from deptMap cache

3. Compute seq: SeqCalc.gapInsertion(order.nodes, parentNode.seq)
   → { seq: number, needsBump: boolean, bumpFrom?: number }

4. OrdersAPI.insertNode({
     order_id:      order.id,
     process_id:    processId,
     process_name:  process.name,
     process_code:  process.code,
     dept_id:       process.default_dept_id,
     dept_name:     resolvedDeptName,
     seq:           computedSeq,
     rework_pass:   0,                // first time for this process in this order
     status:        'active',
     purpose:       'append',
     parent_node_id: parentNode.id,
     note:          reason ?? null
   })
   → { ok, data: newNode }
   🔴 FAIL → return { ok: false, error, phase: 'primary' }

5. If needsBump:
     OrdersAPI.bumpSeq(order.id, bumpFrom, +GAP_STEP, newNode.id)
     → 🟡 FAIL → return { ok: true, ..., warning: 'seq_bump_failed' }

6. newStatus = OrderState.derive(updatedNodes)
   OrdersAPI.updateStatus(order.id, newStatus)
   → 🟡 FAIL → return { ok: true, ..., warning: 'status_update_delayed' }
```

#### Return Format

```typescript
// Success
{
  ok: true,
  newNode: Node,
  newSeq: number,
  needsBump: boolean,
  newOrderStatus: string,
  warning?: 'seq_bump_failed' | 'status_update_delayed'
}

// Failure
{
  ok: false,
  error: string,
  phase: 'primary' | 'seq_bump' | 'status_update'
}
```

---

### M6 · recordException(nodeId, eventData)

```
在指定节点上记录一条质量异常事件。
不修改节点状态。仅追加 exception_events 行。
```

#### Input

| Parameter | Type | Required | Description |
|-----------|------|:------:|-------------|
| `nodeId` | `string` (UUID) | ✅ | 关联节点 ID |
| `eventData` | `Object` | ✅ | `{ type, qty, resolution }` |
| `eventData.type` | `string` | ✅ | 缺陷类型。预设值见 `CONFIG.EXCEPTION_TYPES` |
| `eventData.qty` | `number` | ✅ | 影响数量。整数 > 0 |
| `eventData.resolution` | `string` | ✅ | 处理方式。预设值见 `CONFIG.EXCEPTION_RESOLUTIONS` |

#### Validation

| Step | Rule | Enforcement |
|------|------|------------|
| V1 | `nodeId` is non-empty | `!!nodeId` |
| V2 | `eventData.qty > 0` | `Number.isInteger(qty) && qty > 0` |
| V3 | `eventData.type` is non-empty | `typeof type === 'string' && type.length > 0` |

#### API Call Sequence

```
1. ExceptionsAPI.create({
     node_id:    nodeId,
     type:       eventData.type,
     qty:        eventData.qty,
     resolution: eventData.resolution
   })
   → { ok, data: exception }
   🔴 FAIL → return { ok: false, error, phase: 'primary' }
```

#### Return Format

```typescript
// Success
{
  ok: true,
  exception: Exception,          // { id, node_id, type, qty, resolution, created_at }
}

// Failure
{
  ok: false,
  error: string,
  phase: 'primary'
}
```

> **Note:** `recordException` is write-only. It does NOT modify node status or order status. The caller may independently pause the node after recording the exception.

---

## 3. Common Types

### Node (as passed to/from contract)

```typescript
interface Node {
  id: string;              // UUID
  order_id: string;        // UUID
  process_id: string;      // UUID | null
  process_name: string;    // snapshot
  process_code: string;    // snapshot
  dept_id: string;         // UUID | null
  dept_name: string;       // snapshot
  status: 'waiting' | 'active' | 'done' | 'paused';
  seq: number;
  rework_pass: number;
  pause_reason: string | null;
  qty_out: number | null;
  note: string | null;
  // ... other DB columns as needed
}
```

### Order (as passed to contract)

```typescript
interface Order {
  id: string;
  nodes: Node[];            // must include all nodes for this order
  // ... other order fields as needed
}
```

### Return Wrapper

```typescript
// All methods return this shape:
type ActionResult<T> =
  | { ok: true } & T & { warning?: string }
  | { ok: false; error: string; phase: string };
```

---

## 4. Shared Error Codes

| Code | Meaning | User Message |
|------|---------|-------------|
| `primary` | Core DB write failed | "操作失败：[error]。请重试。" |
| `auto_activate` | Downstream activation failed | "下游激活失败，请手动激活。" |
| `seq_bump` | Seq recomputation failed | "Seq重算失败，请刷新页面检查顺序。" |
| `status_update` | Order status update delayed | "状态更新延迟，下次操作自动修正。" |

---

## 5. Caller Responsibility Matrix

| Responsibility | Page (`order-detail.js`) | Domain (`node-actions.js`) | API (`orders.js`) |
|---------------|:--------:|:---------:|:-----:|
| State validation | ❌ | ✅ | ❌ |
| Business rule validation | ❌ | ✅ | ❌ |
| API call execution | ❌ | ❌ | ✅ |
| Seq computation | ❌ | ✅ | ❌ |
| Order status derivation | ❌ | ✅ (calls `OrderState`) | ❌ |
| DOM update | ✅ | ❌ | ❌ |
| User input collection | ✅ | ❌ | ❌ |
| Error display (toast) | ✅ | ❌ | ❌ |
| Re-render after mutation | ✅ | ❌ | ❌ |

---

## 6. Contract Verification Checklist

Per method, verify before implementation:

| # | Check | M1 | M2 | M3 | M4 | M5 | M6 |
|:--|-------|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 | Input parameters fully typed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | All validation steps listed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | API call sequence defined | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | Return format specified | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | Failure mode documented | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | No DB schema change | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | No new DB fields | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 8 | `purpose` field not persisted | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 9 | `parent_node_id` not persisted | ✅ | ✅ | ✅ | ✅ | ✅ | — |

> **Note (Check 8-9):** `purpose` and `parent_node_id` are used in the API contract for clarity and are passed to `OrdersAPI.insertNode()`. However, `insertNode()` only writes the columns that exist in the `order_nodes` table. `purpose` and `parent_node_id` are stripped before the INSERT — they serve as documentation and orchestration hints only. No schema change required.

---

> **Contract complete. Awaiting approval before D-3 implementation.**
