// tests/test-audit-bottom.js — 自主审查: 亮A §4.1 / 反A §4.4 / 底牌转移 §4.5
// 用确定性状态构造器(不走随机发牌), 严格保持 108 张守恒
var engine = require('../src/index.js');
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { camps } = require('../src/util.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---- 确定性状态构造器 ----
// aceMap: { playerId: [花色...] }  该玩家手里的 A 牌花色(按 hand 顺序占位)
// botMap: { playerId: 花色|null }  该玩家底牌花色(必须是 A 才改写; 非 A 保持)
function build(opts) {
  var o = opts || {};
  var aceMap = o.aceMap || {};
  var botMap = o.botMap || {};
  var ids = ['A', 'B', 'C', 'D', 'E'];
  var n = 0;
  function mkCard(pid, i, rank, suit, loc) {
    n++;
    return {
      id: pid + '-' + loc + '-' + i + '-' + n,
      suit: suit, rank: rank,
      isBigJoker: false, isSmallJoker: false, is主方大A: false,
      location: { type: loc, playerId: pid }
    };
  }
  // 每手牌张数: 前三 22 (含底牌), 后二 21
  var handSize = { A: 21, B: 21, C: 21, D: 20, E: 20 };
  var players = ids.map(function (pid) {
    var want = (aceMap[pid] || []).slice();
    var k = 0;
    var hand = [];
    for (var i = 0; i < handSize[pid]; i++) {
      if (k < want.length) hand.push(mkCard(pid, i, 14, want[k++], 'hand'));
      // \u586b\u5145\u724c: \u70b9\u6570\u9650 5..13 (\u4e0d\u542b A, \u907f\u514d\u5076\u7136\u591a\u51fa A \u6253\u6270\u5927A \u8ba1\u6570)
      else hand.push(mkCard(pid, i, ((i % 9) + 5), ['H', 'D', 'C', 'S'][i % 4], 'hand'));
    }
    var botSuit = botMap[pid];
    var bot = mkCard(pid, 'b', botSuit ? 14 : 3, botSuit || ['H', 'D', 'C', 'S'][2], '底牌');
    return { id: pid, hand: hand, 底牌: bot };
  });
  return {
    phase: PHASES.LIANG_A,
    players: players,
    startPlayerIndex: 0, deck: [], dealOrder: [],
    主A: null, 反A: null, 次方: null, mode: null,
    主方: [], 抓方: [], 头名: null, 推风触发者: null,
    底牌公开: false, 次方公开: false,
    table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null,
    actions: []
  };
}

function totalCards(state) {
  var t = 0;
  state.players.forEach(function (p) { t += p.hand.length + (p.底牌 ? 1 : 0); });
  return t + (state.table || []).length + (state.discarded || []).length;
}

function acesOf(state, pid) {
  var p = state.players.find(function (x) { return x.id === pid; });
  return p.hand.filter(function (c) { return c.rank === 14; });
}

function countBigA(state, suit) {
  var n = 0;
  state.players.forEach(function (p) {
    (p.hand || []).forEach(function (c) { if (c.is主方大A && (!suit || c.suit === suit)) n++; });
    if (p.底牌 && p.底牌.is主方大A && (!suit || p.底牌.suit === suit)) n++;
  });
  return n;
}

function toFAN(st) {
  var s = st;
  if (s.phase === PHASES.LIANG_A) s = transition(s, { type: ACTIONS.FORCED_CHECK, payload: {} }).state;
  if (s.phase === PHASES.LIANG_A_RESOLVED) s = transition(s, { type: ACTIONS.ADVANCE, payload: {} }).state;
  return s;
}

// ================= 1. 亮A §4.1 =================
section('1. 亮A §4.1 + §2.1');

{
  var st = build({ aceMap: { C: ['H', 'H'] } });
  check('1.0 构造 108 张', totalCards(st) === 108, 'total=' + totalCards(st));
  var aces = acesOf(st, 'C');
  check('1.0b C 有 2 张 ♥A', aces.length === 2 && aces[0].suit === 'H');
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'C', cardId: aces[0].id } });
  check('1.1 亮A 成功', r.ok === true, JSON.stringify(r.error));
  if (r.ok) {
    check('1.2 主A = ♥', r.state.主A && r.state.主A.suit === 'H', JSON.stringify(r.state.主A));
    check('1.3 §2.1 主A 花色两张 A 都标 is主方大A', countBigA(r.state, 'H') === 2, 'count=' + countBigA(r.state, 'H'));
  }
}

{
  // 底牌 A 不能亮
  var st = build({ aceMap: {}, botMap: { C: 'H' } });
  var bot = st.players[2].底牌;
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'C', cardId: bot.id } });
  check('1.4 底牌 A 不能亮A → 拒绝', r.ok === false, JSON.stringify(r.error));
}

{
  // 首个有效亮A 定主A, 其后被拒
  var st = build({ aceMap: { C: ['D'], D: ['S'] } });
  var r1 = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'C', cardId: acesOf(st, 'C')[0].id } });
  var r2 = transition(r1.state, { type: ACTIONS.LIANG_A, payload: { playerId: 'D', cardId: acesOf(r1.state, 'D')[0].id } });
  check('1.5 首个亮A 成功', r1.ok === true, JSON.stringify(r1.error));
  check('1.6 第二个亮A 被拒', r2.ok === false, JSON.stringify(r2.error));
}

// ================= 2. 反A §4.4 =================
section('2. 反A §4.4');

{
  // C 亮 ♦A 建主A; E 手握 ♠A×2 反A 成功
  var st = build({ aceMap: { C: ['D'], E: ['S', 'S'] } });
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'C', cardId: acesOf(st, 'C')[0].id } });
  st = toFAN(r.state);
  check('2.0 进入 FAN_A', st.phase === PHASES.FAN_A, st.phase);

  var eIds = acesOf(st, 'E').map(function (c) { return c.id; });
  var fan = transition(st, { type: ACTIONS.FAN_A, payload: { playerId: 'E', suit: 'S', cardIds: eIds } });
  check('2.1 反A 成功', fan.ok === true, JSON.stringify(fan.error));
  if (fan.ok) {
    check('2.2 phase = FAN_A_RESOLVED', fan.state.phase === PHASES.FAN_A_RESOLVED, fan.state.phase);
    check('2.3 §4.4 原主A 花色(♦)大A 标记全部撤销', countBigA(fan.state, 'D') === 0, 'count=' + countBigA(fan.state, 'D'));
    check('2.4 新主A = ♠', fan.state.主A && fan.state.主A.suit === 'S', JSON.stringify(fan.state.主A));
    check('2.5 反A者成为独打主方', fan.state.主方 && fan.state.主方.length === 1 && fan.state.主方[0] === 'E',
      JSON.stringify(fan.state.主方));
    // [P3 观察] FAN_A 阶段 state.抓方 暂为空 (此时阵营尚未锁定),
    // REVEAL_BOTTOM 会按大A分布重算并覆盖, 因此此处不作为断言点。
    var rbf = transition(fan.state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
    check('2.6 §4.4 反A+REVEAL_BOTTOM 后 原主A C 属抓方',
      rbf.ok === true && rbf.state.抓方.length === 4 && rbf.state.抓方.indexOf('C') >= 0,
      rbf.ok ? JSON.stringify(rbf.state.抓方) : JSON.stringify(rbf.error));
    check('2.6b 反A 后 mode = 1V4_明打 (§4.4)',
      rbf.ok && rbf.state.mode === '1V4_明打', rbf.ok ? rbf.state.mode : 'n/a');
    check('2.7 camps() 与 主方/抓方 一致', (function () {
      var c = camps(rbf.ok ? rbf.state : fan.state);
      return c.main.length === 1 && c.takers.length === 4;
    })(), JSON.stringify(camps(rbf.ok ? rbf.state : fan.state)));
  }
}

{
  // 只握 1 张同花色 A → 不能反A
  var st = build({ aceMap: { C: ['D'], E: ['S'] } });
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'C', cardId: acesOf(st, 'C')[0].id } });
  st = toFAN(r.state);
  var eIds = acesOf(st, 'E').map(function (c) { return c.id; });
  var fan = transition(st, { type: ACTIONS.FAN_A, payload: { playerId: 'E', suit: 'S', cardIds: eIds } });
  check('2.8 只握 1 张 A 反A → 拒绝', fan.ok === false, JSON.stringify(fan.error));
}

{
  // 底牌两张 A 不能反A (只给 1 张手牌 A + 底牌 A)
  var st = build({ aceMap: { C: ['D'], E: ['S'] }, botMap: { E: 'S' } });
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'C', cardId: acesOf(st, 'C')[0].id } });
  st = toFAN(r.state);
  var handIds = acesOf(st, 'E').map(function (c) { return c.id; });
  handIds.push(st.players[4].底牌.id);
  var fan = transition(st, { type: ACTIONS.FAN_A, payload: { playerId: 'E', suit: 'S', cardIds: handIds } });
  check('2.9 底牌 A 不参与反A资格 → 拒绝', fan.ok === false, JSON.stringify(fan.error));
}

{
  // 多人反A: 首个成功, 其余被拒
  var st = build({ aceMap: { C: ['D'], D: ['S', 'S'], E: ['H', 'H'] } });
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'C', cardId: acesOf(st, 'C')[0].id } });
  st = toFAN(r.state);
  var f1 = transition(st, { type: ACTIONS.FAN_A, payload: { playerId: 'D', suit: 'S', cardIds: acesOf(st, 'D').map(function (c) { return c.id; }) } });
  var f2 = f1.ok ? transition(f1.state, { type: ACTIONS.FAN_A, payload: { playerId: 'E', suit: 'H', cardIds: acesOf(f1.state, 'E').map(function (c) { return c.id; }) } }) : null;
  check('2.10 首个反A 成功', f1.ok === true, JSON.stringify(f1.error));
  check('2.11 第二个反A 被拒', f2 !== null && f2.ok === false, f2 ? JSON.stringify(f2.error) : 'f1 failed');
}

// ================= 3. 底牌转移 §4.5 =================
section('3. 底牌翻开转移 §4.5');

{
  var st = toFAN(build({ aceMap: { C: ['D'] }, botMap: { C: 'H', E: 'S' } }));
  var before = st.players.map(function (p) { return p.hand.length + (p.底牌 ? 1 : 0); });
  var cBotId = st.players[2].底牌.id;

  var r = transition(st, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  check('3.1 REVEAL_BOTTOM 成功', r.ok === true, JSON.stringify(r.error));
  if (r.ok) {
    check('3.2 底牌槽全部 null', r.state.players.every(function (p) { return p.底牌 === null; }),
      JSON.stringify(r.state.players.map(function (p) { return p.底牌; })));
    check('3.3 每人总张数不变 (手牌+底牌)',
      r.state.players.every(function (p, i) { return p.hand.length === before[i]; }),
      JSON.stringify(r.state.players.map(function (p, i) { return [p.hand.length, before[i]]; })));
    check('3.4 牌张守恒 108', totalCards(r.state) === 108, 'total=' + totalCards(r.state));
    check('3.5 底牌实体并入手牌 (按实体ID)',
      r.state.players[2].hand.some(function (c) { return c.id === cBotId; }), 'botId=' + cBotId);
    check('3.6 底牌公开 = true', r.state.底牌公开 === true, String(r.state.底牌公开));
    check('3.7 无重复实体ID', (function () {
      var seen = {}, dup = 0;
      r.state.players.forEach(function (p) {
        p.hand.forEach(function (c) { if (seen[c.id]) dup++; seen[c.id] = 1; });
      });
      return dup === 0;
    })());
  }
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);