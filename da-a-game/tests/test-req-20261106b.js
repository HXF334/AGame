// tests/test-req-20261106b.js —— 2026-11-06 18:16 报障的定向回归(AI 出牌逻辑)
//
// [用户 2026-11-06 18:16 原话要点]
//   a. 双大A 还会和其他A一起打出 -> 正常是双大A一起出, 不和其他A一起出;
//   b. 多个王拆开出了 -> 正常只有两个王(两个王一起出);
//   c. 手牌3456, 出龙的时候只出了456, 3漏下了 -> 单张的A、2、3也要加在龙里;
//   d. 别人出222, 手牌33344 -> 优先用4取牌; 手牌333444 -> 优先出333, 不能拆4取牌;
//   e. 必须出蛋子的时候, 手里有444和其他蛋子 -> 优先出其他蛋子;
//   f. 4当作蛋子及以上牌型出的时候, 优先度靠后; 4用来取牌时, 优先度靠前;
//   g. 大牌不压制同阵营 = 已公开的同阵营: 次方本人知道(所以不管主A),
//      但抓方在次A未亮明前不知道谁是次A -> 不能按暗地里的真实阵营去压次方。
//
// 断言纪律(AGENTS.md §17): 只锁原则, 不断言"必须出某张牌"。
// 跑法: node tests/test-req-20261106b.js
var SB = require('./lib/state-builder.js');
var cardMod = require('../src/card.js');
var aiMod = require('../src/ai.js');
var handTypes = require('../src/hand-types.js');
var eng = require('../src/index.js');

var pass = 0, fail = 0;
var failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }
var _seq = 0;
function C(s, r) { return cardMod.createNormalCard(s, r, 'b' + (++_seq)); }
function BJ() { return cardMod.createBigJoker('b' + (++_seq)); }
function SJ() { return cardMod.createSmallJoker('b' + (++_seq)); }

// 造确定局面: 指定玩家的手牌就是给的这些(其余牌进弃牌堆, 108 张总数不变)
function stateWith(pid, handCards, table, opts) {
  var o = opts || {};
  var hm = {}; hm[pid] = handCards;
  var st = SB.build({
    handMap: hm, table: table || [], lastPlayer: o.lastPlayer || 'B',
    '主A': o.主A || { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': o.次方 !== undefined ? o.次方 : 'C',
    '次方公开': !!o.次方公开,
    '主方': o.主方 || ['B','C'], '抓方': o.抓方 || ['A','D','E'],
    mode: o.mode || '2V3_暗打'
  });
  var me = st.players.filter(function (p) { return p.id === pid; })[0];
  st.discarded = st.discarded.concat(me.hand.slice(handCards.length));
  me.hand = handCards.slice();
  return st;
}
function playedOf(st, pid, act) {
  var me = st.players.filter(function (p) { return p.id === pid; })[0];
  return (act.cardIds || []).map(function (id) {
    return me.hand.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
}
function jokersOf(cards) {
  return cards.filter(function (c) { return c.isBigJoker || c.isSmallJoker; }).length;
}
function bigAsOf(cards) {
  return cards.filter(function (c) { return !!c.is主方大A; }).length;
}
function ranksOf(cards) { return cards.map(function (c) { return c.rank; }).join(','); }
function typeOf(cards) { return handTypes.identifyHand(cards).type; }

section('T1. 龙要带上能接上的牌 (3456 不能只出 456 把 3 漏下)');
{
  var hand = [C('S',3), C('H',4), C('D',5), C('C',6)];
  var st = stateWith('D', hand, [], { 主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], 次方: 'C', 次方公开: true, lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T1.1 起手出的是一条龙', typeOf(played) === 'STRAIGHT', typeOf(played));
  check('T1.2 这条龙用满能连上的牌(一张不漏)', played.length === hand.length,
    'played=' + played.length + '/' + hand.length + ' ranks=' + ranksOf(played));
}

section('T2. 单张的 A / 2 / 3 也要进龙');
{
  var hand = [C('S',14), C('H',2), C('D',3)];
  var st = stateWith('D', hand, [], { 主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], 次方: 'C', 次方公开: true, lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T2.1 A+2+3 组成一条龙', typeOf(played) === 'STRAIGHT', typeOf(played) + ' ranks=' + ranksOf(played));
  check('T2.2 这条龙用满三张', played.length === hand.length, 'played=' + played.length);
}
{
  var hand = [C('S',14), C('H',2), C('D',3), C('C',4), C('S',5)];
  var st = stateWith('D', hand, [], { 主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], 次方: 'C', 次方公开: true, lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T2.3 A,2,3,4,5 组成一条龙(把 A 带上)', typeOf(played) === 'STRAIGHT' && played.length === 5,
    typeOf(played) + ' played=' + played.length + ' ranks=' + ranksOf(played));
}

section('T3. 双大A: 两张一起出, 不和其他A混出');
{
  var a1 = C('S',14); a1.is主方大A = true;
  var a2 = C('S',14); a2.is主方大A = true;
  var plainA = C('H',14);
  var hand = [a1, a2, plainA, C('D',5), C('C',6), C('S',7)];
  var table = [C('S',4), C('H',4), C('D',4), C('C',4)];
  var st = stateWith('D', hand, table, {
    主A: { suit: 'S', establishedBy: 'D', viaMethod: 'FORCED_CHECK' },
    次方: 'C', 次方公开: true, 主方: ['D','C'], 抓方: ['A','B','E'], lastPlayer: 'B' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T3.1 出了双大A', typeOf(played) === 'DOUBLE_BIG_A', typeOf(played) + ' ranks=' + ranksOf(played));
  check('T3.2 双大A两张一起出, 不带别的牌(不能三张)', played.length === 2 && bigAsOf(played) === 2,
    'played=' + played.length + ' bigA=' + bigAsOf(played));
}

section('T4. 两个王: 要么一起出, 要么都不出(不拆开)');
{
  var hand = [BJ(), SJ(), C('S',5)];
  var st = stateWith('D', hand, [C('S',2)], { 主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], 次方: 'C', 次方公开: true, lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T4.1 出的王不是 1 个(不拆开)', jokersOf(played) !== 1,
    'jokers=' + jokersOf(played) + ' ranks=' + ranksOf(played));
  check('T4.2 两个王一起出', jokersOf(played) === 2, 'jokers=' + jokersOf(played));
}

section('T5. 取牌: 4 组够小就整组取(33344 + 别人出 222)');
{
  var hand = [C('S',3), C('H',3), C('D',3), C('C',4), C('S',4)];
  var table = [C('S',2), C('H',2), C('D',2)];
  var st = stateWith('D', hand, table, { 主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], 次方: 'C', 次方公开: true, lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T5.1 出的全是 4(用 4 取牌)', played.length > 0 && played.every(function (c) { return c.rank === 4; }),
    'ranks=' + ranksOf(played));
  check('T5.2 取的 4 张数 = 桌面张数 - 1', played.length === table.length - 1, 'played=' + played.length);
}

section('T6. 不拆 4 蛋子去取牌(333444 + 别人出 222 -> 出 333)');
{
  var hand = [C('S',3), C('H',3), C('D',3), C('C',4), C('S',4), C('H',4)];
  var table = [C('S',2), C('H',2), C('D',2)];
  var st = stateWith('D', hand, table, { 主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], 次方: 'C', 次方公开: true, lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T6.1 出的牌不含 4(没拆 4 蛋子取牌)', played.every(function (c) { return c.rank !== 4; }),
    'ranks=' + ranksOf(played));
  check('T6.2 出的是蛋子且压得过桌面', typeOf(played) === 'TRIPLE' &&
    handTypes.canBeat(handTypes.identifyHand(played), handTypes.identifyHand(st.table)),
    typeOf(played) + ' ranks=' + ranksOf(played));
}

section('T7. 必须出蛋子时, 优先出别的蛋子(4 蛋子靠后)');
{
  var hand = [C('S',4), C('H',4), C('D',4), C('S',6), C('H',6), C('D',6)];
  var table = [C('S',9), C('H',9)];
  var st = stateWith('D', hand, table, { 主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], 次方: 'C', 次方公开: true, lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T7.1 出的不是 4 组成的蛋子', played.every(function (c) { return c.rank !== 4; }),
    'ranks=' + ranksOf(played));
  check('T7.2 出的是蛋子', typeOf(played) === 'TRIPLE', typeOf(played) + ' ranks=' + ranksOf(played));
}

section('T8. 阵营: 只按已公开的同阵营');
{
  // (a) 次方未亮明, AI 是抓方, 桌上是次方 -> 抓方不知道谁是次方 -> 可以用王压制
  var hand = [BJ(), C('S',5)];
  var st = stateWith('B', hand, [C('S',14)], {
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'C', 次方公开: false, 主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'C' });
  var act = aiMod.chooseAction(st, 'B');
  var played = playedOf(st, 'B', act);
  check('T8.1 次方未亮明时, 抓方可以压制他(不按暗地真阵营)', act.type === 'PLAY', act.type);
  check('T8.2 出的就是那张王', jokersOf(played) === 1, 'jokers=' + jokersOf(played));
}
{
  // (b) 次方已公开, AI 是抓方, 桌上是次方 -> 次方是对手, 可以压制
  var hand = [BJ(), C('S',5)];
  var st = stateWith('B', hand, [C('S',14)], {
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'C', 次方公开: true, 主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'C' });
  var act = aiMod.chooseAction(st, 'B');
  check('T8.3 次方公开后, 抓方仍可压制他(次方是对手)', act.type === 'PLAY', act.type);
}
{
  // (c) 次方已公开, AI 是抓方, 桌上是另一个抓方(队友) -> 不压同阵营
  var hand = [BJ(), C('S',5)];
  var st = stateWith('B', hand, [C('S',2)], {
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'C', 次方公开: true, 主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  var act = aiMod.chooseAction(st, 'B');
  check('T8.4 不对已公开的同阵营(另一个抓方)用大牌', act.type === 'PASS', act.type);
}
{
  // (d) AI 自己就是次方(未亮明), 桌上是主A持有者 -> 次方知道主A是队友, 不压
  var hand = [BJ(), C('S',5)];
  var st = stateWith('C', hand, [C('S',14)], {
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'C', 次方公开: false, 主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'A' });
  var act = aiMod.chooseAction(st, 'C');
  check('T8.5 次方本人不对主A用大牌', act.type === 'PASS', act.type);
}

section('T9. 明打: 阵营公开, 同阵营不压制(用户 2026-11-06 23:21 报障)');
{
  // 内部 id: A=甲 B=乙 C=丙 D=丁 E=戊; 主A=乙(B), 次方=丁(D), 抓方=甲/丙/戊
  function mingState(pid, table, last) {
    var hand = [C('S',2), C('H',2), C('D',2), C('C',5)];
    return stateWith(pid, hand, table, {
      mode: '2V3_明打',
      主A: { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
      次方: 'D', 次方公开: false,
      主方: ['B','D'], 抓方: ['A','C','E'], lastPlayer: last });
  }
  var egg = [C('S',6), C('H',6), C('D',6)];
  var a1 = aiMod.chooseAction(mingState('C', egg, 'A'), 'C');
  check('T9.1 明打时, 抓方**不压**同阵营的抓方', a1.type === 'PASS', a1.type);
  var a2 = aiMod.chooseAction(mingState('C', egg, 'D'), 'C');
  check('T9.2 明打时, 抓方可以压次方(对手)', a2.type === 'PLAY', a2.type);
  var a3 = aiMod.chooseAction(mingState('D', egg, 'B'), 'D');
  check('T9.3 明打时, 次方**不压**主A(队友)', a3.type === 'PASS', a3.type);
}
console.log('');
section('T10. 大组牌型: 不直接出整个假八, 该出大蛋子就出大蛋子(用户 23:33 + 23:54)');
{
  // 上家出 22(对子), AI 手牌 9999 101010 -> 不该把 9999 整组打出去
  var hand = [C('S',9), C('H',9), C('D',9), C('C',9), C('S',10), C('H',10), C('D',10), C('C',10)];
  var table = [C('S',2), C('H',2)];   // 对子 22(用户原话: 上家出22)
  var st = stateWith('D', hand, table, {});
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('T10.1 不直接出整个假八(8 张两组)', typeOf(played) !== 'FAKE_EIGHT' && typeOf(played) !== 'BIG_FAKE_EIGHT',
    typeOf(played) + ' ranks=' + ranksOf(played));
  check('T10.2 也没有打 8 张', played.length !== 8,
    'played=' + played.length + ' ranks=' + ranksOf(played));
  check('T10.3 出的是大蛋子(4 张同点)', typeOf(played) === 'BIG_TRIPLE',
    typeOf(played) + ' ranks=' + ranksOf(played));
}

section('T12. 引擎: 2V3 明打 -> 次方公开 = true(用户 2026-11-06 23:33 指令)');
{
  function idState() {
    var st = SB.build({ handMap: {}, table: [], lastPlayer: 'B',
      '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
      '次方': 'C', '次方公开': false,
      '主方': ['A','C'], '抓方': ['B','D','E'], mode: '2V3_暗打' });
    st.phase = eng.PHASES.IDENTITY_CHOICE;
    st.mode = null;
    return st;
  }
  var r1 = eng.transition(idState(), { type: eng.ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'C', choice: 'PUBLIC' } });
  check('T12.1 2V3 明打: mode = 2V3_明打', r1.ok && r1.state.mode === '2V3_明打',
    r1.ok ? r1.state.mode : JSON.stringify(r1.error));
  check('T12.2 2V3 明打: 次方公开 = true', r1.ok && r1.state['次方公开'] === true,
    r1.ok ? String(r1.state['次方公开']) : 'transition failed');
  var r2 = eng.transition(idState(), { type: eng.ACTIONS.CHOOSE_IDENTITY,
    payload: { playerId: 'C', choice: 'HIDDEN' } });
  check('T12.3 2V3 暗打: 次方公开 仍为 false', r2.ok && r2.state['次方公开'] === false,
    r2.ok ? String(r2.state['次方公开']) : 'transition failed');
}
section('T13. 双大A / 双王: 优先度最后(用户 23:54)');
{
  // 桌面对22, 手里有双大A + 一手蛋子 -> 该出蛋子, 不出双大A
  var bigA1 = C('S',14); bigA1.is主方大A = true;
  var bigA2 = C('S',14); bigA2.is主方大A = true;
  var hand13 = [bigA1, bigA2, C('H',3), C('D',3), C('C',3)];
  var table13 = [C('S',2), C('H',2), C('D',2)];   // 蛋子 222
  var st13 = stateWith('D', hand13, table13, {
    主A: { suit: 'S', establishedBy: 'D', viaMethod: 'FORCED_CHECK' },
    次方: 'C', 次方公开: true, 主方: ['D','C'], 抓方: ['A','B','E'], lastPlayer: 'B' });
  var act13 = aiMod.chooseAction(st13, 'D');
  var p13 = playedOf(st13, 'D', act13);
  check('T13.1 有更省的选择时不出双大A', typeOf(p13) !== 'DOUBLE_BIG_A',
    typeOf(p13) + ' ranks=' + ranksOf(p13));
  check('T13.2 出的是蛋子', typeOf(p13) === 'TRIPLE', typeOf(p13) + ' ranks=' + ranksOf(p13));
}
{
  // 桌面对22, 手里有双王 + 一手蛋子 -> 该出蛋子, 不出双王
  var hand14 = [BJ(), SJ(), C('H',3), C('D',3), C('C',3)];
  var table14 = [C('S',2), C('H',2), C('D',2)];   // 蛋子 222
  var st14 = stateWith('D', hand14, table14, {});
  var act14 = aiMod.chooseAction(st14, 'D');
  var p14 = playedOf(st14, 'D', act14);
  check('T14.1 有更省的选择时不出双王', typeOf(p14) !== 'DOUBLE_JOKER',
    typeOf(p14) + ' ranks=' + ranksOf(p14));
  check('T14.2 出的是蛋子', typeOf(p14) === 'TRIPLE', typeOf(p14) + ' ranks=' + ranksOf(p14));
}

section('T15. 单张大A 不加进龙(单张普通A 可以)(用户 23:54)');
{
  var ace = C('S',14); ace.is主方大A = true;
  var hand15 = [ace, C('H',9), C('D',10), C('C',11)];
  var st15 = stateWith('D', hand15, [], {
    主A: { suit: 'S', establishedBy: 'D', viaMethod: 'FORCED_CHECK' },
    次方: 'C', 次方公开: true, 主方: ['D','C'], 抓方: ['A','B','E'], lastPlayer: 'B' });
  var act15 = aiMod.chooseAction(st15, 'D');
  var p15 = playedOf(st15, 'D', act15);
  check('T15.1 出的龙里没有大A', p15.every(function (c) { return !c.is主方大A; }),
    'ranks=' + ranksOf(p15));
  check('T15.2 出的还是一条龙', typeOf(p15) === 'STRAIGHT', typeOf(p15) + ' ranks=' + ranksOf(p15));
}

section('T16. 大组别轻用: 4个9+3个10 对22 -> 出3个10(用户 23:54)');
{
  var hand16 = [C('S',9), C('H',9), C('D',9), C('C',9), C('S',10), C('H',10), C('D',10)];
  var table16 = [C('S',2), C('H',2)];
  var st16 = stateWith('D', hand16, table16, {});
  var act16 = aiMod.chooseAction(st16, 'D');
  var p16 = playedOf(st16, 'D', act16);
  var same16 = p16.length > 1 && p16.every(function (c) { return c.rank === p16[0].rank; });
  check('T16.1 没有把 4 张同点整组打出去', !(same16 && p16.length === 4),
    'played=' + p16.length + ' ranks=' + ranksOf(p16));
  check('T16.2 出的是蛋子', typeOf(p16) === 'TRIPLE', typeOf(p16) + ' ranks=' + ranksOf(p16));
}

section('T17. 有假八时也不直接出假八: 4个9+4个10 对22 -> 出9999(用户 23:54)');
{
  var hand17 = [C('S',9), C('H',9), C('D',9), C('C',9), C('S',10), C('H',10), C('D',10), C('C',10)];
  var table17 = [C('S',2), C('H',2)];
  var st17 = stateWith('D', hand17, table17, {});
  var act17 = aiMod.chooseAction(st17, 'D');
  var p17 = playedOf(st17, 'D', act17);
  check('T17.1 不直接出整个假八', typeOf(p17) !== 'FAKE_EIGHT' && typeOf(p17) !== 'BIG_FAKE_EIGHT',
    typeOf(p17) + ' ranks=' + ranksOf(p17));
  check('T17.2 出的是大蛋子(4 张同点)', typeOf(p17) === 'BIG_TRIPLE',
    typeOf(p17) + ' ranks=' + ranksOf(p17));
}
section('T18. 4 组成的蛋子+ 有其他选择时靠后(用户 00:19 报障: 丁出 4444)');
{
  // 桌面单张 K, 丁手里 4444 + 333 + 一张 2 -> 有更省的选择时, 不该出 4444
  var hand18 = [C('S',4), C('H',4), C('D',4), C('C',4), C('S',3), C('H',3), C('D',3), C('S',2)];
  var table18 = [C('S',13)];
  var st18 = stateWith('D', hand18, table18, {});
  var act18 = aiMod.chooseAction(st18, 'D');
  var p18 = playedOf(st18, 'D', act18);
  check('T18.1 没有把 4 组成的蛋子+ 整组打出去', typeOf(p18) !== 'BIG_TRIPLE',
    typeOf(p18) + ' ranks=' + ranksOf(p18));
  check('T18.2 出的牌里没有 4 组成的蛋子+', p18.every(function (c) { return c.rank !== 4; }),
    typeOf(p18) + ' ranks=' + ranksOf(p18));
}

section('T19. 次方身份未明时, 抓方不对「阵营不明」的人出大蛋子+(用户 00:19)');
{
  // 桌面上是次方(未亮明), AI 是抓方, 手里只有 4444 能管 -> 不该用大蛋子+ 去压
  var hand19 = [C('S',4), C('H',4), C('D',4), C('C',4), C('S',9)];
  var table19 = [C('S',13)];
  var st19 = stateWith('D', hand19, table19, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'C' });
  var act19 = aiMod.chooseAction(st19, 'D');
  var p19 = playedOf(st19, 'D', act19);
  check('T19.1 阵营不明时不用大蛋子+ 去压', typeOf(p19) !== 'BIG_TRIPLE',
    act19.type + ' ' + typeOf(p19) + ' ranks=' + ranksOf(p19));
  var st19b = stateWith('D', hand19, table19, {
    mode: '2V3_明打', 次方: 'C', 次方公开: true,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'C' });
  var act19b = aiMod.chooseAction(st19b, 'D');
  var p19b = playedOf(st19b, 'D', act19b);
  check('T19.2 阵营公开(明打)时, 大蛋子+ 可以出', typeOf(p19b) === 'BIG_TRIPLE',
    typeOf(p19b) + ' ranks=' + ranksOf(p19b));
}
section('T20. 手上有整组同点牌时, 不拆组去凑同牌型(用户 21:47)');
{
  // 桌面是蛋子(3 张), AI 手里有 5 张同点 -> 该整组出, 不该拆出 3 张去压
  var hand20 = [C('S',2), C('H',2), C('D',2), C('C',2), C('S',5), C('H',5), C('D',5)];
  var table20 = [C('S',8), C('H',8), C('D',8)];
  var st20 = stateWith('D', hand20, table20, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  var act20 = aiMod.chooseAction(st20, 'D');
  var p20 = playedOf(st20, 'D', act20);
  check('T20.1 出的牌能压过桌面',
    p20.length > 0 && handTypes.canBeat(handTypes.identifyHand(p20), handTypes.identifyHand(table20)),
    act20.type + ' ' + typeOf(p20) + ' ranks=' + ranksOf(p20));
  // 不拆同点组: 出的每个点数, 张数必须等于手里该点数的全部
  var hc = {}, uc = {};
  hand20.forEach(function (c) { hc[c.rank] = (hc[c.rank] || 0) + 1; });
  p20.forEach(function (c) { uc[c.rank] = (uc[c.rank] || 0) + 1; });
  var noSplit = p20.length > 0;
  for (var rk in uc) if (uc[rk] !== hc[rk]) noSplit = false;
  check('T20.2 没有拆同点组', noSplit, typeOf(p20) + ' ranks=' + ranksOf(p20));
  check('T20.3 用的是蛋子级牌型',
    ['TRIPLE','BIG_TRIPLE','TRUE_SEVEN','TRUE_EIGHT'].indexOf(typeOf(p20)) >= 0,
    typeOf(p20) + ' ranks=' + ranksOf(p20));
}

section('T21. 暗打: 身份未明的人对身份未明的人出蛋子+ -> 其他抓方推定他是次A(用户 21:47)');
{
  var hand21 = [C('S',9), C('H',9), C('D',9), C('C',9), C('S',3)];
  var table21 = [C('S',8), C('H',8), C('D',8), C('C',8)];   // 戊(E) 出的 4 张 8(大蛋子)
  var st21 = stateWith('D', hand21, table21, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  st21.plays = [{ playerId: 'E', type: 'BIG_TRIPLE', count: 4, beat: 'D' }];
  var act21 = aiMod.chooseAction(st21, 'D');
  var p21 = playedOf(st21, 'D', act21);
  check('T21.1 推定为次方后, 抓方可以出蛋子+ 去压他', typeOf(p21) === 'BIG_TRIPLE',
    act21.type + ' ' + typeOf(p21) + ' ranks=' + ranksOf(p21));
  // 对照: 没有这条线索 -> 不推定 -> 阵营不明就不用蛋子+ 去压(过牌)
  var st21b = stateWith('D', hand21, table21, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  st21b.plays = [];
  var act21b = aiMod.chooseAction(st21b, 'D');
  check('T21.2 没有推定线索时, 阵营不明就不用蛋子+ 去压', act21b.type === 'PASS',
    act21b.type + ' ' + typeOf(playedOf(st21b, 'D', act21b)));
}

section('T22. 对身份明的(主A持有者)出蛋子+ 不构成推定线索');
{
  var st22 = stateWith('D', hand21, table21, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  st22.plays = [{ playerId: 'E', type: 'BIG_TRIPLE', count: 4, beat: 'B' }];  // B 是主A持有者
  var act22 = aiMod.chooseAction(st22, 'D');
  check('T22.1 不推定, 仍然不过度用蛋子+', act22.type === 'PASS',
    act22.type + ' ' + typeOf(playedOf(st22, 'D', act22)));
}

section('T23. 引擎记录出牌流水(AI 推定次方的数据来源)');
{
  var hand23 = [C('S',9), C('H',9), C('D',9), C('S',7)];
  var table23 = [C('S',8), C('H',8), C('D',8)];
  var st23 = stateWith('D', hand23, table23, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  var r23 = eng.handlePlay(st23, { playerId: 'D',
    cardIds: [hand23[0].id, hand23[1].id, hand23[2].id] });
  check('T23.1 出牌成功', r23.ok === true, r23.ok ? '' : JSON.stringify(r23.error));
  var pl23 = (r23.state && r23.state.plays) || [];
  check('T23.2 出牌流水记下了这手', pl23.length === 1, 'plays=' + JSON.stringify(pl23));
  check('T23.3 流水里有牌型和压的是谁',
    pl23.length === 1 && pl23[0].type === 'TRIPLE' && pl23[0].beat === 'E',
    JSON.stringify(pl23[0]));
}
section('T24. AI 决策日志: 候选集 + 排序键 + 决定键(用户 22:26 裁定 C)');
{
  var hand24 = [C('S',2), C('H',2), C('D',2), C('C',2), C('S',9)];
  var table24 = [C('S',8), C('H',8), C('D',8)];
  var st24 = stateWith('D', hand24, table24, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  aiMod.chooseAction(st24, 'D');
  var tr24 = aiMod.getLastTrace();
  check('T24.1 决策后有轨迹', !!tr24, JSON.stringify(tr24));
  check('T24.2 轨迹里有候选集', !!(tr24 && tr24.candidates && tr24.candidates.length > 0),
    tr24 ? 'n=' + tr24.candidates.length : '');
  check('T24.3 候选带排序键文本', !!(tr24 && tr24.candidates[0] && tr24.candidates[0].keyText),
    tr24 ? JSON.stringify(tr24.candidates[0]) : '');
  check('T24.4 轨迹里有选中的一手', !!(tr24 && tr24.chosen), tr24 ? JSON.stringify(tr24.chosen) : '');
  check('T24.5 轨迹里有决定键', !!(tr24 && tr24.decidingKey), tr24 ? String(tr24.decidingKey) : '');
  check('T24.6 轨迹里有阵营三态', !!(tr24 && tr24.camp), tr24 ? JSON.stringify(tr24.camp) : '');
}
section('T25. 不为凑同牌型拆同点组去拼龙(用户 23:22: QKA 拆了 QQQ/KKKK)');
{
  var hand25 = [C('S',12), C('H',12), C('D',12), C('S',13), C('H',13), C('D',13), C('C',13), C('S',14)];
  var table25 = [C('S',11), C('H',11), C('D',11)];   // 上家出 JQK(龙)
  var st25 = stateWith('D', hand25, table25, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  var act25 = aiMod.chooseAction(st25, 'D');
  var p25 = playedOf(st25, 'D', act25);
  // 不拆同点组: 出的每个点数, 张数要么 0 要么等于手里该点数全部
  function noSplitOf(played, handAll) {
    if (!played.length) return true;
    var hc = {}, uc = {};
    handAll.forEach(function (c) { hc[c.rank] = (hc[c.rank] || 0) + 1; });
    played.forEach(function (c) { uc[c.rank] = (uc[c.rank] || 0) + 1; });
    for (var rk in uc) if (uc[rk] !== hc[rk]) return false;
    return true;
  }
  check('T25.1 出了牌就没拆同点组去拼牌型', noSplitOf(p25, hand25),
    act25.type + ' ' + typeOf(p25) + ' ranks=' + ranksOf(p25));
  // 对照: 桌面是**主A持有者**(身份明的敌人) -> 该出整组, 不该拆 QQQ/KKKK 去拼一条龙
  var st25b = stateWith('D', hand25, table25, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  var act25b = aiMod.chooseAction(st25b, 'D');
  var p25b = playedOf(st25b, 'D', act25b);
  check('T25.2 对已知敌人: 出的牌能压过桌面',
    p25b.length > 0 && handTypes.canBeat(handTypes.identifyHand(p25b), handTypes.identifyHand(table25)),
    act25b.type + ' ' + typeOf(p25b) + ' ranks=' + ranksOf(p25b));
  check('T25.3 对已知敌人: 也没拆同点组', noSplitOf(p25b, hand25),
    act25b.type + ' ' + typeOf(p25b) + ' ranks=' + ranksOf(p25b));
}

section('T26. 起手不拆对子去凑更长的龙(用户 23:22: 22345 出了 2345)');
{
  var hand26 = [C('S',2), C('H',2), C('D',3), C('C',4), C('S',5)];
  var st26 = stateWith('D', hand26, [], {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  var act26 = aiMod.chooseAction(st26, 'D');
  var p26 = playedOf(st26, 'D', act26);
  var hc26 = {}, uc26 = {};
  hand26.forEach(function (c) { hc26[c.rank] = (hc26[c.rank] || 0) + 1; });
  p26.forEach(function (c) { uc26[c.rank] = (uc26[c.rank] || 0) + 1; });
  var noSplit26 = p26.length > 0;
  for (var rk26 in uc26) if (uc26[rk26] !== hc26[rk26]) noSplit26 = false;
  check('T26.1 起手没拆同点组', noSplit26, typeOf(p26) + ' ranks=' + ranksOf(p26));
  check('T26.2 起手出了能连上的牌', typeOf(p26) === 'STRAIGHT' || typeOf(p26) === 'PAIR' || typeOf(p26) === 'SINGLE',
    typeOf(p26) + ' ranks=' + ranksOf(p26));
}

section('T27. 手牌只剩一组时整组出(用户 23:22: 只剩对4 却单出一个4)');
{
  var hand27 = [C('S',4), C('H',4)];
  var st27 = stateWith('D', hand27, [], {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  var act27 = aiMod.chooseAction(st27, 'D');
  var p27 = playedOf(st27, 'D', act27);
  check('T27.1 把手上的牌一次出完', p27.length === hand27.length,
    act27.type + ' ' + typeOf(p27) + ' ranks=' + ranksOf(p27));
}

section('T28. 取牌: 44 可取同阵营, 三个4及以上不取同阵营(用户 23:22)');
{
  var hand28a = [C('S',4), C('H',4), C('S',3)];
  var table28a = [C('S',9), C('H',9), C('D',9)];   // 同阵营(抓方 E)出的 3 张
  var st28a = stateWith('D', hand28a, table28a, {
    mode: '2V3_明打', 次方: 'C', 次方公开: true,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  var act28a = aiMod.chooseAction(st28a, 'D');
  var p28a = playedOf(st28a, 'D', act28a);
  check('T28.1 用 44 取同阵营的 3 张目标',
    p28a.length === 2 && p28a.every(function (c) { return c.rank === 4; }),
    act28a.type + ' ' + typeOf(p28a) + ' ranks=' + ranksOf(p28a));
  var hand28b = [C('S',4), C('H',4), C('D',4), C('S',3)];
  var table28b = [C('S',9), C('H',9), C('D',9), C('C',9)];   // 同阵营出的 4 张
  var st28b = stateWith('D', hand28b, table28b, {
    mode: '2V3_明打', 次方: 'C', 次方公开: true,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  var act28b = aiMod.chooseAction(st28b, 'D');
  var p28b = playedOf(st28b, 'D', act28b);
  check('T28.2 三个4及以上不取同阵营的牌',
    !(p28b.length === 3 && p28b.every(function (c) { return c.rank === 4; })),
    act28b.type + ' ' + typeOf(p28b) + ' ranks=' + ranksOf(p28b));
}

section('T29. 这手打完就出完 -> 连队友的牌也跟(用户 23:22)');
{
  var hand29 = [C('S',9), C('H',9), C('D',9)];
  var table29 = [C('S',6), C('H',6), C('D',6)];   // 同阵营(抓方 E)出的 3 张
  var st29 = stateWith('D', hand29, table29, {
    mode: '2V3_明打', 次方: 'C', 次方公开: true,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  var act29 = aiMod.chooseAction(st29, 'D');
  var p29 = playedOf(st29, 'D', act29);
  check('T29.1 出完就走 -> 压了同阵营的牌', act29.type === 'PLAY' && p29.length === hand29.length,
    act29.type + ' ' + typeOf(p29) + ' ranks=' + ranksOf(p29));
}

section('T30. 裁定 A: 推定次方后, 其余未知玩家是队友(不取他们的牌)');
{
  var hand30 = [C('S',4), C('H',4), C('D',4), C('S',3)];
  var table30 = [C('S',9), C('H',9), C('D',9), C('C',9)];   // 另一个未知玩家 B 出的 4 张
  var st30 = stateWith('D', hand30, table30, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  st30.plays = [{ playerId: 'E', type: 'BIG_TRIPLE', count: 4, beat: 'D' }];  // 推定 E 是次方 -> B 是队友
  var act30 = aiMod.chooseAction(st30, 'D');
  var p30 = playedOf(st30, 'D', act30);
  check('T30.1 推定次方后不取队友的牌',
    !(p30.length === 3 && p30.every(function (c) { return c.rank === 4; })),
    act30.type + ' ' + typeOf(p30) + ' ranks=' + ranksOf(p30));
  // 对照: 没有推定线索 -> B 阵营不明 -> 可以取他的牌
  var st30b = stateWith('D', hand30, table30, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  st30b.plays = [];
  var act30b = aiMod.chooseAction(st30b, 'D');
  var p30b = playedOf(st30b, 'D', act30b);
  check('T30.2 没有推定线索时, 阵营不明就照常取牌',
    p30b.length === 3 && p30b.every(function (c) { return c.rank === 4; }),
    act30b.type + ' ' + typeOf(p30b) + ' ranks=' + ranksOf(p30b));
}
console.log('=== 总结 ===');
console.log('checks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
if (fail) { console.log(''); console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
