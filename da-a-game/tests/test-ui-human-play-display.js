// tests/test-ui-human-play-display.js —— 真人自己出的牌要画出来 + 清理时机
//
// [口径变更 2026-11-03 用户]
//   原 2026-11-02 口径: 牌画在**牌桌中央**, 且**轮到自己时不清掉**自己的旧出牌显示
//   (用户原话「应等到自己出牌时才清空自己前面的桌面状态」)。
//   2026-11-03 用户改了口径:
//     1)「真人手牌不是居中, 而是在原来按钮的位置显示, 按钮隐藏掉。」
//     2)「正常轮到自己出牌时上一手牌应该清掉显示按钮。」
//   -> 牌改画在 **layout().humanPlay**(按钮行正中); 轮到真人时**清掉**自己的旧出牌
//      显示 -> 按钮让位 -> 按钮重新出现。
//   这两条旧断言锁的正是被推翻的行为, 故按新口径改写(不是删测试)。
//
// [仍要守住的根因]
//   (A) 画不出来: ui-render.js 的 drawSeatPlays 只按 seatMap 绘制, 而 seatMap
//       原来只有 4 个 AI 座位(真人在座位循环里被跳过了) -> 真人的牌永远不画。
//       (用户 2026-11-01 报障:「真人出的牌在牌面上看不见」)
//
// 局面要点: 真人(丁=D)手里留 2 张不出, 否则**打光手牌**会触发轮末规则
//   「已出完牌的人的桌面要清干净」(那是**正确**行为, 不是本 bug)。
//
// 跑法: node tests/test-ui-human-play-display.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');
var { createNormalCard } = require('../src/card.js');
// [2026-11-03] AI 延迟设**大**: 延迟 0 时 AI 会在 doPlay 里**同步**打完一整圈
//   (都过牌 -> 绕回真人) -> 新口径「轮到真人就清掉上一手牌」会把记录清掉,
//   断言就测不到「出牌后记录还在」。设大 -> AI 链异步等待, doPlay 返回时记录还在。
g.__setAiDelay(5000);

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
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

// ===== 局面: 真人=丁(D); D 手里 5 张(出 3 张留 2 张) =====
var D_ALL = [C('H', 6, 'd0'), C('D', 6, 'd1'), C('S', 6, 'd2'), C('H', 4, 'd3'), C('D', 4, 'd4')];
var D_PLAY = D_ALL.slice(0, 3);   // 要出的三张 6
var hands = {
  A: [C('H', 9, 'a0'), C('D', 9, 'a1')],
  B: [C('H', 8, 'b0'), C('D', 8, 'b1')],
  C: [C('H', 7, 'c0'), C('D', 7, 'c1')],
  D: D_ALL.slice(),
  E: [C('H', 5, 'e0'), C('D', 5, 'e1')]
};
var ids = ['A', 'B', 'C', 'D', 'E'];
var st = g.gameState();
st.phase = 'PLAY';
st.players.forEach(function (p, i) { p.id = ids[i]; p.hand = hands[ids[i]].slice(); });
st['主A'] = { suit: 'D', establishedBy: 'E', viaMethod: 'FORCED_CHECK' };
st['反A'] = null;
st['次方'] = null;
st['次方公开'] = true;
st['底牌公开'] = true;
st.table = [];
st.discarded = [];
st.passedPlayers = [];
st.passCount = 0;
st.lastPlayer = null;
g.__setState(st, { currentPlayer: 'D', human: 'D', clearLog: true });

// ===== 1) 真人(D) 出一手牌 -> 必须进 uiPlays =====
var sel = g.selectedCards();
sel.length = 0;
D_PLAY.forEach(function (c) { sel.push(c.id); });
g.doPlay();
var plays = g.uiPlays() || {};
check('1.1 真人出牌后 uiPlays 里有真人的记录',
  !!(plays.D && plays.D.length === 3),
  'uiPlays=' + JSON.stringify(Object.keys(plays)) + ' D=' + (plays.D ? plays.D.length : 'undefined'));

// ===== 2) 牌要画在**原来按钮的位置**(humanPlay), 不是牌桌中央 =====
var lay = uiRender.layout(844, 390);
var ctx = mockCtx();
uiRender.render(ctx, {
  W: 844, H: 390, phase: 'PLAY',
  gameState: g.gameState(), currentPlayer: 'A', humanPlayer: 'D',
  selectedCards: [], names: ['甲', '乙', '丙', '丁', '戊'],
  rankDesc: function (c) { return String(c.rank); },
  cardDesc: function (c) { return c.id; },
  buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
  uiPlays: plays, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
  marks: {}, memoOpen: false, memoItems: [], testMode: false,
  isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
  scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000
});
// 真人这手牌是三张 6 -> 必须画在 humanPlay(按钮行)附近
var playHits = ctx.items.filter(function (i) {
  return i.t === '6' && Math.abs(i.y - lay.humanPlay.y) < lay.vh * 0.10 &&
         Math.abs(i.x - lay.humanPlay.x) < lay.vw * 0.25;
});
check('2.1 真人的出牌被画在按钮位(humanPlay)附近',
  playHits.length >= 1,
  'humanPlay=(' + Math.round(lay.humanPlay.x) + ',' + Math.round(lay.humanPlay.y) + ') 命中=' + playHits.length);
// 反向: 牌桌中央(y=vh*0.315)不该再有真人的 6
var oldCenterHits = ctx.items.filter(function (i) {
  return i.t === '6' && Math.abs(i.y - lay.vh * 0.315) < lay.vh * 0.06;
});
check('2.2 牌桌中央不再画真人出的牌',
  oldCenterHits.length === 0, '命中=' + oldCenterHits.length);

// ===== 3) 清理时机(2026-11-03 新口径): 轮到真人 -> 清掉上一手牌 -> 按钮回来 =====
// 推进到「轮到真人」: 座位顺序 A->B->C->D->E, 从 C 推进下一位就是 D(真人)
g.__setState(g.gameState(), { currentPlayer: 'C', human: 'D', clearLog: false });
g.advanceCurrentPlayer();
var plays2 = g.uiPlays() || {};
check('3.1 轮到真人时, 真人上一手牌的显示被清掉',
  !plays2.D,
  'uiPlays=' + JSON.stringify(Object.keys(plays2)) + ' D=' + JSON.stringify(plays2.D));
g.draw();
var stage = g.btnStage();
check('3.2 清掉上一手牌后按钮重新出现', stage.length > 0, 'n=' + stage.length);

// ===== 4) 源码级守卫 =====
var _fs = require('fs');
var _path = require('path');
var _src = _fs.readFileSync(_path.join(__dirname, '..', 'game.js'), 'utf8');
check('4.1 源码: advanceCurrentPlayer 里轮到真人会 delete uiPlays[humanPlayer]',
  /function advanceCurrentPlayer[\s\S]{0,900}delete uiPlays\[humanPlayer\]/.test(_src));
var _usrc = _fs.readFileSync(_path.join(__dirname, '..', 'ui-render.js'), 'utf8');
check('4.2 源码: 渲染层给真人分了出牌显示位',
  _usrc.indexOf('seatMap[st.humanPlayer] =') >= 0);

console.log('\ntest-ui-human-play-display: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
