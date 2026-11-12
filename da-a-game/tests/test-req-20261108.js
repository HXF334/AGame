// tests/test-req-20261108.js —— 2026-11-08 23:59 用户反馈的确定性回归
//   1) 「不出」文字会消失(别人出牌/换手后, 过牌的人的标记被清掉)
//   2) 点提示乱拆组 / 顺序乱 / 与托管不一致
//   3) 手动标敌 -> 托管 AI 不敢用蛋子压 -> 直接跳过
// 断言只锁**性质**(不重复 / 顺序单调 / 标记存活 / 不该跳过), 不写死具体牌。
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var card = require('../src/card.js');
var aiMod = require('../src/ai.js');
var ht = require('../src/hand-types.js');
var camp = require('../src/camp.js');
var policy = require('../src/ai-policy.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }
function C(s, r, d) { return card.createNormalCard(s, r, d); }

// 建局: A 是真人。mode 默认 2V3_暗打(次方未明) -> 抓方可以手动标敌友。
function mkState(handCards, tableCards, opt) {
  opt = opt || {};
  var st = SB.build({ handMap: { A: handCards }, table: tableCards, lastPlayer: opt.lastPlayer || 'B',
    '主A': { suit: 'H', establishedBy: opt.holder || 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false,
    '主方': opt.main || ['B', 'C'], '抓方': opt.taker || ['A', 'D', 'E'], mode: '2V3_暗打' });
  var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
  st.discarded = st.discarded.concat(me.hand.slice(handCards.length));
  me.hand = handCards;
  return st;
}
function handOf(st) {
  return st.players.filter(function (p) { return p.id === 'A'; })[0].hand;
}
// 选中牌的形状: 牌型 + 点数集合(同形状 = 同一个候选)
function shapeOfSel(st) {
  var me = handOf(st);
  var cards = g.selectedCards().map(function (id) {
    return me.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  if (!cards.length) return '';
  var h = ht.identifyHand(cards);
  var toks = cards.map(function (c) {
    if (c['is主方大A']) return 'BA';
    if (c.isBigJoker) return 'BJ';
    if (c.isSmallJoker) return 'SJ';
    return 'R' + c.rank;
  }).sort();
  return (h && h.type ? h.type : 'INVALID') + '|' + toks.join(',');
}
function typeOfSel(st) {
  var me = handOf(st);
  var cards = g.selectedCards().map(function (id) {
    return me.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  var h = ht.identifyHand(cards);
  return (h && h.type) || 'INVALID';
}
function pressHints(n) {
  var out = [];
  for (var i = 0; i < n; i++) {
    g.uiHint();
    out.push({ shape: shapeOfSel(g.gameState()), type: typeOfSel(g.gameState()) });
  }
  return out;
}

// ============================================================
// 1. 「不出」标记的生命周期: 只有**本人出牌**才清
// ============================================================
section('1. 「不出」标记: 别人出牌/换手不能把它带走');
{
  var st = mkState([C('S', 5, 'h1'), C('H', 5, 'h2')], [C('S', 4, 't1'), C('H', 4, 't2')]);
  g.__setState(st, { human: 'A', currentPlayer: 'B', clearLog: true });
  // [P2 2026-11-12] 镜像从流水派生: 用 PASS 记录表达「B 过了牌」
  g.gameState().plays.push({ playerId: 'B', kind: 'PASS', type: 'PASS', count: 0 });
  g.draw();
  check('1.1 过牌的人有「不出」标记', !!g.uiPassed()['B']);
  // 轮转 5 步 -> 回到 B(上家过牌后, 别人出牌, 轮子转回他)
  for (var i = 0; i < 5; i++) g.advanceCurrentPlayer();
  check('1.2 轮转一圈回到他本人时, 「不出」仍在(只在他自己出牌时才清)',
    !!g.uiPassed()['B'], JSON.stringify(g.uiPassed()) + ' cur=' + g.currentPlayer());
  // 真人自己的: 轮到自己时标记要清(否则【出牌/不出/提示】被藏起来)
  g.gameState().plays.push({ playerId: 'A', kind: 'PASS', type: 'PASS', count: 0 });
  g.draw();
  for (var j = 0; j < 4; j++) g.advanceCurrentPlayer();
  check('1.3 轮到真人本人时清掉自己的「不出」(按钮要让位)',
    !g.uiPassed()['A'], JSON.stringify(g.uiPassed()) + ' cur=' + g.currentPlayer());
}

// ============================================================
// 2. 提示: 第一手 = 托管那一手 / 不重复 / 同类型优先 + 牌型从小到大
// ============================================================
section('2. 提示顺序与去重');
function hintOrderCase(name, handCards, tableCards) {
  var st = mkState(handCards, tableCards);
  g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });
  g.selectedCards().length = 0;
  var cands = g.uiHintCandidates();
  var C = cands.length;
  if (!C) { check(name + ': 有候选', false, 'cands=0'); return []; }
  // (a) 第一手 = 托管那一手(托管用的就是同一个 chooseAction 调用)
  var aiAct = aiMod.chooseAction(st, 'A', {});
  var aiIds = (aiAct && aiAct.type === 'PLAY') ? aiAct.cardIds.slice().sort().join(',') : '(PASS)';
  var hintIds = cands[0].ids.slice().sort().join(',');
  check(name + ': 第一手 = 托管那一手', aiIds === hintIds, 'AI=' + aiIds + ' 提示=' + hintIds);
  // (b) 轮一圈: 形状不重复, 且**不出现连续重复的同一手**
  var seq = pressHints(C);
  var shapes = seq.map(function (x) { return x.shape; });
  var uniq = {}, dupInCycle = [];
  shapes.forEach(function (s) { if (uniq[s]) dupInCycle.push(s); uniq[s] = 1; });
  check(name + ': 一圈之内不重复同一手', dupInCycle.length === 0,
    'dup=' + JSON.stringify(dupInCycle) + ' all=' + JSON.stringify(shapes));
  var consec = [];
  for (var k = 1; k < shapes.length; k++) if (shapes[k] === shapes[k - 1]) consec.push(shapes[k]);
  check(name + ': 不出现连续重复的同一手(用户: 连点提示连着选三个 3)', consec.length === 0,
    JSON.stringify(shapes));
  // (c) 顺序: 同牌型优先, 牌型从小到大(用 HINT_TYPE_RANK 判单调)
  var tableType = null;
  try { var th = ht.identifyHand(st.table || []); tableType = th && th.type; } catch (e) { }
  var mono = true, detail = [];
  for (var m = 1; m < seq.length; m++) {
    var prevSame = (tableType && seq[m - 1].type === tableType) ? 0 : 1;
    var curSame = (tableType && seq[m].type === tableType) ? 0 : 1;
    var prevRank = policy.HINT_TYPE_RANK[seq[m - 1].type];
    var curRank = policy.HINT_TYPE_RANK[seq[m].type];
    detail.push(seq[m].type + '(' + curRank + ')');
    if (curSame < prevSame) { mono = false; break; }
    if (curSame === prevSame && curRank < prevRank) { mono = false; break; }
  }
  check(name + ': 同牌型优先 + 牌型从小到大', mono, detail.join(' > '));
  return seq;
}
{
  // 用户例子: 上家出 44, 我有 5566
  hintOrderCase('2.1 桌44 手5566',
    [C('S', 5, 'a1'), C('H', 5, 'a2'), C('D', 6, 'a3'), C('C', 6, 'a4')],
    [C('S', 4, 'b1'), C('H', 4, 'b2')]);
  // 用户例子: 上家出 10, 我有 J333
  hintOrderCase('2.2 桌10 手J333',
    [C('S', 11, 'c1'), C('H', 3, 'c2'), C('D', 3, 'c3'), C('C', 3, 'c4')],
    [C('S', 10, 'd1')]);
}
{
  // 用户例子: 我有出牌权, 手 45588 -> 连点两次提示不能还是同一手
  var st = mkState([C('S', 4, 'e1'), C('H', 5, 'e2'), C('D', 5, 'e3'), C('C', 8, 'e4'), C('S', 8, 'e5')], []);
  g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });
  g.selectedCards().length = 0;
  var seq = pressHints(3);
  check('2.3 连点提示每次换一手(用户: 还是选中4)',
    seq[0].shape !== seq[1].shape && seq[1].shape !== seq[2].shape,
    JSON.stringify(seq.map(function (x) { return x.shape; })));
}

// ============================================================
// 3. 手动标敌 -> 托管 AI 敢用蛋子压(否则直接跳过)
// ============================================================
section('3. 手动敌友标记驱动托管决策');
{
  // 桌面是**对子**(只有蛋子能压); 目标是身份不明的抓方 D; 真人 A 是抓方。
  var st = mkState([C('S', 3, 'f1'), C('H', 3, 'f2'), C('D', 3, 'f3'), C('C', 9, 'f4')],
    [C('S', 4, 'g1'), C('H', 4, 'g2')], { lastPlayer: 'D' });
  g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });
  check('3.1 抓方在次方未明时可以手动标敌友', camp.canManualMark(st, 'A'));
  check('3.2 没标之前, 身份不明的人对真人是「不明」', camp.campOf(st, 'A', 'D') === 'UNKNOWN',
    camp.campOf(st, 'A', 'D'));
  var actNoMark = aiMod.chooseAction(st, 'A', {});
  check('3.3 没标敌 -> 阵营不明, AI 不用蛋子+压(跳过)',
    !actNoMark || actNoMark.type === 'PASS', 'act=' + (actNoMark ? actNoMark.type : 'null'));
  st.uiMarks = { A: { D: 'enemy' } };
  check('3.4 标敌后, 该玩家对真人是「敌」', camp.campOf(st, 'A', 'D') === 'ENEMY',
    camp.campOf(st, 'A', 'D'));
  var act = aiMod.chooseAction(st, 'A', {});
  var me = handOf(st);
  var played = (act && act.type === 'PLAY') ? act.cardIds.map(function (id) {
    return me.filter(function (c) { return c.id === id; })[0]; }).filter(Boolean) : [];
  var h = ht.identifyHand(played);
  check('3.5 标敌后 AI 会出牌压制(不再跳过)', act && act.type === 'PLAY',
    'act=' + (act ? act.type : 'null'));
  check('3.6 压的那一手牌力能压过桌面', !!h && h.type !== 'INVALID' &&
    ht.canBeat(h, ht.identifyHand(st.table)),
    'type=' + (h ? h.type : 'none'));
}

console.log('');
console.log('test-req-20261108: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
