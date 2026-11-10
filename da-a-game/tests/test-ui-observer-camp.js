// tests/test-ui-observer-camp.js —— 观察者视角敌友标记 + 4取牌「取」标志 的回归锁
//
// 背景(2026-11-11 用户报障):
//   1. 切换到 AI 玩家视角, AI **推定**出来的玩家敌友标记没变, 还是问号,
//      但 AI 实际出牌已经按推定出的敌友走。
//      根因: game.js 观察者视角把 humanPlayer **改写成观察者本人**, 渲染层却用
//            「observer !== humanPlayer」判观察态 -> 恒为假 -> 掉进真人手动标记分支 -> 一直画问号。
//      修法: 观察态判据改成「有没有观察者」(切回自己时 observer=null)。
//   2. 桌面上被 4 取走的牌没有「取」标志。
//      根因: 扫描函数被写在**模块顶层**(只在加载时空跑一次) -> 取牌时从没被调用。
//      修法: 改成从引擎出牌流水(plays)里认 kind='CAPTURE' 的条目(beat=被取走那手牌的主人)。
//
// 本文件锁**性质**(谁该显示敌/友/问号、标志该落在谁身上), 不写死具体牌。
// 跑法: node tests/test-ui-observer-camp.js
var mock = require('./mock-wx.js');
mock.install({ width: 900, height: 500 });   // 必须在 require game.js 之前
var uiRender = require('../ui-render.js');
var g = require('../game.js');
var SB = require('./lib/state-builder.js');
var transition = require('../src/transition.js').transition;

var VW = 844, VH = 390;
var passed = 0, failed = 0;
var failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// 录文字的假 ctx
function mockCtx() {
  var items = [];
  var noop = function () {};
  return {
    items: items,
    canvas: { width: VW, height: VH },
    measureText: function (t) { return { width: String(t || '').length * 8 }; },
    fillText: function (t, x, y) { items.push({ t: String(t), x: x, y: y }); },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arcTo: noop, arc: noop, fill: noop, stroke: noop, clearRect: noop,
    fillRect: noop, translate: noop, rotate: noop, scale: noop, ellipse: noop,
    setLineDash: noop, createLinearGradient: function () { return { addColorStop: noop }; },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1
  };
}
function countText(items, s) { return items.filter(function (i) { return i.t === s; }).length; }

// 暗打局面: 主A=B, 次方=C(未亮明), 抓方=A/D/E
// 公开流水: A 用大蛋子+ 压了身份未明的 D -> 推定 A 是次方(裁定A: 其余未知玩家=队友)
function darkState() {
  return {
    phase: 'PLAY', mode: '2V3_暗打',
    '主A': { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false,
    '主方': ['B', 'C'], '抓方': ['A', 'D', 'E'],
    table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null,
    plays: [{ playerId: 'A', type: 'BIG_TRIPLE', count: 3, beat: 'D' }],
    players: ['A', 'B', 'C', 'D', 'E'].map(function (id) { return { id: id, hand: [], '底牌': null }; })
  };
}
function renderState(extra) {
  var st = {
    W: VW, H: VH, phase: 'PLAY',
    gameState: darkState(),
    currentPlayer: 'A', humanPlayer: 'E',
    selectedCards: [], names: ['甲', '乙', '丙', '丁', '戊'],
    rankDesc: function () { return ''; }, cardDesc: function () { return ''; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {}, uiTakenPlay: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000,
    turnIsLiang: false, turnIsGate: false
  };
  for (var k in (extra || {})) st[k] = extra[k];
  return st;
}

section('§1. 观察者视角(切到AI玩家): 敌友按**该观察者的推定**显示');
{
  // game.js 观察者视角: humanPlayer 被改写成观察者本人, observer = 观察者
  var st = renderState({ humanPlayer: 'E', observer: 'E' });
  var ctx = mockCtx();
  var out = uiRender.render(ctx, st);
  var nE = countText(ctx.items, '敌'), nF = countText(ctx.items, '友'), nQ = countText(ctx.items, '?');
  check('§1.1 画出了 4 个敌友标记', nE + nF + nQ === 4, '敌=' + nE + ' 友=' + nF + ' ?=' + nQ);
  check('§1.2 推定出的次方显示「敌」(不是问号)', nE === 2, '敌=' + nE);
  check('§1.3 其余未知玩家按裁定A显示「友」', nF === 2, '友=' + nF);
  check('§1.4 观察者视角没有问号(推定已定)', nQ === 0, '?=' + nQ);
  check('§1.5 观察者视角不可点改敌友(无命中框)', (out.markHits || []).length === 0,
    'hits=' + (out.markHits || []).length);
}

section('§2. 真人自己视角: 推定的关系仍显示问号(AI_POLICY 11.3)');
{
  var st = renderState({ humanPlayer: 'E', observer: null });
  var ctx = mockCtx();
  var out = uiRender.render(ctx, st);
  var nE = countText(ctx.items, '敌'), nQ = countText(ctx.items, '?');
  check('§2.1 确定的关系(对主A)显示「敌」', nE === 1, '敌=' + nE);
  check('§2.2 推定的关系仍是问号', nQ === 3, '?=' + nQ);
  check('§2.3 真人视角有敌友命中框(可手改)', (out.markHits || []).length === 4,
    'hits=' + (out.markHits || []).length);
}

section('§3. 4取牌: 被取走的那手牌标「取」');
{
  var nines = [SB.C('H', 9), SB.C('D', 9), SB.C('C', 9)];
  var fours = [SB.C('S', 4), SB.C('H', 4)];
  var st = SB.build({ table: nines, lastPlayer: 'E', handMap: { A: fours } });
  check('§3.0 构造态合法 108 张', SB.countAll(st) === 108, 'total=' + SB.countAll(st));
  var r = transition(st, { type: 'PLAY', payload: { playerId: 'A', cardIds: fours.map(function (c) { return c.id; }) } });
  check('§3.1 取牌成功', r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
  if (r.ok) {
    var caps = (r.state.plays || []).filter(function (p) { return p && p.kind === 'CAPTURE'; });
    check('§3.2 出牌流水里有 CAPTURE 记录', caps.length === 1, 'n=' + caps.length);
    check('§3.3 CAPTURE.beat = 被取走那手牌的主人', caps.length === 1 && caps[0].beat === 'E',
      caps.length ? ('beat=' + caps[0].beat) : '-');
    var taker = r.state.players.filter(function (p) { return p.id === 'A'; })[0].hand
      .filter(function (c) { return c['取自']; });
    check('§3.4 被取的牌进了取牌者手牌', taker.length === 3, 'n=' + taker.length);

    g.__setState(r.state, { currentPlayer: 'A', human: 'A' });
    var ui = g.__uiState();
    var marks = ui.uiTakenPlay || {};
    check('§3.5 UI 标记了被取走那手牌的主人', marks.E === true, JSON.stringify(marks));
    check('§3.6 取牌者自己没被标', !marks.A, JSON.stringify(marks));

    g.uiPlays().E = nines;
    var styles = g.__renderTextStyles();
    var taken = styles.filter(function (s) { return s.text === '取'; });
    check('§3.7 画面上被取那手牌标了「取」', taken.length === 1, 'n=' + taken.length);
    check('§3.8 「取」是黄字', taken.length === 1 && taken[0].style === '#ffe9a8',
      taken.length ? taken[0].style : '-');
  }
}

console.log('');
console.log('==================================================');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed) {
  console.log('');
  console.log('FAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);
