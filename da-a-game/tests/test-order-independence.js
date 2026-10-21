// tests/test-order-independence.js — 回归: 牌型识别必须与传入顺序无关 (2026-10-21 P0)
// 根因: play.js handlePlay 用 player.hand.filter(...) 取牌, 会按【手牌存储顺序】
//       重排, 丢弃调用方给的顺序; 而 isValidStraight / isValidDoubleStraight
//       原本逐位比较 cards[i+1].rank === cards[i].rank + 1, 隐含"已按点数升序"。
//       结果: 玩家手牌若不是点数升序, 连张/双龙永远打不出来 (INVALID_HAND)。
var assert = require('assert');
var { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');
var { identifyHand, canBeat, HAND_TYPES } = require('../src/hand-types.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var n = 0;
function C(s, r) { return createNormalCard(s, r, 'c' + (++n)); }
function BJ() { return createBigJoker('j' + (++n)); }
function SJ() { return createSmallJoker('s' + (++n)); }

// 按给定顺序构造牌
function seq(specs) { return specs.map(function (s) { return C(s[0], s[1]); }); }

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  var out = [];
  arr.forEach(function (x, i) {
    var rest = arr.slice(0, i).concat(arr.slice(i + 1));
    permutations(rest).forEach(function (p) { out.push([x].concat(p)); });
  });
  return out;
}

// ================= 1. 连张: 所有排列都识别为 STRAIGHT =================
section('1. 连张与传入顺序无关');

[
  { name: '1.1 3-4-5', specs: [['S', 3], ['H', 4], ['D', 5]], type: HAND_TYPES.STRAIGHT },
  { name: '1.2 7-8-9-10', specs: [['S', 7], ['H', 8], ['D', 9], ['C', 10]], type: HAND_TYPES.STRAIGHT },
  { name: '1.3 Q-K-A (高端 A)', specs: [['S', 12], ['H', 13], ['D', 14]], type: HAND_TYPES.STRAIGHT },
  { name: '1.4 A-2-3 (低端 A)', specs: [['S', 14], ['H', 2], ['D', 3]], type: HAND_TYPES.STRAIGHT },
  { name: '1.5 双龙 4-4-5-5-6-6', specs: [['S', 4], ['H', 4], ['D', 5], ['C', 5], ['S', 6], ['H', 6]], type: HAND_TYPES.DOUBLE_STRAIGHT },
  { name: '1.6 双龙 10-10-J-J-Q-Q', specs: [['S', 10], ['H', 10], ['D', 11], ['C', 11], ['S', 12], ['H', 12]], type: HAND_TYPES.DOUBLE_STRAIGHT }
].forEach(function (t) {
  var base = seq(t.specs);
  var perms = permutations(base);
  var bad = [];
  perms.forEach(function (p) {
    var id = identifyHand(p);
    if (id.type !== t.type) bad.push(id.type);
  });
  check(t.name + ' 全部 ' + perms.length + ' 种排列都识别为 ' + t.type,
    bad.length === 0, '错误类型: ' + Array.from(new Set(bad)).join(','));
});

// ================= 2. 非法组合在乱序下仍应非法 =================
section('2. 非法组合乱序下仍非法 (不能因排序而误判为合法)');

[
  { name: '2.1 4-4-5 (重复点数非连张)', specs: [['S', 4], ['H', 4], ['D', 5]], bad: HAND_TYPES.STRAIGHT },
  { name: '2.2 5-5-4-4 (双龙但不成对)', specs: [['S', 5], ['H', 5], ['D', 4], ['C', 4]], bad: HAND_TYPES.DOUBLE_STRAIGHT },
  { name: '2.3 K-A-2 (§6.1 不允许)', specs: [['S', 13], ['H', 14], ['D', 2]], bad: HAND_TYPES.STRAIGHT },
  { name: '2.4 3-5-7 (跳号)', specs: [['S', 3], ['H', 5], ['D', 7]], bad: HAND_TYPES.STRAIGHT }
].forEach(function (t) {
  var base = seq(t.specs);
  var perms = permutations(base);
  var leaked = [];
  perms.forEach(function (p) {
    var id = identifyHand(p);
    if (id.type === t.bad) leaked.push(1);
  });
  check(t.name + ' 任何排列都不得识别为 ' + t.bad,
    leaked.length === 0, '泄漏 ' + leaked.length + ' / ' + perms.length + ' 种排列');
});

// ================= 3. 端到端: 乱序手牌也能出连张 =================
section('3. 端到端 — 手牌存储顺序不影响出牌');

function mkState(handCards, table) {
  return {
    phase: PHASES.PLAY, mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'B' }, 次方: 'C', 次方公开: true,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], 底牌公开: true,
    table: table.slice(), discarded: [], passedPlayers: [], passCount: 0,
    lastPlayer: 'B', 推风触发者: null, actions: [],
    players: [
      { id: 'A', hand: handCards.slice(), 底牌: null },
      { id: 'B', hand: [C('H', 3)], 底牌: null },
      { id: 'C', hand: [C('H', 3)], 底牌: null },
      { id: 'D', hand: [C('H', 3)], 底牌: null },
      { id: 'E', hand: [C('H', 3)], 底牌: null }
    ]
  };
}

{
  // 手牌乱序: 9, 7, 8 (非升序), 想出 7-8-9 连张
  var hand = [C('S', 9), C('H', 7), C('D', 8)];
  var ids = hand.map(function (c) { return c.id; });
  var st = mkState(hand, []);
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: ids } });
  check('3.1 空桌 + 乱序手牌(9,7,8) -> 出连张被引擎接受',
    r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
}

{
  // 压一个已有的连张: 桌上有 3-4-5, 手牌乱序 10,9,8 -> 应能出 8-9-10
  var hand = [C('S', 10), C('H', 8), C('D', 9)];
  var ids = hand.map(function (c) { return c.id; });
  var table = [C('S', 3), C('H', 4), C('D', 5)];
  var st = mkState(hand, table);
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: ids } });
  check('3.2 桌上有345 + 乱序手牌(10,8,9) -> 出8-9-10被接受',
    r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
}

{
  // 双龙乱序
  var hand = [C('S', 7), C('H', 5), C('D', 6), C('C', 6), C('S', 5), C('H', 7)];
  var ids = hand.map(function (c) { return c.id; });
  var st = mkState(hand, []);
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: ids } });
  check('3.3 空桌 + 乱序手牌(7,5,6,6,5,7) -> 出双龙被接受',
    r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);