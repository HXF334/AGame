// tests/test-ui-display-batch.js —— 记牌器默认展开 / 「不出」残留 / 结算几何 / 积分文案
//
// 用户原话(2026-10-27):
//   4) 「记牌器默认展开。」
//   5) 「我亮的大A并且有首出权, 但是甲前面有个不出文字。」
//   6) 「结算画面标题和下边明细贴的有点近, 把结算画面高度稍微加一点, 整体往下一点。」
//   7) 「结算画面的积分后面加个分字, 玩家头像下面的积分正分的情况不用加号。」
//
// 跑法: node tests/test-ui-display-batch.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');
var { createNormalCard } = require('../src/card.js');
g.__setAiDelay(0);
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

// ===== 一个能抓文字+坐标的假 ctx =====
function mockCtx() {
  var out = [];
  var noop = function () {};
  return {
    items: out,
    canvas: { width: 844, height: 390 },
    measureText: function (t) { return { width: String(t || '').length * 8 }; },
    fillText: function (t, x, y) { out.push({ t: String(t), x: x, y: y }); },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arcTo: noop, arc: noop, fill: noop, stroke: noop,
    fillRect: noop, clearRect: noop, translate: noop, rotate: noop, scale: noop,
    setLineDash: noop, createLinearGradient: function () { return { addColorStop: noop }; },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1
  };
}

var PLAYERS = [
  { id: 'A', hand: [C('S', 5, 'a0'), C('H', 6, 'a1')], 底牌: null },
  { id: 'B', hand: [], 底牌: null },
  { id: 'C', hand: [C('D', 7, 'c0')], 底牌: null },
  { id: 'D', hand: [C('C', 8, 'd0')], 底牌: null },
  { id: 'E', hand: [C('S', 9, 'e0')], 底牌: null }
];
function baseState(phase, scores, settlement) {
  return {
    W: 844, H: 390,
    phase: phase,          // 渲染层判的是 **st.phase**(结算面板/按钮都看它)
    gameState: { phase: phase, players: PLAYERS, '主方': ['B'], '抓方': ['A', 'C', 'D', 'E'], table: [] },
    currentPlayer: null, humanPlayer: 'B',
    selectedCards: [], names: ['甲', '乙', '丙', '丁', '戊'],
    rankDesc: function () { return ''; }, cardDesc: function () { return ''; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: scores || {}, settlement: settlement || null,
    turnDeadline: 0, turnTotal: 20000
  };
}

// ===== 4) 记牌器默认展开 =====
g.newGame();
check('记牌器默认展开', g.uiMemoOpen() === true, String(g.uiMemoOpen()));

// ===== 5) 进 PLAY 阶段时「不出」标记要清干净 =====
// 注: 断言**不能**下在 newGame() 之后 —— 那时闸门还在跑, 引擎在闸门阶段
//   会**自动过牌**(亮A/反A/身份阶段), 标记是那会儿留下的, 要等进 PLAY 才清。
//   (这正是用户报的: 我亮了大A而且有首出权, 但甲头上还挂着「不出」)
g.__driveGateToPlay({ liangA: false });   // 把闸门确定性地走到 PLAY
check('进 PLAY 阶段后没有残留的「不出」标记', Object.keys(g.uiPassed()).length === 0,
  'phase=' + g.gameState().phase + ' uiPassed=' + JSON.stringify(g.uiPassed()));
var _fs = require('fs'), _path = require('path');
var _src = _fs.readFileSync(_path.join(__dirname, '..', 'game.js'), 'utf8');
check('源码: newGame 清「不出」标记',
  /uiPassed = \{\};\s*\/\/ \[2026-10-27\]/.test(_src));
check('源码: 进 PLAY 阶段清「不出」标记',
  /function enterPlayIfNeeded\(\)[\s\S]{0,500}uiPassed = \{\};/.test(_src));

// ===== 6) 结算画面几何: 标题离明细远一点 + 整体往下 =====
var lay = uiRender.layout(844, 390);
var SL = uiRender.settlementLayout(lay);
// 标题文字底边 与 第一行底纹顶边 的间距
var titleBottom = SL.py + SL.titleH * 0.5 + SL.titleFs / 2;
var firstRowTop = SL.py + SL.titleH - SL.rowH * 0.46;
check('结算: 标题与第一行之间有 >=6px 空隙(标题不压明细)',
  firstRowTop - titleBottom >= 6,
  'gap=' + (firstRowTop - titleBottom).toFixed(1) + ' titleBottom=' + titleBottom.toFixed(1) + ' firstRowTop=' + firstRowTop.toFixed(1));
check('结算: 面板比居中位置**偏下**', SL.py > (lay.vh - SL.ph) / 2,
  'py=' + SL.py.toFixed(1) + ' 居中=' + ((lay.vh - SL.ph) / 2).toFixed(1));
check('结算: 面板高度加了(比上一版 231 大)', SL.ph > 235, 'ph=' + SL.ph);
check('结算: 面板没超出屏幕', SL.py >= 0 && SL.py + SL.ph <= lay.vh,
  'py=' + SL.py.toFixed(1) + ' ph=' + SL.ph + ' vh=' + lay.vh);

// ===== 7) 积分文案 =====
var scores = { A: -1, B: 2, C: -1, D: -1, E: 1 };
var ctxEnd = mockCtx();
uiRender.render(ctxEnd, baseState('GAME_END', scores,
  { res: { winner: '主方' }, scores: scores }));
var endTexts = ctxEnd.items.map(function (i) { return i.t; });
check('结算画面: 正分是「+2分」', endTexts.indexOf('+2分') >= 0,
  JSON.stringify(endTexts.filter(function (t) { return t.indexOf('分') >= 0; })));
check('结算画面: 负分是「-1分」', endTexts.indexOf('-1分') >= 0,
  JSON.stringify(endTexts.filter(function (t) { return t.indexOf('分') >= 0; })));

// 头像下面的积分: 正分**不带加号**
var ctxPlay = mockCtx();
uiRender.render(ctxPlay, baseState('PLAY', scores, null));
var playTexts = ctxPlay.items.map(function (i) { return i.t; });
check('头像下面: 正分不带加号(「2分」)', playTexts.indexOf('2分') >= 0,
  JSON.stringify(playTexts.filter(function (t) { return t.indexOf('分') >= 0; })));
check('头像下面: **没有**「+2分」这种写法', playTexts.indexOf('+2分') < 0,
  JSON.stringify(playTexts.filter(function (t) { return t.indexOf('分') >= 0; })));
check('头像下面: 负分照旧是「-1分」', playTexts.indexOf('-1分') >= 0,
  JSON.stringify(playTexts.filter(function (t) { return t.indexOf('分') >= 0; })));

console.log('test-ui-display-batch: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
