// tools/item-scene.js — 子进程: 造一个场景, 跑真 game.js, 把绘制调用录成 JSON
'use strict';
var fs = require('fs');
var path = require('path');
var GAME = path.resolve(__dirname, '..');   // 仓库内: tools/ 的上一级 = da-a-game
var VW = 844, VH = 390;

var ops = { texts: [], rects: [], arcs: [] };
function makeCtx() {
  var ctx = { canvas: { width: VW, height: VH } };
  var M = ['fillRect','strokeRect','fillText','clearRect','beginPath','closePath','moveTo','lineTo',
    'arcTo','arc','fill','stroke','save','restore','translate','rotate','scale','setTransform',
    'drawImage','measureText','createLinearGradient','ellipse','setLineDash'];
  M.forEach(function (m) {
    ctx[m] = function () {
      if (m === 'fillText') ops.texts.push({ t: String(arguments[0]), x: arguments[1], y: arguments[2], style: ctx.fillStyle, font: ctx.font });
      else if (m === 'fillRect') ops.rects.push({ x: arguments[0], y: arguments[1], w: arguments[2], h: arguments[3], style: ctx.fillStyle });
      else if (m === 'arc') ops.arcs.push({ x: arguments[0], y: arguments[1], r: arguments[2] });
      if (m === 'measureText') return { width: String(arguments[0] || '').length * 8 };
      if (m === 'createLinearGradient') return { addColorStop: function () {} };
    };
  });
  ctx.fillStyle = ''; ctx.strokeStyle = ''; ctx.lineWidth = 1; ctx.font = '';
  ctx.textAlign = ''; ctx.textBaseline = ''; ctx.globalAlpha = 1;
  return ctx;
}
var canvas = { width: VW, height: VH, getContext: function (t) { return t === '2d' ? makeCtx() : null; },
  addEventListener: function () {}, removeEventListener: function () {},
  requestAnimationFrame: function (cb) { setImmediate(cb); return 1; }, cancelAnimationFrame: function () {} };
var touch = [];
global.wx = {
  __isMock: true, createCanvas: function () { return canvas; },
  onTouchStart: function (cb) { touch.push(cb); },
  onTouchMove: function () {}, onTouchEnd: function () {}, onWindowResize: function () {},
  getSystemInfoSync: function () { return { windowWidth: VW, windowHeight: VH, pixelRatio: 2, platform: 'devtools' }; },
  getSystemInfo: function () { return { windowWidth: VW, windowHeight: VH }; },
  createImage: function () { return { src: '', onload: function () {} }; },
  vibrateShort: function () {}, showToast: function () {},
  setStorageSync: function () {}, getStorageSync: function () { return ''; }, removeStorageSync: function () {},
  getFileSystemManager: function () { return { writeFileSync: function () {}, readFileSync: function () { return ''; }, accessSync: function () {} }; }
};

var g = require(path.join(GAME, 'game.js'));
var sb = require(path.join(GAME, 'tests', 'lib', 'state-builder.js'));

function tap(x, y) {
  var evt = { touches: [{ clientX: x, clientY: y, x: x, y: y }],
             changedTouches: [{ clientX: x, clientY: y, x: x, y: y }], timeStamp: Date.now() };
  touch.forEach(function (cb) { if (cb) cb(evt); });
}

var DARK = {
  phase: 'PLAY', mode: '2V3_暗打',
  '主A': { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
  '次方': 'C', '次方公开': false,
  '主方': ['B', 'C'], '抓方': ['A', 'D', 'E']
};
function base(extra) {
  var st = sb.build(Object.assign({}, DARK, extra || {}));
  // state-builder **不返回** '出完顺序'(它只认自己那批字段) -> 贡字靠它, 必须补上
  if (extra && extra['出完顺序']) st['出完顺序'] = extra['出完顺序'].slice();
  return st;
}

function setState(st, human, current) {
  g.__setState(st, { human: human, currentPlayer: current });
}
function putPlay(pid, cards) {
  var us = g.__uiState();
  us.uiPlays[pid] = cards;
  us.uiPlaysTrick[pid] = us.uiTrickId;
}

var SCENES = {};

SCENES.play = function () {
  var st = base({
    '出完顺序': ['A'], emptyPlayers: ['A'],
    plays: [{ playerId: 'A', type: 'TRIPLE', count: 3, beat: null }]
  });
  setState(st, 'D', 'A');
  putPlay('A', [sb.C('H', 9), sb.C('H', 5), sb.C('D', 12)]);
};

// 桌面贡字: 出完的人**桌上无牌**时才显示(有牌在桌上先显示牌)
SCENES.gong = function () {
  var st = base({ '出完顺序': ['A'], emptyPlayers: ['A'], plays: [] });
  setState(st, 'D', 'B');
};

SCENES.observer = function () {
  var st = base({ plays: [{ playerId: 'A', type: 'TRIPLE', count: 3, beat: null }] });
  setState(st, 'D', 'A');
  putPlay('A', [sb.C('H', 9), sb.C('H', 5), sb.C('D', 12)]);
  var m = g.uiLayoutSnapshot();
  tap(m.seats[0].x, m.seats[0].y);
};

SCENES.observerLit = function () {
  var st = base({ '次方公开': true, plays: [{ playerId: 'A', type: 'TRIPLE', count: 3, beat: null }] });
  setState(st, 'D', 'A');
  var m = g.uiLayoutSnapshot();
  tap(m.seats[0].x, m.seats[0].y);
};

SCENES.oneV4Holder = function () {
  var st = base({
    mode: '1V4_明打',
    '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': null, '次方公开': true,
    '主方': ['A'], '抓方': ['B', 'C', 'D', 'E']
  });
  setState(st, 'D', 'A');
  var m = g.uiLayoutSnapshot();
  tap(m.seats[2].x, m.seats[2].y);   // R1 = 主A持有者 A
};

SCENES.oneV4Taker = function () {
  var st = base({
    mode: '1V4_明打',
    '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': null, '次方公开': true,
    '主方': ['A'], '抓方': ['B', 'C', 'D', 'E']
  });
  setState(st, 'D', 'A');
  var m = g.uiLayoutSnapshot();
  tap(m.seats[0].x, m.seats[0].y);   // L1 = 抓方 B
};

SCENES.autoplay = function () {
  var st = base({ plays: [] });
  setState(st, 'D', 'D');
  g.__setAutoPlay(true);
};

SCENES.gate = function () {
  var st = base({
    phase: 'LIANG_A',
    handMap: { D: [sb.C('H', 14), sb.C('H', 14), sb.C('S', 14), sb.C('S', 14), sb.C('D', 7)] }
  });
  setState(st, 'D', 'D');
  g.__setGateChoice({ kind: 'LIANG_A', eligible: ['H', 'S'], reason: 'shot',
    cards: [sb.C('H', 14), sb.C('S', 14)] });
};

SCENES.settle = function () {
  var st = base({ phase: 'GAME_END', '出完顺序': ['A', 'B', 'C'], emptyPlayers: ['A', 'B', 'C'] });
  setState(st, 'D', 'A');
};

SCENES.passed = function () {
  // passedPlayers 与注入的 uiPassed 保持一致: draw() 里的 _uiSyncPassState 会按引擎状态同步
  var st = base({ plays: [], passedPlayers: ['C', 'D'], passCount: 2 });
  setState(st, 'D', 'A');
  var us = g.__uiState();
  us.uiPassed['C'] = true;
  us.uiPassed['D'] = true;
};

SCENES.taken = function () {
  var st = base({ plays: [
    { playerId: 'A', type: 'TRIPLE', count: 3, beat: null },
    { kind: 'CAPTURE', playerId: 'C', beat: 'A', useFours: 0 }
  ] });
  setState(st, 'D', 'C');
  putPlay('A', [sb.C('H', 9), sb.C('H', 5), sb.C('D', 12)]);
};

// E45: 信号C —— 有人用三个4取主A的牌 -> 观察者视角把那人标成友(抓方)
SCENES.signalC = function () {
  // 三个4取主A的牌 -> 记录与引擎 src/play.js 同形(type = identifyHand(playCards).type)
  var _fours = [sb.C('H', 4), sb.C('D', 4), sb.C('S', 4)];
  var _type = 'TRIPLE';
  try {
    var ht = require(path.join(GAME, 'src', 'hand-types.js'));
    var fn = ht.identifyHand || ht.identify || ht.detect;
    if (fn) _type = fn(_fours).type || _type;
  } catch (e) {}
  var st = base({ plays: [{ kind: 'CAPTURE', playerId: 'C', beat: 'B', useFours: 3, count: 3, type: _type }] });
  setState(st, 'D', 'A');
  var m = g.uiLayoutSnapshot();
  tap(m.seats[2].x, m.seats[2].y);   // R1 = 抓方 A
};

function main() {
  var name = process.argv[2];
  var outFile = process.argv[3];
  if (!SCENES[name]) { console.error('unknown scene ' + name); process.exit(2); }
  // 清掉**开局自动开局**残留的 UI 层状态(AI 可能会过牌 -> uiPassed 残留,
  // 会让画面上多出「不出」)。场景要什么自己再设。
  var _us = g.__uiState();
  Object.keys(_us.uiPassed).forEach(function (k) { delete _us.uiPassed[k]; });
  Object.keys(_us.uiPlays).forEach(function (k) { delete _us.uiPlays[k]; });
  Object.keys(_us.uiPlaysTrick).forEach(function (k) { delete _us.uiPlaysTrick[k]; });
  Object.keys(_us.uiTakenPlay).forEach(function (k) { delete _us.uiTakenPlay[k]; });
  SCENES[name]();
  // 只录**最后一帧**: __setState / 触摸切观察者 内部都会 draw(),
  // 一起录进来会让所有计数翻倍(敌友徽章数翻倍、按钮残留等)。
  ops.texts.length = 0; ops.rects.length = 0; ops.arcs.length = 0;
  g.draw();
  var gs = g.gameState();
  var us = g.__uiState();
  var out = {
    scene: name,
    ops: ops,
    layout: g.uiLayoutSnapshot(),
    buttons: g.uiButtonBoxes(),
    handHitboxes: g.handCardHitboxes(),
    uiPassed: us.uiPassed,
    uiTakenPlay: us.uiTakenPlay,
    uiPlays: Object.keys(us.uiPlays),
    humanPlayer: g.getHumanPlayer(),
    currentPlayer: g.currentPlayer(),
    phase: gs.phase,
    mode: gs.mode,
    '出完顺序': gs['出完顺序'] || [],
    players: gs.players.map(function (p) { return { id: p.id, hand: (p.hand || []).length }; })
  };
  fs.writeFileSync(outFile, JSON.stringify(out), 'utf8');
  console.log('OK ' + name + ' texts=' + ops.texts.length);
  process.exit(0);
}
main();