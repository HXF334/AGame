// tests/test-req-20261110.js —— 2026-11-10 AI 口径改动的定向回归
//
// [用户 2026-11-10 改的四条 AI_POLICY 口径]
//   a. 2.2 王的拆组: 2 张王只能一起出/都不出; 3 张王可用 1 张或 3 张; 4 张王可用 2 张或 4 张。
//      并且「单张大A 不优先进龙」-> 允许大A进龙, 只是靠后(优先普通A进龙)。
//   b. 2.3 取牌的阵营过滤: 同阵营一律不取牌; 阵营不明时不用三个及以上的4取牌(2 张 4 取 3 张仍可)。
//   c. 11.2 抓方信号C: 用三个 4 及以上的 4 去取主A玩家的牌 -> 那个人是抓方。
//   d. 出完优先: 能一次出完就出完, 假八/大假八不再设例外。
//
// 断言纪律(AGENTS.md §17): 只锁**性质**, 不断言"必须出某张牌/某个点数"。
//   做法: 同一手牌换阵营/换桌面跑两遍, 用**差分**证明过滤真的生效(避免"AI 什么也没出"的假绿)。
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
function BigA(suit) { var c = cardMod.createNormalCard(suit, 14, 'b' + (++_seq)); c.is主方大A = true; return c; }

// 建局面: 手牌只留被测的牌(其余补位牌挪进弃牌堆, 免得干扰拆组/连张判定)
function buildState(handCards, table, opts) {
  opts = opts || {};
  var hm = {}; hm.D = handCards;
  var st = SB.build({
    handMap: hm, table: table || [], lastPlayer: opts.lastPlayer || 'C',
    '主A': opts.主A || { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': opts.次方 !== undefined ? opts.次方 : 'C',
    '次方公开': !!opts.次方公开,
    '主方': opts.主方 || ['A', 'C'], '抓方': opts.抓方 || ['B', 'D', 'E'],
    mode: opts.mode || '2V3_暗打',
    plays: opts.plays || []
  });
  var me = st.players.filter(function (p) { return p.id === 'D'; })[0];
  st.discarded = st.discarded.concat(me.hand.slice(handCards.length));
  me.hand = handCards.slice();
  return st;
}
function playedOf(st, act) {
  var me = st.players.filter(function (p) { return p.id === 'D'; })[0];
  return (act.cardIds || []).map(function (id) {
    return me.hand.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
}
function jokersOf(cards) {
  return cards.filter(function (c) { return c.isBigJoker || c.isSmallJoker; }).length;
}
function foursOf(cards) {
  return cards.filter(function (c) { return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker; }).length;
}
// 候选集里每手牌用了几个王
function jokerCounts(cands) {
  return (cands || []).map(function (c) {
    return jokersOf(c.cards || []);
  });
}

section('§1. 取牌的阵营过滤(AI_POLICY 2.3)');
{
  // 桌面 3 张 -> 取牌要 2 张 4 (§7.1: 取 N 张用 N-1 张 4)
  var hand2 = [C('S',4), C('H',4), C('S',3)];
  var table3 = [C('S',9), C('H',9), C('D',9)];
  // 同阵营(明打, 桌上是抓方同伴 E): 一律不取
  var stAlly = buildState(hand2, table3, { lastPlayer: 'E', 次方公开: true, mode: '2V3_明打' });
  var actAlly = aiMod.chooseAction(stAlly, 'D');
  check('§1.1 同阵营不用 4 取牌', foursOf(playedOf(stAlly, actAlly)) < 2,
    'fours=' + foursOf(playedOf(stAlly, actAlly)) + ' type=' + actAlly.type);
  // 对照: 敌对(明打, 桌上是主方 C) -> 允许用 2 张 4 取 3 张
  var stEnemy = buildState(hand2, table3, { lastPlayer: 'C', 次方公开: true, mode: '2V3_明打' });
  var actEnemy = aiMod.chooseAction(stEnemy, 'D');
  var playedEnemy = playedOf(stEnemy, actEnemy);
  check('§1.2 敌对时可用 2 张 4 取 3 张(差分对照)',
    foursOf(playedEnemy) === 2 && playedEnemy.length === 2,
    'fours=' + foursOf(playedEnemy) + ' n=' + playedEnemy.length + ' type=' + actEnemy.type);

  // 阵营不明(暗打, 次方未亮明) + 桌面 4 张(取牌要 3 张 4): 不用三个及以上 4 取
  var hand3 = [C('S',4), C('H',4), C('D',4), C('S',3)];
  var table4 = [C('S',9), C('H',9), C('D',9), C('C',9)];
  var stUnk4 = buildState(hand3, table4, { lastPlayer: 'C', 次方公开: false });
  var actUnk4 = aiMod.chooseAction(stUnk4, 'D');
  check('§1.3 阵营不明时不用三个及以上 4 取牌', foursOf(playedOf(stUnk4, actUnk4)) < 3,
    'fours=' + foursOf(playedOf(stUnk4, actUnk4)) + ' type=' + actUnk4.type);
  // 阵营不明 + 桌面 3 张(只要 2 张 4): 仍可取
  var stUnk3 = buildState(hand2, table3, { lastPlayer: 'C', 次方公开: false });
  var actUnk3 = aiMod.chooseAction(stUnk3, 'D');
  check('§1.4 阵营不明时 2 张 4 取 3 张仍可取(差分对照)',
    foursOf(playedOf(stUnk3, actUnk3)) === 2,
    'fours=' + foursOf(playedOf(stUnk3, actUnk3)) + ' type=' + actUnk3.type);
}

section('§2. 王的拆组口径(AI_POLICY 2.2)');
{
  var jokerOpts = { lastPlayer: 'C', 次方公开: true, mode: '2V3_明打' };
  // 2 张王 -> 候选里不能出现"只出 1 张王"
  var st2 = buildState([BJ(), SJ()], [C('D',2)], jokerOpts);
  aiMod.chooseAction(st2, 'D');
  var c2 = jokerCounts(aiMod.getLastCandidates());
  check('§2.1 两个王不拆成单张', c2.indexOf(1) < 0, 'counts=' + c2.join(','));
  // 3 张王 -> 允许 1 张或 3 张, 不允许 2 张
  var st3 = buildState([BJ(), SJ(), SJ()], [C('D',2)], jokerOpts);
  aiMod.chooseAction(st3, 'D');
  var c3 = jokerCounts(aiMod.getLastCandidates());
  check('§2.2 三个王可用 1 张或 3 张(不出现 2 张)',
    c3.indexOf(2) < 0 && c3.indexOf(1) >= 0 && c3.indexOf(3) >= 0,
    'counts=' + c3.join(','));
  // 4 张王 -> 允许 2 张或 4 张, 不允许 1/3 张
  var st4 = buildState([BJ(), BJ(), SJ(), SJ()], [C('D',2)], jokerOpts);
  aiMod.chooseAction(st4, 'D');
  var c4 = jokerCounts(aiMod.getLastCandidates());
  check('§2.3 四个王只用 2 张或 4 张(不出现 1/3)',
    c4.indexOf(1) < 0 && c4.indexOf(3) < 0 && c4.indexOf(2) >= 0 && c4.indexOf(4) >= 0,
    'counts=' + c4.join(','));
}

section('§3. 抓方信号C(AI_POLICY 11.2)');
{
  // E 用 3 个 4 取了主A的牌 -> E 是抓方 -> 对抓方观察者 D 是队友
  var stC = buildState([C('S',9), C('H',9)], [], {
    lastPlayer: 'B', 次方公开: false,
    plays: [{ playerId: 'E', kind: 'CAPTURE', useFours: 3, beat: 'A' }] });
  check('§3.1 三个4取主A的牌 -> 那人是抓方(对抓方观察者是队友)',
    campMod.campOf(stC, 'D', 'E') === 'ALLY', 'campOf=' + campMod.campOf(stC, 'D', 'E'));
  // 只用 2 个 4 取 -> 不构成信号C -> 抓方之间仍不明
  var stC2 = buildState([C('S',9), C('H',9)], [], {
    lastPlayer: 'B', 次方公开: false,
    plays: [{ playerId: 'E', kind: 'CAPTURE', useFours: 2, beat: 'A' }] });
  check('§3.2 两个4取主A的牌 -> 不构成抓方信号(差分对照)',
    campMod.campOf(stC2, 'D', 'E') === 'UNKNOWN', 'campOf=' + campMod.campOf(stC2, 'D', 'E'));
}

section('§4. 单张大A 不优先进龙(AI_POLICY 2.2 / D-049)');
{
  var tableStraight = [C('D',8), C('D',9), C('D',10)];   // 桌面是连张
  var bigOpts = { lastPlayer: 'C', 次方公开: true, mode: '2V3_明打' };
  // §4.1 允许大A进龙: 含大A的连张进候选(不再硬排除), 唯一连张时会被选中
  var stA = buildState([BigA('H'), C('H',12), C('H',13)], tableStraight, bigOpts);
  var actA = aiMod.chooseAction(stA, 'D');
  var candsA = aiMod.getLastCandidates() || [];
  var bigChain = candsA.filter(function (c) {
    return (c.cards || []).some(function (x) { return x.is主方大A; });
  });
  check('§4.1 含大A的连张进候选(不再硬排除)', bigChain.length >= 1, 'candN=' + candsA.length);
  check('§4.2 只有含大A的连张可选时, 选中它',
    playedOf(stA, actA).some(function (c) { return c.is主方大A; }),
    'type=' + actA.type + ' n=' + playedOf(stA, actA).length);

  // §4.3 普通A进龙优先于大A进龙: 两条同型连张都在候选里时, 含大A的排后面
  //     手牌点数各不相同 -> 不触发拆组罚分, 两条连张都能进候选
  var stB = buildState([C('H',12), C('H',13), BigA('H'), C('S',10), C('S',11)], tableStraight, bigOpts);
  var actB = aiMod.chooseAction(stB, 'D');
  var candsB = aiMod.getLastCandidates() || [];
  var idxBig = -1, idxPlain = -1;
  candsB.forEach(function (c, i) {
    var cs = c.cards || [];
    if (cs.length !== 3) return;
    if (cs.some(function (x) { return x.is主方大A; })) { if (idxBig < 0) idxBig = i; }
    else if (idxPlain < 0) idxPlain = i;
  });
  check('§4.3 含大A的连张与普通连张同时在候选里', idxBig >= 0 && idxPlain >= 0,
    'idxBig=' + idxBig + ' idxPlain=' + idxPlain + ' n=' + candsB.length);
  check('§4.4 普通A进龙排在大A进龙前面', idxBig >= 0 && idxPlain >= 0 && idxPlain < idxBig,
    'idxBig=' + idxBig + ' idxPlain=' + idxPlain);
  check('§4.5 选了普通连张(不含大A)',
    playedOf(stB, actB).length > 0 && !playedOf(stB, actB).some(function (c) { return c.is主方大A; }),
    'type=' + actB.type + ' n=' + playedOf(stB, actB).length);
}

section('§5. 1V4 暗打：抓方之间仍为不明(AI_POLICY 1 / 12)');
{
  // 1V4 暗打 + 次方未亮明 -> 抓方之间 = 不明(不是友, 也不是敌)
  var st1v4 = buildState([C('S',9), C('H',9)], [], {
    mode: '1V4_暗打', lastPlayer: 'B', 次方: null, 次方公开: false,
    主方: ['A'], 抓方: ['B', 'C', 'D', 'E'] });
  check('§5.1 1V4 暗打：抓方之间是不明', campMod.campOf(st1v4, 'D', 'E') === 'UNKNOWN',
    'campOf=' + campMod.campOf(st1v4, 'D', 'E'));
  // 对主A 一定是敌(身份明的敌人)
  check('§5.2 1V4 暗打：对主A 是敌', campMod.campOf(st1v4, 'D', 'A') === 'ENEMY',
    'campOf=' + campMod.campOf(st1v4, 'D', 'A'));
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
process.exit(0);
