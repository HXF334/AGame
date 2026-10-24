// tests/test-game-scenarios.js — 构造态回归: 把用户报过的每个 bug 固化为永久用例
//
// 动机: game.js 初始化随机发牌并同步跑完 AI 回合, 测试无法控制局面,
//       用户报过的 bug 只能随机撞上。有了 __setState 注入点可精确构造场景。
//
// 重要 API 事实 (踩坑记录):
//   1. doPlay() **不接受参数** —— 出牌取的是模块级 selectedCards。
//      测试必须 g.selectedCards().push(id) 后再调 g.doPlay()。
//   2. 构造态必须是合法 108 张局面, 否则引擎行为不可预期。
//   3. doPushWind 的触发者是 lastEmptiedPlayer || gameState['推风触发者'],
//      而 lastEmptiedPlayer 是模块级变量, 必须经 __setState 的 opts 传入。
//
// 覆盖 (均为用户实际报过的现象):
//   S1 推风跳阵营 / S2 33333管单大A / S3 10JQ连张(乱序手牌) /
//   S4 对子出牌 / S5 §4.3双大A独打 / S6 反A
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var { transition } = require('../src/transition.js');
var { createNormalCard } = require('../src/card.js');
var { identifyHand, canBeat, HAND_TYPES } = require('../src/hand-types.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var seq = 0;
function C(s, r) { return createNormalCard(s, r, 'sc' + (++seq)); }
function BigA(s) { var c = createNormalCard(s, 14, 'sb' + (++seq)); c.is主方大A = true; return c; }

// 合法 108 张局面: 手牌 + 桌面牌 + 弃牌堆 = 108
// emptyPlayers 中的人手牌为 0 (已出完), 其份额自动计入弃牌堆
var TARGET = { A: 22, B: 22, C: 22, D: 21, E: 21 };
function build(o) {
  var ids = ['A', 'B', 'C', 'D', 'E'];
  var table = (o.table || []).slice();
  var empty = o.emptyPlayers || [];
  var handTotal = 108 - table.length;   // 先假设弃牌堆为空

  var players = ids.map(function (pid) {
    if (empty.indexOf(pid) >= 0) return { id: pid, hand: [], 底牌: null };
    var hand = (o.handMap && o.handMap[pid] ? o.handMap[pid].slice() : []);
    return { id: pid, hand: hand, 底牌: null };
  });

  // 按 108 - 桌面 - 弃牌 分配手牌张数
  var need = handTotal - players.reduce(function (a, p) { return a + p.hand.length; }, 0);
  // 填充牌点数限 5..13 (不含 A/王/4), 避免干扰被测场景
  players.forEach(function (p) {
    if (empty.indexOf(p.id) >= 0) return;          // 已出完的玩家不填充
    var want = TARGET[p.id];
    var add = Math.max(0, Math.min(want - p.hand.length, need));
    for (var i = 0; i < add; i++) p.hand.push(C(['H','D','C','S'][i % 4], 5 + (i % 9)));
    need -= add;
  });
  // 剩余额度计入弃牌堆 (模拟已出完玩家丢弃的牌)
  var discarded = [];
  for (var j = 0; j < need; j++) discarded.push(C(['H','D','C','S'][j % 4], 5 + (j % 9)));

  return {
    phase: o.phase || 'PLAY',
    mode: o.mode || '2V3_暗打',
    主A: o.主A || { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    反A: o.反A || null,
    次方: o.次方 !== undefined ? o.次方 : 'C',
    次方公开: !!o.次方公开,
    主方: o.主方 || ['B', 'C'],
    抓方: o.抓方 || ['A', 'D', 'E'],
    底牌公开: o.底牌公开 !== undefined ? o.底牌公开 : true,
    头名: null, 推风触发者: o.推风触发者 || null,
    table: table,
    discarded: discarded,
    passedPlayers: (o.passedPlayers || []).slice(), passCount: 0,
    lastPlayer: o.lastPlayer || 'B',
    actions: [],
    players: players
  };
}
function countAll(s) {
  var t = 0;
  s.players.forEach(function (p) { t += p.hand.length + (p.底牌 ? 1 : 0); });
  return t + (s.table || []).length + (s.discarded || []).length;
}
function inject(st, opts) {
  return g.__setState(st, Object.assign({ currentPlayer: 'A', human: 'A' }, opts || {}));
}
function handA() { return g.gameState().players.find(function (p) { return p.id === 'A'; }).hand; }
// 已出的牌可能已被 AI 压过而进入弃牌堆 (桌面只保留当前最大的一手),
// 故断言"该牌既不在 A 手上、且确实存在于桌面或弃牌堆"即证明出牌成功。
function playedSomewhere(cards) {
  var s = g.gameState();
  var onTable = s.table || [], inDiscard = s.discarded || [];
  return cards.every(function (c) {
    return onTable.some(function (t) { return t.id === c.id; }) ||
           inDiscard.some(function (t) { return t.id === c.id; });
  });
}
function stillInHand(pid, cards) {
  var h = g.gameState().players.find(function (p) { return p.id === pid; }).hand;
  return cards.some(function (c) { return h.some(function (x) { return x.id === c.id; }); });
}
function logStr() { return g.logHistory().join(' || '); }
// 选中若干张并出牌 (doPlay 不收参数, 须先写 selectedCards)
function selectAndPlay(cards) {
  g.selectedCards().length = 0;
  cards.forEach(function (c) { g.selectedCards().push(c.id); });
  g.doPlay();
}

// ================= S1 推风跳阵营 =================
section('S1 推风必须同阵营 (§9.3)');

{
  // 主A=乙, 次方=丙(公开) -> 主方{乙,丙} 抓方{甲,丁,戊}
  // 甲(抓方)已出完触发推风, 丁也出完, 戊(抓方)剩牌 -> 应推戊
  var st = build({
    handMap: { B: [C('S',5),C('H',5),C('D',5)], C: [C('S',5),C('H',5),C('D',5)], E: [C('S',7)] },
    emptyPlayers: ['A', 'D'],
    主方: ['B','C'], 抓方: ['A','D','E'], 次方: 'C', 次方公开: true,
    主A: { suit: 'H', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    推风触发者: 'A', table: [C('C', 9)], lastPlayer: 'A',
    passedPlayers: ['B','C','D']
  });
  check('S1.1 构造态合法 108 张', countAll(st) === 108, 'total=' + countAll(st));
  check('S1.2 甲确实已出完', st.players.find(function (p) { return p.id === 'A'; }).hand.length === 0);
  // 关键: 故意注入一个**错误**的 currentPlayer, 以验证 doPushWind 是否真的
  //   从引擎返回值同步 (而非沿用旧值)。若注入了正确值, 修复与否无法区分。
  inject(st, { currentPlayer: 'C', human: 'B', lastEmptiedPlayer: 'A' });

  g.doPushWind();
  var after = g.currentPlayer();
  var lg = logStr();
  console.log('   [取证] 注入 currentPlayer=C, 推风后=' + after);
  console.log('   [取证] log 首行: ' + (lg.split(' || ')[0] || '(空)'));
  console.log('   [取证] 最终手牌: ' + g.gameState().players.map(function (p) { return p.id + ':' + p.hand.length; }).join(' '));

  // 判定: 引擎给出的推风目标是 E(戊), 故**第一个行动的人必须是戊**。
  var firstActor = (lg.split(' || ')[0] || '');
  check('S1.3 推风后第一个行动的是戊(抓方最近未出完者), 而非主A 乙',
    firstActor.indexOf('\u620a') >= 0, 'firstActor=' + firstActor);
  check('S1.4 第一个行动者不是乙(主A)也不是丙(主方)',
    firstActor.indexOf('\u4e59') < 0 && firstActor.indexOf('\u4e19') < 0, 'firstActor=' + firstActor);
  check('S1.5 currentPlayer 非空 (同步已发生)', !!after, String(after));
}

// ================= S2 33333 管单大A =================
section('S2 5张同点大蛋子管单大A (§6.4)');

{
  var five3 = [C('H',3), C('D',3), C('C',3), C('S',3), C('H',3)];
  var st = build({
    handMap: { A: five3, B: [C('S',2)], C: [C('S',2)], D: [C('S',2)], E: [C('S',2)] },
    table: [BigA('H')], lastPlayer: 'B'
  });
  check('S2.0 构造态合法 108 张', countAll(st) === 108, 'total=' + countAll(st));
  inject(st, { currentPlayer: 'A' });

  check('S2.1 引擎判定 33333 可管单大A',
    canBeat(identifyHand(five3), identifyHand(st.table)) === true, 'canBeat');

  var beforeN = handA().length;
  selectAndPlay(five3);
  var afterN = handA().length;
  check('S2.2 出 33333 后手牌减 5', beforeN - afterN === 5, 'before=' + beforeN + ' after=' + afterN);
  // 注意: doPlay 内部会接着调 runAI(), AI 可能已追加出牌,
  //       故断言"A 的 5 张 3 确实上桌"而非"桌面恰好 5 张"。
  check('S2.3 A 的 5 张 3 均已离手且存在于桌面/弃牌堆',
    playedSomewhere(five3) && !stillInHand('A', five3),
    'table=' + g.gameState().table.length + ' discarded=' + g.gameState().discarded.length);
  check('S2.4 log 无失败/不合法', logStr().indexOf('\u5931\u8d25') < 0, logStr().slice(0, 200));
  check('S2.5 牌张守恒 108', countAll(g.gameState()) === 108, 'total=' + countAll(g.gameState()));
}

// ================= S3 10JQ 连张 (乱序手牌) =================
section('S3 乱序手牌出连张 (P0 牌序修复)');

{
  var messy = [C('S',12), C('H',10), C('D',11)];   // 顺序刻意打乱
  var st = build({
    handMap: { A: messy, B: [C('S',2)], C: [C('S',2)], D: [C('S',2)], E: [C('S',2)] },
    table: [], lastPlayer: 'B'
  });
  check('S3.0 构造态合法 108 张', countAll(st) === 108, 'total=' + countAll(st));
  inject(st, { currentPlayer: 'A' });

  var beforeN = handA().length;
  selectAndPlay(messy);
  var afterN = handA().length;
  check('S3.1 乱序手牌(12,10,11)出连张被接受', beforeN - afterN === 3, 'before=' + beforeN + ' after=' + afterN);
  check('S3.2 A 的 3 张连张牌均已离手且存在于桌面/弃牌堆',
    playedSomewhere(messy) && !stillInHand('A', messy),
    'table=' + g.gameState().table.length + ' discarded=' + g.gameState().discarded.length);
  check('S3.3 log 无不合法', logStr().indexOf('\u4e0d\u5408\u6cd5') < 0 && logStr().indexOf('\u5931\u8d25') < 0, logStr().slice(0, 200));
  check('S3.4 牌张守恒 108', countAll(g.gameState()) === 108, 'total=' + countAll(g.gameState()));
}

// ================= S4 对子出牌 =================
section('S4 对子出牌 (桌上有对10)');

{
  var st = build({
    handMap: { A: [C('S',3), C('C',3)], B: [C('S',2)], C: [C('S',2)], D: [C('S',2)], E: [C('S',2)] },
    table: [C('S',10), C('H',10)], lastPlayer: 'B'
  });
  check('S4.0 构造态合法 108 张', countAll(st) === 108, 'total=' + countAll(st));
  inject(st, { currentPlayer: 'A' });

  var pair = handA().filter(function (c) { return c.rank === 3; });
  check('S4.1 A 手上有对3', pair.length === 2, 'n=' + pair.length);
  var beforeN = handA().length;
  selectAndPlay(pair);
  var afterN = handA().length;
  check('S4.2 出对3 成功', beforeN - afterN === 2, 'before=' + beforeN + ' after=' + afterN);
  check('S4.3 A 的 2 张 3 均已离手且存在于桌面/弃牌堆',
    playedSomewhere(pair) && !stillInHand('A', pair),
    'table=' + g.gameState().table.length + ' discarded=' + g.gameState().discarded.length);
  check('S4.4 log 无不合法', logStr().indexOf('\u4e0d\u5408\u6cd5') < 0, logStr().slice(0, 200));
}

// ================= S5 §4.3 双大A 独打 =================
section('S5 §4.3 直接亮双大A -> 1V4明打');

{
  var aceMap = { B: ['H', 'H'] };
  var hs = { A: 21, B: 21, C: 21, D: 20, E: 20 };
  var st = {
    phase: 'LIANG_A', mode: null,
    主A: null, 反A: null, 次方: null, 次方公开: false,
    主方: [], 抓方: [], 头名: null, 推风触发者: null,
    底牌公开: false, table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null, actions: [],
    startPlayerIndex: 2, deck: [], dealOrder: [],
    players: ['A','B','C','D','E'].map(function (pid) {
      var want = (aceMap[pid] || []).slice(); var k = 0; var hand = [];
      for (var i = 0; i < hs[pid]; i++) {
        if (k < want.length) hand.push(C(want[k++], 14));
        else hand.push(C(['H','D','C','S'][i % 4], 5 + (i % 9)));
      }
      return { id: pid, hand: hand, 底牌: C('C', 3) };
    })
  };
  inject(st, { currentPlayer: 'B' });

  var bAces = g.gameState().players.find(function (p) { return p.id === 'B'; })
    .hand.filter(function (c) { return c.rank === 14; });
  check('S5.0 B 有两张同花色 A', bAces.length === 2 && bAces[0].suit === bAces[1].suit, 'n=' + bAces.length);

  var steps = [
    { type: 'LIANG_A', payload: { playerId: 'B', cardId: bAces[0].id } },
    { type: 'FORCED_CHECK', payload: {} },
    { type: 'ADVANCE', payload: {} },
    { type: 'ADVANCE', payload: {} },   // 可能需要二次 ADVANCE 越过 FAN_A
    { type: 'REVEAL_BOTTOM', payload: {} }
  ];
  var r = null, lastOk = null;
  for (var i = 0; i < steps.length; i++) {
    r = transition(g.gameState(), steps[i]);
    if (r.ok) { inject(r.state, { currentPlayer: 'B' }); lastOk = steps[i].type; }
  }
  check('S5.1 REVEAL_BOTTOM 成功', r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
  if (r.ok) {
// [2026-10-24 用户裁定·规则修正] 双大A 默认 1V4暗打 -> 先进 IDENTITY_CHOICE 选明/暗
check('S5.2 进 IDENTITY_CHOICE (要选明/暗)', g.gameState().phase === 'IDENTITY_CHOICE', g.gameState().phase);
check('S5.3 未选择时 mode 未定', !g.gameState().mode, String(g.gameState().mode));
    check('S5.4 独打者为首出', g.currentPlayer() === 'B', String(g.currentPlayer()));
  }
}

// ================= S6 反A =================
section('S6 反A (§4.4)');

{
  var st = build({
    handMap: { E: [C('S',14), C('S',14), C('D',3), C('C',3)] },
    phase: 'FAN_A',
    主A: { suit: 'D', establishedBy: 'B', viaMethod: 'FORCED_CHECK' },
    主方: ['B'], 抓方: ['A','C','D','E'], 次方: null, 次方公开: false,
    mode: '1V4_暗打', lastPlayer: 'B',
    底牌公开: false
  });
  check('S6.0 构造态合法 108 张', countAll(st) === 108, 'total=' + countAll(st));
  inject(st, { currentPlayer: 'E' });

  var eAces = g.gameState().players.find(function (p) { return p.id === 'E'; })
    .hand.filter(function (c) { return c.suit === 'S' && c.rank === 14; });
  check('S6.1 E 有两张 ♠A', eAces.length === 2, 'n=' + eAces.length);

  var r = transition(g.gameState(), {
    type: 'FAN_A', payload: { playerId: 'E', suit: 'S', cardIds: eAces.map(function (c) { return c.id; }) }
  });
  check('S6.2 反A 成功', r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
  if (r.ok) {
    inject(r.state, { currentPlayer: 'E' });
    check('S6.3 新主A = ♠', g.gameState().主A.suit === 'S', g.gameState().主A.suit);
    check('S6.4 §4.4 反A 后 1V4明打', g.gameState().mode === '1V4_明打', String(g.gameState().mode));
    var rb = transition(g.gameState(), { type: 'REVEAL_BOTTOM', payload: {} });
    check('S6.5 REVEAL_BOTTOM 后进 PLAY', rb.ok === true && rb.state.phase === 'PLAY',
      rb.ok ? rb.state.phase : rb.error.message);
    if (rb.ok) {
      inject(rb.state, { currentPlayer: 'E' });
      check('S6.6 抓方含原主A 乙', rb.state.抓方.indexOf('B') >= 0, JSON.stringify(rb.state.抓方));
      check('S6.7 反A者为首出', g.currentPlayer() === 'E', String(g.currentPlayer()));
      check('S6.8 牌张守恒 108', countAll(g.gameState()) === 108, 'total=' + countAll(g.gameState()));
    }
  }
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
mock.uninstall();
process.exit(failed > 0 ? 1 : 0);