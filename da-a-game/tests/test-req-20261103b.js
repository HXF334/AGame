// tests/test-req-20261103b.js —— 2026-11-03 23:26 用户 8 条需求的定向回归
//
// [用户原话 2026-11-03 23:26]
//   1. AI也优先出对7，不能为了出双龙或者单龙拆太多蛋子及以上牌型。
//      例: 手牌56777可以出567；手牌5666778出5；手牌45567出4567；手牌556667788出55667788；
//   2. 轮到AI玩家出牌时，闹钟显示的时候要把他上一轮出的牌或者不出文字清掉。
//   3. 提示文字移到手牌上方一点。不要压住其他东西。
//   4. 牌局结束的时候后面的闹钟要清掉。
//   5. 出牌前亮A等倒计时的提示文字不要。
//   6. 打出去的手牌要从左往右按由小到大排序。
//   7. 手牌区最右侧的手牌右侧点击无法选中这张牌。
//   8. 其他人出5555，我有66667777，点6自动弹出6666，点7自动弹出7777，6666落下了，
//      无法选择66667777一起出牌；6666起来以后我再点7应该先判断手里的牌能不能组成有效牌型，
//      能的话不自动落下牌。
//
// [跑法] node tests/test-req-20261103b.js
var mock = require('./mock-wx.js');
var m = mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');
var { chooseAction } = require('../src/ai.js');
var { identifyHand } = require('../src/hand-types.js');
var { createNormalCard } = require('../src/card.js');

var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
var n = 0;
function C(suit, rank, deck) { return createNormalCard(suit, rank, deck || ('n' + (++n))); }
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
    buttons: [{ id: 'play', label: '出牌', enabled: true }],
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
// 1. AI 起手: 最小牌能组成什么就出什么(用户 4 个例子 + 优先出对7)
// ============================================================
section('1. AI 起手牌型选择');
function mkLead(hand) {
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
function lead(hand) {
  var act = chooseAction(mkLead(hand), 'A');
  var cards = (act.cardIds || []).map(function (id) {
    return hand.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  return { type: cards.length ? identifyHand(cards).type : 'PASS',
           ranks: cards.map(function (c) { return c.rank; }).sort(function (a, b) { return a - b; }).join(','),
           count: cards.length };
}
{
  var info = lead([C('S',5),C('H',6),C('D',7),C('C',7),C('S',7)]);
  check('1.1 手牌 56777 -> 出 567', info.ranks === '5,6,7', JSON.stringify(info));
}
{
  var info = lead([C('S',5),C('H',6),C('D',6),C('C',6),C('S',7),C('H',7),C('D',8)]);
  check('1.2 手牌 5666778 -> 出 5(5678 要拆两组 -> 淘汰)', info.ranks === '5', JSON.stringify(info));
}
{
  var info = lead([C('S',4),C('H',5),C('D',5),C('C',6),C('S',7)]);
  check('1.3 手牌 45567 -> 出 4567', info.ranks === '4,5,6,7', JSON.stringify(info));
}
{
  var info = lead([C('S',5),C('H',5),C('D',6),C('C',6),C('S',6),C('H',7),C('D',7),C('S',8),C('H',8)]);
  check('1.4 手牌 556667788 -> 出 55667788(双龙)', info.ranks === '5,5,6,6,7,7,8,8', JSON.stringify(info));
}
{
  var info = lead([C('S',5),C('H',5),C('D',5),C('C',5),C('S',6),C('H',6),C('D',6),C('S',7),C('H',7)]);
  check('1.5 手牌 5555/666/77 -> 优先出对7(双龙/连张都拆两组 -> 淘汰)',
    info.type === 'PAIR' && info.ranks === '7,7', JSON.stringify(info));
}

// ============================================================
// 2. 轮到 AI 出牌 -> 闹钟显示, 上一轮出的牌 / 「不出」清掉
// ============================================================
section('2. AI 回合清掉上一轮的出牌显示');
{
  var st = g.gameState();
  st.phase = 'PLAY';
  var ids = ['A', 'B', 'C', 'D', 'E'];
  st.players.forEach(function (p, i) {
    p.id = ids[i];
    p.hand = [C('S', 9, 'p' + i), C('H', 10, 'q' + i)];
  });
  st['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
  st['反A'] = null; st['次方'] = null; st['次方公开'] = true; st['底牌公开'] = true;
  st.table = []; st.discarded = []; st.passedPlayers = []; st.lastPlayer = null;
  g.__setState(st, { currentPlayer: 'A', human: 'D', clearLog: true });
  // 人为塞上「A 上一轮出的牌」和「A 上一轮说了不出」
  g.uiPlays().A = [C('S', 9, 'old1'), C('H', 10, 'old2')];
  g.uiPassed().A = true;
  g.advanceCurrentPlayer();     // A -> B(AI)
  check('2.1 轮到 AI(B) -> B 自己的旧牌显示被清掉', !g.uiPlays().B, JSON.stringify(Object.keys(g.uiPlays() || {})));
  check('2.2 轮到 AI(B) -> B 的「不出」被清掉', !g.uiPassed().B, JSON.stringify(g.uiPassed()));
  check('2.3 别人的旧显示还在(A 的没被误清)', !!(g.uiPlays().A && g.uiPlays().A.length),
    JSON.stringify(Object.keys(g.uiPlays() || {})));
}

// ============================================================
// 3. 提示文字在手牌上方
// ============================================================
section('3. 提示条位置');
{
  var ctx = mockCtx();
  uiRender.render(ctx, baseState({ toast: { text: '请先选牌', until: Date.now() + 5000 } }));
  var pos = ctx.items.filter(function (i) { return i.t === '请先选牌'; })[0];
  check('3.1 提示条在手牌区**上方**', !!pos && pos.y > lay.btn.y + lay.btn.h && pos.y < lay.hand.y,
    'y=' + (pos ? pos.y.toFixed(1) : '(没画)') + ' btn底=' + (lay.btn.y + lay.btn.h).toFixed(1) + ' hand顶=' + lay.hand.y.toFixed(1));
  check('3.2 提示条不压按钮行', !!pos && pos.y >= lay.btn.y + lay.btn.h,
    'y=' + (pos ? pos.y.toFixed(1) : '-'));
}

// ============================================================
// 4. 牌局结束 -> 闹钟清掉
// ============================================================
section('4. 牌局结束清闹钟');
{
  var st = g.gameState();
  st.phase = 'GAME_END';
  g.__setState(st, { currentPlayer: 'A', human: 'D', clearLog: true });
  g.draw();
  check('4.1 牌局结束 -> 回合倒计时清零', g.uiTurnInfo().deadline === 0, 'dl=' + g.uiTurnInfo().deadline);
  check('4.2 牌局结束 -> AI 等待闹钟清零', g.uiAiWait().deadline === 0, 'dl=' + g.uiAiWait().deadline);
}

// ============================================================
// 5. 亮A 等倒计时不再有提示文字
// ============================================================
section('5. 倒计时只留表盘');
{
  var ctx = mockCtx();
  uiRender.render(ctx, baseState({ turnDeadline: Date.now() + 5000, turnTotal: 5000, turnIsLiang: true, turnIsGate: true }));
  var hasLabel = ctx.items.some(function (i) { return /自动(跳过亮A|不反A|隐藏身份)/.test(i.t); });
  check('5.1 闸门倒计时没有说明文字', !hasLabel,
    JSON.stringify(ctx.items.map(function (i) { return i.t; })).slice(0, 160));
  var sec = ctx.items.filter(function (i) { return /^[0-9]+$/.test(i.t); });
  check('5.2 秒数还在(表盘仍可见)', sec.length >= 1, 'n=' + sec.length);
}

// ============================================================
// 6. 打出去的手牌从左往右由小到大
// ============================================================
section('6. 出牌显示排序');
{
  var big = C('S', 9, 's1'), small = C('H', 6, 's2');
  var ctx = mockCtx();
  uiRender.render(ctx, baseState({ uiPlays: { D: [big, small] }, uiPlaysTrick: { D: 0 } }));
  var i9 = ctx.items.filter(function (i) { return i.t === '9'; })[0];
  var i6 = ctx.items.filter(function (i) { return i.t === '6'; })[0];
  check('6.1 出牌按由小到大从左往右排(6 在 9 左边)', !!i6 && !!i9 && i6.x < i9.x,
    '6.x=' + (i6 ? i6.x.toFixed(1) : '-') + ' 9.x=' + (i9 ? i9.x.toFixed(1) : '-'));
}

// ============================================================
// 7. 最右侧手牌的右侧也能点到
// ============================================================
section('7. 最右手牌右侧可点');
{
  var st = g.gameState();
  st.phase = 'PLAY';
  var ids = ['A', 'B', 'C', 'D', 'E'];
  st.players.forEach(function (p, i) {
    p.id = ids[i];
    p.hand = (i === 3) ? [C('S', 9, 'h0'), C('H', 10, 'h1'), C('D', 11, 'h2')]
                      : [C('S', 5, 'k' + i)];
  });
  st['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
  st['反A'] = null; st['次方'] = null; st['次方公开'] = true; st['底牌公开'] = true;
  st.table = []; st.discarded = []; st.passedPlayers = []; st.lastPlayer = null;
  // 底牌翻开 -> 手里**没有牌背**压着, 最右边那张整张露出(这才有「右侧点不到」的问题)
  st.players[3]['底牌'] = null;
  g.__setState(st, { currentPlayer: 'D', human: 'D', clearLog: true });
  g.draw();
  var boxes = g.handCardHitboxes();
  var last = boxes[boxes.length - 1];
  check('7.1 最后一张牌有整张宽度记录(fullW)', !!(last && last.fullW && last.fullW > last.w),
    'fullW=' + (last ? last.fullW : '-') + ' w=' + (last ? last.w : '-'));
  // 点最后一张牌的**右缘**(命中区右侧之外一点, 仍在牌面范围内)
  var tapX = last.x + last.fullW - 2;
  g.selectedCards().length = 0;
  mock.fireTouch(m.touchHandlers, tapX, last.y + last.h / 2);
  check('7.2 点最右手牌的右侧 -> 选中这张牌',
    g.selectedCards().indexOf(last.cardId) >= 0,
    'tapX=' + tapX.toFixed(1) + ' sel=' + JSON.stringify(g.selectedCards()));
}

// ============================================================
// 8. 选牌不落下: 已选 6666 再点 7 -> 66667777(假八)
// ============================================================
section('8. 选牌不自动落下');
{
  var st = g.gameState();
  st.phase = 'PLAY';
  var ids = ['A', 'B', 'C', 'D', 'E'];
  st.players.forEach(function (p, i) {
    p.id = ids[i];
    p.hand = (i === 3) ? [C('S', 6, 'w0'), C('H', 6, 'w1'), C('D', 6, 'w2'), C('C', 6, 'w3'),
                          C('S', 7, 'w4'), C('H', 7, 'w5'), C('D', 7, 'w6'), C('C', 7, 'w7')]
                      : [C('S', 5, 'v' + i)];
  });
  st['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
  st['反A'] = null; st['次方'] = null; st['次方公开'] = true; st['底牌公开'] = true;
  st.table = [C('S', 5, 't0'), C('H', 5, 't1'), C('D', 5, 't2'), C('C', 5, 't3')];  // 别人出了 5555
  st.discarded = []; st.passedPlayers = []; st.lastPlayer = 'A';
  g.__setState(st, { currentPlayer: 'D', human: 'D', clearLog: true });
  g.draw();
  var boxes = g.handCardHitboxes();
  function tapCard(idx) {
    var b = boxes[idx];
    mock.fireTouch(m.touchHandlers, b.x + b.w / 2, b.y + b.h / 2);
  }
  function ranksOfSel() {
    var hand = g.gameState().players[3].hand;
    return g.selectedCards().map(function (id) {
      var c = hand.filter(function (x) { return x.id === id; })[0];
      return c ? c.rank : '?';
    }).sort(function (a, b) { return a - b; }).join(',');
  }
  // 找 6 和 7 在手牌条上的位置(手牌按牌力降序排: 7 在 6 前面)
  var sixIdx = -1, sevenIdx = -1;
  var hand = g.gameState().players[3].hand;
  boxes.forEach(function (b, i) {
    var c = hand.filter(function (x) { return x.id === b.cardId; })[0];
    if (!c) return;
    if (c.rank === 6 && sixIdx < 0) sixIdx = i;
    if (c.rank === 7 && sevenIdx < 0) sevenIdx = i;
  });
  tapCard(sixIdx);
  check('8.1 点 6 -> 自动弹出 6666', ranksOfSel() === '6,6,6,6', ranksOfSel());
  tapCard(sevenIdx);
  check('8.2 再点 7 -> 组成 66667777(不把 6666 落下)', ranksOfSel() === '6,6,6,6,7,7,7,7', ranksOfSel());
}

// ============================================================
// 9. 推风把回合交回真人 -> 按钮必须出现(不能只剩闹钟)
// ============================================================
section('9. 推风后真人回合的按钮');
{
  var st = g.gameState();
  st.phase = 'PLAY';
  var ids = ['A', 'B', 'C', 'D', 'E'];
  st.players.forEach(function (p, i) {
    p.id = ids[i];
    p.hand = (i === 1) ? [] : [C('S', 9, 'x' + i), C('H', 10, 'y' + i)];   // 乙(B) 已出完
  });
  st['主A'] = { suit: 'D', establishedBy: 'A', viaMethod: 'LIANG_A' };
  st['反A'] = null; st['次方'] = null; st['次方公开'] = true; st['底牌公开'] = true;
  st['主方'] = ['A', 'B']; st['抓方'] = ['C', 'D', 'E'];   // 甲(A) 与 乙(B) 同阵营
  st.table = []; st.discarded = []; st.passedPlayers = []; st.lastPlayer = null;
  st['推风触发者'] = 'B';
  g.__setState(st, { currentPlayer: 'C', human: 'A', clearLog: true });
  // 真人上一轮说了「不出」
  g.uiPassed()['A'] = true;
  g.doPushWind();
  g.draw();
  check('9.1 推风把回合交给真人', g.currentPlayer() === 'A', 'cur=' + g.currentPlayer());
  check('9.2 推风后真人的「不出」标记被清掉', !g.uiPassed()['A'], JSON.stringify(g.uiPassed()));
  check('9.3 推风后真人回合 -> 按钮出现(不是只剩闹钟)', g.btnStage().length > 0,
    'n=' + g.btnStage().length);
}

// ============================================================
// 10. AI 起手: 链要带上高端的 A(用户 2026-11-04)
// ============================================================
section('10. 连张带高端 A');
{
  var info = lead([C('S',9),C('H',10),C('D',10),C('C',11),C('S',12),C('H',13),C('D',14)]);
  check('10.1 手牌 9 10 10 J Q K A -> 出 9 10 J Q K A(6 张连张)',
    info.ranks === '9,10,11,12,13,14', JSON.stringify(info));
}
{
  // [2026-11-06 用户新规] 「手牌3456, 出龙的时候只出了456, 3漏下了」-> 龙要带上能接上的牌,
  //   单张的 A/2/3 也要进龙。旧的「链从锚点起, 不带大牌 3」按新裁定作废。
  var info = lead([C('S',3),C('H',4),C('D',5),C('C',6)]);
  check('10.2 手牌 3 4 5 6 -> 出的龙带上了 3(链用满能连上的牌)',
    info.type === 'STRAIGHT' && info.count === 4, JSON.stringify(info));
}

// ============================================================
// 11. AI 的出牌 /「不出」离头像再远一点(用户 2026-11-04)
// ============================================================
section('11. AI 出牌显示离头像的距离');
{
  var st11 = baseState({ currentPlayer: 'B', uiPassed: { B: true } });
  st11.gameState.phase = 'PLAY';   // 渲染层判「不出」用 gameState.phase
  // 第 9 节把 B 的手牌清空了(出完) -> 这里补上, 否则画的是「已出完」而不是「不出」
  (st11.gameState.players || []).forEach(function (p) {
    if (p && (!p.hand || !p.hand.length)) p.hand = [C('S', 9, 'zz' + p.id)];
  });
  var ctx = mockCtx();
  var r3 = uiRender.render(ctx, st11);
  var buChu = ctx.items.filter(function (i) { return i.t === '不出'; })[0];
  var gap = 1e9;
  if (buChu) {
    (r3.seatHitboxes || []).forEach(function (b) {
      if (Math.abs(b.y + b.h / 2 - buChu.y) > 6) return;
      var d = Math.abs(buChu.x - (b.x + b.w / 2)) - b.w / 2;
      if (d < gap) gap = d;
    });
  }
  check('11.1 「不出」离头像边缘 >= 18px', !!buChu && gap >= 18, 'gap=' + gap + ' 有文字=' + !!buChu);
}
{
  var st12 = baseState({ uiPlays: { B: [C('S', 9, 'pp1'), C('H', 10, 'pp2')] }, uiPlaysTrick: { B: 0 } });
  st12.gameState.phase = 'PLAY';
  var ctx2 = mockCtx();
  var r4 = uiRender.render(ctx2, st12);
  var face = ctx2.items.filter(function (i) { return i.t === '9'; })[0];
  var gap2 = 1e9;
  if (face) {
    var best = null, bestd = 1e9;
    (r4.seatHitboxes || []).forEach(function (b) {
      var d = Math.abs(b.x + b.w / 2 - face.x);
      if (d < bestd) { bestd = d; best = b; }
    });
    if (best) gap2 = Math.abs(face.x - (best.x + best.w / 2)) - best.w / 2;
  }
  check('11.2 AI 打出的牌离头像边缘 >= 14px', !!face && gap2 >= 14, 'gap=' + gap2 + ' 有牌面=' + !!face);
}

console.log('\ntest-req-20261103b: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
  console.log('Failed tests:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed === 0 ? 0 : 1);
