// tests/test-ai-lead-combo.js — AI 起手可打廉价组合 (解除连张结构性死锁)
// 背景: §6.3 龙/对子/单张同层级互不压, 连张只能压等长连张。
//   旧版 AI 起手永远出单张 -> 桌上永远无连张 -> AI 永远打不出连张。
var { chooseAction } = require('../src/ai.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { identifyHand, HAND_TYPES } = require('../src/hand-types.js');
var { createNormalCard } = require('../src/card.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var n = 0;
function C(s, r) { return createNormalCard(s, r, 'c' + (++n)); }

function mk(hand, table) {
  return {
    phase: PHASES.PLAY, mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'B' }, 次方: 'C', 次方公开: true,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], 底牌公开: true,
    table: (table || []).slice(), discarded: [], passedPlayers: [], passCount: 0,
    lastPlayer: 'B', 推风触发者: null, actions: [],
    players: [
      { id: 'A', hand: hand.slice(), 底牌: null },
      { id: 'B', hand: [C('H', 3)], 底牌: null },
      { id: 'C', hand: [C('H', 3)], 底牌: null },
      { id: 'D', hand: [C('H', 3)], 底牌: null },
      { id: 'E', hand: [C('H', 3)], 底牌: null }
    ]
  };
}
function typeOf(act, hand) {
  if (!act || !act.cardIds || !act.cardIds.length) return 'PASS';
  var cards = act.cardIds.map(function (id) { return hand.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean);
  if (cards.length !== act.cardIds.length) return 'BAD_ID';
  return identifyHand(cards).type;
}

// ================= 1. 起手可打连张 =================
section('1. 起手可打连张 (解除结构性死锁)');

{
  var hand = [C('S', 7), C('H', 8), C('D', 9), C('C', 5), C('S', 11), C('H', 12)];
  var st = mk(hand);
  var act = chooseAction(st, 'A');
  var t = typeOf(act, hand);
  check('1.1 空桌 + 手上有7-8-9连张 -> 起手出连张',
    t === HAND_TYPES.STRAIGHT, 'got=' + t + ' [' + (act.cardIds || []).length + '张]');
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: act.cardIds } });
  check('1.2 该起手连张经引擎确认合法', r.ok === true, r.ok ? '' : r.error.message);
}

{
  // 双龙起手
  var hand = [C('S',5),C('H',5),C('D',6),C('C',6),C('S',7),C('H',7),C('D',9),C('C',9)];
  var st = mk(hand);
  var act = chooseAction(st, 'A');
  var t = typeOf(act, hand);
  check('1.3 空桌 + 手上有5-5-6-6-7-7双龙 -> 起手出双龙',
    t === HAND_TYPES.DOUBLE_STRAIGHT, 'got=' + t);
}

// ================= 2. 起手仍不打大牌组合 =================
section('2. 起手保护大牌');

{
  // 连张里含 2/3/A/王 -> 不起手
  var hand = [C('S', 3), C('H', 4), C('D', 5), C('C', 6)];
  var st = mk(hand);
  var act = chooseAction(st, 'A');
  var t = typeOf(act, hand);
  check('2.1 含 3 的连张不起手 (保护大牌)', t === HAND_TYPES.SINGLE, 'got=' + t);
}

{
  // 蛋子含 A -> 不起手
  var hand = [C('S', 14), C('H', 14), C('D', 14), C('C', 8)];
  var st = mk(hand);
  var act = chooseAction(st, 'A');
  var t = typeOf(act, hand);
  check('2.2 三张A 不起手 (保护大牌)', t === HAND_TYPES.SINGLE, 'got=' + t);
}

{
  // 廉价蛋子 -> 得起手
  var hand = [C('S', 6), C('H', 6), C('D', 6), C('C', 8), C('S', 9)];
  var st = mk(hand);
  var act = chooseAction(st, 'A');
  var t = typeOf(act, hand);
  check('2.3 廉价三张6 得起手', t === HAND_TYPES.TRIPLE, 'got=' + t);
}

// ================= 3. 不用 4 起手 (留给取牌 §7) =================
section('3. 4 不用于起手组合');

{
  var hand = [C('S', 4), C('H', 4), C('D', 4), C('C', 9), C('S', 11)];
  var st = mk(hand);
  var act = chooseAction(st, 'A');
  var t = typeOf(act, hand);
  check('3.1 三张4 不起手 (留给取牌)', t === HAND_TYPES.SINGLE, 'got=' + t);
  var usedFour = (act.cardIds || []).some(function (id) {
    var c = hand.filter(function (x) { return x.id === id; })[0];
    return c && c.rank === 4;
  });
  check('3.2 起手未使用 4', usedFour === false);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);