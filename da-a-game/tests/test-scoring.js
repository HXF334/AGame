// tests/test-scoring.js — §11 积分结算
// 跑法：node tests/test-scoring.js

const assert = require('assert');
const { calculateScore } = require('../src/scoring.js');

// ===== 测试运行器 =====
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed += 1;
    failures.push({ name: name, err: e });
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : e));
  }
}

function section(t) { console.log('\n=== ' + t + ' ==='); }

// 构造 score 状态
function makeState(opts) {
  opts = opts || {};
  return {
    mode: opts.mode,
    主方: opts.主方 || [],
    次方: opts.次方 || null,
    抓方: opts.抓方 || []
  };
}

// ============================================================
// §1  1V4 明打
// ============================================================
section('1. 1V4 明打');

test('独打者胜: 独打 +64, 4 抓方各 -16', () => {
  const state = makeState({
    mode: '1V4_明打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '主方' });
  assert.strictEqual(r['A'], 64);
  assert.strictEqual(r['B'], -16);
  assert.strictEqual(r['C'], -16);
  assert.strictEqual(r['D'], -16);
  assert.strictEqual(r['E'], -16);
});

test('抓方胜: 独打 -64, 4 抓方各 +16', () => {
  const state = makeState({
    mode: '1V4_明打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '抓方' });
  assert.strictEqual(r['A'], -64);
  assert.strictEqual(r['B'], 16);
  assert.strictEqual(r['C'], 16);
  assert.strictEqual(r['D'], 16);
  assert.strictEqual(r['E'], 16);
});

test('平局: 全 0', () => {
  const state = makeState({
    mode: '1V4_明打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: 'draw' });
  // 没有变化意味着全 0
  assert.deepStrictEqual(r, {});
});

// ============================================================
// §2  1V4 暗打
// ============================================================
section('2. 1V4 暗打');

test('独打者胜: 独打 +32, 4 抓方各 -8', () => {
  const state = makeState({
    mode: '1V4_暗打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '主方' });
  assert.strictEqual(r['A'], 32);
  assert.strictEqual(r['B'], -8);
  assert.strictEqual(r['C'], -8);
  assert.strictEqual(r['D'], -8);
  assert.strictEqual(r['E'], -8);
});

test('抓方胜: 独打 -32, 4 抓方各 +8', () => {
  const state = makeState({
    mode: '1V4_暗打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '抓方' });
  assert.strictEqual(r['A'], -32);
  assert.strictEqual(r['B'], 8);
  assert.strictEqual(r['C'], 8);
  assert.strictEqual(r['D'], 8);
  assert.strictEqual(r['E'], 8);
});

test('平局: 全 0', () => {
  const state = makeState({
    mode: '1V4_暗打',
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: 'draw' });
  assert.deepStrictEqual(r, {});
});

// ============================================================
// §3  2V3 明打
// ============================================================
section('3. 2V3 明打 (倍率=2)');

test('主方胜 N=2: 主A +8, 次A +4, 3 抓方各 -4', () => {
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '主方' }, 2);
  assert.strictEqual(r['A'], 8);   // 2 * 2 * 2
  assert.strictEqual(r['B'], 4);   // 2 * 2
  assert.strictEqual(r['C'], -4);  // -2 * 2
  assert.strictEqual(r['D'], -4);
  assert.strictEqual(r['E'], -4);
});

test('主方胜 N=1: 主A +4, 次A +2, 3 抓方各 -2', () => {
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '主方' }, 1);
  assert.strictEqual(r['A'], 4);
  assert.strictEqual(r['B'], 2);
  assert.strictEqual(r['C'], -2);
  assert.strictEqual(r['D'], -2);
  assert.strictEqual(r['E'], -2);
});

test('主方胜 N=3: 主A +12, 次A +6, 3 抓方各 -6', () => {
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '主方' }, 3);
  assert.strictEqual(r['A'], 12);
  assert.strictEqual(r['B'], 6);
  assert.strictEqual(r['C'], -6);
  assert.strictEqual(r['D'], -6);
  assert.strictEqual(r['E'], -6);
});

test('抓方胜: 主A -2N*倍率, 次A -N*倍率, 3 抓方各 +N*倍率', () => {
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '抓方' }, 2);
  assert.strictEqual(r['A'], -8);   // -2 * 2 * 2
  assert.strictEqual(r['B'], -4);   // -2 * 2
  assert.strictEqual(r['C'], 4);
  assert.strictEqual(r['D'], 4);
  assert.strictEqual(r['E'], 4);
});

test('平局: 全 0', () => {
  const state = makeState({
    mode: '2V3_明打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: 'draw' });
  assert.deepStrictEqual(r, {});
});

// ============================================================
// §4  2V3 暗打
// ============================================================
section('4. 2V3 暗打 (倍率=1)');

test('主方胜 N=2: 主A +4, 次A +2, 3 抓方各 -2', () => {
  const state = makeState({
    mode: '2V3_暗打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '主方' }, 2);
  assert.strictEqual(r['A'], 4);   // 2 * 2 * 1
  assert.strictEqual(r['B'], 2);
  assert.strictEqual(r['C'], -2);
  assert.strictEqual(r['D'], -2);
  assert.strictEqual(r['E'], -2);
});

test('抓方胜: 主A -2N, 次A -N, 3 抓方各 +N', () => {
  const state = makeState({
    mode: '2V3_暗打',
    主方: ['A'],
    次方: 'B',
    抓方: ['C', 'D', 'E']
  });
  const r = calculateScore(state, { winner: '抓方' }, 1);
  assert.strictEqual(r['A'], -2);
  assert.strictEqual(r['B'], -1);
  assert.strictEqual(r['C'], 1);
  assert.strictEqual(r['D'], 1);
  assert.strictEqual(r['E'], 1);
});

// ============================================================
// §5  边界
// ============================================================
section('5. 边界');

test('无 mode → 空对象 (不 crash)', () => {
  const state = makeState({});
  const r = calculateScore(state, { winner: '主方' });
  assert.deepStrictEqual(r, {});
});

// ===== 汇总 =====
console.log('\n=== ' + passed + ' passed, ' + failed + ' failed ===');
if (failed > 0) {
  console.log('Failed tests:');
  for (const f of failures) {
    console.log('  - ' + f.name);
    console.log('    ' + (f.err && f.err.message ? f.err.message : f.err));
  }
  process.exit(1);
}
process.exit(0);
