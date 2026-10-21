// tests/test-combos.js — candidateCombos 枚举 + 引擎裁决回归
// 覆盖: 用户报告的 10JQ (连张) / 33333 (5张大蛋子管单大A) + 对子回退
var { candidateCombos } = require('../src/combos.js');
var { identifyHand, HAND_TYPES, canBeat } = require('../src/hand-types.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var n = 0;
function C(s, r) { n++; return createNormalCard(s, r, 'c' + n); }
function BigA(s) { var c = createNormalCard(s, 14, 'b' + (++n)); c.is主方大A = true; return c; }
function ids(cards) { return cards.map(function (c) { return c.id; }); }

// 模拟 doPlay 回退: 枚举候选 -> 引擎裁决 -> 取第一个 ok
function fallbackPlay(tableCards, handCards) {
  var st = {
    phase: PHASES.PLAY, mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'B' }, 次方: 'C', 次方公开: true,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], 底牌公开: true,
    table: tableCards.slice(), discarded: [], passedPlayers: [], passCount: 0,
    lastPlayer: 'B', 推风触发者: null, actions: [],
    players: [
      { id: 'A', hand: handCards.slice(), 底牌: null },
      { id: 'B', hand: [C('H', 2)], 底牌: null },
      { id: 'C', hand: [C('H', 2)], 底牌: null },
      { id: 'D', hand: [C('H', 2)], 底牌: null },
      { id: 'E', hand: [C('H', 2)], 底牌: null }
    ]
  };
  var cands = candidateCombos(handCards);
  for (var i = 0; i < cands.length; i++) {
    var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: cands[i].slice() } });
    if (r.ok) {
      var cards = cands[i].map(function (id) {
        return handCards.filter(function (c) { return c.id === id; })[0];
      }).filter(Boolean);
      return { ok: true, type: identifyHand(cards).type, cards: cards, n: cands[i].length };
    }
  }
  return { ok: false };
}

// ================= 1. §6.4 单大A 压制规则 (用户报告: 33333 管大A) =================
section('1. §6.4 5/6 张同点大蛋子能管单大A');

{
  var singleBigA = identifyHand([BigA('H')]);
  [5, 6].forEach(function (cnt) {
    var cards = [];
    for (var i = 0; i < cnt; i++) cards.push(C('H', 3));
    check('1.' + cnt + ' 33333(' + cnt + '张) 能管单大A',
      canBeat(identifyHand(cards), singleBigA) === true, 'count=' + cnt);
  });
  [4].forEach(function (cnt) {
    var cards = [];
    for (var i = 0; i < cnt; i++) cards.push(C('H', 3));
    check('1.' + cnt + ' ' + cnt + '张大蛋子 不能管单大A (§6.4 明文)',
      canBeat(identifyHand(cards), singleBigA) === false, 'count=' + cnt);
  });
  // 不要求是大A牌
  var five3 = [C('H', 3), C('D', 3), C('C', 3), C('S', 3), C('H', 3)];
  check('1.7 规则不要求是大A牌 (33333 即可)',
    canBeat(identifyHand(five3), singleBigA) === true);
  // 4 张大A 也不能管 (规则看张数, 不看是否大A)
  var fourBigA = [BigA('H'), BigA('H'), BigA('H'), BigA('H')];
  check('1.8 4 张大A 也不能管单大A',
    canBeat(identifyHand(fourBigA), singleBigA) === false);
  // 蛋子/对子/龙 仍不能管
  check('1.9 蛋子不能管单大A', canBeat(identifyHand([C('H',3),C('D',3),C('C',3)]), singleBigA) === false);
  check('1.10 对子不能管单大A', canBeat(identifyHand([C('H',3),C('D',3)]), singleBigA) === false);
  // 双王/三王/四王 可以
  check('1.11 双王能管单大A',
    canBeat(identifyHand([createBigJoker('j1'), createSmallJoker('s1')]), singleBigA) === true);
}

// ================= 2. 枚举函数基本行为 =================
section('2. candidateCombos 枚举');

{
  check('2.1 空手牌 -> 空数组', candidateCombos([]).length === 0);
  var hand = [C('H', 13), C('D', 13), C('C', 7)];
  var combos = candidateCombos(hand);
  var hasPair = combos.some(function (c) { return c.length === 2; });
  check('2.2 手上有对子 -> 枚举出 2 张组合', hasPair);
  var allInHand = combos.every(function (c) {
    return c.every(function (id) { return hand.some(function (x) { return x.id === id; }); });
  });
  check('2.3 所有组合都是手牌内的实体 ID', allInHand);
}

// ================= 3. 用户报告: 10JQ 连张 =================
section('3. 回退能出连张 10JQ');

{
  var table = [C('S', 3), C('H', 4), C('D', 5)];   // 345 连张
  var hand = [C('S', 10), C('C', 11), C('D', 12), C('H', 8)];
  var r = fallbackPlay(table, hand);
  check('3.1 桌上有345, 手上有10JQ -> 回退能出',
    r.ok === true, JSON.stringify(r));
  if (r.ok) {
    check('3.2 出的是连张', r.type === HAND_TYPES.STRAIGHT, 'type=' + r.type);
    check('3.3 张数为 3', r.n === 3, 'n=' + r.n);
  }
}

{
  // 空桌时应能出连张
  var hand = [C('S', 10), C('C', 11), C('D', 12)];
  var r = fallbackPlay([], hand);
  check('3.4 空桌 + 手上有10JQ -> 能出', r.ok === true && r.type === HAND_TYPES.STRAIGHT,
    JSON.stringify(r));
}

// ================= 4. 用户报告: 33333 管单大A =================
section('4. 回退能出 5 张大蛋子压单大A');

{
  var bigA = BigA('H');
  var table = [bigA];                             // 桌面: 单大A
  var hand = [C('H', 3), C('D', 3), C('C', 3), C('S', 3), C('C', 3), C('H', 9)];
  var r = fallbackPlay(table, hand);
  check('4.1 桌上有单大A, 手上有5张3 -> 回退能出',
    r.ok === true, JSON.stringify(r));
  if (r.ok) {
    check('4.2 出的是大蛋子', r.type === HAND_TYPES.BIG_TRIPLE, 'type=' + r.type);
    check('4.3 张数为 5', r.n === 5, 'n=' + r.n);
  }
}

// ================= 5. 对子回退 (此前声称修过但未落盘) =================
section('5. 对子回退');

{
  var table = [C('S', 10), C('H', 10)];            // 桌上有对10
  var hand = [C('S', 3), C('C', 3), C('D', 7), C('H', 9)];   // 手上有对3
  var r = fallbackPlay(table, hand);
  check('5.1 桌上有对10, 手上有对3 -> 回退出对3',
    r.ok === true && r.type === HAND_TYPES.PAIR, JSON.stringify(r));
}

{
  // 3 > A > K, 对K 压不了对3 -> 应回退失败(无可出)
  var table = [C('S', 3), C('H', 3)];
  var hand = [C('S', 13), C('C', 13), C('D', 7)];
  var combos = candidateCombos(hand);
  var pairFound = combos.some(function (c) {
    var cards = c.map(function (id) { return hand.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    return c.length === 2 && canBeat(identifyHand(cards), identifyHand(table));
  });
  check('5.2 对K 不能压对3 (§6.2: 3 > K)', pairFound === false);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);