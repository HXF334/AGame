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
console.log('=== 总结 ===');
console.log('checks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
if (fail) { console.log(''); console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
