// tests/test-ui-hint-straight.js —— 连张候选枚举 + 选牌自动补成最小可用牌型
//
// 用户原话(2026-10-27):
//   1) 「其他人出567, 我有910J提示没有可用牌。和双大王类似, 都要横展开。」
//   2) 「我选择一个9, 则默认帮我选择9可组成的最小可用牌型, 例如我有88991010JJQQ,
//        我选择一个9, 默认把8和10一起选中起来。」
//
// 根因(第1条): src/combos.js 的连段枚举用 seq.concat(byRank[rank]) 把该点数的**所有**牌
//   都塞进同一段 -> 手里 9 有两张时枚举出 [8,9,9,10,10,J] 这种含重复点数的组合
//   -> identifyHand 判 INVALID -> 真正能压的 [9,10,J] **从没被枚举过**
//   -> 【提示】/ AI 选牌 / doPlay 组合回退 三条路径(都走 candidateCombos)全都找不到
//   引擎一直是对的: identifyHand([9,10,J])=STRAIGHT, canBeat(STRAIGHT, STRAIGHT)=true
//
// 跑法: node tests/test-ui-hint-straight.js
var mock = require('./mock-wx.js');
var m = mock.install({});
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');
g.__setAiDelay(0);
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

// 手牌: 8 9 9 10 10 J J Q Q (用户例子); 桌面: 5 6 7
var eight = C('S', 8, 'h0'), nineA = C('D', 9, 'h1'), nineB = C('C', 9, 'h2'),
    tenA = C('S', 10, 'h3'), tenB = C('D', 10, 'h4'), jack = C('H', 11, 'h5'),
    jack2 = C('S', 11, 'h6'), que = C('D', 12, 'h7'), que2 = C('C', 12, 'h8');
var myHand = [eight, nineA, nineB, tenA, tenB, jack, jack2, que, que2];

g.newGame();
var st = g.gameState();
st.phase = 'PLAY';
var ids = ['A', 'B', 'C', 'D', 'E'];
st.players.forEach(function (p, i) {
  p.id = ids[i];
  p.hand = (i === 3) ? myHand.slice() : [C('S', 3, 'x' + i), C('H', 4, 'y' + i)];
});
st['主A'] = { suit: 'C', establishedBy: 'A', viaMethod: 'LIANG_A' };
st['反A'] = null;
st['次方'] = null;
st['次方公开'] = true;
st['底牌公开'] = true;
st.table = [C('C', 5, 't0'), C('D', 6, 't1'), C('H', 7, 't2')];
st.discarded = [];
st.lastPlayer = 'A';
st.passedPlayers = [];
g.__setState(st, { currentPlayer: 'D', human: 'D', clearLog: true });

// ===== 1) 【提示】要能找到能压 567 的连张 =====
var okFirst = g.uiHint();
check('【提示】有候选(不再是「当前没有可用牌」)', okFirst === true,
  'log=' + JSON.stringify(g.logHistory().slice(-2)));

var seen = [];
for (var i = 0; i < 60; i++) {
  if (!g.uiHint()) break;
  var sel = g.selectedCards().slice();
  seen.push(sel);
}
function ranksOf(ids2) {
  return ids2.map(function (id) {
    var c = myHand.filter(function (x) { return x.id === id; })[0];
    return c ? c.rank : '?';
  }).sort(function (a, b) { return a - b; }).join(',');
}
var threeCardStraights = seen.filter(function (s) { return s.length === 3 && ranksOf(s) !== '9,9,9' && ranksOf(s).indexOf(',') > 0; });
check('候选里有能压 567 的连张(3 张, 点数连续)',
  seen.some(function (s) {
    if (s.length !== 3) return false;
    var r = ranksOf(s).split(',').map(Number);
    return r[1] === r[0] + 1 && r[2] === r[1] + 1;
  }),
  '候选: ' + JSON.stringify(seen.map(ranksOf)));

// ===== 2) 选中一张 9 -> 自动补成**最小可用牌型**(8 9 10) =====
// 注: 上面的提示循环**留下了选中状态**(提示会选中候选), 不清掉的话
//   再点那张 9 就变成「取消选中」-> 测的就不是自动补成了
g.selectedCards().length = 0;
var boxes = g.handCardHitboxes();
var nineBox = boxes.filter(function (b) { return b.cardId === nineA.id; })[0];
check('找到 9 的命中框', !!nineBox, JSON.stringify(boxes.map(function (b) { return b.cardId; })));
if (nineBox) {
  mock.fireTouch(m.touchHandlers, nineBox.x + nineBox.w / 2, nineBox.y + nineBox.h / 2);
  var sel2 = g.selectedCards().slice();
  check('选中一张 9 -> 自动补成 3 张(8 9 10)',
    sel2.length === 3 && ranksOf(sel2) === '8,9,10',
    'sel=' + JSON.stringify(sel2) + ' ranks=' + ranksOf(sel2));
  check('自动补的牌里含刚点的那张 9', sel2.indexOf(nineA.id) >= 0,
    'sel=' + JSON.stringify(sel2));
}

console.log('test-ui-hint-straight: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
