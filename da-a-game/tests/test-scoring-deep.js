// tests/test-scoring-deep.js — B: 计分深度覆盖 (SKILL §11.1 / §11.2)
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
function P(id, out) { return { id: id, hand: out ? [] : [{}] }; } // out=true 表示手牌空(已出完)

// 1V4: 独打者 A, 抓方 B/C/D/E
function s1V4(mode, outMap) {
  const st = {
    mode: mode,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    次方: null,
    主方: ['A'],
    抓方: ['B', 'C', 'D', 'E'],
    players: IDS.map(id => P(id, outMap[id])),
  };
  return st;
}

// 2V3: 主A=A, 次A=D, 抓方 B/C/E
function s2V3(mode, outMap, 次方公开) {
  const st = {
    mode: mode,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    次方: 'D',
    次方公开: 次方公开 === undefined ? true : 次方公开,
    主方: ['A', 'D'],
    抓方: ['B', 'C', 'E'],
    players: IDS.map(id => P(id, outMap[id])),
  };
  return st;
}

function sum(changes) {
  return Object.keys(changes).reduce((s, k) => s + changes[k], 0);
}

// ============================================================
// 1. 总分池守恒 (SKILL §11)
// ============================================================
section('1. 总分池守恒 (所有变化之和 = 0)');

test('1.1 1V4 明打 主方胜: +64 -16*4 = 0', function () {
  const st = s1V4('1V4_明打', { A: true });
  const c = calculateScore(st, { winner: '主方' });
  assert.strictEqual(sum(c), 0, '总分池应守恒, 实际 ' + sum(c));
});

test('1.2 1V4 明打 抓方胜: -64 +16*4 = 0', function () {
  const st = s1V4('1V4_明打', { B: true });
  const c = calculateScore(st, { winner: '抓方' });
  assert.strictEqual(sum(c), 0);
});

test('1.3 1V4 暗打 主方胜: +32 -8*4 = 0', function () {
  const st = s1V4('1V4_暗打', { A: true });
  const c = calculateScore(st, { winner: '主方' });
  assert.strictEqual(sum(c), 0);
});

test('1.4 2V3 明打 主方胜 N=2: +8 +4 -4*3 = 0', function () {
  const st = s2V3('2V3_明打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 2);
  assert.strictEqual(sum(c), 0, '2N + N - 3N 应为 0');
});

test('1.5 2V3 明打 主方胜 N=3 仍守恒', function () {
  const st = s2V3('2V3_明打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 3);
  assert.strictEqual(sum(c), 0);
});

test('1.6 2V3 暗打 主方胜 N=1 守恒', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 1);
  assert.strictEqual(sum(c), 0);
});

test('1.7 2V3 抓方胜 N=1 守恒', function () {
  const st = s2V3('2V3_暗打', { B: true, C: true, E: true });
  const c = calculateScore(st, { winner: '抓方' }, 1);
  assert.strictEqual(sum(c), 0);
});

// ============================================================
// 2. 1V4 明打 / 暗打 具体数值 (SKILL §11.1)
// ============================================================
section('2. 1V4 具体数值');

test('2.1 1V4 明打 主方胜: 独打者 +64, 抓方各 -16', function () {
  const st = s1V4('1V4_明打', { A: true });
  const c = calculateScore(st, { winner: '主方' });
  assert.strictEqual(c.A, 64);
  ['B', 'C', 'D', 'E'].forEach(p => assert.strictEqual(c[p], -16, p));
});

test('2.2 1V4 明打 抓方胜: 独打者 -64, 抓方各 +16', function () {
  const st = s1V4('1V4_明打', { B: true });
  const c = calculateScore(st, { winner: '抓方' });
  assert.strictEqual(c.A, -64);
  ['B', 'C', 'D', 'E'].forEach(p => assert.strictEqual(c[p], 16, p));
});

test('2.3 1V4 暗打 主方胜: 独打者 +32, 抓方各 -8', function () {
  const st = s1V4('1V4_暗打', { A: true });
  const c = calculateScore(st, { winner: '主方' });
  assert.strictEqual(c.A, 32);
  ['B', 'C', 'D', 'E'].forEach(p => assert.strictEqual(c[p], -8, p));
});

test('2.4 1V4 暗打 抓方胜: 独打者 -32, 抓方各 +8', function () {
  const st = s1V4('1V4_暗打', { B: true });
  const c = calculateScore(st, { winner: '抓方' });
  assert.strictEqual(c.A, -32);
  ['B', 'C', 'D', 'E'].forEach(p => assert.strictEqual(c[p], 8, p));
});

test('2.5 1V4 明打 平局: 全 0 (SKILL §11.1)', function () {
  const st = s1V4('1V4_明打', { A: true, B: true });
  const c = calculateScore(st, { winner: 'draw' });
  assert.deepStrictEqual(c, {}, '平局应无任何变化');
});

test('2.6 1V4 暗打 平局: 全 0', function () {
  const st = s1V4('1V4_暗打', { A: true, B: true });
  const c = calculateScore(st, { winner: 'draw' });
  assert.deepStrictEqual(c, {});
});

// ============================================================
// 3. 2V3 N 取值全组合 (SKILL §11.2)
// ============================================================
section('3. 2V3 N 取值');

test('3.1 2V3 明打 主方胜 N=1: 主A +4, 次A +2, 抓方各 -2', function () {
  const st = s2V3('2V3_明打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 1);
  assert.strictEqual(c.A, 4, '2*1*2=4');
  assert.strictEqual(c.D, 2, '1*1*2=2');
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -2));
});

test('3.2 2V3 明打 主方胜 N=2: 主A +8, 次A +4, 抓方各 -4', function () {
  const st = s2V3('2V3_明打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 2);
  assert.strictEqual(c.A, 8);
  assert.strictEqual(c.D, 4);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -4));
});

test('3.3 2V3 明打 主方胜 N=3: 主A +12, 次A +6, 抓方各 -6', function () {
  const st = s2V3('2V3_明打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 3);
  assert.strictEqual(c.A, 12);
  assert.strictEqual(c.D, 6);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -6));
});

test('3.4 2V3 暗打 主方胜 N=1: 主A +2, 次A +1, 抓方各 -1', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 1);
  assert.strictEqual(c.A, 2, '2*1*1');
  assert.strictEqual(c.D, 1);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -1));
});

test('3.5 2V3 暗打 主方胜 N=2: 主A +4, 次A +2, 抓方各 -2', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 2);
  assert.strictEqual(c.A, 4);
  assert.strictEqual(c.D, 2);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -2));
});

test('3.6 2V3 暗打 主方胜 N=3: 主A +6, 次A +3, 抓方各 -3', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 3);
  assert.strictEqual(c.A, 6);
  assert.strictEqual(c.D, 3);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], -3));
});

test('3.7 2V3 暗打 抓方胜 N=1: 主A -2, 次A -1, 抓方各 +1', function () {
  const st = s2V3('2V3_暗打', { B: true, C: true, E: true });
  const c = calculateScore(st, { winner: '抓方' }, 1);
  assert.strictEqual(c.A, -2);
  assert.strictEqual(c.D, -1);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], 1));
});

test('3.8 2V3 暗打 抓方胜 N=2: 主A -4, 次A -2, 抓方各 +2', function () {
  const st = s2V3('2V3_暗打', { B: true, C: true, E: true });
  const c = calculateScore(st, { winner: '抓方' }, 2);
  assert.strictEqual(c.A, -4);
  assert.strictEqual(c.D, -2);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], 2));
});

test('3.9 2V3 明打 抓方胜 N=2: 主A -8, 次A -4, 抓方各 +4', function () {
  const st = s2V3('2V3_明打', { B: true, C: true, E: true });
  const c = calculateScore(st, { winner: '抓方' }, 2);
  assert.strictEqual(c.A, -8, '2*2*2');
  assert.strictEqual(c.D, -4);
  ['B', 'C', 'E'].forEach(p => assert.strictEqual(c[p], 4));
});

test('3.10 2V3 平局: 全 0 (SKILL §11.2)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: 'draw' }, 2);
  assert.deepStrictEqual(c, {}, '平局应无任何变化');
});

// ============================================================
// 4. N 未传入时默认 (SKILL 主方失败查表)
// ============================================================
section('4. N 未传入 / 缺省行为');

test('4.1 2V3 主方胜 未传 N → 自动推导 N=3 (B/C/E 都有牌)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });  // 主A+次A 空, B/C/E 都有牌
  const c = calculateScore(st, { winner: '主方' });
  // [B 重构] 原考项默认 N=1, 现改为推导: 抓方 3 人未出完 → N=3
  // 2*3*1 = 6 (主A)
  assert.strictEqual(c.A, 6, 'B 重构后 N=3: 2*3*1=6');
});

test('4.2 2V3 主方胜 N=0 → 全 0 (边界)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, 0);
  assert.strictEqual(sum(c), 0, 'N=0 时应全 0');
});

test('4.3 2V3 主方胜 N 负数 → 仍守恒 (实现不做钳制)', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  const c = calculateScore(st, { winner: '主方' }, -1);
  assert.strictEqual(sum(c), 0, 'N=-1 时 2N+N-3N 仍为 0');
});

// ============================================================
// 5. 双路径: state.主方/抓方 缺失时从 主A+次方 推导
// ============================================================
section('5. 双路径 (与 A 修复对齐)');

test('5.1 2V3 无 state.主方/抓方, 只有 主A+次方 → 仍能算', function () {
  const st = s2V3('2V3_暗打', { A: true, D: true });
  delete st.主方; delete st.抓方;
  const c = calculateScore(st, { winner: '主方' }, 2);
  // 若实现依赖 主方[0]/抓方, 这里会 crash 或返回 {}
  assert.strictEqual(c.A, 4, '应能从 主A 推导主方');
});

test('5.2 1V4 无 state.主方/抓方 → 仍能算', function () {
  const st = s1V4('1V4_明打', { A: true });
  delete st.主方; delete st.抓方;
  const c = calculateScore(st, { winner: '主方' });
  assert.strictEqual(c.A, 64, '应能从 主A 推导独打者');
});

test('5.3 1V4 无 state.主方/抓方 抓方胜 → 仍能算', function () {
  const st = s1V4('1V4_明打', { B: true });
  delete st.主方; delete st.抓方;
  const c = calculateScore(st, { winner: '抓方' });
  assert.strictEqual(c.A, -64);
});

// ============================================================
// 6. 非法输入防御
// ============================================================
section('6. 非法输入防御');

test('6.1 state 为 null → 返回 {}', function () {
  const c = calculateScore(null, { winner: '主方' }, 1);
  assert.deepStrictEqual(c, {});
});

test('6.2 state 无 mode → 返回 {}', function () {
  const c = calculateScore({ players: [] }, { winner: '主方' }, 1);
  assert.deepStrictEqual(c, {});
});

test('6.3 result 为 undefined → 返回 {}', function () {
  const st = s1V4('1V4_明打', { A: true });
  const c = calculateScore(st, undefined, 1);
  assert.deepStrictEqual(c, {}, '无 result 应无变化');
});

test('6.4 winner 为未知字符串 → 返回 {} (不 crash)', function () {
  const st = s1V4('1V4_明打', { A: true });
  const c = calculateScore(st, { winner: 'UNKNOWN' }, 1);
  assert.deepStrictEqual(c, {});
});

test('6.5 未知 mode → 返回 {}', function () {
  const st = s1V4('WEIRD', { A: true });
  const c = calculateScore(st, { winner: '主方' }, 1);
  assert.deepStrictEqual(c, {});
});

console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(failed > 0 ? 1 : 0);