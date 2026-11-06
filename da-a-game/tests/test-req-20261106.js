// tests/test-req-20261106.js —— 2026-11-06 13 条报障的定向回归(A 批: UI)
//
// [用户 2026-11-06 13:02 / 14:18 / 14:34 原话]
//   1. 禁止出现+N截断。手牌和打出的牌都要显示全。
//   2. 机器人头像再大一点，不是按钮变大，是按扭里的机器人；机器人按钮左移一点。
//   3. 发牌速度改为0.2秒。
//   7. 亮A那四个花色按钮距离再小一些；亮A按钮太小了，整体放大。
//   8. 出牌的闹钟大小和亮A的闹钟一样。
//  12. 打出的手牌排序时按龙的顺序排序而不是按单张大小。
//
// 跑法: node tests/test-req-20261106.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');
var sortCards = require('../src/sort-cards.js');
var { createNormalCard } = require('../src/card.js');
g.__setAiDelay(0);

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var VW = 844, VH = 390;
var lay = uiRender.layout(VW, VH);

// 能抓文字 + 字号 + 圆弧的假 ctx
function mockCtx() {
  var items = [], arcs = [];
  var noop = function () {};
  return {
    items: items, arcs: arcs,
    canvas: { width: VW, height: VH },
    measureText: function (t) { return { width: String(t || '').length * 8 }; },
    fillText: function (t, x, y) { items.push({ t: String(t), x: x, y: y, font: this.font }); },
    arc: function (x, y, r) { arcs.push({ x: x, y: y, r: r }); },
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop,
    lineTo: noop, arcTo: noop, fill: noop, stroke: noop,
    fillRect: noop, clearRect: noop, translate: noop, rotate: noop, scale: noop,
    setLineDash: noop, createLinearGradient: function () { return { addColorStop: noop }; },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1
  };
}
function C(suit, rank, id) { return createNormalCard(suit, rank, id); }
function fontSize(item) {
  var m = /([0-9.]+)px/.exec(item.font || '');
  return m ? parseFloat(m[1]) : 0;
}
function baseState(extra) {
  var st = {
    W: VW, H: VH, phase: 'PLAY',
    gameState: { phase: 'PLAY', players: [
      { id: 'A', hand: [], 底牌: null }, { id: 'B', hand: [], 底牌: null },
      { id: 'C', hand: [], 底牌: null }, { id: 'D', hand: [], 底牌: null },
      { id: 'E', hand: [], 底牌: null }], '主方': ['B'], '抓方': ['A','C','D','E'], table: [] },
    currentPlayer: 'A', humanPlayer: 'B',
    selectedCards: [], names: ['甲','乙','丙','丁','戊'],
    rankDesc: function (card) { return card && card._tag ? card._tag : ''; },
    cardDesc: function (card) { return card && card._tag ? card._tag : ''; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000,
    turnIsLiang: false, turnIsGate: false
  };
  if (extra) { for (var k in extra) st[k] = extra[k]; }
  return st;
}

// ============================================================
// 1. 发牌速度改为 0.2 秒
// ============================================================
section('1. 发牌速度 0.2 秒');
{
  check('1.1 发牌间隔 = 200ms', g.__dealStepMs() === 200, String(g.__dealStepMs()));
  var totalS = (22 * g.__dealStepMs()) / 1000;
  check('1.2 22 轮总时长 4.4 秒', Math.abs(totalS - 4.4) < 0.001, String(totalS));
}

// ============================================================
// 2. 机器人: 图形放大 / 按钮左移 / 按钮本身不变大
// ============================================================
section('2. 机器人图形放大 + 按钮左移');
{
  var OLD_HEAD_W = 0.78, OLD_HEAD_H = 0.58;
  var OLD_ICON_X = VW - Math.round(VH * 0.33);
  var OLD_ICON_R = Math.round(VH * 0.042);
  check('2.1 机器人**头部**明显放大(headW >= 1.2 半径)', lay.bot.headW >= 1.2,
    'headW=' + lay.bot.headW + ' old=' + OLD_HEAD_W);
  check('2.2 头部高度也放大(headH >= 0.9 半径)', lay.bot.headH >= 0.9,
    'headH=' + lay.bot.headH + ' old=' + OLD_HEAD_H);
  check('2.3 按钮**左移**一点', lay.autoPlay.iconX < OLD_ICON_X,
    'new=' + lay.autoPlay.iconX + ' old=' + OLD_ICON_X);
  check('2.4 按钮本身大小**没变**(还是与记牌器一致)',
    lay.autoPlay.iconR === lay.memo.iconR && lay.autoPlay.iconR === OLD_ICON_R,
    'r=' + lay.autoPlay.iconR + ' memo=' + lay.memo.iconR);
  check('2.5 仍避开小游戏胶囊按钮(离右边缘 >= 100px)',
    VW - (lay.autoPlay.iconX + lay.autoPlay.iconR) >= 100,
    '右缘余量=' + (VW - lay.autoPlay.iconX - lay.autoPlay.iconR));
  // 图形必须完整落在圆内: 头是圆心下方的矩形, 取四角最远点
  var r = lay.autoPlay.iconR;
  var hw = r * lay.bot.headW, hh = r * lay.bot.headH;
  var hy = lay.autoPlay.iconY - r * 0.18;
  var corner = Math.sqrt(Math.pow(hw / 2, 2) + Math.pow(hh / 2, 2));
  check('2.6 头部四角仍在圆内(不会画到按钮外面)', corner < r,
    'corner=' + corner.toFixed(2) + ' r=' + r);
}
// ============================================================
// 7. 亮A 四个花色按钮: 间距更小 + 整体放大
// ============================================================
section('7. 亮A 花色按钮间距小 + 放大');
{
  var suits = [{ id: 'a', kind: 'suit' }, { id: 'b', kind: 'suit' },
                { id: 'c', kind: 'suit' }, { id: 'd', kind: 'suit' }];
  var bs = uiRender.buttonLayout(suits, lay);
  var gaps = [];
  for (var i = 1; i < bs.length; i++) gaps.push(Math.round(bs[i].x - (bs[i - 1].x + bs[i - 1].w)));
  var OLD_GAP = Math.round(VW * 0.020);
  check('7.1 花色按钮间距**比上轮更小**', gaps.every(function (gp) { return gp < OLD_GAP; }),
    'new=' + JSON.stringify(gaps) + ' old=' + OLD_GAP);
  check('7.2 间距约 8px', gaps.every(function (gp) { return gp >= 6 && gp <= 10; }),
    JSON.stringify(gaps));
  check('7.3 四个按钮等距',
    Math.abs(gaps[0] - gaps[1]) < 0.5 && Math.abs(gaps[1] - gaps[2]) < 0.5, JSON.stringify(gaps));
  check('7.4 花色按钮**整体放大**(宽 >= 50px)', bs.every(function (b) { return b.w >= 50; }),
    'w=' + JSON.stringify(bs.map(function (b) { return b.w; })) + ' old=38');
  check('7.5 整排仍居中',
    Math.abs(bs[0].x - (VW - (bs[3].x + bs[3].w))) < 1.5,
    'left=' + bs[0].x.toFixed(1) + ' right=' + (VW - (bs[3].x + bs[3].w)).toFixed(1));
  check('7.6 整排宽度没超出屏幕', bs[3].x + bs[3].w < VW, String(bs[3].x + bs[3].w));
}

// ============================================================
// 8. 出牌闹钟大小 = 亮A闹钟大小
// ============================================================
section('8. 闹钟大小统一');
{
  var OLD_LIANG_R = Math.round(VH * 0.055);
  var OLD_TURN_R = Math.round(VH * 0.048);
  function clockArc(st) {
    var ctx = mockCtx();
    uiRender.render(ctx, st);
    // 闹钟表盘是**居中正上方**那个圆: x = vw/2, y = m.turn.y
    var cands = ctx.arcs.filter(function (a) {
      return Math.abs(a.x - VW / 2) < 3 && Math.abs(a.y - lay.turn.y) < 3;
    });
    return cands.length ? Math.round(cands[0].r) : 0;
  }
  // [注] currentPlayer 必须是**真人**(humanPlayer): 轮到 AI 时闹钟画在那个 AI 头像前方(设计如此)
  var stLiang = baseState({ currentPlayer: 'B', turnDeadline: Date.now() + 5000, turnIsLiang: true, turnIsGate: true });
  var stTurn = baseState({ currentPlayer: 'B', turnDeadline: Date.now() + 5000, turnIsLiang: false, turnIsGate: false });
  var rLiang = clockArc(stLiang);
  var rTurn = clockArc(stTurn);
  check('8.1 亮A/闸门闹钟半径 = 0.055H', rLiang === OLD_LIANG_R, rLiang + ' vs ' + OLD_LIANG_R);
  check('8.2 出牌闹钟半径**与亮A一样**', rTurn === rLiang,
    'turn=' + rTurn + ' liang=' + rLiang + ' oldTurn=' + OLD_TURN_R);
  check('8.3 出牌闹钟确实变大了(比上轮的 0.048H 大)', rTurn > OLD_TURN_R,
    'new=' + rTurn + ' old=' + OLD_TURN_R);
}

// ============================================================
// 12. 打出的手牌按「龙的顺序」排, 不按单张大小
// ============================================================
section('12. 出牌按龙序排序');
{
  function mk(rank, id) { return C('S', rank, id); }
  // 3-4-5-6 连张: 单张大小序(3>2>A>K>...>4)会把 3 排到最后; 龙序应是 3 4 5 6
  var chain = [mk(3, 'c1'), mk(4, 'c2'), mk(5, 'c3'), mk(6, 'c4')];
  var sorted = sortCards.sortByChain(chain);
  check('12.1 连张按链序排 -> 3 4 5 6',
    sorted && sorted.map(function (c) { return c.rank; }).join(',') === '3,4,5,6',
    sorted ? sorted.map(function (c) { return c.rank; }).join(',') : 'null');
  // 双龙 9 9 10 10 11 11 -> 链序 9 9 10 10 11 11
  var dbl = [mk(9, 'd1'), mk(9, 'd2'), mk(10, 'd3'), mk(10, 'd4'), mk(11, 'd5'), mk(11, 'd6')];
  var sd = sortCards.sortByChain(dbl);
  check('12.2 双龙按链序排(每张两张一组)',
    sd && sd.map(function (c) { return c.rank; }).join(',') === '9,9,10,10,11,11',
    sd ? sd.map(function (c) { return c.rank; }).join(',') : 'null');
  // 非龙型(非法组合) -> 返回 null, 调用方走原来的单张大小排序
  var bad = [mk(9, 'b1'), mk(6, 'b2')];
  check('12.3 非龙型返回 null(不改变原有排序路径)', sortCards.sortByChain(bad) === null,
    String(sortCards.sortByChain(bad)));
  // 渲染层: 实际画出来的顺序也要是链序
  var ctx = mockCtx();
  var cards = chain.map(function (c, i) { var x = Object.assign({}, c); x._tag = 'R' + (i + 1); return x; });
  uiRender.render(ctx, baseState({ uiPlays: { D: cards }, uiPlaysTrick: { D: 0 } }));
  var tags = ctx.items.filter(function (i) { return /^R[1-4]$/.test(i.t); })
    .sort(function (a, b) { return a.x - b.x; });
  check('12.4 画面上从左到右是 3 4 5 6(链序)',
    tags.map(function (i) { return i.t; }).join(',') === 'R1,R2,R3,R4',
    tags.map(function (i) { return i.t + '@' + i.x.toFixed(0); }).join(' '));
}
// ============================================================
// 1(续). 禁止 +N 截断: 手牌和打出的牌都要显示全
// ============================================================
section('1b. 全部显示(禁 +N)');
{
  // 16 张双龙(用户 2026-11-04 报障的那手)
  var wide = [];
  var d = 0;
  [[5,2],[6,2],[7,2],[8,2],[9,2],[10,2],[11,2],[12,2]].forEach(function (r) {
    for (var i = 0; i < r[1]; i++) {
      var c = C('S', r[0], 'w' + (d++)); c._tag = 'T' + d; wide.push(c);
    }
  });
  var ctx = mockCtx();
  uiRender.render(ctx, baseState({ uiPlays: { D: wide }, uiPlaysTrick: { D: 0 } }));
  var tags = ctx.items.filter(function (i) { return /^T\d+$/.test(i.t); });
  var plus = ctx.items.filter(function (i) { return /^\+\d+$/.test(i.t); });
  check('1b.1 16 张牌**全部**画出(一张不丢)', tags.length === 16, 'drawn=' + tags.length);
  check('1b.2 不再出现 "+N" 截断标记', plus.length === 0,
    JSON.stringify(plus.map(function (x) { return x.t; })));
  var xs = tags.map(function (i) { return i.x; }).sort(function (a, b) { return a - b; });
  var mono = true;
  for (var k = 1; k < xs.length; k++) if (xs[k] <= xs[k - 1]) mono = false;
  check('1b.3 全部横向排开(x 严格递增)', mono, JSON.stringify(xs.map(function (v) { return Math.round(v); })));
  check('1b.4 全部落在屏幕内', xs.every(function (v) { return v >= 0 && v <= VW; }),
    'x=' + Math.round(xs[0]) + '..' + Math.round(xs[xs.length - 1]));
}
{
  // 手牌: 全部画出 + 高度加大 + 牌上字更大
  var st = baseState();
  var hc = [C('S', 9, 'h1'), C('H', 6, 'h2'), C('D', 11, 'h3'), C('C', 3, 'h4')];
  hc.forEach(function (c, i) { c._tag = 'H' + (i + 1); });
  st.gameState.players[1].hand = hc;
  var ctx = mockCtx();
  uiRender.render(ctx, st);
  var handTags = ctx.items.filter(function (i) { return /^H\d+$/.test(i.t); });
  check('1b.5 手牌全部画出(4 张)', handTags.length >= 4, 'drawn=' + handTags.length);
  var OLD_CARD_H = VH * 0.170;
  check('1b.6 手牌**高度**比上轮大(cardH > 0.170H)', lay.hand.cardH > OLD_CARD_H,
    'new=' + lay.hand.cardH.toFixed(1) + ' old=' + OLD_CARD_H.toFixed(1));
  check('1b.7 加高后整排仍在屏幕内(底边 < 屏高)',
    lay.hand.y + lay.hand.cardH <= VH,
    '底=' + (lay.hand.y + lay.hand.cardH).toFixed(1) + ' 屏高=' + VH);
  // 牌面字号: 取手牌区里最大的字号(牌面点数/花色)
  var fs = 0;
  handTags.forEach(function (i) { var s = fontSize(i); if (s > fs) fs = s; });
  var OLD_FS = Math.max(10, Math.round(lay.hand.cardH * lay.hand.ratio * 0.42));
  check('1b.8 牌上的字**比上轮大**', fs > OLD_FS, 'new=' + fs + ' old~' + OLD_FS);
}

// ============================================================
// B 批: AI 逻辑 + 提示 (2026-11-06 用户裁定)
// ============================================================
var cardMod = require('../src/card.js');
var leadChoice = require('../src/lead-choice.js');
var SB = require('./lib/state-builder.js');
var aiMod = require('../src/ai.js');
var handTypes = require('../src/hand-types.js');

function mkCards(list) {
  return list.map(function (x, i) {
    if (x === 'BJ') return cardMod.createBigJoker('lc' + i);
    if (x === 'SJ') return cardMod.createSmallJoker('lc' + i);
    return cardMod.createNormalCard(x[0], x[1], 'lc' + i);
  });
}
// 起手选牌的点数(升序) —— 顺序不重要, 只看**出哪几张**
function leadRanks(list) {
  var r = leadChoice.pickLead(mkCards(list));
  if (!r) return '(null)';
  return r.cards.map(function (c) { return c.rank; })
    .sort(function (a, b) { return a - b; }).join(',');
}
function expectLead(name, list, want) {
  var got = leadRanks(list);
  check(name, got === want, 'got=' + got + ' want=' + want);
}

section('B1. 起手选牌 (最小牌锚点: 龙 > 对子 > 单张)');
expectLead('B1.1 王322kkk -> 22', ['BJ', ['S',3], ['S',2], ['H',2], ['S',13], ['H',13], ['D',13]], '2,2');
expectLead('B1.2 55567 -> 567', [['S',5],['H',5],['D',5],['S',6],['S',7]], '5,6,7');
expectLead('B1.3 45567 -> 4567', [['S',4],['S',5],['S',6],['S',7]], '4,5,6,7');
expectLead('B1.4 5666778 -> 5', [['S',5],['S',6],['H',6],['S',7],['H',7],['S',8]], '5');
expectLead('B1.5 556667788 -> 双龙 55667788',
  [['S',5],['H',5],['S',6],['H',6],['S',7],['H',7],['S',8],['H',8]], '5,5,6,6,7,7,8,8');
expectLead('B1.6 5555/666/77 -> 77',
  [['S',5],['H',5],['D',5],['C',5],['S',6],['H',6],['D',6],['S',7],['H',7]], '7,7');
expectLead('B1.7 两张以上 4 排除出起手池', [['S',4],['H',4],['S',9]], '9');
expectLead('B1.8 单张 4 保留(单 4 最先出)', [['S',4],['S',9]], '4');

section('B2. AI 压制: 同牌型优先 + 不拆其他同点组');
{
  var C2 = SB.C;
  var handD = [C2('S',2),C2('H',2),C2('D',2),C2('C',2),C2('S',10),C2('H',10),C2('D',10),
               C2('S',13),C2('H',5),C2('D',6),C2('C',3)];
  var table9 = [C2('S',9),C2('H',9)];
  var st = SB.build({ handMap: { D: handD }, table: table9, lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': 'D', '次方公开': true, '主方': ['A','D'], '抓方': ['B','C','E'], mode: '2V3_暗打' });
  var real = st.players.filter(function (p) { return p.id === 'D'; })[0].hand;
  var act = aiMod.chooseAction(st, 'D');
  var played = (act.cardIds || []).map(function (id) {
    return real.filter(function (c) { return c.id === id; })[0];
  }).filter(Boolean);
  var th = handTypes.identifyHand(st.table);
  var ph = handTypes.identifyHand(played);
  check('B2.1 AI 出了牌', act.type === 'PLAY', act.type);
  check('B2.2 同牌型优先(桌面 ' + th.type + ' -> 出同类型)', ph.type === th.type, ph.type);
  var grp = {}, used = {};
  real.forEach(function (c) { grp[c.rank] = (grp[c.rank] || 0) + 1; });
  played.forEach(function (c) { used[c.rank] = (used[c.rank] || 0) + 1; });
  var split = false;
  for (var rk in used) { if (used[rk] < grp[rk]) split = true; }
  check('B2.3 不拆其他同点组', !split, played.map(function (c) { return c.rank; }).join(','));
  check('B2.4 没有甩 2222(大牌留着)', !(played.length === 4 && played.every(function (c) { return c.rank === 2; })),
    played.map(function (c) { return c.rank; }).join(','));
}

section('B3. 提示: 有优先出牌权时手牌 55 -> 提示 55');
{
  var hcards = [createNormalCard('S', 5, 'p55a'), createNormalCard('H', 5, 'p55b')];
  var st = SB.build({ handMap: { A: hcards }, table: [], lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': true, '主方': ['B','C'], '抓方': ['A','D','E'], mode: '2V3_暗打' });
  var me = st.players.filter(function (p) { return p.id === 'A'; })[0];
  st.discarded = st.discarded.concat(me.hand.slice(2));
  me.hand = me.hand.slice(0, 2);
  g.__setState(st, { human: 'A', currentPlayer: 'A' });
  var cands = g.uiHintCandidates();
  check('B3.1 有提示候选', cands.length > 0, 'n=' + cands.length);
  var first = cands[0];
  check('B3.2 第一个提示是 **55**(2 张 5, 不是单张 5)',
    !!(first && first.cards.length === 2 && first.cards.every(function (c) { return c.rank === 5; })),
    first ? first.cards.map(function (c) { return c.rank; }).join(',') + ' n=' + first.cards.length : '(无)');
}

section('C1. 「取消托管」标识: 手牌下半部、数字下方');
{
  var st = baseState({ autoPlay: true });
  var hc = [C('S', 9, 'c1'), C('H', 6, 'c2'), C('D', 11, 'c3'), C('C', 3, 'c4')];
  hc.forEach(function (c, i) { c._tag = 'H' + (i + 1); });
  st.gameState.players[1].hand = hc;      // baseState 的 humanPlayer = 'B' -> players[1]
  var ctx = mockCtx();
  uiRender.render(ctx, st);
  var labels = ctx.items.filter(function (i) { return i.t === '取消托管'; });
  check('C1.1 画出了「取消托管」标识', labels.length === 1, 'n=' + labels.length);
  if (labels.length) {
    var label = labels[0];
    var handTop = lay.hand.y, handH = lay.hand.cardH;
    var numYs = ctx.items.filter(function (i) { return /^H\d+$/.test(i.t); })
      .map(function (i) { return i.y; });
    var maxNumY = numYs.length ? Math.max.apply(null, numYs) : -1;
    check('C1.2 标识在**手牌下半部**', label.y > handTop + handH / 2,
      'labelY=' + label.y.toFixed(1) + ' 手牌区=' + handTop.toFixed(1) + '..' + (handTop + handH).toFixed(1));
    check('C1.3 标识在**数字下方**', label.y > maxNumY,
      'labelY=' + label.y.toFixed(1) + ' numY=' + maxNumY.toFixed(1));
    check('C1.4 标识没超出手牌区', label.y + fontSize(label) / 2 <= handTop + handH,
      'labelBottom=' + (label.y + fontSize(label) / 2).toFixed(1) + ' 牌底=' + (handTop + handH).toFixed(1));
  }
}

// ============================================================
// C 批: 托管 (本局持续代打 / 取消后不再自动出牌)
// ============================================================
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function waitUntil(fn, ms) {
  var t0 = Date.now();
  return (async function () {
    while (Date.now() - t0 < ms) {
      if (fn()) return true;
      await sleep(50);
    }
    return fn();
  })();
}
function humanHandLen() {
  var gs = g.gameState();
  var me = gs.players.filter(function (p) { return p.id === g.getHumanPlayer(); })[0];
  return me ? me.hand.length : -1;
}
function sbState(handMap) {
  return SB.build({ handMap: handMap, table: [], lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': true, '主方': ['B','C'], '抓方': ['A','D','E'], mode: '2V3_暗打' });
}

(async function () {
  // [重要] 先把**启动阶段的闸门**跑完 —— 否则它会在下面的等待里自己开局,
  //   把注入的局面冲掉(2026-11-06 实测: C2.3 因此误报失败)。
  try { g.__driveGateToPlay({}); } catch (e) { }
  section('C2. 托管: 取消后不得再自动出牌');
  {
    var C3 = SB.C;
    var st = sbState({ A: [C3('S',5), C3('H',5)] });
    g.__setState(st, { human: 'A', currentPlayer: 'A' });
    var h0 = humanHandLen();
    g.toggleAutoPlay();                       // 开启托管
    check('C2.1 托管已开启', g.uiAutoPlay() === true, String(g.uiAutoPlay()));
    g.toggleAutoPlay();                       // 立刻取消 -> 排队中的动作必须作废
    check('C2.2 托管已关闭', g.uiAutoPlay() === false, String(g.uiAutoPlay()));
    await sleep(1200);                        // 超过排队动作的延迟(500ms)
    check('C2.3 取消后**没有自动出牌**',
      humanHandLen() === h0 && (g.gameState().table || []).length === 0,
      'hand=' + humanHandLen() + '(原 ' + h0 + ') table=' + (g.gameState().table || []).length);
    check('C2.3b 注入的局面没被开局流程冲掉', g.gameState() === st, '');
  }

  section('C3. 托管: 开启后本局**持续**由 AI 代打');
  {
    var C4 = SB.C;
    var st = sbState({ A: [C4('S',5), C4('H',5), C4('D',9)] });
    g.__setState(st, { human: 'A', currentPlayer: 'A' });
    var h1 = humanHandLen();
    g.toggleAutoPlay();                       // 开启托管
    check('C3.1 托管已开启', g.uiAutoPlay() === true, String(g.uiAutoPlay()));
    var first = await waitUntil(function () { return humanHandLen() < h1; }, 4000);
    var h2 = humanHandLen();
    check('C3.2 托管中 AI 替真人出了牌', first, 'hand ' + h1 + ' -> ' + h2);
    var second = await waitUntil(function () { return humanHandLen() < h2; }, 4000);
    var h3 = humanHandLen();
    check('C3.3 托管**持续**(本局连续代打, 不用手动再点)', second, 'hand ' + h2 + ' -> ' + h3);
    g.toggleAutoPlay();                       // 收尾: 关掉托管
    check('C3.4 收尾已关闭托管', g.uiAutoPlay() === false, String(g.uiAutoPlay()));
  }

  console.log('\ntest-req-20261106: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
  process.exit(0);
})();
