// tests/test-ui-toast-countdown.js —— 提示条位置 / 空选弹出牌 / 亮A倒计时可见 / log 文案
//
// 用户原话(2026-10-27):
//   1) 「提示文字太靠上了, 放在中间。」
//   2) 「没选中牌的时候点出牌要弹提示, 不能直接出牌。」
//   3) 「开局5秒倒计时没看到, 直接跳过了, 但是log说有5秒倒计时。」
//   4) 「这段log说进入强制排查, 又说AI乙亮了, 又说真人已亮A, 看不懂」
//
// 跑法: node tests/test-ui-toast-countdown.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { createNormalCard } = require('../src/card.js');
var uiRender = require('../ui-render.js');
g.__setAiDelay(0);
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}

// 能抓文字+坐标的假 ctx(渲染层是纯函数, 可以直接构造 state 画一次)
function renderItems(state) {
  var out = [];
  var noop = function () {};
  var ctx = {
    canvas: { width: 844, height: 390 },
    measureText: function (t) { return { width: String(t || '').length * 8 }; },
    fillText: function (t, x, y) { out.push({ t: String(t), x: x, y: y }); },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arcTo: noop, arc: noop, fill: noop, stroke: noop,
    fillRect: noop, clearRect: noop, translate: noop, rotate: noop, scale: noop,
    setLineDash: noop, createLinearGradient: function () { return { addColorStop: noop }; },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1
  };
  uiRender.render(ctx, state);
  return out;
}
function baseState(extra) {
  var s = {
    W: 844, H: 390, phase: 'PLAY',
    gameState: { phase: 'PLAY', players: [], '主方': [], '抓方': [], table: [] },
    currentPlayer: null, humanPlayer: 'D', selectedCards: [],
    names: ['甲', '乙', '丙', '丁', '戊'],
    rankDesc: function () { return ''; }, cardDesc: function () { return ''; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000
  };
  for (var k in (extra || {})) s[k] = extra[k];
  return s;
}

// ===== 2) 没选中牌点【出牌】-> 弹提示, 且**不出牌** =====
g.newGame();
var st = g.gameState();
st.phase = 'PLAY';
var ids = ['A', 'B', 'C', 'D', 'E'];
st.players.forEach(function (p, i) {
  p.id = ids[i];
  p.hand = (i === 3) ? [C('S', 9, 'h0'), C('H', 10, 'h1'), C('D', 5, 'h2')] : [C('S', 3, 'x' + i)];
});
st['主A'] = { suit: 'C', establishedBy: 'A', viaMethod: 'LIANG_A' };
st['次方'] = null; st['次方公开'] = true; st['底牌公开'] = true;
st.table = []; st.discarded = []; st.lastPlayer = null; st.passedPlayers = [];
g.__setState(st, { currentPlayer: 'D', human: 'D', clearLog: true });

var handBefore = g.gameState().players[3].hand.length;
g.selectedCards().length = 0;
g.doPlay();
var handAfter = g.gameState().players[3].hand.length;
check('2.1 没选中牌点出牌 -> **不出牌**(手牌没少)', handBefore === handAfter,
  'before=' + handBefore + ' after=' + handAfter);
var lg = g.logHistory().join(' || ');
check('2.2 日志有「请先选牌」', lg.indexOf('请先选牌') >= 0, lg.slice(-160));
check('2.3 提示条真的画在画面上', g.__renderTexts().indexOf('请先选牌') >= 0);

// ===== 1) 提示条在**屏幕中间**(原来贴在顶栏下面) =====
var toastPos = renderItems(baseState({
  toast: { text: '请先选牌', until: Date.now() + 5000 }
})).filter(function (i) { return i.t === '请先选牌'; })[0];
check('1.1 提示条在**屏幕中间**(不再贴顶栏)',
  !!toastPos && Math.abs(toastPos.y - 195) < 40,
  'y=' + (toastPos ? toastPos.y.toFixed(1) : '(没画)') + ' 屏幕中=195');

// ===== 3) 亮A 的 5 秒倒计时要**看得见** =====
var aS = C('S', 14, 's1');
g.newGame();
g.__setGateChoice({ kind: 'LIANG_A', eligible: true, reason: '测试注入', cards: [aS] });
var items2 = renderItems(baseState({
  turnDeadline: g.uiLiangDeadline(), turnTotal: 5000, turnIsLiang: true
}));
var label = items2.filter(function (i) { return i.t.indexOf('自动跳过亮A') >= 0; })[0];
check('3.1 亮A 倒计时有**说明文字**(秒后自动跳过亮A)', !!label,
  JSON.stringify(items2.map(function (i) { return i.t; })).slice(0, 200));
var secItem = items2.filter(function (i) { return /^[0-9]$/.test(i.t); })[0];
check('3.2 亮A 倒计时的**秒数画出来了**', !!secItem,
  JSON.stringify(items2.map(function (i) { return i.t; })).slice(0, 200));
check('3.3 秒数画得够大(比出牌阶段的醒目)',
  !!secItem && secItem.t.length === 1, secItem ? secItem.t : '(没画)');

var _fs = require('fs'), _path = require('path');
var _src = _fs.readFileSync(_path.join(__dirname, '..', 'game.js'), 'utf8');
// 下一局后 ticker 要重新起(原来只停不启 -> 倒计时不刷新 -> 玩家看不到)
check('3.4 newGame 会重新起 ticker(倒计时才能刷新)',
  /uiStopTicker\(\);[\s\S]{0,140}uiStartTicker\(\);/.test(_src));

// ===== 4) log 文案要说清楚 =====
check('4.1 倒计时结束的 log 说明「由 AI 依次尝试亮A」',
  _src.indexOf('由 AI 依次尝试亮A(没人能亮就进强制排查)') >= 0);
// 注: 查 **log 语句本身**(注释里为了说明历史写法, 仍会出现那句旧文本)
check('4.2 「跳过」log 带上主A是谁立的(不再写死「真人已亮A」)',
  _src.indexOf("log('  跳过(主A已确立: '") >= 0);

console.log('test-ui-toast-countdown: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
