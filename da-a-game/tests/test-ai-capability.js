// tests/test-ai-capability.js — AI 能力专项
// 目标: (1) AI 能出多种牌型 (旧版 16 种只出 SINGLE)
//       (2) AI 每个行动都必须通过引擎校验 (§12/§14 AI 不得绕过规则)
//       (3) 策略合理: 省大牌、优先取牌、无牌可压时过牌
var { chooseAction } = require('../src/ai.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { identifyHand, HAND_TYPES } = require('../src/hand-types.js');
var { createNormalCard, createBigJoker, createSmallJoker } = require('../src/card.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var n = 0;
function C(s, r) { return createNormalCard(s, r, 'c' + (++n)); }
function BigA(s) { var c = createNormalCard(s, 14, 'b' + (++n)); c.is主方大A = true; return c; }

function mkState(table, hand, opts) {
  var o = opts || {};
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return {
    phase: o.phase || PHASES.PLAY, mode: '2V3_暗打',
    主A: { suit: 'H', establishedBy: 'B' }, 次方: 'C', 次方公开: true,
    主方: ['B', 'C'], 抓方: ['A', 'D', 'E'], 底牌公开: true,
    table: table.slice(), discarded: [], passedPlayers: [], passCount: 0,
    lastPlayer: 'B', 推风触发者: null, actions: [], nextNote: 0,
    players: ids.map(function (id) {
      if (id === 'A') return { id: id, hand: hand.slice(), 底牌: null };
      return { id: id, hand: [C('H', 3)], 底牌: null };
    })
  };
}

function handTypeOf(act, hand) {
  if (!act || !act.cardIds || !act.cardIds.length) return 'PASS';
  var cards = act.cardIds.map(function (id) {
    return hand.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  if (cards.length !== act.cardIds.length) return 'BAD_ID';
  return identifyHand(cards).type;
}

// ================= 1. 多牌型压制能力 =================
section('1. AI 能用多张牌压制');

[
  { name: '1.1 桌上有对10 -> AI 出对3', table: [C('S', 10), C('H', 10)], hand: [C('S', 3), C('C', 3), C('D', 7)], want: HAND_TYPES.PAIR },
  { name: '1.2 桌上有345连张 -> AI 出10JQ连张', table: [C('S', 3), C('H', 4), C('D', 5)], hand: [C('S', 10), C('C', 11), C('D', 12), C('H', 8)], want: HAND_TYPES.STRAIGHT },
  { name: '1.3 桌上有3-4-5-6 连张 -> AI 出8-9-10-J 连张', table: [C('S', 3), C('H', 4), C('D', 5), C('C', 6)], hand: [C('S', 8), C('H', 9), C('D', 10), C('C', 11)], want: HAND_TYPES.STRAIGHT },
  // [2026-10-21 修正] 原断言 AI 应出蛋子(TRIPLE), 与用户新策略冲突。
  // 桌上有单张5 时, 单张7 同样能压 (7 > 5), 两者都合法。
  //   用户原话: "也应该从合适的手牌中由小往大出" -> 跟牌时选**最小可压制手牌**。
  //   故改为期望 SINGLE(单张7)。
  //   §6.3 "蛋子在单张层级之上" 是**牌型压制规则**, 已在 test-hand-types 系列覆盖;
  //   此处测的是 AI **选牌策略**, 两者不应混为一谈。
  { name: '1.4 桌上有单张 -> AI 出最小可压制手牌(单张7, 而非蛋子)', table: [C('S', 5)], hand: [C('S', 9), C('C', 9), C('D', 9), C('H', 7)], want: HAND_TYPES.SINGLE },
  { name: '1.5 桌上有单大A -> AI 出5张3大蛋子 (§6.4)', table: [BigA('H')], hand: [C('H', 3), C('D', 3), C('C', 3), C('S', 3), C('H', 3), C('D', 8)], want: HAND_TYPES.BIG_TRIPLE },
  { name: '1.6 桌上有对K -> AI 出蛋子(跨型压对子)', table: [C('S', 13), C('H', 13)], hand: [C('S', 4), C('H', 4), C('C', 4), C('D', 7)], want: HAND_TYPES.TRIPLE },
  { name: '1.7 桌上有对4-5-6 双龙 -> AI 出大蛋子', table: [C('S',4),C('H',4),C('D',5),C('C',5),C('S',6),C('H',6)], hand: [C('S',9),C('H',9),C('C',9),C('D',9),C('S',7)], want: HAND_TYPES.BIG_TRIPLE }
].forEach(function (t) {
  var st = mkState(t.table, t.hand);
  var act = chooseAction(st, 'A');
  var got = handTypeOf(act, t.hand);
  check(t.name, got === t.want, 'want=' + t.want + ' got=' + got +
    (act && act.cardIds ? ' [' + act.cardIds.length + '张]' : ''));
});

// ================= 1b. 同层级不互压 (§6.3) =================
section('1b. 同层级不互压 — AI 不得用对子压单张');

{
  // §6.3: 龙/对子/单张 同层级, 三者之间不互压
  var st = mkState([C('S', 5)], [C('S', 9), C('C', 9), C('D', 7)]);
  var act = chooseAction(st, 'A');
  var t = handTypeOf(act, st.players[0].hand);
  check('1b.1 有对9 但单张也能压 -> AI 不应用对子压单张',
    t !== HAND_TYPES.PAIR, 'got=' + t);
  check('1b.2 AI 的单张出牌能压过 5',
    t === HAND_TYPES.SINGLE && (act.cardIds || []).length === 1, 'got=' + t);
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: act.cardIds } });
  check('1b.3 该单张出牌经引擎确认合法', r.ok === true, r.ok ? '' : r.error.message);
}

{
  // 对子只能压对子: 桌上有对10, AI 有对9 -> 9 < 10 压不了, 应过牌
  var st = mkState([C('S', 10), C('H', 10)], [C('S', 9), C('C', 9), C('D', 7)]);
  var act = chooseAction(st, 'A');
  check('1b.4 对9 压不了对10 -> PASS (§6.2 10 > 9)', act.type === 'PASS', 'type=' + act.type);
}

// ================= 2. 每个行动都过引擎校验 (§12/§14) =================
section('2. AI 行动全部经引擎校验');

[
  { name: '2.1 对10 场景', table: [C('S', 10), C('H', 10)], hand: [C('S', 3), C('C', 3), C('D', 7)] },
  { name: '2.2 连张场景', table: [C('S', 3), C('H', 4), C('D', 5)], hand: [C('S', 10), C('C', 11), C('D', 12)] },
  { name: '2.3 单大A 场景', table: [BigA('H')], hand: [C('H', 3), C('D', 3), C('C', 3), C('S', 3), C('H', 3)] },
  { name: '2.4 双龙场景', table: [C('S',4),C('H',4),C('D',5),C('C',5),C('S',6),C('H',6)], hand: [C('S',9),C('H',9),C('C',9),C('D',9)] },
  { name: '2.5 双王场景', table: [createBigJoker('j1'), createSmallJoker('s1')], hand: [C('S', 3), C('C', 3), C('D', 7)] }
].forEach(function (t) {
  var st = mkState(t.table, t.hand);
  var act = chooseAction(st, 'A');
  if (act.type === 'PASS') { check(t.name + ' (过牌合法)', true); return; }
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: act.cardIds } });
  check(t.name + ' -> 引擎接受', r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
});

// ================= 3. 策略: 取牌优先 (§7) =================
section('3. [4]取牌 优先');

{
  // 桌面 3 张 5, AI 有 2 个 4 -> 应取牌
  var table = [C('S', 5), C('H', 5), C('C', 5)];
  var hand = [C('D', 4), C('S', 4), C('H', 11), C('C', 12)];
  var st = mkState(table, hand);
  var act = chooseAction(st, 'A');
  check('3.1 有 2 个 4 且桌面 3 张同点 -> 取牌而非压牌',
    act.type === 'PLAY' && act.cardIds.length === 2 &&
    act.cardIds.every(function (id) { return hand.filter(function (c) { return c.id === id && c.rank === 4; }).length > 0; }),
    'cardIds=' + JSON.stringify(act.cardIds));
}

// ================= 4. 策略: 无牌可压时过牌 =================
section('4. 无牌可压 -> 过牌');

{
  // 桌面大王, AI 只有 4-6 小牌 -> 压不了
  var st = mkState([createBigJoker('jx')], [C('S', 4), C('H', 5), C('D', 6)]);
  var act = chooseAction(st, 'A');
  check('4.1 压不了大王 -> PASS', act.type === 'PASS', 'type=' + act.type);
}

{
  // 桌上有对A, AI 只有对4 -> 4 < A, 压不了
  var st = mkState([C('S', 14), C('H', 14)], [C('S', 4), C('H', 4), C('D', 6)]);
  var act = chooseAction(st, 'A');
  check('4.2 对4 压不了对A (§6.2 A > 4) -> PASS', act.type === 'PASS', 'type=' + act.type);
}

// ================= 5. 策略: 省大牌 =================
section('5. 起手省大牌');

{
  var hand = [C('S', 2), C('H', 3), C('D', 14), C('C', 7), C('S', 9)];
  var st = mkState([], hand);
  var act = chooseAction(st, 'A');
  var opened = hand.filter(function (c) { return c.id === (act.cardIds || [])[0]; })[0];
  check('5.1 起手不出 2/3/A -> 是安全牌', opened && opened.rank >= 5 && opened.rank <= 13,
    'first=' + (opened ? opened.suit + opened.rank : 'none'));
}

// ================= 6. 健壮性 =================
section('6. 健壮性 (不 crash)');

check('6.1 null state', chooseAction(null, 'A').type === 'PASS');
check('6.2 无 players', chooseAction({ phase: PHASES.PLAY }, 'A').type === 'PASS');
check('6.3 玩家不存在', chooseAction(mkState([], [C('S', 5)]), 'Z').type === 'PASS');
check('6.4 手牌空', chooseAction(mkState([C('S', 5)], []), 'A').type === 'PASS');
check('6.5 IDENTITY_CHOICE -> CHOOSE_IDENTITY',
  chooseAction(mkState([], [C('S', 5)], { phase: PHASES.IDENTITY_CHOICE }), 'A').type === 'CHOOSE_IDENTITY');
check('6.6 table 为 undefined',
  chooseAction({ phase: PHASES.PLAY, players: [{ id: 'A', hand: [C('S', 5)] }] }, 'A').type !== undefined);

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);