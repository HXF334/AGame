// tests/test-ui-play-position.js — 回归: 真人出牌的显示位置 / 按钮让位 / AI 等待闹钟
//
// [用户原话 2026-11-03]
//   1. 「真人手牌不是居中, 而是在原来按钮的位置显示, 按钮隐藏掉。」
//   2. 「现在轮到自己时上一手牌还在, 正常轮到自己出牌时上一手牌应该清掉显示按钮。」
//   3. 「其他玩家出牌时应该先显示倒计时, 等他们出牌或过牌后才会把闹钟隐藏掉
//       显示打出的手牌或不出。」
//
// [背景]
//   2026-11-02 的方案把真人出的牌画在**牌桌中央**(layout().center),
//   并且**轮到自己时不清掉**自己的旧出牌显示(当时牌在中央, 不和按钮冲突)。
//   2026-11-03 用户改了口径: 牌画到**原来按钮的位置**(layout().humanPlay),
//   于是「轮到自己」必须把上一手牌清掉, 否则牌和【出牌/不出/提示】三个按钮叠在一起。
//   同时补上**其他玩家行动时的闹钟**(原来只有真人回合有倒计时 -> AI 思考期间画面是静的)。
//
// [跑法] node tests/test-ui-play-position.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');
var { createNormalCard } = require('../src/card.js');
// [2026-11-03] AI 延迟设**大**: 延迟 0 时 AI 会在 doPlay 里**同步**打完一整圈
//   (都过牌 -> 绕回真人) -> 新口径「轮到真人就清掉上一手牌」会把记录清掉,
//   测不到「出牌后牌还在按钮位」。设大 -> AI 链异步等待, doPlay 返回时状态可测。
g.__setAiDelay(5000);

var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck); }

// ===== 能抓文字+坐标的假 ctx =====
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

// ===== 造一个渲染用 state =====
function baseState(over) {
  var st = {
    W: 844, H: 390, phase: 'PLAY',
    gameState: g.gameState(), currentPlayer: 'A', humanPlayer: 'D',
    selectedCards: [], names: ['甲', '乙', '丙', '丁', '戊'],
    rankDesc: function (c) { return String(c.rank); },
    cardDesc: function (c) { return c.id; },
    buttons: [{ id: 'play', label: '出牌', enabled: true },
              { id: 'pass', label: '不出', enabled: true },
              { id: 'hint', label: '提示', enabled: true }],
    stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000
  };
  for (var k in (over || {})) st[k] = over[k];
  return st;
}

// ============================================================
// 1. 布局: 真人出牌位 = 按钮行正中(不再是牌桌中央)
// ============================================================
section('1. 布局: 真人出牌位在按钮行');
var lay = uiRender.layout(844, 390);
check('1.1 layout 里有 humanPlay 位', !!lay.humanPlay, JSON.stringify(lay.humanPlay));
check('1.2 humanPlay 在按钮行的垂直范围内',
  lay.humanPlay.y >= lay.btn.y && lay.humanPlay.y <= lay.btn.y + lay.btn.h,
  'humanPlay.y=' + lay.humanPlay.y + ' btn=' + lay.btn.y + '~' + (lay.btn.y + lay.btn.h));
check('1.3 旧的 center 位已移除(牌不再画在牌桌中央)',
  lay.center === undefined, 'center=' + JSON.stringify(lay.center));

// ============================================================
// 2. 真人出牌画在按钮位, 且不再画在牌桌中央
// ============================================================
section('2. 真人出的牌画在按钮位, 不在牌桌中央');
var THREE_SIX = [C('H', 6, 'd0'), C('D', 6, 'd1'), C('S', 6, 'd2')];
var stPlay = baseState({
  uiPlays: { D: THREE_SIX },
  uiPlaysTrick: { D: 0 },
  uiTrickId: 0
});
var ctxPlay = mockCtx();
uiRender.render(ctxPlay, stPlay);
// 牌面文字 '6' 画在 humanPlay 附近
var nearHuman = ctxPlay.items.filter(function (i) {
  return i.t === '6' && Math.abs(i.y - lay.humanPlay.y) < lay.vh * 0.10 &&
         Math.abs(i.x - lay.humanPlay.x) < lay.vw * 0.30;
});
check('2.1 真人的出牌画在 humanPlay 位附近', nearHuman.length >= 1,
  'hits=' + nearHuman.length + ' humanPlay=(' + Math.round(lay.humanPlay.x) + ',' + Math.round(lay.humanPlay.y) + ')');
// 牌桌中央(y=vh*0.315)不应该再出现真人的那三张 6
var oldCenterY = lay.vh * 0.315;
var atOldCenter = ctxPlay.items.filter(function (i) {
  return i.t === '6' && Math.abs(i.y - oldCenterY) < lay.vh * 0.06 &&
         Math.abs(i.x - lay.vw * 0.5) < lay.vw * 0.15;
});
check('2.2 牌桌中央不再画真人出的牌', atOldCenter.length === 0,
  'hits=' + atOldCenter.length + ' y=' + Math.round(oldCenterY));

// ============================================================
// 3. 按钮让位: 真人出牌显示中 -> 按钮隐藏; 清掉 -> 按钮回来
// ============================================================
section('3. 按钮让位/恢复');
var ctxBtn = mockCtx();
var btnBoxes = uiRender.render(ctxBtn, stPlay).btnStage;
check('3.1 真人出牌显示中 -> 按钮被隐藏(btnStage 为空)', btnBoxes.length === 0,
  'n=' + btnBoxes.length);
var ctxBtn2 = mockCtx();
var stNoPlay = baseState({ uiPlays: {} });
var btnBoxes2 = uiRender.render(ctxBtn2, stNoPlay).btnStage;
check('3.2 真人没有出牌显示 -> 按钮正常出现(3 个)',
  btnBoxes2.length === 3, 'n=' + btnBoxes2.length);
check('3.3 按钮位置仍在按钮行',
  btnBoxes2.length > 0 && Math.abs(btnBoxes2[0].y - lay.btn.y) < 1, 'y=' + (btnBoxes2[0] && btnBoxes2[0].y));

// ============================================================
// 4. 状态机: 轮到自己 -> 清掉上一手牌 -> 按钮重新出现
// ============================================================
section('4. 轮到自己时清掉上一手牌');
var hands = {
  A: [C('H', 9, 'a0'), C('D', 9, 'a1')],
  B: [C('H', 8, 'b0'), C('D', 8, 'b1')],
  C: [C('H', 7, 'c0'), C('D', 7, 'c1')],
  D: [C('H', 6, 'd0'), C('D', 6, 'd1'), C('S', 6, 'd2'), C('H', 4, 'd3'), C('D', 4, 'd4')],
  E: [C('H', 5, 'e0'), C('D', 5, 'e1')]
};
var stg = g.gameState();
stg.phase = 'PLAY';
var ids = ['A', 'B', 'C', 'D', 'E'];
stg.players.forEach(function (p, i) { p.id = ids[i]; p.hand = hands[ids[i]].slice(); });
stg['主A'] = { suit: 'D', establishedBy: 'E', viaMethod: 'FORCED_CHECK' };
stg['反A'] = null;
stg['次方'] = null;
stg['次方公开'] = true;
stg['底牌公开'] = true;
stg.table = [];
stg.discarded = [];
stg.passedPlayers = [];
stg.passCount = 0;
stg.lastPlayer = null;
g.__setState(stg, { currentPlayer: 'D', human: 'D', clearLog: true });

// 真人出一手牌 -> uiPlays 里必须有
var sel = g.selectedCards();
sel.length = 0;
[C('H', 6, 'd0'), C('D', 6, 'd1'), C('S', 6, 'd2')].forEach(function (c) { sel.push(c.id); });
g.doPlay();
var plays = g.uiPlays() || {};
check('4.1 真人出牌后 uiPlays 里有记录', !!(plays.D && plays.D.length === 3),
  'keys=' + JSON.stringify(Object.keys(plays)));
check('4.2 出牌后当前玩家已交给别人(不是真人)',
  g.currentPlayer() !== 'D', 'cur=' + g.currentPlayer());
check('4.3 出牌后按钮让位(真人牌占了按钮位 -> 按钮隐藏)',
  g.btnStage().length === 0, 'n=' + g.btnStage().length);

// ============================================================
// 5. 其他玩家行动时的闹钟
// ============================================================
section('5. 其他玩家行动时的闹钟');
// [时序] 真人出完牌 -> 轮到 AI -> 闹钟**点亮**; 等 AI 行动完 -> 闹钟**熄灭**
//   (然后画面上是「他打出的手牌 / 不出」)。
// 4.x 之后 currentPlayer 已经是 AI(正在等) -> 此刻闹钟应该是亮的
var aiWait = g.uiAiWait();
check('5.1 轮到 AI(正在等) -> 闹钟点亮(有等待截止时间)',
  aiWait.deadline > Date.now(),
  'deadline=' + aiWait.deadline + ' now=' + Date.now());
// [2026-11-03 用户] 「出牌倒计时时间和真人玩家一样, 暂时先定 20 秒」-> AI 回合**也**计时, 总长一样
check('5.2 AI 回合的倒计时同样是 20 秒(和真人一致)',
  g.uiTurnInfo().deadline > Date.now() && g.uiTurnInfo().total === 20000,
  'turnDeadline=' + g.uiTurnInfo().deadline + ' total=' + g.uiTurnInfo().total);
check('5.3 闹钟总时长 = AI 思考间隔', aiWait.total === g.__aiDelay(),
  'total=' + aiWait.total + ' delay=' + g.__aiDelay());

// 轮到真人 -> AI 闹钟熄, 换成真人自己的倒计时, 自己上一手牌也清掉
g.__setState(g.gameState(), { currentPlayer: 'C', human: 'D', clearLog: false });
g.advanceCurrentPlayer();          // C -> D(真人)
check('5.4 轮到真人 -> AI 的等待闹钟熄灭',
  g.uiAiWait().deadline === 0, 'deadline=' + g.uiAiWait().deadline);
check('5.5 轮到真人 -> 换成真人自己的回合倒计时',
  g.uiTurnInfo().deadline > Date.now(), 'turnDeadline=' + g.uiTurnInfo().deadline);
check('5.6 轮到真人 -> 自己上一手牌的显示被清掉',
  !g.uiPlays().D, 'D=' + JSON.stringify(g.uiPlays().D));
g.draw();
check('5.7 清掉上一手牌后按钮重新出现', g.btnStage().length > 0, 'n=' + g.btnStage().length);

// 渲染层: 有 turnDeadline 时闹钟画在 turn 位(按钮行上方)
// [窗口要窄] 牌桌标题「内蒙古打大 A」在 y=0.425H, 闹钟在 y=0.468H -> 别把标题算进来
// [2026-11-03 用户] 「其他玩家出牌时的倒计时在他们自己前方, 不能都放在真人玩家这块」
//   -> AI 回合的闹钟画在**他自己座位那一行**; 真人回合才画在 turn 位。
var ctxAlarm = mockCtx();
uiRender.render(ctxAlarm, baseState({ turnDeadline: Date.now() + 30000, turnTotal: 20000 }));
var alarmHit = ctxAlarm.items.filter(function (i) {
  return Math.abs(i.x - lay.turn.x) < lay.vw * 0.05 && Math.abs(i.y - lay.turn.y) < lay.vh * 0.02;
});
check('5.8 AI 回合 -> 闹钟**不**画在真人那块(turn 位)', alarmHit.length === 0, 'hits=' + alarmHit.length);
var seatRows = [lay.vh * 0.215, lay.vh * 0.405];
var aiSeatAlarm = ctxAlarm.items.filter(function (i) {
  return /^[0-9]+$/.test(i.t) && seatRows.some(function (y) { return Math.abs(i.y - y) < 3; });
});
check('5.8b AI 回合 -> 闹钟画在 AI 自己座位那一行(自己前方)', aiSeatAlarm.length >= 1,
  'hits=' + aiSeatAlarm.length + ' ' + JSON.stringify(ctxAlarm.items.filter(function (i) { return /^[0-9]+$/.test(i.t); })));
var ctxAlarmHuman = mockCtx();
uiRender.render(ctxAlarmHuman, baseState({ currentPlayer: 'D', turnDeadline: Date.now() + 30000, turnTotal: 20000 }));
var alarmHuman = ctxAlarmHuman.items.filter(function (i) {
  return Math.abs(i.x - lay.turn.x) < lay.vw * 0.05 && Math.abs(i.y - lay.turn.y) < lay.vh * 0.02;
});
check('5.8c 真人回合 -> 闹钟画在 turn 位', alarmHuman.length >= 1, 'hits=' + alarmHuman.length);
var ctxNoAlarm = mockCtx();
uiRender.render(ctxNoAlarm, baseState({ turnDeadline: 0 }));
var alarmNone = ctxNoAlarm.items.filter(function (i) {
  return Math.abs(i.x - lay.turn.x) < lay.vw * 0.05 && Math.abs(i.y - lay.turn.y) < lay.vh * 0.02;
});
check('5.9 无倒计时 -> 不画闹钟', alarmNone.length === 0, 'hits=' + alarmNone.length);

console.log('\ntest-ui-play-position: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
  console.log('Failed tests:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed === 0 ? 0 : 1);
