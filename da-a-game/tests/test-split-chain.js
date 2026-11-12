// test-split-chain.js
// [2026-11-12 用户] 「上家出5, 我手牌有678JJQ, 现在逻辑会出6。我觉得 AI、托管、提示
//   应该都出 Q, 因为 678 是完整的龙, 最好不拆; 如果最后只有 678JJ, 那就需要拆龙出 6 了。」
// 口径: 拆同点组(对子)权重 2, 拆龙权重 1 -> 孤立 Q(0) < 拆龙 6(1) < 拆对子 J(2)。
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var ai = require(path.join(__dirname, '..', 'src', 'ai.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function handOf(st, pid) {
  return st.players.filter(function (p) { return p.id === pid; })[0].hand;
}
// 只留指定手牌, 其余填充牌移进弃牌堆(保持 108 张守恒)
function isolate(st, pid, cards) {
  var p = st.players.filter(function (x) { return x.id === pid; })[0];
  var keep = {};
  cards.forEach(function (c) { keep[c.id] = 1; });
  var extras = p.hand.filter(function (c) { return !keep[c.id]; });
  st.discarded = (st.discarded || []).concat(extras);
  p.hand = cards.slice();
  return st;
}

// ===== 1. chainSplitCount 单元 =====
console.log('\n=== 1. 拆龙计数 ===');
var c6 = SB.C('S', 6), c7 = SB.C('H', 7), c8 = SB.C('D', 8);
var cJ1 = SB.C('S', 11), cJ2 = SB.C('H', 11), cQ = SB.C('D', 12);
var hand1 = [c6, c7, c8, cJ1, cJ2, cQ];
check('1.1 单出 Q 不拆龙', ai.chainSplitCount([cQ], hand1) === 0);
check('1.2 单出 6 拆了 678', ai.chainSplitCount([c6], hand1) === 1);
check('1.3 整条 678 一起出不算拆', ai.chainSplitCount([c6, c7, c8], hand1) === 0);
// 6789 里拿 6, 剩下的 789 仍是龙 -> 不拆
var c9 = SB.C('C', 9);
check('1.4 6789 拿 6 后 789 仍成段 -> 不罚', ai.chainSplitCount([c6], [c6, c7, c8, c9]) === 0);

// ===== 2. AI/托管出 Q =====
console.log('\n=== 2. 678JJQ 打单 5 -> 出 Q ===');
var hA = [SB.C('S', 6), SB.C('H', 7), SB.C('D', 8), SB.C('S', 11), SB.C('H', 11), SB.C('D', 12)];
var st = isolate(SB.build({ handMap: { A: hA },
  table: [SB.C('S', 5)], lastPlayer: 'E', phase: 'PLAY' }), 'A', hA);
var act = ai.chooseAction(st, 'A');
var pickedRanks = (act.cardIds || []).map(function (id) {
  var c = handOf(st, 'A').filter(function (x) { return x.id === id; })[0];
  return c ? c.rank : -1;
});
check('2.1 托管选择出牌', act.type === 'PLAY', act.type);
check('2.2 出的是 Q(12), 不是 6/7/8/J', pickedRanks.length === 1 && pickedRanks[0] === 12,
  'ranks=' + pickedRanks.join(','));

// 提示第一手应与托管一致
g.__setState(st, { human: 'A', currentPlayer: 'A', clearLog: true });
var cands = g.uiHintCandidates();
var first = cands[0];
var firstRanks = (first.ids || []).map(function (id) {
  var c = handOf(st, 'A').filter(function (x) { return x.id === id; })[0];
  return c ? c.rank : -1;
});
check('2.3 提示第一手也是 Q', firstRanks.length === 1 && firstRanks[0] === 12,
  'ranks=' + firstRanks.join(','));

// ===== 3. 没有孤立单张时才拆龙 =====
console.log('\n=== 3. 678JJ 打单 5 -> 拆龙出 6 ===');
var h3 = [SB.C('S', 6), SB.C('H', 7), SB.C('D', 8), SB.C('S', 11), SB.C('H', 11)];
var st3 = isolate(SB.build({ handMap: { A: h3 },
  table: [SB.C('S', 5)], lastPlayer: 'E', phase: 'PLAY' }), 'A', h3);
var act3 = ai.chooseAction(st3, 'A');
var ranks3 = (act3.cardIds || []).map(function (id) {
  var c = handOf(st3, 'A').filter(function (x) { return x.id === id; })[0];
  return c ? c.rank : -1;
});
check('3.1 拆龙出 6 (rank=6)', act3.type === 'PLAY' && ranks3.length === 1 && ranks3[0] === 6,
  'ranks=' + ranks3.join(','));

// ===== 4. 领出时整条龙仍然照常出 =====
console.log('\n=== 4. 领出 678 不被拆龙惩罚带偏 ===');
var h4 = [SB.C('S', 6), SB.C('H', 7), SB.C('D', 8), SB.C('S', 11), SB.C('H', 11), SB.C('D', 12)];
var st4 = isolate(SB.build({ handMap: { A: h4 },
  table: [], lastPlayer: null, phase: 'PLAY' }), 'A', h4);
var act4 = ai.chooseAction(st4, 'A');
check('4.1 领出合法', act4.type === 'PLAY', act4.type);
check('4.2 领出的牌型不是单张', (act4.cardIds || []).length >= 3,
  'count=' + (act4.cardIds || []).length);

console.log('\ntest-split-chain: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
