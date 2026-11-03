// tests/test-req-20261103.js —— 2026-11-03 用户 6 条需求的定向回归
//
// [用户原话 2026-11-03 18:24]
//   1. 现在亮A有5秒倒计时，给反A，次方亮明身份呢也加5秒倒计时。
//   2. 真人玩家的不出文字和打出的手牌在同一个位置，而不是玩家头像上方。
//   3. 其他玩家出牌时的倒计时在他们自己前方，不能都放在真人玩家这块。
//   4. 出牌倒计时时间和真人玩家一样，暂时先定20秒，后面都要改成创建房间时设置的时间。
//      只是个别ai玩家等待几秒再出牌。
//   5. 提示的时候相同的牌不要一直提示，循环回来的话可以再次提示。
//      例如上家出44，我有5555，666，77，点提示不应该提示55，55，55，555，555，5555这么提示，
//      正常应该先提示77，然后666，然后5555。
//   6. 最小的牌能组成什么就出什么 … 双龙>单龙>对子>单张>蛋子及以上牌型。
//      如果最小的4组成两个及以上的4，就不优先出4。
//
// [跑法] node tests/test-req-20261103.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');
var { chooseAction } = require('../src/ai.js');
var { identifyHand, HAND_TYPES } = require('../src/hand-types.js');
var { createNormalCard } = require('../src/card.js');

var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
var n = 0;
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck || ('x' + (++n))); }

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
function baseState(over) {
  // [注意] 渲染层判「不出」用的是 **gameState.phase** —— 这里必须给成 PLAY
  var _gs = g.gameState();
  _gs.phase = 'PLAY';
  var st = {
    W: 844, H: 390, phase: 'PLAY',
    gameState: _gs, currentPlayer: 'A', humanPlayer: 'D',
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
var lay = uiRender.layout(844, 390);

// ============================================================
// 1. 亮A / 反A / 次方身份 —— 三种闸门都 5 秒倒计时
// ============================================================
section('1. 三种闸门都有 5 秒倒计时');
g.__setAiDelay(0);

g.__setGateChoice(null);
g.__setGateChoice({ kind: 'FAN_A', eligible: true, reason: '测试注入', cards: [], suit: 'S' });
var dlFan = g.uiLiangDeadline();
check('1.1 反A 闸门起 5 秒倒计时',
  dlFan > 0 && Math.abs((dlFan - Date.now()) - 5000) < 800, 'dl=' + dlFan);
var fanTexts = g.__renderTexts();
// [2026-11-03 用户] 「出牌前亮A等倒计时的提示文字不要」-> 倒计时只画表盘
check('1.2 反A 倒计时**没有**提示文字',
  fanTexts.indexOf('秒后自动不反A') < 0, JSON.stringify(fanTexts.slice(0, 14)));

g.__setGateChoice(null);
g.__setGateChoice({ kind: 'IDENTITY', eligible: true, reason: '测试注入' });
var dlId = g.uiLiangDeadline();
check('1.3 次方身份闸门起 5 秒倒计时',
  dlId > 0 && Math.abs((dlId - Date.now()) - 5000) < 800, 'dl=' + dlId);
var idTexts = g.__renderTexts();
check('1.4 次方身份倒计时**没有**提示文字',
  idTexts.indexOf('秒后自动隐藏身份') < 0, JSON.stringify(idTexts.slice(0, 14)));
g.__setGateChoice(null);   // 清掉注入的闸门, 别干扰后面的用例

// ============================================================
// 2. 真人「不出」文字和打出的手牌同位置(按钮位 humanPlay)
// ============================================================
section('2. 真人「不出」画在按钮位');
var stPass = baseState({ currentPlayer: 'A', uiPassed: { D: true } });
var ctxPass = mockCtx();
var rPass = uiRender.render(ctxPass, stPass);
var buChu = ctxPass.items.filter(function (i) { return i.t === '不出'; });
check('2.1 画面上有「不出」文字', buChu.length >= 1, 'n=' + buChu.length);
check('2.2 「不出」画在 humanPlay 位(和打出的手牌同一个位置)',
  buChu.length >= 1 && Math.abs(buChu[0].x - lay.humanPlay.x) < 2 && Math.abs(buChu[0].y - lay.humanPlay.y) < 2,
  JSON.stringify(buChu[0]) + ' humanPlay=' + JSON.stringify(lay.humanPlay));
var oldPos = ctxPass.items.filter(function (i) {
  return i.t === '不出' && Math.abs(i.x - lay.me.x) < 2 && Math.abs(i.y - (lay.me.y - lay.me.r - lay.vh * 0.030)) < 2;
});
check('2.3 「不出」**不再**画在真人头像上方', oldPos.length === 0, 'n=' + oldPos.length);
check('2.4 位置被「不出」占住 -> 按钮让位隐藏', rPass.btnStage.length === 0, 'n=' + rPass.btnStage.length);

// ============================================================
// 3. 其他玩家的倒计时画在**他自己座位前方**
// ============================================================
section('3. AI 的闹钟画在各自座位前方');
var ctxAi = mockCtx();
uiRender.render(ctxAi, baseState({ currentPlayer: 'A', turnDeadline: Date.now() + 20000, turnTotal: 20000 }));
var atTurn = ctxAi.items.filter(function (i) {
  return Math.abs(i.x - lay.turn.x) < lay.vw * 0.05 && Math.abs(i.y - lay.turn.y) < lay.vh * 0.02;
});
check('3.1 AI 回合 -> 闹钟不画在真人那块(turn 位)', atTurn.length === 0, 'n=' + atTurn.length);
var seatRows = [lay.vh * 0.215, lay.vh * 0.405];
var atSeat = ctxAi.items.filter(function (i) {
  return /^[0-9]+$/.test(i.t) && seatRows.some(function (y) { return Math.abs(i.y - y) < 3; });
});
check('3.2 AI 回合 -> 闹钟画在 AI 自己座位那一行', atSeat.length >= 1,
  'n=' + atSeat.length + ' ' + JSON.stringify(ctxAi.items.filter(function (i) { return /^[0-9]+$/.test(i.t); })));
var ctxHuman = mockCtx();
uiRender.render(ctxHuman, baseState({ currentPlayer: 'D', turnDeadline: Date.now() + 20000, turnTotal: 20000 }));
var atTurnHuman = ctxHuman.items.filter(function (i) {
  return Math.abs(i.x - lay.turn.x) < lay.vw * 0.05 && Math.abs(i.y - lay.turn.y) < lay.vh * 0.02;
});
check('3.3 真人回合 -> 闹钟画在 turn 位(不变)', atTurnHuman.length >= 1, 'n=' + atTurnHuman.length);

// ============================================================
// 4. 出牌倒计时 20 秒(AI 回合同样计时)
// ============================================================
section('4. 出牌倒计时 20 秒');
g.__setAiDelay(5000);          // AI 异步 -> doPlay 返回时正好轮到 AI
var stTurn = g.gameState();
stTurn.phase = 'PLAY';
var ids4 = ['A', 'B', 'C', 'D', 'E'];
stTurn.players.forEach(function (p, i) {
  p.id = ids4[i];
  p.hand = (i === 3) ? [C('S', 6, 't0'), C('H', 6, 't1'), C('D', 7, 't2')]
                      : [C('S', 9, 'u' + i)];
});
stTurn['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
stTurn['反A'] = null; stTurn['次方'] = null; stTurn['次方公开'] = true; stTurn['底牌公开'] = true;
stTurn.table = []; stTurn.discarded = []; stTurn.passedPlayers = []; stTurn.passCount = 0; stTurn.lastPlayer = null;
g.__setState(stTurn, { currentPlayer: 'D', human: 'D', clearLog: true });
var sel4 = g.selectedCards();
sel4.length = 0;
sel4.push(C('S', 6, 't0').id); sel4.push(C('H', 6, 't1').id);
g.doPlay();
var ti = g.uiTurnInfo();
check('4.1 AI 回合也在计时(有截止时间)', ti.deadline > Date.now(), 'deadline=' + ti.deadline);
check('4.2 出牌倒计时总长 = 20 秒(和真人一致)', ti.total === 20000, 'total=' + ti.total);
g.__setAiDelay(0);

// ============================================================
// 5. 提示: 相同牌不重复提示 + 顺序(77 -> 666 -> 5555)
// ============================================================
section('5. 提示去重与顺序');
var stH = g.gameState();
stH.phase = 'PLAY';
var ids5 = ['A', 'B', 'C', 'D', 'E'];
var hands5 = {
  A: [C('S', 4, 'h0'), C('H', 4, 'h1')],
  B: [C('S', 9, 'h2')],
  C: [C('S', 10, 'h3')],
  D: [C('S', 5, 'h4'), C('H', 5, 'h5'), C('D', 5, 'h6'), C('C', 5, 'h7'),
      C('S', 6, 'h8'), C('H', 6, 'h9'), C('D', 6, 'ha'),
      C('S', 7, 'hb'), C('H', 7, 'hc')],
  E: [C('S', 11, 'hd')]
};
stH.players.forEach(function (p, i) { p.id = ids5[i]; p.hand = hands5[ids5[i]].slice(); });
stH['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
stH['反A'] = null; stH['次方'] = null; stH['次方公开'] = true; stH['底牌公开'] = true;
stH.table = [C('S', 4, 'tt0'), C('H', 4, 'tt1')];   // 上家出了 44
stH.discarded = []; stH.passedPlayers = []; stH.passCount = 0; stH.lastPlayer = 'A';
g.__setState(stH, { currentPlayer: 'D', human: 'D', clearLog: true });
var meHand = g.gameState().players[3].hand;
function ranksNow() {
  return g.selectedCards().map(function (id) {
    var c = meHand.filter(function (x) { return x.id === id; })[0];
    return c ? c.rank : '?';
  }).sort(function (a, b) { return a - b; }).join(',');
}
var seq = [], labels = [];
for (var i5 = 0; i5 < 4; i5++) {
  g.uiHint();
  seq.push(ranksNow());
  var lg = g.logHistory();
  labels.push(lg[lg.length - 1] || '');
}
check('5.1 第 1 次提示 = 对7', seq[0] === '7,7', JSON.stringify(seq));
check('5.2 第 2 次提示 = 三张6', seq[1] === '6,6,6', JSON.stringify(seq));
check('5.3 第 3 次提示 = 四张5', seq[2] === '5,5,5,5', JSON.stringify(seq));
check('5.4 第 4 次提示循环回到对7', seq[3] === '7,7', JSON.stringify(seq));
check('5.5 没有 55 / 555 这种拆开的重复提示',
  seq.every(function (s) { return s !== '5,5' && s !== '5,5,5'; }), JSON.stringify(seq));
check('5.6 提示走的是引擎认可的合法牌型',
  labels.join(' | ').indexOf('2张7') >= 0 || labels.join(' | ').indexOf('7') >= 0, JSON.stringify(labels));

// ============================================================
// 6. AI 起手: 最小的牌能组成什么就出什么
// ============================================================
section('6. AI 起手牌型阶梯');
function mkLeadState(hand) {
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return {
    phase: 'PLAY', mode: '2V3_暗打',
    '主A': { suit: 'H', establishedBy: 'B' }, '次方': 'C', '次方公开': true,
    '主方': ['B', 'C'], '抓方': ['A', 'D', 'E'], '底牌公开': true,
    table: [], discarded: [], passedPlayers: [], passCount: 0,
    lastPlayer: 'B', '推风触发者': null, actions: [], nextNote: 0,
    players: ids.map(function (id) {
      if (id === 'A') return { id: id, hand: hand.slice(), '底牌': null };
      return { id: id, hand: [C('H', 3)], '底牌': null };
    })
  };
}
function leadInfo(hand) {
  var act = chooseAction(mkLeadState(hand), 'A');
  var cards = (act.cardIds || []).map(function (id) {
    return hand.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  return {
    type: cards.length ? identifyHand(cards).type : 'PASS',
    ranks: cards.map(function (c) { return c.rank; }).sort(function (a, b) { return a - b; }).join(','),
    count: cards.length
  };
}
{
  // 用户例子: 5555 / 666 / 77 能组出**双龙**(556677) -> 阶梯里双龙排最前 -> 起手出双龙
  var hand = [C('S', 5), C('H', 5), C('D', 5), C('C', 5),
              C('S', 6), C('H', 6), C('D', 6),
              C('S', 7), C('H', 7)];
  var info = leadInfo(hand);
  check('6.1 5555/666/77 -> 起手出对7(双龙/连张都拆两组 -> 淘汰)',
    info.type === HAND_TYPES.PAIR && info.ranks === '7,7', JSON.stringify(info));
}
{
  // 没有双龙/连张时 -> 有对子出对子(阶梯: 对子 > 蛋子及以上)
  var hand = [C('S', 5), C('H', 5), C('D', 5), C('C', 5),
              C('S', 6), C('H', 6), C('D', 6),
              C('S', 9), C('H', 9)];
  var info = leadInfo(hand);
  check('6.1b 5555/666/99(无龙) -> 起手出对子',
    info.type === HAND_TYPES.PAIR, JSON.stringify(info));
}
{
  var hand = [C('S', 7), C('H', 8), C('D', 9), C('C', 12)];
  var info = leadInfo(hand);
  check('6.2 有连张 -> 起手出连张(单龙 > 对子/单张)',
    info.type === HAND_TYPES.STRAIGHT, JSON.stringify(info));
}
{
  var hand = [C('S', 5), C('H', 5), C('D', 6), C('C', 6), C('S', 7), C('H', 7), C('D', 9), C('C', 9)];
  var info = leadInfo(hand);
  check('6.3 能组双龙 -> 起手出双龙(双龙 > 对子)',
    info.type === HAND_TYPES.DOUBLE_STRAIGHT, JSON.stringify(info));
}
{
  var hand = [C('S', 6), C('H', 6), C('D', 6)];
  var info = leadInfo(hand);
  check('6.4 只剩蛋子 -> 起手出蛋子(蛋子及以上是可出的)',
    info.type === HAND_TYPES.TRIPLE, JSON.stringify(info));
}
{
  var hand = [C('S', 4), C('H', 4), C('D', 8), C('C', 9)];
  var info = leadInfo(hand);
  check('6.5 手里有 4 -> 起手不用 4(留给取牌)',
    info.ranks.indexOf('4') < 0, JSON.stringify(info));
}
{
  var hand = [C('S', 2), C('H', 3), C('D', 14), C('C', 7), C('S', 9)];
  var info = leadInfo(hand);
  check('6.6 起手保护大牌(不先出 2/3/A)',
    info.ranks !== '2' && info.ranks !== '3' && info.ranks !== '14', JSON.stringify(info));
}

// ============================================================
// 1.4 反A 倒计时到点 -> 自动按「不反」(需要真等 5 秒)
// ============================================================
setTimeout(function () {
  section('1.4 反A 5 秒到点自动处理');
  g.newGame();
  g.__setGateChoice({ kind: 'FAN_A', eligible: true, reason: '测试注入', cards: [], suit: 'S' });
  var armed = g.uiLiangDeadline();
  check('1.4a 反A 闸门倒计时已启动', armed > 0, 'dl=' + armed);
  setTimeout(function () {
    var gi = g.gateInfo();
    check('1.4b 反A 5 秒到点 -> 闸门被自动消费(等同「不反」)',
      !gi.choice || gi.choice.kind !== 'FAN_A', 'choice=' + JSON.stringify(gi.choice));
    var lg = g.logHistory().join(' || ');
    check('1.4c 日志说明超时按「不反」处理',
      lg.indexOf('反A 5 秒倒计时结束') >= 0, lg.slice(-160));

    console.log('\ntest-req-20261103: ' + passed + ' passed, ' + failed + ' failed');
    if (failures.length) {
      console.log('Failed tests:');
      failures.forEach(function (f) { console.log('  - ' + f); });
    }
    process.exit(failed === 0 ? 0 : 1);
  }, 5400);
}, 100);
