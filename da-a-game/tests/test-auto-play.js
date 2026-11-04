// tests/test-auto-play.js —— 托管(顶栏小机器人)专项回归
//
// [用户 2026-11-04 裁定]
//   顶栏右上角小机器人按钮 -> 点击 AI 玩家操作真人手牌, 再次点击取消托管
//   托管时真人手牌处显示透明「取消托管」标识, 点该区域或小机器人都能取消
//   托管**不跨局保留**
//
// 跑法: node tests/test-auto-play.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

section('1. 托管开关: 点击切换');
{
  check('1.1 初始为关闭', g.uiAutoPlay() === false, String(g.uiAutoPlay()));
  g.toggleAutoPlay();
  check('1.2 点击后开启', g.uiAutoPlay() === true, String(g.uiAutoPlay()));
  g.toggleAutoPlay();
  check('1.3 再点关闭', g.uiAutoPlay() === false, String(g.uiAutoPlay()));
}

section('2. 托管不跨局保留');
{
  g.toggleAutoPlay();
  check('2.1 托管已开', g.uiAutoPlay() === true, '');
  g.newGame();
  check('2.2 新局后托管重置为关', g.uiAutoPlay() === false, String(g.uiAutoPlay()));
}

section('3. 渲染层: 顶栏小机器人 + 手牌区「取消托管」');
{
  function mockCtx() {
    var out = [];
    var noop = function () {};
    return {
      items: out, canvas: { width: 844, height: 390 },
      measureText: function (t) { return { width: String(t || '').length * 8 }; },
      fillText: function (t, x, y) { out.push({ t: String(t), x: x, y: y }); },
      save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
      lineTo: noop, arcTo: noop, arc: noop, fill: noop, stroke: noop,
      fillRect: noop, clearRect: noop, translate: noop, rotate: noop, scale: noop,
      setLineDash: noop, createLinearGradient: function () { return { addColorStop: noop }; },
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1
    };
  }
  var C3 = require('../src/card.js').createNormalCard;
  var meHand = [C3('S',5,'ap1'), C3('H',6,'ap2'), C3('D',7,'ap3')];
  var st = {
    W: 844, H: 390, phase: 'PLAY',
    gameState: { phase: 'PLAY', players: [
      { id: 'A', hand: [], 底牌: null }, { id: 'B', hand: meHand, 底牌: null },
      { id: 'C', hand: [], 底牌: null }, { id: 'D', hand: [], 底牌: null },
      { id: 'E', hand: [], 底牌: null }], '主方': ['B'], '抓方': ['A','C','D','E'], table: [] },
    currentPlayer: 'A', humanPlayer: 'B',
    selectedCards: [], names: ['甲','乙','丙','丁','戊'],
    rankDesc: function () { return ''; }, cardDesc: function () { return ''; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000,
    autoPlay: false
  }
  var ctx = mockCtx();
  var out = uiRender.render(ctx, st);
  check('3.1 渲染层返回顶栏机器人图标', !!(out.autoPlayIcon && out.autoPlayIcon.r > 0), JSON.stringify(out.autoPlayIcon));
  check('3.2 机器人图标在屏幕右上角(不贴最右边)',
    out.autoPlayIcon.x > 844 * 0.7 && out.autoPlayIcon.x < 844 - 20,
    'x=' + out.autoPlayIcon.x.toFixed(1));
  check('3.3 未托管时手牌区没有「取消托管」', out.cancelAutoPlayBox === null, JSON.stringify(out.cancelAutoPlayBox));
  st.autoPlay = true;
  var ctx2 = mockCtx();
  var out2 = uiRender.render(ctx2, st);
  var hasCancel = ctx2.items.some(function (i) { return i.t === '取消托管'; });
  check('3.4 托管时手牌区显示「取消托管」文字', hasCancel, JSON.stringify(ctx2.items.map(function (i) { return i.t; })).slice(0, 200));
  check('3.5 托管时有「取消托管」命中框', !!(out2.cancelAutoPlayBox && out2.cancelAutoPlayBox.w > 0), JSON.stringify(out2.cancelAutoPlayBox));
}

section('4. 托管: AI 接管真人手牌');
{
  g.toggleAutoPlay();
  check('4.1 托管开启后状态为开', g.uiAutoPlay() === true, String(g.uiAutoPlay()));
  check('4.2 托管时真人无法手动出牌', (function () {
    var btns = g.uiButtonModel();
    var pb = btns.filter(function (b) { return b.id === 'play'; })[0];
    if (!pb) return true;
    return pb.enabled === false;
  })(), 'play=' + JSON.stringify(g.uiButtonModel().filter(function (b) { return b.id === 'play'; })[0]));
  g.toggleAutoPlay();
  check('4.3 关闭托管后恢复为关', g.uiAutoPlay() === false, String(g.uiAutoPlay()));
}
console.log('\ntest-auto-play: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
