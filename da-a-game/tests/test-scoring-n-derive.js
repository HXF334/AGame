// tests/test-scoring-n-derive.js — B: SKILL §11.2 N 自动推导测试
const assert = require('assert');
const { calculateScore } = require('../src/scoring.js');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

const IDS = ['A', 'B', 'C', 'D', 'E'];
function P(id, out) { return { id: id, hand: out ? [] : [{ id: 'x' + id, suit: 'S', rank: 5 }] }; }

// 构造 2V3 state (主A=A, 次A=D, 抓方=B/C/E)
function s2V3(mode, outMap, 次方公开) {
  return {
    mode: mode,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    次方: 'D',
    次方公开: 次方公开 === undefined ? true : 次方公开,
    主方: ['A', 'D'],
    抓方: ['B', 'C', 'E'],
    players: IDS.map(id => P(id, outMap[id]))
  };
}

function sum(c) { return Object.keys(c).reduce((s, k) => s + c[k], 0); }

// ============================================================
// 1. 主方胜 N 推导 (动态: 抓方未出完人数)
// ============================================================
section('1. 主方胜 N 推导');

test('1.1 主A+次A 都空, 3 抓方都还有牌 → N=3 (暗打)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  // B/C/E 都有牌
  const c = calculateScore(st, { winner: '主方' });
  // N=3, 倍率=1: 主A +6, 次A +3, 抓方各 -3
  assert.strictEqual(c.A, 6, '主A = 2*3*1');
  assert.strictEqual(c.D, 3, '次A = 3*1');
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -3, p + ' = -3'));
});

test('1.2 主A+次A 都空, 1 抓方空 → N=2 (§11.2 阵营计分, B 出完也得 -2)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true, B: true });  // B 空, C/E 还有
  const c = calculateScore(st, { winner: '主方' });
  // N=2: 主A +4, 次A +2; 所有 3 抓方各 -2
  assert.strictEqual(c.A, 4);
  assert.strictEqual(c.D, 2);
  assert.strictEqual(c.B, -2, 'B 在抓方阵营, 出完也得扣');
  assert.strictEqual(c.C, -2);
  assert.strictEqual(c.E, -2);
});

test('1.3 主A+次A 都空, 2 抓方空 → N=1 (所有抓方各 -1)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true, B: true, C: true });
  const c = calculateScore(st, { winner: '主方' });
  // N=1: 主A +2, 次A +1; 所有 3 抓方各 -1 (B/C 空但仍扣)
  assert.strictEqual(c.A, 2);
  assert.strictEqual(c.D, 1);
  assert.strictEqual(c.B, -1);
  assert.strictEqual(c.C, -1);
  assert.strictEqual(c.E, -1);
});

test('1.4 主方胜 3 抓方都空 → N=0 → 全 0', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true, B: true, C: true, E: true });
  const c = calculateScore(st, { winner: '主方' });
  assert.strictEqual(sum(c), 0);
});

// ============================================================
// 2. 主方失败 N 查表
// ============================================================
section('2. 主方失败 N 查表 (§11.2 表)');

test('2.1 主A 未出完, 次A 已出完 → N=2', function () {
  // A 还有牌, D 空
  const st = s2V3('2V3_暗打', { D: true });
  const c = calculateScore(st, { winner: '抓方' });
  // N=2, 抓方胜: 主A -4, 次A -2, 抓方各 +2
  assert.strictEqual(c.A, -4, '主A = -2*2*1');
  assert.strictEqual(c.D, -2, '次A = -2*1');
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], 2));
});

test('2.2 主A 已出完, 次A 未出完 → N=1', function () {
  // A 空, D 还有牌
  const st = s2V3('2V3_暗打', { A: true });
  const c = calculateScore(st, { winner: '抓方' });
  assert.strictEqual(c.A, -2, '主A = -2*1*1');
  assert.strictEqual(c.D, -1, '次A = -1*1');
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], 1));
});

test('2.3 主A 未出完, 次A 未出完 → N=3', function () {
  // A 还有牌, D 还有牌
  const st = s2V3('2V3_暗打', {});
  const c = calculateScore(st, { winner: '抓方' });
  assert.strictEqual(c.A, -6);
  assert.strictEqual(c.D, -3);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], 3));
});

// ============================================================
// 3. 明打倍率差异
// ============================================================
section('3. 明打/暗打 倍率差异');

test('3.1 主方胜 暗打 N=2 → 总分池守恒', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' });
  assert.strictEqual(sum(c), 0, '总分池应守恒');
});

test('3.2 主方胜 明打 (3 抓方都有牌) → N=3 倍率×2 → 总分池守恒', function () {
  const st = s2V3('2V3_明打', { A: true, D: true });  // B/C/E 都有牌 → N=3
  const c = calculateScore(st, { winner: '主方' });
  // N=3, 倍率=2: 主A +12, 次A +6, 抓方各 -6
  assert.strictEqual(c.A, 12);
  assert.strictEqual(c.D, 6);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -6));
  assert.strictEqual(sum(c), 0);
});

// ============================================================
// 4. 显式 n 仍可覆盖自动推导 (向后兼容)
// ============================================================
section('4. 向后兼容: 显式 n 仍生效');

test('4.1 显式 n=1 覆盖主方胜 默认推导 → 结果同 N=1', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c1 = calculateScore(st, { winner: '主方' });  // 自动 (B/C/E 都有牌 -> N=3)
  const c2 = calculateScore(st, { winner: '主方' }, 1);  // 显式 N=1
  assert.deepStrictEqual(c2, {
    A: 2 * 1 * 1,
    D: 1 * 1,
    B: -1, C: -1, E: -1
  });
  // c1 应该用 N=3
  assert.strictEqual(c1.A, 6);
  assert.strictEqual(c1.D, 3);
});

test('4.2 显式 n=0 → 全 0', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 0);
  assert.strictEqual(sum(c), 0);
});

// ============================================================
// 5. 边界
// ============================================================
section('5. 边界');

test('5.1 winner=draw → 空对象 (不调 autoDeriveN)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: 'draw' });
  assert.deepStrictEqual(c, {});
});

test('5.2 state 无主A → autoDeriveN 返回 1 (不 crash)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  delete st.主A;
  const c = calculateScore(st, { winner: '主方' });
  // 回退用 state.主方 数组 (['A','D'])
  // N 推导: 看 state.players, 主方[0]=A 空, [1]=D 空 → N = 抓方未空数
  // 应不 crash, 有结果
  assert.ok(c, '应返回结果');
  assert.strictEqual(typeof c.A, 'number');
});

test('5.3 state.players 缺失 → 回退 N=1, 不 crash', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  delete st.players;
  const c = calculateScore(st, { winner: '主方' });
  assert.ok(c, '应返回结果不崩溃');
});

test('5.4 主方获胜 双方都空但 state 主A 缺失 → 走 camps(state), 不 crash', function () {
  const st = {
    mode: '2V3_暗打',
    次方: 'D',
    主方: ['A', 'D'],
    抓方: ['B', 'C', 'E'],
    players: [{ id: 'A', hand: [] }, { id: 'B', hand: [{ id: 'b' }] }, { id: 'C', hand: [{ id: 'c' }] }, { id: 'D', hand: [] }, { id: 'E', hand: [{ id: 'e' }] }]
    // no 主A field
  };
  const c = calculateScore(st, { winner: '主方' });
  // camps() 回退用 state.主方 = ['A','D'], A/D 空, B/C/E 都有牌 → N=3
  assert.strictEqual(c.A, 6, '主A +6');
  assert.strictEqual(c.D, 3, '次A +3');
  assert.strictEqual(c.B, -3);
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(failed > 0 ? 1 : 0);