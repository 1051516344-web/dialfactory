/* ============================================================
   DialFactory V1 · Batch layer unit tests
   Uses the same node:test + vm pattern as domain.test.js.
   batch-state.js is pure (no DOM/DB), so it loads into a vm realm.
   createRootBatch / no-delete rules are verified statically against
   js/data/batches.js (DB behaviour requires the migration to be applied).
   ============================================================ */

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// Load the pure domain module into a fresh realm
const context = vm.createContext({});
const domainSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'domain', 'batch-state.js'), 'utf8');
vm.runInContext(domainSrc, context, { filename: 'batch-state.js' });
const BatchState = vm.runInContext('BatchState', context);

// Source of the data layer, for static assertions
const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'batches.js'), 'utf8');

// Helper: a 1100-sheet parent with three colour children
const parent = { id: 'p1', batch_no: 'A001-01', quantity: 1100, status: 'active' };
const children = [
  { batch_no: 'A001-01-01', quantity: 300, color: '银色' },
  { batch_no: 'A001-01-02', quantity: 400, color: '黑色' },
  { batch_no: 'A001-01-03', quantity: 300, color: '蓝色' }
];
const batchRows = [
  { id: 'p1', batch_no: 'A001-01', quantity: 1100, color: null, status: 'active' },
  { id: 'c1', batch_no: 'A001-01-01', quantity: 300, color: '银色', status: 'active' },
  { id: 'c2', batch_no: 'A001-01-02', quantity: 400, color: '黑色', status: 'active' },
  { id: 'c3', batch_no: 'A001-01-03', quantity: 300, color: '蓝色', status: 'active' }
];
const relations = [
  { source_batch_id: 'p1', target_batch_id: 'c1', quantity: 300 },
  { source_batch_id: 'p1', target_batch_id: 'c2', quantity: 400 },
  { source_batch_id: 'p1', target_batch_id: 'c3', quantity: 300 }
];

test('1 · createRootBatch exists and inserts a root batch (static)', () => {
  assert.ok(apiSrc.includes('createRootBatch'), 'createRootBatch must be exported');
  assert.ok(apiSrc.includes("from('production_batches')"), 'must insert into production_batches');
  assert.ok(apiSrc.includes("status: 'active'"), 'root batch starts as active');
});

test('2 · split 1100 → 300+400+300 yields 3 children, 3 relations, parent retained', () => {
  const v = BatchState.validateSplit(parent, [], children);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.remaining, 100, '1100 - 1000 = 100 remaining');

  const { roots, parentMap } = BatchState.buildTree(batchRows, relations);
  assert.strictEqual(roots.length, 1, 'single root batch');
  assert.strictEqual(roots[0].batch_no, 'A001-01', 'parent retained as root');
  assert.strictEqual(roots[0].quantity, 1100, 'parent quantity unchanged');
  assert.strictEqual(roots[0].children.length, 3, 'three child batches');
  assert.strictEqual(Object.keys(parentMap).length, 3, 'three relations');
});

test('3 · parent/child lookup works both directions', () => {
  const { roots, parentMap } = BatchState.buildTree(batchRows, relations);

  // From parent → all children
  const childNos = roots[0].children.map(c => c.batch.batch_no).sort();
  assert.deepStrictEqual(Array.from(childNos), ['A001-01-01', 'A001-01-02', 'A001-01-03']);

  // From child → parent
  assert.strictEqual(parentMap['c1'], 'p1');
  assert.strictEqual(parentMap['c2'], 'p1');
  assert.strictEqual(parentMap['c3'], 'p1');
});

test('4 · over-allocation split (1100 → 700+700) is rejected', () => {
  const v = BatchState.validateSplit(parent, [], [
    { batch_no: 'A001-01-01', quantity: 700 },
    { batch_no: 'A001-01-02', quantity: 700 }
  ]);
  assert.strictEqual(v.ok, false);
  assert.ok(String(v.error).includes('超过可分配'), 'error mentions exceeding allocatable');
});

test('5 · no batch delete — history cannot be removed (static)', () => {
  assert.ok(!apiSrc.includes('.delete('), 'batches.js must not issue any delete');
  assert.ok(!/delete\s*[:=]|deleteBatch/.test(apiSrc), 'no delete export');
});
