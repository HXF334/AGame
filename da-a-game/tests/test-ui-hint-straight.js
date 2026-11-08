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

// ===== 1) 【提示】的连张候选 =====
// [2026-11-08 22:05/22:40 用户] AI/托管**不拆同点组**去拼龙:
//   手里全是对子时, 连张要拆对子 -> 提示不给(与托管一致);
//   但**手牌是单张**时(9/10/J), 连张不拆任何组 -> 提示照样要能找到(用户 2026-10-27 的原话)。
var okFirst = g.uiHint();
check('1a 手里全是对子: 提示不给拆组的连张(与托管一致)', okFirst === false,
  'log=' + JSON.stringify(g.logHistory().slice(-2)));

function ranksOf(ids2) {
  return ids2.map(function (id) {
    var c = myHand.filter(function (x) { return x.id === id; })[0];
    return c ? c.rank : '?';
  }).sort(function (a, b) { return a - b; }).join(',');
}

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

// ===== 3) 手牌是单张(9/10/J)时: 提示要能找到能压 567 的连张(用户 2026-10-27 原话) =====
{
  var st3 = g.gameState();
  st3.phase = 'PLAY';
  st3.players.forEach(function (p, i) { p.id = ids[i]; });
  st3.players[3].hand = [C('S', 9, 's9'), C('H', 10, 's10'), C('D', 11, 'sJ'), C('C', 8, 's8')];
  st3.table = [C('C', 5, 'tt0'), C('D', 6, 'tt1'), C('H', 7, 'tt2')];
  st3.lastPlayer = 'A';
  g.__setState(st3, { currentPlayer: 'D', human: 'D', clearLog: true });
  var ok3 = g.uiHint();
  check('3a 手牌是单张: 提示能找到能压 567 的连张', ok3 === true,
    'log=' + JSON.stringify(g.logHistory().slice(-2)));
}

console.log('test-ui-hint-straight: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
