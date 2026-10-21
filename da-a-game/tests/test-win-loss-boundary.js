// tests/_fix_B_1v4.js — B: 1V4 暗打 平局边界 (SKILL §10.3 第三种)
const fs = require('fs');
const assert = require('assert');
const { transition, PHASES, ACTIONS } = require('../src/index.js');
const { checkGameEnd } = require('../src/win-loss.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '  ' + (e && e.message)); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function card(suit, rank) {
  return { id: suit + rank, suit: suit, rank: rank, isBigJoker: false, isSmallJoker: false, is主方大A: false, location: { type: 'hand' } };
}
function mk(hand, id) { return { id: id, hand: hand, 底牌: null }; }

// SKILL §10.3 三种情况
section('B. 1V4 暗打 三种情况 (§10.3)');

test('B.1 独打者先出完 → 主方胜', function () {
  var s = {
    mode: '1V4_暗打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'A',
    players: [mk([], 'A'), mk([card('D', 5)], 'B'), mk([card('D', 6)], 'C'), mk([card('D', 7)], 'D'), mk([card('D', 8)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方', '应主方胜');
});

test('B.2 4 抓方全出完 独打者未出完 → 抓方胜', function () {
  var s = {
    mode: '1V4_暗打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([], 'C'), mk([], 'D'), mk([], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方', '应抓方胜');
});

test('B.3 抓方有人先出完 + 独打者也出完 + 仍有抓方未出完 → 平局', function () {
  // 头名 = B (抓方, 先出完); 独打者 A 也出完; C/D/E 仍有牌
  var s = {
    mode: '1V4_暗打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([], 'A'), mk([], 'B'), mk([card('D', 5)], 'C'), mk([card('D', 6)], 'D'), mk([card('D', 7)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, 'draw', '应平局');
});

test('B.4 边界: 只有 1 个抓方未出完 (其余全空) + 独打者也空 → 平局', function () {
  var s = {
    mode: '1V4_暗打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([], 'A'), mk([], 'B'), mk([], 'C'), mk([], 'D'), mk([card('D', 5)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, 'draw', '应平局 (仍有人未出完)');
});

test('B.5 独打者未出完 + 有抓方全空 → 抓方胜 (不是平局)', function () {
  var s = {
    mode: '1V4_暗打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([], 'C'), mk([], 'D'), mk([], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方', '应抓方胜 (4 抓方全空)');
});

test('B.6 中间态: 独打者和抓方都未出完 → 不结束', function () {
  var s = {
    mode: '1V4_暗打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([card('D', 6)], 'C'), mk([card('D', 7)], 'D'), mk([card('D', 8)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, false, '不应结束');
});

section('B2. 2V3 头末规则 (A 修复验证)');

test('B2.1 抓方先出完 (头名在抓方) → 抓方胜 (不是平局)', function () {
  // 用户报告的 bug 场景: 主A=A, 次A=D; B 先出完 → 应抓方胜
  var s = {
    mode: '2V3_暗打',
    次方: 'D',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([card('D', 6)], 'C'), mk([card('D', 7)], 'D'), mk([card('D', 8)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, false, '抓方未全空, 不该结束 (C/E 还有牌)');
});

test('B2.2 抓方全空 (头名 B 在抓方) → 抓方胜', function () {
  var s = {
    mode: '2V3_暗打',
    次方: 'D',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([], 'C'), mk([card('D', 7)], 'D'), mk([], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true, '抓方全空 → 立即结算 (SKILL §10.1)');
  assert.strictEqual(r.winner, '抓方', '头名 B 在抓方 → 抓方胜');
});

test('B2.3 主方全空 (头名在主方) → 主方胜', function () {
  var s = {
    mode: '2V3_暗打',
    次方: 'D',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'D',
    players: [mk([], 'A'), mk([card('D', 5)], 'B'), mk([card('D', 6)], 'C'), mk([], 'D'), mk([card('D', 7)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方', '主方全空 + 头名在主方 → 主方胜');
});

test('B2.4 主方全空 (头名在抓方) → 平局', function () {
  var s = {
    mode: '2V3_暗打',
    次方: 'D',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([], 'A'), mk([], 'B'), mk([card('D', 6)], 'C'), mk([], 'D'), mk([card('D', 7)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, 'draw', '主方全空 + 头名在抓方 → 平局');
});

test('B2.5 抓方全空 (头名在主方) → 平局', function () {
  var s = {
    mode: '2V3_暗打',
    次方: 'D',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'A',
    players: [mk([], 'A'), mk([], 'B'), mk([], 'C'), mk([card('D', 7)], 'D'), mk([], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, 'draw', '抓方全空 + 头名在主方 → 平局');
});

test('B2.6 抓方全空 (头名在抓方) → 抓方胜', function () {
  var s = {
    mode: '2V3_暗打',
    次方: 'D',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([], 'C'), mk([card('D', 7)], 'D'), mk([], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方', '抓方全空 + 头名在抓方 → 抓方胜');
});

test('B2.7 双方都有牌 → 不结束', function () {
  var s = {
    mode: '2V3_暗打',
    次方: 'D',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([card('D', 6)], 'C'), mk([card('D', 7)], 'D'), mk([card('D', 8)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, false, '双方都有牌, 不该结束');
});

section('B3. 1V4 明打');

test('B3.1 1V4 明打 第一个人出完即结束 → 头名阵营胜', function () {
  var s = {
    mode: '1V4_明打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'A',
    players: [mk([], 'A'), mk([card('D', 5)], 'B'), mk([card('D', 6)], 'C'), mk([card('D', 7)], 'D'), mk([card('D', 8)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '主方', '头名 A (独打者) → 主方胜');
});

test('B3.2 1V4 明打 抓方先出完 → 抓方胜', function () {
  var s = {
    mode: '1V4_明打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: 'B',
    players: [mk([card('D', 5)], 'A'), mk([], 'B'), mk([card('D', 6)], 'C'), mk([card('D', 7)], 'D'), mk([card('D', 8)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, true);
  assert.strictEqual(r.winner, '抓方', '头名 B (抓方) → 抓方胜');
});

test('B3.3 1V4 明打 都没出完 → 不结束', function () {
  var s = {
    mode: '1V4_明打', 次方: null,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'LIANG_A' },
    头名: null,
    players: [mk([card('D', 5)], 'A'), mk([card('D', 5)], 'B'), mk([card('D', 6)], 'C'), mk([card('D', 7)], 'D'), mk([card('D', 8)], 'E')]
  };
  var r = checkGameEnd(s);
  assert.strictEqual(r.ended, false, '没人出完, 不该结束');
});

console.log('\ntotal: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
process.exit(failed > 0 ? 1 : 0);
