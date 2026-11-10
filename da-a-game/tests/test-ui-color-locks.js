// tests/test-ui-color-locks.js —— 画面「颜色/位置」类的无头锁
//
// 背景: 微信开发者工具模拟器的**像素级目视验收**需要人在有桌面的会话里看画面;
//   无头跑不到那一层 -> 凡是能录到绘制调用的事实, 就用「假 ctx」录下来断言, 免得留回归空档。
//   本文件锁的是**性质**(谁该是金色 / 谁该同色 / 标在哪 / 在什么位置), 不是某张具体的牌。
//
// 跑法: node tests/test-ui-color-locks.js
var uiRender = require('../ui-render.js');
var cardMod = require('../src/card.js');

var VW = 844, VH = 390;
var pass = 0, fail = 0;
var failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }

// 录调用用的假 ctx: 记录每次 fillText 的文本/坐标/**当时的 fillStyle**(颜色)
function mockCtx() {
  var items = [];
  var noop = function () {};
  return {
    items: items,
    canvas: { width: VW, height: VH },
    measureText: function (t) { return { width: String(t || '').length * 8 }; },
    fillText: function (t, x, y) { items.push({ t: String(t), x: x, y: y, font: this.font, color: this.fillStyle }); },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arcTo: noop, arc: noop, fill: noop, stroke: noop, clearRect: noop,
    fillRect: noop, translate: noop, rotate: noop, scale: noop, ellipse: noop,
    setLineDash: noop, createLinearGradient: function () { return { addColorStop: noop }; },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1
  };
}

function baseState(extra) {
  var st = {
    W: VW, H: VH, phase: 'PLAY',
    gameState: { phase: 'PLAY', players: [
      { id: 'A', hand: [], '底牌': null }, { id: 'B', hand: [], '底牌': null },
      { id: 'C', hand: [], '底牌': null }, { id: 'D', hand: [], '底牌': null },
      { id: 'E', hand: [], '底牌': null }],
      '主方': ['A', 'C'], '抓方': ['B', 'D', 'E'], table: [] },
    currentPlayer: 'A', humanPlayer: 'D',
    selectedCards: [], names: ['甲', '乙', '丙', '丁', '戊'],
    rankDesc: function () { return ''; }, cardDesc: function () { return ''; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {}, uiTakenPlay: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000,
    turnIsLiang: false, turnIsGate: false
  };
  if (extra) { for (var k in extra) st[k] = extra[k]; }
  return st;
}

function C(suit, rank, id) { return cardMod.createNormalCard(suit, rank, id); }
function textsOf(items, s) { return items.filter(function (i) { return i.t === s; }); }

section('§0. 基线: 假 ctx 能录到绘制调用');
{
  var ctx0 = mockCtx();
  uiRender.render(ctx0, baseState());
  check('§0.1 录到了文字', ctx0.items.length > 0, 'items=' + ctx0.items.length);
  check('§0.2 录到了颜色', ctx0.items.some(function (i) { return !!i.color; }), 'no color');
}

section('§1. 结算画面: 只有自己的名字是金色');
{
  var m = uiRender.layout(VW, VH);
  var SL = uiRender.settlementLayout(m);
  var st = baseState({
    phase: 'GAME_END',
    gameState: { phase: 'GAME_END', players: [
      { id: 'A', hand: [], '底牌': null }, { id: 'B', hand: [], '底牌': null },
      { id: 'C', hand: [], '底牌': null }, { id: 'D', hand: [], '底牌': null },
      { id: 'E', hand: [], '底牌': null }],
      '主方': ['A', 'C'], '抓方': ['B', 'D', 'E'], table: [], '出完顺序': ['A', 'B'] },
    settlement: { res: { winner: 'A' }, scores: { A: 3, B: -1, C: 0, D: 0, E: -2 } },
    scores: { A: 3, B: -1, C: 0, D: 0, E: -2 }
  });
  var ctx = mockCtx();
  uiRender.render(ctx, st);
  function inPanel(i) { return i.y > SL.py && i.y < SL.py + SL.ph; }
  function nameRow(name) {
    var hits = ctx.items.filter(function (i) { return i.t === name && inPanel(i) && Math.abs(i.x - (SL.px + 22)) < 0.5; });
    return hits[0] || null;
  }
  var selfRow = nameRow('丁');   // humanPlayer = D -> 名字「丁」
  check('§1.1 结算画面画出了自己那一行', !!selfRow, 'no row');
  check('§1.2 自己的名字是金色(#ffd700)', selfRow && selfRow.color === '#ffd700',
    selfRow ? selfRow.color : '-');
  var others = ['甲', '乙', '丙', '戊'].map(nameRow);
  check('§1.3 其他人的名字都不是金色',
    others.every(function (r) { return r && r.color !== '#ffd700'; }),
    others.map(function (r) { return r ? r.color : 'none'; }).join(','));
  check('§1.4 其他人的名字是白色',
    others.every(function (r) { return r && r.color === '#ffffff'; }),
    others.map(function (r) { return r ? r.color : 'none'; }).join(','));
  var gl = ctx.items.filter(function (i) {
    return (i.t === '大贡' || i.t === '二贡') && inPanel(i) && Math.abs(i.x - (SL.px + SL.pw - 72)) < 0.5;
  });
  check('§1.5 结算画面按出完顺序画出了贡标签', gl.length === 2,
    'n=' + gl.length + ' ' + gl.map(function (i) { return i.t; }).join('/'));
  check('§1.6 结算画面的贡标签颜色一致', gl.length === 2 && gl[0].color === gl[1].color,
    gl.map(function (i) { return i.t + ':' + i.color; }).join(' '));
}

section('§2. 座位旁贡字: 真人与 AI 同色; 没按顺序出完的是灰色');
{
  var st = baseState({
    gameState: { phase: 'PLAY', players: [
      { id: 'A', hand: [], '底牌': null }, { id: 'B', hand: [], '底牌': null },
      { id: 'C', hand: [], '底牌': null }, { id: 'D', hand: [], '底牌': null },
      { id: 'E', hand: [], '底牌': null }],
      '主方': ['A', 'C'], '抓方': ['B', 'D', 'E'], table: [], '出完顺序': ['A', 'D'] }
  });
  var ctx = mockCtx();
  uiRender.render(ctx, st);
  var big = textsOf(ctx.items, '大贡')[0];
  var two = textsOf(ctx.items, '二贡')[0];
  check('§2.1 按出完顺序画出了大贡/二贡', !!big && !!two, 'big=' + !!big + ' two=' + !!two);
  check('§2.2 真人座位与 AI 座位的贡字颜色一致', big && two && big.color === two.color,
    (big ? big.color : '-') + ' vs ' + (two ? two.color : '-'));
  check('§2.3 贡字不是灰色(灰色=没按顺序出完)', big && big.color !== '#9a9a9a', big ? big.color : '-');
  var done = textsOf(ctx.items, '已出完');
  check('§2.4 不在出完顺序里的玩家显示「已出完」', done.length > 0, 'n=' + done.length);
  check('§2.5 「已出完」是灰色', done.every(function (i) { return i.color === '#9a9a9a'; }),
    done.map(function (i) { return i.color; }).join(','));
}

section('§3. 被4取走的手牌: 只标最后一手');
{
  var st = baseState({
    uiPlays: { A: [C('S', 9, 'tk1'), C('H', 9, 'tk2'), C('D', 9, 'tk3')], B: [C('S', 7, 'ok1'), C('H', 7, 'ok2')] },
    uiTakenPlay: { A: true }
  });
  var ctx = mockCtx();
  uiRender.render(ctx, st);
  var taken = textsOf(ctx.items, '取');
  check('§3.1 被取的那手牌上有「取」标记', taken.length > 0, 'n=' + taken.length);
  check('§3.2 同一手只标一个「取」(只标最后一张)', taken.length === 1, 'n=' + taken.length);
  check('§3.3 「取」是黄字', taken.length === 1 && taken[0].color === '#ffe9a8',
    taken.length ? taken[0].color : '-');
}

section('§4. 托管: 「取消托管」在手牌下半部');
{
  var st = baseState({ autoPlay: true });
  st.gameState.players[3].hand = [C('S', 9, 'h1'), C('H', 10, 'h2'), C('D', 11, 'h3')];
  var ctx = mockCtx();
  var out = uiRender.render(ctx, st);
  var cancel = textsOf(ctx.items, '取消托管')[0];
  check('§4.1 托管时画出了「取消托管」', !!cancel, 'no text');
  var L2 = uiRender.handLayout(st.gameState.players[3].hand.length, uiRender.layout(VW, VH));
  check('§4.2 「取消托管」在手牌下半部(数字下方)',
    cancel && cancel.y > L2.y + L2.cardH * 0.5,
    cancel ? ('y=' + Math.round(cancel.y) + ' cardY=' + Math.round(L2.y) + ' h=' + Math.round(L2.cardH)) : '-');
  check('§4.3 「取消托管」有可点命中框', !!out.cancelAutoPlayBox, 'no box');
}

section('§5. 「不出」: 过牌的人显示');
{
  var st = baseState({ uiPassed: { A: true } });
  st.gameState.players[0].hand = [C('S', 9, 'p1')];
  st.gameState.players[1].hand = [];
  st.gameState['出完顺序'] = ['B'];
  var ctx = mockCtx();
  uiRender.render(ctx, st);
  var np = textsOf(ctx.items, '不出');
  check('§5.1 过牌的人显示「不出」', np.length > 0, 'n=' + np.length);
  check('§5.2 只有过牌的那一个显示「不出」', np.length === 1, 'n=' + np.length);
  check('§5.3 「不出」是金色', np.every(function (i) { return i.color === '#ffd700'; }),
    np.map(function (i) { return i.color; }).join(','));
}

console.log('');
console.log('==================================================');
console.log('checks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
if (fail) {
  console.log('');
  console.log('FAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
process.exit(0);
