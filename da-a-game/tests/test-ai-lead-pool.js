// tests/test-ai-lead-pool.js — 回归: AI 起手「有什么出什么 + 由小往大」
//
// [用户原话 2026-11-03]
//   「AI玩家有本轮出牌权时默认从小往大出，如果是对子就出对子，不要只会出单牌」
//   [2026-11-03 17:57 澄清] 「不是说起手出对子，是**有什么出什么**，有单出单，
//     有对子出对子，有龙出龙，不是固定起手出对子」
//
// [实现口径] src/ai.js 起手分支:
//   候选池**合并成一个** = candidateCombos(hand) 里所有合法组合(对子/蛋子/连张/双龙/
//   连珠蛋/假八 …) + 池空时的单张兜底。
//   * 组合**整体优先于单张** -> 满足「有对子出对子」「有龙出龙」
//   * 池内按**保留价值升序**(越不值钱越先出) -> 满足「由小往大」
//   * 同保留价值时**张数多者优先**
//
// 跑法: node tests/test-ai-lead-pool.js
var { chooseAction } = require('../src/ai.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { identifyHand, HAND_TYPES } = require('../src/hand-types.js');
var { createNormalCard } = require('../src/card.js');

var passed = 0, failed = 0, failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var n = 0;
function C(s, r) { return createNormalCard(s, r, 'p' + (++n)); }

function mkState(table, hand) {
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return {
    phase: PHASES.PLAY, mode: '2V3_暗打',
    '主A': { suit: 'H', establishedBy: 'B' }, '次方': 'C', '次方公开': true,
    '主方': ['B', 'C'], '抓方': ['A', 'D', 'E'], '底牌公开': true,
    table: table.slice(), discarded: [], passedPlayers: [], passCount: 0,
    lastPlayer: 'B', '推风触发者': null, actions: [], nextNote: 0,
    players: ids.map(function (id) {
      if (id === 'A') return { id: id, hand: hand.slice(), '底牌': null };
      return { id: id, hand: [C('H', 3)], '底牌': null };
    })
  };
}
function typeOf(act, hand) {
  if (!act || !act.cardIds || !act.cardIds.length) return 'PASS';
  var cards = act.cardIds.map(function (id) {
    return hand.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  if (cards.length !== act.cardIds.length) return 'BAD_ID';
  return identifyHand(cards).type;
}
function ranksOf(act, hand) {
  return (act.cardIds || []).map(function (id) {
    var c = hand.filter(function (x) { return x.id === id; })[0];
    return c ? c.rank : '?';
  }).sort(function (a, b) { return a - b; }).join(',');
}

// ============================================================
// 1. 组合优先于单张 —— 有对子/龙就不出单张
// ============================================================
section('1. 组合优先于单张(有对子出对子, 有龙出龙)');

{
  var hand = [C('S', 5), C('H', 5), C('D', 9), C('C', 11)];
  var act = chooseAction(mkState([], hand), 'A');
  check('1.1 手里有对5 -> 起手出对子(PAIR)', typeOf(act, hand) === HAND_TYPES.PAIR,
    'got=' + typeOf(act, hand) + ' ranks=' + ranksOf(act, hand));
  check('1.2 出的是 5,5', ranksOf(act, hand) === '5,5', ranksOf(act, hand));
}

{
  var hand = [C('S', 7), C('H', 8), C('D', 9), C('C', 12)];
  var act = chooseAction(mkState([], hand), 'A');
  check('1.3 手里有7-8-9 -> 起手出连张(STRAIGHT)', typeOf(act, hand) === HAND_TYPES.STRAIGHT,
    'got=' + typeOf(act, hand) + ' ranks=' + ranksOf(act, hand));
}

{
  var hand = [C('S', 6), C('H', 10), C('D', 13)];
  var act = chooseAction(mkState([], hand), 'A');
  check('1.4 只有散牌 -> 兜底出单张(SINGLE)', typeOf(act, hand) === HAND_TYPES.SINGLE,
    'got=' + typeOf(act, hand) + ' ranks=' + ranksOf(act, hand));
}

// ============================================================
// 2. 池内由小往大(保留价值低者优先)
// ============================================================
section('2. 池内由小往大');

{
  var hand = [C('S', 5), C('H', 5), C('D', 9), C('C', 9), C('S', 10), C('H', 11), C('D', 12)];
  var act = chooseAction(mkState([], hand), 'A');
  // [2026-11-03 用户新规] 起手看**最小的那张**能组成什么:
  //   5 旁边没有 6 -> 组不成连张 -> 起手出对5(9/10-11-12 留着)。
  check('2.1 对5/对9/10-11-12 -> 最小牌 5 组不成连张 -> 出对5',
    typeOf(act, hand) === HAND_TYPES.PAIR && ranksOf(act, hand) === '5,5',
    'got=' + typeOf(act, hand) + ' ranks=' + ranksOf(act, hand));
}

{
  var hand = [C('S', 9), C('H', 9), C('S', 10), C('H', 11), C('D', 12)];
  var act = chooseAction(mkState([], hand), 'A');
  check('2.2 对9 vs 9-10-11-12 -> 最小牌 9 能组连张 -> 出连张',
    typeOf(act, hand) === HAND_TYPES.STRAIGHT && ranksOf(act, hand) === '9,10,11,12',
    'got=' + typeOf(act, hand) + ' ranks=' + ranksOf(act, hand));
}

{
  var hand = [C('S', 6), C('H', 6), C('D', 6), C('C', 9)];
  var act = chooseAction(mkState([], hand), 'A');
  check('2.3 三张6 vs 单张9 -> 最小牌 9 组不成牌型 -> 出单张9(蛋子留着整组)',
    typeOf(act, hand) === HAND_TYPES.SINGLE && ranksOf(act, hand) === '9',
    'got=' + typeOf(act, hand) + ' ranks=' + ranksOf(act, hand));
}

// ============================================================
// 3. 起的这手牌必须引擎认可
// ============================================================
section('3. 起的牌必须经引擎校验');

[
  { name: '3.1 对5', hand: [C('S', 5), C('H', 5), C('D', 9)] },
  { name: '3.2 连张7-8-9', hand: [C('S', 7), C('H', 8), C('D', 9), C('C', 12)] },
  { name: '3.3 三张6', hand: [C('S', 6), C('H', 6), C('D', 6), C('C', 9)] },
  { name: '3.4 散牌', hand: [C('S', 6), C('H', 10), C('D', 13)] }
].forEach(function (t) {
  var st = mkState([], t.hand);
  var act = chooseAction(st, 'A');
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: act.cardIds } });
  check(t.name + ' -> 引擎接受', r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
});

// ============================================================
// 4. 保护大牌: 不起手 2/3/A/王, 不用 4 起手
// ============================================================
section('4. 起手仍保护大牌');

{
  var hand = [C('S', 2), C('H', 3), C('D', 14), C('C', 7), C('S', 9)];
  var act = chooseAction(mkState([], hand), 'A');
  var opened = hand.filter(function (c) { return c.id === (act.cardIds || [])[0]; })[0];
  check('4.1 有2/3/A -> 起手不出它们', opened && opened.rank >= 5 && opened.rank <= 13,
    'first=' + (opened ? opened.suit + opened.rank : 'none'));
}

{
  var hand = [C('S', 4), C('H', 4), C('D', 8)];
  var act = chooseAction(mkState([], hand), 'A');
  check('4.2 对4 不用于起手(留给取牌)',
    !(act.cardIds || []).some(function (id) {
      return hand.filter(function (c) { return c.id === id; })[0].rank === 4;
    }), 'ranks=' + ranksOf(act, hand));
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);
