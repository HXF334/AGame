// tests/test-deal-async.js —— 异步逐轮发牌路径 + 2026-11-04 晚 7 项报障回归
//
// [用户 2026-11-04 20:46 报障]
//   #1 点数个数<=13 能否枚举 21 张大连珠蛋? (答: 能)
//   #2 开局前每个人前面都显示「已出完」(发牌阶段手牌本来就是空的 -> 误判成出完)
//   #3 发牌过程中亮完大A后不发牌了
//   #4 亮牌后不能选牌不能出牌, 没有出牌按钮了
//   #5 机器人图标被小游戏胶囊按钮挡住 -> 再往左移
//   #6 AI 玩家头像整体往下移一点, 第二排多下移一点
//   #7 发牌阶段记牌器收起来
//
// [为什么以前测不出来] 无头默认 DEAL_STEP=0 -> 22 轮**同步**跑完;
//   于是**异步**发牌路径(真机/模拟器每 0.5 秒一轮)从来没被跑过。
//   #3/#4 正好只在这条路径上出现(闸门计划在牌没发完时被空转跑光)。
//   本套件用 __setDealStep 强制走异步路径。
//
// 跑法: node tests/test-deal-async.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var engine = require('../src/index.js');
var ht = require('../src/hand-types.js');
var combos = require('../src/combos.js');
var uiRender = require('../ui-render.js');
var { createNormalCard } = require('../src/card.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function waitUntil(fn, ms) {
  var t0 = Date.now();
  while (Date.now() - t0 < (ms || 3000)) { if (fn()) return true; await sleep(5); }
  return false;
}
// 牌堆: ranges = [[点数, 张数], ...]
function buildHand(ranges) {
  var hand = [], id = 0;
  ranges.forEach(function (r) {
    for (var k = 0; k < r[1]; k++) hand.push({ id: 'c' + (id++), rank: r[0], suit: 'S' + (k % 4), point: r[0] });
  });
  return hand;
}
async function main() {
section('A. 引擎: 21 张大连珠蛋可以枚举 (用户问 #1)');
{
  // 7 组 x 3 张 = 21 张, 点数个数 = 7 (远小于上限 13)
  var hand = buildHand([[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3]]);
  check('A.1 手牌 21 张', hand.length === 21, String(hand.length));
  var rec = ht.identifyHand(hand);
  check('A.2 识别为 BIG_STRAIGHT_TRIPLE(大连珠蛋)',
    rec && rec.type === ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE, rec ? rec.type : 'null');
  var cands = combos.candidateCombos(hand) || [];
  var byId = {};
  hand.forEach(function (c) { byId[c.id] = c; });
  var found = cands.filter(function (ids) {
    var cs = ids.map(function (i) { return byId[i]; }).filter(Boolean);
    var t = ht.identifyHand(cs);
    return t && t.type === ht.HAND_TYPES.BIG_STRAIGHT_TRIPLE && cs.length === 21;
  });
  check('A.3 枚举出 21 张的大连珠蛋候选', found.length >= 1,
    '候选总数=' + cands.length + ' 21张大连珠蛋=' + found.length);
  check('A.4 枚举出的 21 张候选点数连续', found.length >= 1 &&
    found[0].map(function (i) { return byId[i].point; }).join(',') === '2,2,2,3,3,3,4,4,4,5,5,5,6,6,6,7,7,7,8,8,8',
    found.length ? found[0].map(function (i) { return byId[i].point; }).join(',') : '(无)');
  // 点数个数上限: 13 个点数(2..A)的最长连张必须还能枚举
  var long13 = buildHand([[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1]]);
  var c13 = combos.candidateCombos(long13) || [];
  var ok13 = c13.some(function (ids) { return ids.length === 13; });
  check('A.5 13 个点数的连张仍能枚举', ok13, '候选=' + c13.length);
}

section('B. 引擎: 发牌过程中亮A -> 发牌不中断 (用户报障 #3)');
{
  var st = engine.newGameState();
  var r = engine.transition(st, { type: engine.ACTIONS.START_GAME, payload: { progressive: true, startPlayerIndex: 0 } });
  for (var i = 0; i < 4; i++) r = engine.transition(r.state, { type: engine.ACTIONS.DEAL_ROUND, payload: {} });
  var me = r.state.players[0];
  var ace = createNormalCard('H', 14, 'dealAsyncA');
  ace.location = { type: 'hand', playerId: me.id };
  var st2 = Object.assign({}, r.state, {
    players: r.state.players.map(function (p) {
      return p.id === me.id ? { id: p.id, hand: p.hand.concat([ace]), 底牌: p.底牌 } : p;
    })
  });
  var rr = engine.transition(st2, { type: engine.ACTIONS.LIANG_A, payload: { playerId: me.id, cardId: ace.id } });
  check('B.1 发牌中亮A 引擎接受', rr.ok === true, rr.ok ? '' : JSON.stringify(rr.error));
  check('B.2 亮A 后 phase 仍是 DEALING(发牌不中断)',
    rr.state.phase === engine.PHASES.DEALING, rr.state.phase);
  check('B.3 亮A 后主A确立', !!(rr.state['主A'] && rr.state['主A'].suit === 'H'), '');
  check('B.4 亮A 后发牌轮次保留(没被重置)', rr.state.dealRoundIndex === 4, String(rr.state.dealRoundIndex));
  check('B.5 亮A 后同花色 A 标为主方大A',
    rr.state.players[0].hand.filter(function (c) { return c.is主方大A; }).length >= 1, '');
  // 继续把牌发完 -> 因为主A已确立, 直接进 LIANG_A_RESOLVED(跳过亮A阶段)
  var r2 = rr.state;
  while (r2.phase === engine.PHASES.DEALING) {
    r2 = engine.transition(r2, { type: engine.ACTIONS.DEAL_ROUND, payload: {} }).state;
  }
  check('B.6 牌发完后 -> LIANG_A_RESOLVED', r2.phase === engine.PHASES.LIANG_A_RESOLVED, r2.phase);
  var total = r2.players.reduce(function (a, p) { return a + p.hand.length + (p.底牌 ? 1 : 0); }, 0);
  check('B.7 发牌完成总牌数 108(含注入的 1 张 A -> 109)', total === 109, String(total));
}
section('C. game.js: 异步发牌路径 (用户报障 #3/#4 的真实现场)');
{
  // 无头默认 DEAL_STEP=0 -> 22 轮**同步**跑完, 异步路径平时测不到。
  // 这里强制走异步(每轮 5ms), 复现真机/模拟器的时序。
  g.__setDealStep(5);
  g.newGame();
  check('C.1 新局进入 DEALING', g.gameState().phase === 'DEALING', g.gameState().phase);
  var gi = g.gateInfo();
  check('C.2 发牌中闸门停在第 2 档(没被跑光)', gi.idx === 1 && gi.stage === 'FORCED_CHECK',
    'idx=' + gi.idx + ' stage=' + gi.stage + ' total=' + gi.total);
  // 等牌发完(异步) -> 闸门继续跑 -> 必须进 PLAY
  var done = await waitUntil(function () { return g.gameState().phase !== 'DEALING'; }, 8000);
  check('C.3 发牌最终结束', done, g.gameState().phase);
  for (var k = 0; k < 30 && g.gameState().phase !== 'PLAY'; k++) {
    g.__driveGateToPlay({});
    await sleep(20);
  }
  check('C.4 最终进入 PLAY 阶段', g.gameState().phase === 'PLAY', g.gameState().phase);
  var gi2 = g.gateInfo();
  check('C.5 闸门跑完(idx == total)', gi2.idx === gi2.total, 'idx=' + gi2.idx + '/' + gi2.total);
  // 「出牌」按钮必须存在, 且轮到真人时可用
  var bm = g.uiButtonModel();
  var playBtn = bm.filter(function (b) { return b.id === 'play'; })[0];
  check('C.6 有【出牌】按钮', !!playBtn, JSON.stringify(bm.map(function (b) { return b.id; })));
  g.__setState(g.gameState(), { currentPlayer: g.getHumanPlayer(), human: g.getHumanPlayer(), clearLog: false });
  var bm2 = g.uiButtonModel();
  var pb2 = bm2.filter(function (b) { return b.id === 'play'; })[0];
  check('C.7 轮到真人时【出牌】可用', !!(pb2 && pb2.enabled), JSON.stringify(bm2));
}

section('C2. game.js: 发牌过程中亮大A -> 发牌继续 (用户报障 #3)');
{
  g.__setDealStep(20);
  g.newGame();
  check('C2.1 新局进入 DEALING', g.gameState().phase === 'DEALING', g.gameState().phase);
  // 往真人手里塞一张黑桃A(规则已在 B 段验证, 这里验证**游戏层**发牌不中断)
  var hs = g.gameState();
  var meIdx = hs.players.map(function (p) { return p.id; }).indexOf(g.getHumanPlayer());
  hs.players[meIdx].hand.push(createNormalCard('H', 14, 'asyncDealAce'));
  await sleep(80);   // 等下一轮刷新可亮A候选(uiDealAces)
  var latched = g.uiClick('dealLiangA:H');
  check('C2.2 发牌中真人成功亮A', latched === true, 'phase=' + g.gameState().phase);
  check('C2.3 亮A 后 phase 仍是 DEALING(牌继续发)',
    g.gameState().phase === 'DEALING', g.gameState().phase);
  check('C2.4 亮A 后主A确立', !!(g.gameState()['主A'] && g.gameState()['主A'].suit === 'H'),
    JSON.stringify(g.gameState()['主A']));
  // 关键: 亮A **之后**发牌轮次还要继续增长(修前会停在这里 -> 牌永远发不完)
  var r1 = g.gameState().dealRoundIndex;
  await sleep(140);
  var r2 = g.gameState().dealRoundIndex;
  check('C2.5 亮A 后发牌轮次继续增长(没中断)', r2 > r1, 'r1=' + r1 + ' r2=' + r2);
  var done2 = await waitUntil(function () { return g.gameState().phase !== 'DEALING'; }, 8000);
  check('C2.6 牌最终发完', done2, g.gameState().phase);
  g.__setDealStep(0);
}
section('D. UI: 发牌阶段不显示「已出完」(用户报障 #2)');
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
  var st = {
    W: 844, H: 390, phase: 'PLAY',
    gameState: g.gameState(), currentPlayer: 'A', humanPlayer: 'D',
    selectedCards: [], names: ['甲', '乙', '丙', '丁', '戊'],
    rankDesc: function (c) { return String(c.rank); },
    cardDesc: function (c) { return c.id; },
    buttons: [], stageHint: '', logVisible: false, logHistory: [], toast: null,
    uiPlays: {}, uiPlaysTrick: {}, uiTrickId: 0, uiPassed: {},
    marks: {}, memoOpen: false, memoItems: [], testMode: false,
    isMainAce: function () { return false; }, mainAceSuit: null, mainAceMarks: {},
    scores: {}, settlement: null, turnDeadline: 0, turnTotal: 20000, autoPlay: false
  };
  for (var k in (over || {})) st[k] = over[k];
  return st;
}
function countText(items, s) {
  return items.filter(function (i) { return i.t === s; }).length;
}
{
  var gs = g.gameState();
  gs.phase = 'DEALING';
  gs.players.forEach(function (p) { p.hand = []; p.底牌 = null; });
  var ctxD = mockCtx();
  uiRender.render(ctxD, baseState({ gameState: gs, phase: 'DEALING' }));
  check('D.1 发牌阶段不显示「已出完」', countText(ctxD.items, '已出完') === 0,
    '已出完=' + countText(ctxD.items, '已出完'));
  // 回归护栏: PLAY 阶段打完牌的玩家**仍然**要显示「已出完」
  var gs2 = g.gameState();
  gs2.phase = 'PLAY';
  gs2.players.forEach(function (p, i) { p.hand = i === 0 ? [] : [createNormalCard('H', 9, 'r' + i)]; });
  var ctxP = mockCtx();
  uiRender.render(ctxP, baseState({ gameState: gs2, phase: 'PLAY' }));
  check('D.2 PLAY 阶段打完牌的人仍显示「已出完」', countText(ctxP.items, '已出完') >= 1,
    '已出完=' + countText(ctxP.items, '已出完'));
}

section('E. UI: 布局调整 (用户报障 #5 机器人图标 / #6 AI 头像下移)');
{
  var lay = uiRender.layout(844, 390);
  var OLD_ROBOT_X = 844 - lay.safeR - Math.round(390 * 0.085);
  check('E.1 机器人图标比原来更靠左', lay.autoPlay.iconX < OLD_ROBOT_X - 40,
    'new=' + lay.autoPlay.iconX + ' old=' + OLD_ROBOT_X);
  check('E.2 机器人图标离右边缘 >= 100px(避开胶囊按钮)',
    844 - (lay.autoPlay.iconX + lay.autoPlay.iconR) >= 100,
    '右缘=' + (844 - lay.autoPlay.iconX - lay.autoPlay.iconR));
  check('E.3 AI 第一排下移', lay.seats[0].y > 390 * 0.215,
    'y=' + lay.seats[0].y + ' old=' + (390 * 0.215));
  check('E.4 AI 第二排下移', lay.seats[1].y > 390 * 0.405,
    'y=' + lay.seats[1].y + ' old=' + (390 * 0.405));
  check('E.5 第二排比第一排下移得多(第二排多下移)',
    (lay.seats[1].y - lay.seats[0].y) > (390 * 0.405 - 390 * 0.215) + 8,
    '间距=' + (lay.seats[1].y - lay.seats[0].y) + ' old=' + (390 * 0.405 - 390 * 0.215));
}

section('F. 记牌器: 发牌阶段收起 (用户报障 #7)');
{
  var stD = g.gameState();
  stD.phase = 'DEALING';
  g.__setState(stD, { clearLog: true });
  check('F.1 发牌阶段记牌器收起', g.uiMemoOpenNow() === false, String(g.uiMemoOpenNow()));
  var stP = g.gameState();
  stP.phase = 'PLAY';
  g.__setState(stP, { clearLog: true });
  check('F.2 出牌阶段按用户设置展开(默认展开)', g.uiMemoOpenNow() === true, String(g.uiMemoOpenNow()));
}
}

main().then(function () {
  console.log('\ntest-deal-async: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
  process.exit(0);
}, function (e) {
  console.log('\ntest-deal-async: 异常 ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
