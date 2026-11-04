// tests/test-ui-play-wide.js —— 桌面出牌显示**不截断**
//
// 用户报障(2026-11-04): 「我出55667788991010JJQQ，桌面上显示不全」
//   根因: ui-render.js drawSeatPlays 里 `Math.min(cards.length, 10)` **硬截断到 10 张**,
//          16 张的双龙只画出 10 张 + 一个 "+6" -> 看着没出全。
//   修法: 不再截断, 按该槽位**可用宽度压缩步长**, 尽量全部画出;
//         只有连最小步长都塞不下才截断并标 "+N"。
//
// 跑法: node tests/test-ui-play-wide.js
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

// 能抓文字+坐标的假 ctx
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
  { id: 'A', hand: [], 底牌: null }, { id: 'B', hand: [], 底牌: null },
  { id: 'C', hand: [], 底牌: null }, { id: 'D', hand: [], 底牌: null },
  { id: 'E', hand: [], 底牌: null }
];
function baseState(uiPlays) {
  return {
    W: 844, H: 390, phase: 'PLAY',
    gameState: { phase: 'PLAY', players: PLAYERS, '主方': ['B'], '抓方': ['A','C','D','E'], table: [] },
    currentPlayer: 'A', humanPlayer: 'B',
    selectedCards: [], names: ['甲','乙','丙','丁','戊'],
    // [给每张牌一个唯一标记] -> 渲染层画出的点数文字就是该标记, 可精确计数画了几张牌
    rankDesc: function (card) { return card && card._tag ? card._tag : ''; },
    cardDesc: function (card) { return card && card._tag ? card._tag : ''; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: uiPlays || {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000
  };
}

// 用户报障的那手牌: 55667788991010JJQQ (16 张, 双龙)
function wideHand() {
  var out = [], d = 0;
  [[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2]].forEach(function (r) {
    for (var i = 0; i < r[1]; i++) {
      var c = C('S', r[0], 'w' + (d++));
      c._tag = 'T' + d;
      out.push(c);
    }
  });
  return out;
}

// 数一数画出了几张牌(按唯一标记计数)
function drawnTags(ctx) {
  return ctx.items.filter(function (i) { return /^T\d+$/.test(i.t); });
}

console.log('=== 1. 真人自己出 16 张 -> 全部画在按钮位(不截断) ===');
{
  var cards = wideHand();
  var ctx = mockCtx();
  uiRender.render(ctx, baseState({ B: cards }));
  var tags = drawnTags(ctx);
  var plus = ctx.items.filter(function (i) { return /^\+\d+$/.test(i.t); });
  check('1.1 16 张牌**全部**画出', tags.length === 16, 'drawn=' + tags.length);
  check('1.2 不再出现 "+N" 截断标记', plus.length === 0,
    JSON.stringify(plus.map(function (x) { return x.t; })));
  // 全部落在屏幕内, 且按 x 从小到大排(不重叠错乱)
  var inScreen = tags.every(function (i) { return i.x >= 0 && i.x <= 844; });
  check('1.3 全部落在屏幕内', inScreen,
    'x=' + Math.min.apply(null, tags.map(function (i) { return i.x; })) + '..' +
    Math.max.apply(null, tags.map(function (i) { return i.x; })));
  var xs = tags.map(function (i) { return i.x; }).sort(function (a, b) { return a - b; });
  var mono = true;
  for (var k = 1; k < xs.length; k++) if (xs[k] <= xs[k - 1]) mono = false;
  check('1.4 16 张横向排开, x 严格递增(没有挤在一起)', mono, JSON.stringify(xs));
}

console.log('=== 2. AI 出 16 张 -> 全部画在头像内侧(不截断) ===');
{
  var cards = wideHand();
  var ctx = mockCtx();
  uiRender.render(ctx, baseState({ D: cards }));
  var tags = drawnTags(ctx);
  var plus = ctx.items.filter(function (i) { return /^\+\d+$/.test(i.t); });
  check('2.1 AI 的 16 张也全部画出', tags.length === 16, 'drawn=' + tags.length);
  check('2.2 不再出现 "+N" 截断标记', plus.length === 0,
    JSON.stringify(plus.map(function (x) { return x.t; })));
}

console.log('=== 3. 少量牌仍按原样显示(回归) ===');
{
  var cards = [C('S', 9, 'a1'), C('H', 6, 'a2')];
  cards[0]._tag = 'T1'; cards[1]._tag = 'T2';
  var ctx = mockCtx();
  uiRender.render(ctx, baseState({ D: cards }));
  check('3.1 两张牌都画出来', drawnTags(ctx).length === 2, 'n=' + drawnTags(ctx).length);
}

console.log('=== 4. 源码级守卫: 硬截断语句已消失 ===');
{
  var fs = require('fs');
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'ui-render.js'), 'utf8');
  check('4.1 没有 `var n = Math.min(cards.length, 10)` 这种硬截断',
    src.indexOf('var n = Math.min(cards.length, 10)') < 0);
  check('4.2 新的按宽度压缩逻辑在(seen/shown 变量)',
    src.indexOf('var shown = n;') >= 0);
}

console.log('test-ui-play-wide: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
