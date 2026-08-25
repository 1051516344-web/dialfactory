/* ============================================================
   DialFactory V1 · Order image recognition unit tests
   Pure conversion + matching logic only (no DOM/DB/network).
   ============================================================ */

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(relPath, name) {
  const context = vm.createContext({});
  const src = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  vm.runInContext(src, context, { filename: relPath });
  return vm.runInContext(name, context);
}

const OrderCreate = loadModule('js/domain/order-create.js', 'OrderCreate');
const CustomersAPI = loadModule('js/data/customers.js', 'CustomersAPI');

const customers = [
  { id: 'c1', name: '安通实业有限公司', code: 'ATT', short_name: 'ATT' },
  { id: 'c2', name: '广州恒信五金', code: 'HX', short_name: '恒信' },
];

test('1 · parseQuantity: "4100+2%" → 4100', () => {
  assert.strictEqual(OrderCreate.parseQuantity('4100+2%'), 4100);
});

test('2 · parseQuantity: "4100片" → 4100, "2,500" → 2500, junk → null', () => {
  assert.strictEqual(OrderCreate.parseQuantity('4100片'), 4100);
  assert.strictEqual(OrderCreate.parseQuantity('2,500'), 2500);
  assert.strictEqual(OrderCreate.parseQuantity('无数量'), null);
});

test('3 · parseDeliveryDate: Chinese/ISO variants → "YYYY-MM-DD"', () => {
  assert.strictEqual(OrderCreate.parseDeliveryDate('2026年09月01日'), '2026-09-01');
  assert.strictEqual(OrderCreate.parseDeliveryDate('2026/9/1'), '2026-09-01');
  assert.strictEqual(OrderCreate.parseDeliveryDate('2026-09-01'), '2026-09-01');
  assert.strictEqual(OrderCreate.parseDeliveryDate('无交期'), null);
});

test('4 · CustomersAPI.match: exact match on name / short_name / code, case-insensitive', () => {
  assert.strictEqual(CustomersAPI.match(customers, '广州恒信五金').id, 'c2');
  assert.strictEqual(CustomersAPI.match(customers, 'att').id, 'c1');
  assert.strictEqual(CustomersAPI.match(customers, '恒信').id, 'c2');
});

test('5 · CustomersAPI.match: no fuzzy guess — partial/unmatched returns null', () => {
  assert.strictEqual(CustomersAPI.match(customers, '恒信五'), null);
  assert.strictEqual(CustomersAPI.match(customers, '不存在的客户'), null);
  assert.strictEqual(CustomersAPI.match(customers, ''), null);
});
