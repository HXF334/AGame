// tests/test-req-20261110.js —— 2026-11-10 AI 口径改动的定向回归
//
// [用户 2026-11-10 改的三条 AI_POLICY 口径]
//   a. 2.2 王的拆组: 2 张王只能一起出/都不出; 3 张王可用 1 或 3 张; 4 张王可用 2 或 4 张。
//      并且「单张大A 不优先进龙」-> 允许大A进龙, 只是靠后(优先普通A进龙)。
//   b. 2.3 取牌的阵营过滤: 同阵营一律不取牌; 阵营不明时不用三个及以上的4取牌(2 张 4 取 3 张仍可)。
//   c. 11.2 抓方信号C: 用三个 4 及以上的 4 去取主A玩家的牌 -> 那个人是抓方。
//
// 断言纪律(AGENTS.md §17): 只锁性质, 不断言"必须出某张牌"。
// 跑法: node tests/test-req-20261110.js
var SB = require('./lib/state-builder.js');
var cardMod = require('../src/card.js');
var aiMod = require('../src/ai.js');
var campMod = require('../src/camp.js');

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
function foursOf(cards) {
  return cards.filter(function (c) { return c.rank === 4; }).length;
}

section('§1. 取牌的阵营过滤(AI_POLICY 2.3)');
{
  // 同阵营(明打公开): 一律不用 4 取牌
  var hand = [C('S',4), C('H',4), C('S',3)];
  var table = [C('S',9), C('H',9), C('D',9)];   // 同阵营出的 3 张
  var st = stateWith('D', hand, table, {
    mode: '2V3_明打', 次方: 'C', 次方公开: true,
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'E' });
  var act = aiMod.chooseAction(st, 'D');
  var played = playedOf(st, 'D', act);
  check('§1.1 同阵营不用 4 取牌', !(foursOf(played) >= 2 && played.length === 2),
    act.type + ' played=' + played.length);

  // 阵营不明: 三个 4 不取(2 张 4 取 3 张仍可)
  var hand4 = [C('S',4), C('H',4), C('D',4), C('S',3)];
  var table4 = [C('S',9), C('H',9), C('D',9), C('C',9)];   // 4 张目标 -> 要用 3 个 4
  var st2 = stateWith('D', hand4, table4, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  st2.plays = [];
  var act2 = aiMod.chooseAction(st2, 'D');
  var played2 = playedOf(st2, 'D', act2);
  check('§1.2 阵营不明时不用三个及以上 4 取牌', !(foursOf(played2) >= 3),
    act2.type + ' played=' + played2.length + ' fours=' + foursOf(played2));

  // 阵营不明: 2 张 4 取 3 张目标 -> 允许(口径只禁三个及以上)
  var hand3 = [C('S',4), C('H',4), C('S',3)];
  var table3 = [C('S',9), C('H',9), C('D',9)];
  var st3 = stateWith('D', hand3, table3, {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  st3.plays = [];
  var act3 = aiMod.chooseAction(st3, 'D');
  var played3 = playedOf(st3, 'D', act3);
  check('§1.3 阵营不明时 2 张 4 取 3 张仍可取',
    (foursOf(played3) === 2 && played3.length === 2) || played3.length === 0,
    act3.type + ' played=' + played3.length + ' fours=' + foursOf(played3));
}

section('§2. 王的拆组口径(AI_POLICY 2.2)');
{
  // 2 张王: 不许拆成 1 张单出
  var st2j = stateWith('D', [BJ(), SJ(), C('S',3)], [C('S',9)], {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  st2j.plays = [];
  var a2 = aiMod.chooseAction(st2j, 'D');
  var p2 = playedOf(st2j, 'D', a2);
  check('§2.1 两个王不拆成单张', jokersOf(p2) !== 1,
    a2.type + ' jokers=' + jokersOf(p2));

  // 3 张王: 允许 1 张单出 或 3 张一起(都不许出现 2 张)
  var st3j = stateWith('D', [BJ(), SJ(), SJ(), C('S',3)], [C('S',9)], {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  st3j.plays = [];
  var a3 = aiMod.chooseAction(st3j, 'D');
  var p3 = playedOf(st3j, 'D', a3);
  check('§2.2 三个王只用 1 张或 3 张(不出现 2 张)',
    jokersOf(p3) === 0 || jokersOf(p3) === 1 || jokersOf(p3) === 3,
    a3.type + ' jokers=' + jokersOf(p3));

  // 4 张王: 只用 2 张或 4 张(不出现 1/3)
  var st4j = stateWith('D', [BJ(), BJ(), SJ(), SJ(), C('S',3)], [C('S',9)], {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  st4j.plays = [];
  var a4 = aiMod.chooseAction(st4j, 'D');
  var p4 = playedOf(st4j, 'D', a4);
  check('§2.3 四个王只用 2 张或 4 张(不出现 1/3)',
    jokersOf(p4) === 0 || jokersOf(p4) === 2 || jokersOf(p4) === 4,
    a4.type + ' jokers=' + jokersOf(p4));
}

section('§3. 抓方信号C(AI_POLICY 11.2)');
{
  // E 用 3 个 4 取了主A的牌 -> E 是抓方
  var stC = stateWith('D', [C('S',9), C('H',9)], [], {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  stC.plays = [{ playerId: 'E', kind: 'CAPTURE', useFours: 3, beat: 'A' }];
  var inferred = campMod.campOf(stC, 'D', 'E');
  check('§3.1 三个4取主A的牌 -> 那人是抓方(对抓方观察者是队友)',
    inferred === 'ALLY', 'campOf=' + inferred);

  // 用 2 个 4 取 -> 不构成信号C
  var stC2 = stateWith('D', [C('S',9), C('H',9)], [], {
    mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    主方: ['A','C'], 抓方: ['B','D','E'], lastPlayer: 'B' });
  stC2.plays = [{ playerId: 'E', kind: 'CAPTURE', useFours: 2, beat: 'A' }];
  var inferred2 = campMod.campOf(stC2, 'D', 'E');
  check('§3.2 两个4取主A的牌 -> 不构成抓方信号',
    inferred2 === 'UNKNOWN', 'campOf=' + inferred2);
}

console.log('');
console.log('==================================================');
console.log('checks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
if (fail) {
  console.log('');
  console.log('FAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
