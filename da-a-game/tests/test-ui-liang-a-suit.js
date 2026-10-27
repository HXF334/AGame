// tests/test-ui-liang-a-suit.js —— 亮A 阶段: **花色按钮**(列出全部4个花色, 没有的置灰)
//
// 用户原话(2026-10-27):
//   「在发牌阶段开始到亮A阶段, 把所有A都列出来, 没有的A是不可点击状态,
//     有哪个A哪个A的按钮变成可点击状态。
//     亮A阶段的不亮按钮不要了, 换成5秒倒计时。
//     倒计时结束没人亮A的话自动跳过亮A进入强制排查阶段。」
//
// 场景: 真人手里有 ♠A 和 ♥A 两个花色 -> 亮A 阶段出现 **4 个花色按钮**
//   ♠/♥ 可点, ♦/♣ 置灰; 点 ♠ 就亮黑桃大A, 点 ♥ 就亮红桃大A。
//   **没有**「不亮」按钮(改成 5 秒倒计时)。
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

function setup(cards) {
  g.newGame();
  var st = g.gameState();
  st.phase = 'LIANG_A';
  st['主A'] = null;
  st['反A'] = null;
  st['次方'] = null;
  var me = st.players.filter(function (p) { return p.id === 'D'; })[0] || st.players[0];
  me.hand = cards.concat([C('S', 3, 'x1'), C('H', 4, 'x2'), C('D', 5, 'x3')]);
  g.__setState(st, { human: me.id, clearLog: true });
  // 注入闸门决策: 真人有资格亮A, 手里的 A 有这两个花色
  g.__setGateChoice({ kind: 'LIANG_A', eligible: true, reason: '测试注入', cards: cards });
  return me.id;
}

var myId = setup([aS, aH]);
var btns = g.uiButtons();
var ids = btns.map(function (b) { return b.id; });
check('亮A 阶段: 有 ♠ 花色按钮', ids.indexOf('liangA:S') >= 0, ids.join(','));
check('亮A 阶段: 有 ♥ 花色按钮', ids.indexOf('liangA:H') >= 0, ids.join(','));
check('亮A 阶段: 没有单独的「亮A」按钮', ids.indexOf('liangA') < 0, ids.join(','));
// [2026-10-27] 规格变了: 「不亮」按钮**取消**(改成 5 秒倒计时) -> 这条断言从「保留」翻成「没有」
check('亮A 阶段: **没有**「不亮」按钮(改成 5 秒倒计时)', ids.indexOf('noLiangA') < 0, ids.join(','));
// [2026-10-27] 规格变了: 改为**固定列出 4 个花色**(手里没有的置灰), 不再是「有几个加几个」
check('亮A 阶段: 固定 4 个花色按钮', btns.length === 4, 'n=' + btns.length + ' ids=' + ids.join(','));
check('亮A 阶段: 4 个花色都在(S/H/D/C)',
  ids.indexOf('liangA:S') >= 0 && ids.indexOf('liangA:H') >= 0 &&
  ids.indexOf('liangA:D') >= 0 && ids.indexOf('liangA:C') >= 0, ids.join(','));

var byId = {};
btns.forEach(function (b) { byId[b.id] = b; });
check('♠ 可点(手里有 ♠A)', byId['liangA:S'] && byId['liangA:S'].enabled === true,
  JSON.stringify(byId['liangA:S']));
check('♥ 可点(手里有 ♥A)', byId['liangA:H'] && byId['liangA:H'].enabled === true,
  JSON.stringify(byId['liangA:H']));
check('♦ **不可点**(手里没有 ♦A)', byId['liangA:D'] && byId['liangA:D'].enabled === false,
  JSON.stringify(byId['liangA:D']));
check('♣ **不可点**(手里没有 ♣A)', byId['liangA:C'] && byId['liangA:C'].enabled === false,
  JSON.stringify(byId['liangA:C']));

var suitBtns = btns.filter(function (b) { return b.kind === 'suit'; });
check('花色按钮带 kind=suit + suit 字段',
  suitBtns.length === 4 && suitBtns.every(function (b) { return !!b.suit; }),
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
check('点 ♠ 按钮 -> 主A 由真人确立', !!(zhu && zhu.establishedBy === myId),
  'zhu=' + JSON.stringify(zhu));

// 另一个花色: 重新注入, 点 ♥ -> 亮红桃大A
var myId2 = setup([aS, aH]);
g.uiClick('liangA:H');
var zhu2 = g.gameState()['主A'];
check('点 ♥ 按钮 -> 主A 是红桃', !!(zhu2 && zhu2.suit === 'H'),
  'zhu=' + JSON.stringify(zhu2));

console.log('test-ui-liang-a-suit: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
