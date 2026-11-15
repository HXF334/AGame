// tests/test-endgame.js — 残局搜索（D-080）
var path = require('path');
var ROOT = path.join(__dirname, '..');
var SB = require('./lib/state-builder.js');
var card = require(ROOT + '/src/card.js');
var endgame = require(ROOT + '/src/endgame.js');
var ai = require(ROOT + '/src/ai.js');
var winLoss = require(ROOT + '/src/win-loss.js');

var fails = 0;
function ok(cond, msg) {
  if (!cond) { fails++; console.error('FAIL ' + msg); }
  else console.log('ok   ' + msg);
}

var deck = card.createDeck();
function take(pred, n) {
  var out = [];
  for (var i = 0; i < deck.length && out.length < n; i++) {
    if (!deck[i]._used && pred(deck[i])) { deck[i]._used = 1; out.push(deck[i]); }
  }
  return out;
}
function C(suit, rank) { return take(function (c) { return c.suit === suit && c.rank === rank; }, 1)[0]; }

// 构造一个稀疏残局：指定各家手牌，其余牌进弃牌堆
function sparse(hands, extra) {
  deck.forEach(function (c) { delete c._used; });
  var s = SB.build(Object.assign({ handMap: {} }, extra || {}));
  var all = [];
  s.players.forEach(function (p) { all = all.concat(p.hand); });
  s.players.forEach(function (p) { p.hand = []; });
  Object.keys(hands).forEach(function (pid) {
    var p = s.players.filter(function (x) { return x.id === pid; })[0];
    p.hand = hands[pid].slice();
  });
  var used = {};
  Object.keys(hands).forEach(function (pid) {
    hands[pid].forEach(function (c) { used[c.id] = 1; });
  });
  all.forEach(function (c) { if (!used[c.id]) s.discarded.push(c); });
  return s;
}

// 1) 阈值
(function () {
  var s = sparse({ A: [C('H', 5)], B: [C('H', 6)], C: [C('H', 7)], D: [C('H', 8)], E: [C('H', 9)] });
  ok(endgame.totalCards(s) === 5, '1.1 totalCards 统计 5');
  ok(endgame.isEndgame(s, 10) === true, '1.2 5 张 <= 10 进入残局');
  var s2 = sparse({ A: [C('D', 5)], B: [C('D', 6)], C: [C('D', 7)], D: [C('D', 8)], E: [C('D', 9), C('D', 10)] });
  ok(endgame.totalCards(s2) === 6, '1.3 totalCards 统计 6');
})();

// 2) 未见牌只排除公开信息 + 自己手牌
(function () {
  var mine = [C('S', 3), C('S', 4)];
  var s = sparse({ B: mine, A: [C('H', 5)], C: [C('H', 6)], D: [C('H', 7)], E: [C('H', 8)] });
  var unseen = endgame.unseenCards(s, 'B');
  var hasMine = unseen.some(function (c) { return mine.some(function (m) { return m.id === c.id; }); });
  ok(!hasMine, '2.1 未见牌不含自己手牌');
  ok(unseen.length === 108 - mine.length,
    '2.2 未见牌数量 = 108 - 自己手牌');
})();

// 3) 抽样世界保持各家张数
(function () {
  var s = sparse({ B: [C('S', 3), C('S', 4)], A: [C('H', 5)], C: [C('H', 6)], D: [C('H', 7)], E: [C('H', 8)] });
  s.currentPlayer = 'B';
  var rng = endgame.mulberry32(7);
  var w = endgame.sampleState(s, 'B', rng);
  ok(w.players.filter(function (p) { return p.id === 'A'; })[0].hand.length === 1, '3.1 抽样后 A 仍是 1 张');
  var ids = {};
  var dup = false;
  w.players.forEach(function (p) {
    p.hand.forEach(function (c) { if (ids[c.id]) dup = true; ids[c.id] = 1; });
  });
  ok(!dup, '3.2 抽样世界的牌不重复');
})();

// 4) 合法动作枚举：空桌领出至少有一个出牌动作
(function () {
  var s = sparse({ B: [C('S', 3)], A: [C('H', 5)], C: [C('H', 6)], D: [C('H', 7)], E: [C('H', 8)] });
  var acts = endgame.enumerateActions(s, 'B');
  ok(acts.length >= 1 && acts[0].type === 'PLAY', '4.1 领出候选包含 PLAY');
})();

// 5) 评分：阵营胜负
(function () {
  var s = sparse({ B: [C('S', 3)], A: [C('H', 5)], C: [C('H', 6)], D: [C('H', 7)], E: [C('H', 8)] });
  var win = endgame.evaluate(s, 'B', { ended: true, winner: '主方' });
  var lose = endgame.evaluate(s, 'B', { ended: true, winner: '抓方' });
  var draw = endgame.evaluate(s, 'B', { ended: true, winner: 'draw' });
  ok(win === 1000 && lose === -1000 && draw === 0, '5.1 终局评分 +1000/-1000/0');
})();

// 6) 队友计入同一阵营的剩牌
(function () {
  var s = sparse({ B: [C('S', 3), C('S', 4)], C: [C('S', 5)], A: [C('H', 6), C('H', 7)], D: [C('H', 8)], E: [C('H', 9)] });
  var ev = endgame.evaluate(s, 'B', { ended: false });
  // 主方剩 3 张，抓方剩 4 张 -> (4-3)*10 = 10（B 不是 currentPlayer，无 +3）
  ok(ev === 10, '6.1 未终局按阵营剩牌差评分（含队友）');
})();

// 7) 搜索在残局返回合法动作
(function () {
  var s = sparse({ B: [C('S', 3)], A: [C('H', 5), C('H', 10)], C: [C('H', 6)], D: [C('H', 7)], E: [C('H', 8)] });
  s.currentPlayer = 'B';
  var r = endgame.search(s, 'B', { samples: 3, chooseAction: ai.chooseAction, seed: 11 });
  ok(r && r.action && r.action.type === 'PLAY', '7.1 搜索返回 PLAY');
  var acts = endgame.search(s, 'B', { samples: 1, chooseAction: ai.chooseAction, seed: 11 });
  ok(acts && acts.samples === 1, '7.2 samples 生效');
})();

// 8) chooseAction 在残局走搜索分支（不崩且出牌合法）
(function () {
  var s = sparse({ B: [C('S', 3), C('S', 4)], A: [C('H', 5)], C: [C('H', 6)], D: [C('H', 7)], E: [C('H', 8)] });
  s.currentPlayer = 'B';
  var a = ai.chooseAction(s, 'B');
  ok(a && (a.type === 'PLAY' || a.type === 'PASS'), '8.1 残局 chooseAction 返回合法动作');
})();

console.log(fails === 0 ? '\nALL PASS' : '\nFAILED ' + fails);
process.exit(fails === 0 ? 0 : 1);
