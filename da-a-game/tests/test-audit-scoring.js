// tests/audit-scoring.js — 自主审查: 计分公式 §11 逐项核对
var { calculateScore } = require('../src/scoring.js');
var { camps } = require('../src/util.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function P(id, n) { return { id: id, hand: new Array(n).fill({ id: id + 'x' }), 底牌: null }; }

function mkState(mode, opts) {
  var o = opts || {};
  var 主方 = o.主方 || ['A'];
  var 抓方 = o.抓方 || ['B', 'C', 'D', 'E'];
  var sizes = o.sizes || { A: 0, B: 5, C: 5, D: 5, E: 5 };
  var players = ['A', 'B', 'C', 'D', 'E'].map(function (id) { return P(id, sizes[id] || 0); });
  return {
    phase: 'GAME_END', mode: mode,
    主A: { suit: 'H', establishedBy: 主方[0], viaMethod: 'FORCED_CHECK' },
    次方: o.次方 !== undefined ? o.次方 : (主方[1] || null),
    次方公开: !!o.次方公开,
    主方: 主方, 抓方: 抓方,
    table: [], discarded: [], players: players, passedPlayers: [], passCount: 0
  };
}

function eq(name, actual, expected) {
  var a = JSON.stringify(actual), b = JSON.stringify(expected);
  check(name, a === b, 'actual=' + a + ' expected=' + b);
}

// ================= §11.1 1V4 =================
section('1. §11.1 1V4 独打 (倍率 4 / 2)');

eq('1.1 明打·独打者胜: 主方+64, 4抓方各-16',
  calculateScore(mkState('1V4_明打'), { winner: '主方' }),
  { A: 64, B: -16, C: -16, D: -16, E: -16 });

eq('1.2 明打·抓方胜: 主方-64, 4抓方各+16',
  calculateScore(mkState('1V4_明打'), { winner: '抓方' }),
  { A: -64, B: 16, C: 16, D: 16, E: 16 });

eq('1.3 暗打·独打者胜: 主方+32, 4抓方各-8',
  calculateScore(mkState('1V4_暗打'), { winner: '主方' }),
  { A: 32, B: -8, C: -8, D: -8, E: -8 });

eq('1.4 暗打·抓方胜: 主方-32, 4抓方各+8',
  calculateScore(mkState('1V4_暗打'), { winner: '抓方' }),
  { A: -32, B: 8, C: 8, D: 8, E: 8 });

eq('1.5 明打·平局: 全 0 变更',
  calculateScore(mkState('1V4_明打'), { winner: 'draw' }), {});

eq('1.6 暗打·平局: 全 0 变更',
  calculateScore(mkState('1V4_暗打'), { winner: 'draw' }), {});

// 零和检查
section('1b. 零和校验 (总分池=0)');
[['1V4_明打', '主方'], ['1V4_明打', '抓方'], ['1V4_暗打', '主方'], ['1V4_暗打', '抓方']].forEach(function (p) {
  var ch = calculateScore(mkState(p[0]), { winner: p[1] });
  var sum = Object.keys(ch).reduce(function (a, k) { return a + ch[k]; }, 0);
  check(p[0] + ' ' + p[1] + ' 总分=0', sum === 0, 'sum=' + sum);
});

// ================= §11.2 2V3 =================
section('2. §11.2 2V3 (暗打倍率1 / 明打倍率2)');

// 2V3 暗打·主方胜·N=2
eq('2.1 暗打·主方胜 N=2: 主A+4, 次A+2, 抓方各-2',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 0, B: 5, C: 5, D: 0, E: 0 } }), { winner: '主方' }, 2),
  { A: 4, D: 2, B: -2, C: -2, E: -2 });

// 2V3 明打·主方胜·N=2 (倍率2)
eq('2.2 明打·主方胜 N=2: 主A+8, 次A+4, 抓方各-4',
  calculateScore(mkState('2V3_明打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', 次方公开: true, sizes: { A: 0, B: 5, C: 5, D: 0, E: 0 } }), { winner: '主方' }, 2),
  { A: 8, D: 4, B: -4, C: -4, E: -4 });

// 2V3 暗打·主方失败·N 查表
// 主A 未出完, 次A 已出完 → N=2
eq('2.3 暗打·主方败 N=2 (主A未出完/次A已出完)',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 3, B: 0, C: 0, D: 0, E: 0 } }), { winner: '抓方' }),
  { A: -4, D: -2, B: 2, C: 2, E: 2 });

// 主A 已出完, 次A 未出完 → N=1
eq('2.4 暗打·主方败 N=1 (主A已出完/次A未出完)',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 0, B: 0, C: 0, D: 3, E: 0 } }), { winner: '抓方' }),
  { A: -2, D: -1, B: 1, C: 1, E: 1 });

// 主A 未出完, 次A 未出完 → N=3
eq('2.5 暗打·主方败 N=3 (主A/次A均未出完)',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 3, B: 0, C: 0, D: 3, E: 0 } }), { winner: '抓方' }),
  { A: -6, D: -3, B: 3, C: 3, E: 3 });

eq('2.6 2V3·平局: 全 0',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D' }), { winner: 'draw' }), {});

// 2V3 零和
section('2b. 2V3 零和校验');
[
  ['2V3_暗打', '主方', 2, { A: 0, B: 5, C: 5, D: 0, E: 0 }],
  ['2V3_暗打', '抓方', 3, { A: 3, B: 0, C: 0, D: 3, E: 0 }],
  ['2V3_明打', '主方', 2, { A: 0, B: 5, C: 5, D: 0, E: 0 }],
  ['2V3_明打', '抓方', 1, { A: 0, B: 0, C: 0, D: 3, E: 0 }]
].forEach(function (p) {
  var st = mkState(p[0], { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', 次方公开: p[0] === '2V3_明打', sizes: p[3] });
  var ch = calculateScore(st, { winner: p[1] }, p[2]);
  var sum = Object.keys(ch).reduce(function (a, k) { return a + ch[k]; }, 0);
  check(p[0] + ' ' + p[1] + ' N=' + p[2] + ' 总分=0', sum === 0, 'sum=' + sum + ' ch=' + JSON.stringify(ch));
});

// ================= §11.2 N 自动推导 =================
section('3. §11.2 N 自动推导 (不传 n 时从 state 推导)');

// 主方胜: N = 抓方未出完人数
eq('3.1 主方胜 N 自动推导 = 抓方未出完数(1: 仅B未出完)',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 0, B: 5, C: 0, D: 0, E: 0 } }), { winner: '主方' }),
  { A: 2, D: 1, B: -1, C: -1, E: -1 });

eq('3.1b 主方胜 N 自动推导 = 抓方未出完数(2: B/E未出完)',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 0, B: 5, C: 0, D: 0, E: 5 } }), { winner: '主方' }),
  { A: 4, D: 2, B: -2, C: -2, E: -2 });

eq('3.1c 主方胜 N 自动推导 = 抓方未出完数(3: 全部未出完)',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 0, B: 5, C: 5, D: 0, E: 5 } }), { winner: '主方' }),
  { A: 6, D: 3, B: -3, C: -3, E: -3 });

// 退化: 抓方全出完时游戏按 §10.1 已结束, N=0 → 无实际分差 (全 0 或 {} 均可)
var z = calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 0, B: 0, C: 0, D: 0, E: 0 } }), { winner: '主方' });
var zSum = Object.keys(z).reduce(function (a, k) { return a + z[k]; }, 0);
check('3.1d 退化 N=0 → 总分差0', zSum === 0, 'sum=' + zSum);

eq('3.2 主方胜 N 自动推导 = 抓方未出完数(3)',
  calculateScore(mkState('2V3_暗打', { 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'], 次方: 'D', sizes: { A: 0, B: 5, C: 5, D: 0, E: 5 } }), { winner: '主方' }),
  { A: 6, D: 3, B: -3, C: -3, E: -3 });

// 边界: mode 缺失 / 未知
section('4. 边界与鲁棒性');
eq('4.1 无 mode → {}', calculateScore({ players: [] }, { winner: '主方' }), {});
eq('4.2 null state → {}', calculateScore(null, { winner: '主方' }), {});
eq('4.3 未知 mode → {}', calculateScore(mkState('9V9_明打'), { winner: '主方' }), {});
eq('4.4 无 winner → {}', calculateScore(mkState('1V4_明打'), {}), {});

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);