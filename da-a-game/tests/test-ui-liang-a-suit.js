// tests/test-ui-liang-a-suit.js —— 亮A 阶段: 「亮A」按钮换成**花色按钮**
//
// 用户原话(2026-10-27):
//   「亮A的时候把亮按钮换成花色按钮, 可以选择对应花色亮对应的大A。有几个花色加几个按钮。」
//
// 场景: 真人手里有 ♠A 和 ♥A 两个花色 -> 亮A 阶段应该出现 **2 个花色按钮**
//   点 ♠ 就亮黑桃大A, 点 ♥ 就亮红桃大A; 另外保留「不亮」。
//
// 跑法: node tests/test-ui-liang-a-suit.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');
g.__setAiDelay(0);
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

var aS = C('S', 14, 's1');   // ♠A
var aH = C('H', 14, 'h1');   // ♥A

g.newGame();
var st = g.gameState();
st.phase = 'LIANG_A';
st['主A'] = null;
st['反A'] = null;
st['次方'] = null;
st.players.forEach(function (p) { p.id = p.id; });
var me = st.players.filter(function (p) { return p.id === 'D'; })[0];
if (!me) me = st.players[0];
me.hand = [aS, aH, C('S', 3, 'x1'), C('H', 4, 'x2'), C('D', 5, 'x3')];
g.__setState(st, { human: me.id, clearLog: true });
// 注入闸门决策: 真人有资格亮A, 手里的 A 有两个花色
g.__setGateChoice({ kind: 'LIANG_A', eligible: true, reason: '测试注入', cards: [aS, aH] });

var btns = g.uiButtons();
var ids = btns.map(function (b) { return b.id; });
check('亮A 阶段: 有 ♠ 花色按钮', ids.indexOf('liangA:S') >= 0, ids.join(','));
check('亮A 阶段: 有 ♥ 花色按钮', ids.indexOf('liangA:H') >= 0, ids.join(','));
check('亮A 阶段: 没有单独的「亮A」按钮', ids.indexOf('liangA') < 0, ids.join(','));
check('亮A 阶段: 保留「不亮」', ids.indexOf('noLiangA') >= 0, ids.join(','));
check('亮A 阶段: 按钮数 = 花色数 + 1', btns.length === 3, 'n=' + btns.length + ' ids=' + ids.join(','));

var suitBtns = btns.filter(function (b) { return b.kind === 'suit'; });
check('花色按钮带 kind=suit + suit 字段',
  suitBtns.length === 2 && suitBtns.every(function (b) { return !!b.suit; }),
  JSON.stringify(suitBtns.map(function (b) { return b.id + ':' + b.suit; })));
check('花色按钮的 label 是花色符号(不是「亮A」字样)',
  suitBtns.every(function (b) { return b.label && b.label.length <= 2 && b.label !== '亮A'; }),
  JSON.stringify(suitBtns.map(function (b) { return b.label; })));

// 渲染层: 花色符号真的画出来了
var ts = g.__renderTexts() || [];
check('画面上画出了花色符号',
  ts.indexOf('\u2660') >= 0 || ts.indexOf('\u2665') >= 0,
  JSON.stringify(ts.filter(function (t) { return t && t.length <= 2 && /[\u2660-\u2667]/.test(t); })));

// 点 ♠ -> 亮黑桃大A
g.uiClick('liangA:S');
var zhu = g.gameState()['主A'];
check('点 ♠ 按钮 -> 主A 是黑桃', !!(zhu && zhu.suit === 'S'),
  'zhu=' + JSON.stringify(zhu));
check('点 ♠ 按钮 -> 主A 由真人确立', !!(zhu && zhu.establishedBy === me.id),
  'zhu=' + JSON.stringify(zhu));

// 另一个花色: 重新注入, 点 ♥ -> 亮红桃大A
g.newGame();
var st2 = g.gameState();
st2.phase = 'LIANG_A';
st2['主A'] = null;
st2['反A'] = null;
st2['次方'] = null;
var me2 = st2.players.filter(function (p) { return p.id === 'D'; })[0] || st2.players[0];
me2.hand = [aS, aH, C('S', 3, 'y1'), C('H', 4, 'y2'), C('D', 5, 'y3')];
g.__setState(st2, { human: me2.id, clearLog: true });
g.__setGateChoice({ kind: 'LIANG_A', eligible: true, reason: '测试注入', cards: [aS, aH] });
g.uiClick('liangA:H');
var zhu2 = g.gameState()['主A'];
check('点 ♥ 按钮 -> 主A 是红桃', !!(zhu2 && zhu2.suit === 'H'),
  'zhu=' + JSON.stringify(zhu2));

console.log('test-ui-liang-a-suit: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
