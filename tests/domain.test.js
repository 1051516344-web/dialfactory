'use strict';
/* ============================================================
   DialFactory V1 · Domain Layer Unit Tests (#8)
   Loads the IIFE domain modules into a shared vm sandbox and
   asserts their pure business logic (no network / DOM).
   Run: npm test  (node --test tests/)
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Load the self-contained domain IIFEs into a shared sandbox.
const DOMAIN_DIR = path.join(__dirname, '..', 'js', 'domain');
const context = vm.createContext({});
for (const f of ['order-state.js', 'node-state.js', 'validation.js', 'seq-calc.js']) {
  const src = fs.readFileSync(path.join(DOMAIN_DIR, f), 'utf8');
  vm.runInContext(src, context, { filename: f });
}
const OrderState = vm.runInContext('OrderState', context);
const NodeState = vm.runInContext('NodeState', context);
const Validation = vm.runInContext('Validation', context);
const SeqCalc = vm.runInContext('SeqCalc', context);

// ------------------------------------------------------------
// OrderState.derive
// ------------------------------------------------------------
test('OrderState.derive: no nodes → in_production', () => {
  assert.strictEqual(OrderState.derive([]), 'in_production');
});

test('OrderState.derive: all done → completed', () => {
  assert.strictEqual(
    OrderState.derive([{ status: 'done' }, { status: 'done' }]),
    'completed'
  );
});

test('OrderState.derive: all non-done paused → paused', () => {
  assert.strictEqual(
    OrderState.derive([{ status: 'paused' }, { status: 'paused' }]),
    'paused'
  );
});

test('OrderState.derive: mixed done/active → in_production', () => {
  assert.strictEqual(
    OrderState.derive([{ status: 'done' }, { status: 'active' }]),
    'in_production'
  );
});

test('OrderState.derive: cancelled is terminal and never overridden', () => {
  assert.strictEqual(OrderState.derive([{ status: 'active' }], 'cancelled'), 'cancelled');
});

// ------------------------------------------------------------
// NodeState
// ------------------------------------------------------------
test('NodeState.validate: waiting → active is valid', () => {
  assert.strictEqual(NodeState.validate('waiting', 'active').valid, true);
});

test('NodeState.validate: active → done and active → paused are valid', () => {
  assert.strictEqual(NodeState.validate('active', 'done').valid, true);
  assert.strictEqual(NodeState.validate('active', 'paused').valid, true);
});

test('NodeState.validate: paused → active is valid', () => {
  assert.strictEqual(NodeState.validate('paused', 'active').valid, true);
});

test('NodeState.validate: done is terminal (no outbound transition)', () => {
  assert.strictEqual(NodeState.validate('done', 'active').valid, false);
});

test('NodeState.validate: unknown source state is invalid', () => {
  assert.strictEqual(NodeState.validate('bogus', 'active').valid, false);
});

test('NodeState.isTerminal', () => {
  assert.strictEqual(NodeState.isTerminal('done'), true);
  assert.strictEqual(NodeState.isTerminal('active'), false);
});

test('NodeState.canCreateChild: waiting cannot, active can', () => {
  assert.strictEqual(NodeState.canCreateChild('waiting'), false);
  assert.strictEqual(NodeState.canCreateChild('active'), true);
});

test('NodeState.getAvailableActions', () => {
  // Array.from() re-homes the vm-realm array into the host realm for deepStrictEqual
  assert.deepStrictEqual(
    Array.from(NodeState.getAvailableActions({ status: 'active' })),
    ['advance', 'pause', 'append', 'record_exception']
  );
  assert.deepStrictEqual(Array.from(NodeState.getAvailableActions({ status: 'waiting' })), []);
  assert.deepStrictEqual(
    Array.from(NodeState.getAvailableActions({ status: 'done' })),
    ['rework', 'append', 'record_exception']
  );
});

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------
test('Validation.validateQtyOut: 检验 requires a positive integer', () => {
  assert.strictEqual(Validation.validateQtyOut('检验', null).valid, false);
  assert.strictEqual(Validation.validateQtyOut('检验', '').valid, false);
  assert.strictEqual(Validation.validateQtyOut('检验', 0).valid, false);
  assert.strictEqual(Validation.validateQtyOut('检验', -5).valid, false);
  assert.strictEqual(Validation.validateQtyOut('检验', 2.5).valid, false);
  assert.strictEqual(Validation.validateQtyOut('检验', 10).valid, true);
});

test('Validation.validateQtyOut: non-检验 always valid', () => {
  assert.strictEqual(Validation.validateQtyOut('冲板', null).valid, true);
});

test('Validation.validateDueDate', () => {
  assert.strictEqual(Validation.validateDueDate('2026-09-01').valid, true);
  assert.strictEqual(Validation.validateDueDate('').valid, false);
  assert.strictEqual(Validation.validateDueDate('not-a-date').valid, false);
});

// ------------------------------------------------------------
// SeqCalc
// ------------------------------------------------------------
test('SeqCalc.gapInsertion: append at end when no next node', () => {
  const r = SeqCalc.gapInsertion([{ seq: 10 }, { seq: 20 }], 20);
  assert.strictEqual(r.seq, 30);
  assert.strictEqual(r.needsBump, false);
});

test('SeqCalc.gapInsertion: midpoint within an existing gap', () => {
  const r = SeqCalc.gapInsertion([{ seq: 10 }, { seq: 30 }], 10);
  assert.strictEqual(r.seq, 20);
  assert.strictEqual(r.needsBump, false);
});

test('SeqCalc.gapInsertion: consecutive seq requires a bump', () => {
  const r = SeqCalc.gapInsertion([{ seq: 10 }, { seq: 11 }], 10);
  assert.strictEqual(r.seq, 20);
  assert.strictEqual(r.needsBump, true);
  assert.strictEqual(r.bumpFrom, 11);
});

test('SeqCalc.gapInsertion: afterSeq not found → append at end', () => {
  const r = SeqCalc.gapInsertion([{ seq: 10 }], 99);
  assert.strictEqual(r.seq, 20);
  assert.strictEqual(r.needsBump, false);
});

test('SeqCalc.validate: duplicate seq is flagged', () => {
  const r = SeqCalc.validate([
    { id: 'a', seq: 10 },
    { id: 'b', seq: 10 }
  ]);
  assert.strictEqual(r.valid, false);
  assert.ok(r.issues.some(i => i.includes('重复')));
});

test('SeqCalc.validate: valid seqs pass', () => {
  const r = SeqCalc.validate([
    { id: 'a', seq: 10 },
    { id: 'b', seq: 20 }
  ]);
  assert.strictEqual(r.valid, true);
});
