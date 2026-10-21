// tests/test-liang-double-a.js — §4.3 直接亮双大A 独打
// SKILL §4.3: "玩家若持有同花色的两张A，可以直接亮双大A，确立自己为主方并独打。
//              该玩家没有独立次A；直接亮双大A的独打者享有首轮出牌权。"
// SKILL §4.5: "直接亮双大A宣告独打视为公开独打身份，按1V4明打"
// SKILL §5  : "直接亮双大A独打的玩家" 拥有首轮出牌权 (优先级 1)
var engine = require('../src/index.js');
var { transition, determineFirstPlayer } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { createNormalCard } = require('../src/card.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var n = 0;
function C(s, r) { return createNormalCard(s, r, 'c' + (++n)); }

function build(aceMap) {
  var ids = ['A', 'B', 'C', 'D', 'E'];
  var handSize = { A: 21, B: 21, C: 21, D: 20, E: 20 };
  return {
    phase: PHASES.LIANG_A, players: ids.map(function (pid) {
      var want = (aceMap[pid] || []).slice(); var k = 0; var hand = [];
      for (var i = 0; i < handSize[pid]; i++) {
        if (k < want.length) hand.push(C(want[k++], 14));
        else hand.push(C(['H','D','C','S'][i % 4], ((i % 9) + 5)));
      }
      return { id: pid, hand: hand, 底牌: C('C', 3) };
    }),
    startPlayerIndex: 2, deck: [], dealOrder: [],
    主A: null, 反A: null, 次方: null, mode: null,
    主方: [], 抓方: [], 头名: null, 推风触发者: null,
    底牌公开: false, 次方公开: false,
    table: [], discarded: [], passedPlayers: [], passCount: 0, lastPlayer: null, actions: []
  };
}

function acesOf(state, pid) {
  return state.players.find(function (p) { return p.id === pid; })
    .hand.filter(function (c) { return c.rank === 14; });
}

// ================= 1. 双大A 独打：全流程 =================
section('1. 玩家持同花色两张A 直接亮 -> 1V4明打 独打');

{
  // B 手里两张 ♥A -> 直接亮双大A
  var st = build({ B: ['H', 'H'] });
  var bAces = acesOf(st, 'B');
  check('1.0 B 手里有 2 张 ♥A', bAces.length === 2 && bAces[0].suit === 'H');

  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'B', cardId: bAces[0].id } });
  check('1.1 亮A 成功', r.ok === true, r.ok ? '' : (r.error.type + ' ' + r.error.message));
  if (!r.ok) { console.log('\nFAILED:', failures); process.exit(1); }

  check('1.2 主A = ♥, 确立者 = B', r.state.主A.suit === 'H' && r.state.主A.establishedBy === 'B', JSON.stringify(r.state.主A));

  // 两张 ♥A 都应被标记为大A
  var bigA = r.state.players.filter(function (p) {
    return p.hand.filter(function (c) { return c.suit === 'H' && c.rank === 14 && c.is主方大A; }).length;
  });
  check('1.3 §2.1 两张同花色A 都标 is主方大A', bigA.length === 1 && bigA[0].id === 'B', 'marked players=' + bigA.map(function (p) { return p.id; }).join(','));

  // 推进到 PLAY
  var s = transition(r.state, { type: ACTIONS.FORCED_CHECK, payload: {} }).state;
  s = transition(s, { type: ACTIONS.ADVANCE, payload: {} }).state;
  if (s.phase === PHASES.FAN_A) s = transition(s, { type: ACTIONS.ADVANCE, payload: {} }).state;
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;

  check('1.4 进入 PLAY (直接进, 无 IDENTITY_CHOICE)', s.phase === PHASES.PLAY, 'phase=' + s.phase);
  check('1.5 §4.5 mode = 1V4_明打', s.mode === '1V4_明打', 'mode=' + s.mode);
  check('1.6 §4.3 无独立次方', s['次方'] === null, '次方=' + s['次方']);
  check('1.7 主方 = [B] 独打', s['主方'] && s['主方'].length === 1 && s['主方'][0] === 'B', JSON.stringify(s['主方']));
  check('1.8 抓方 = 其余 4 人', s['抓方'] && s['抓方'].length === 4, JSON.stringify(s['抓方']));
  var fp = determineFirstPlayer(s);
  check('1.9 §5 首轮出牌权归独打者 B', fp === 'B', 'first=' + fp);
}

// ================= 2. 对照：两张A分属两人 = 2V3 =================
section('2. 对照 — 两张大A分属两人 -> 2V3 (应有 IDENTITY_CHOICE)');

{
  var st = build({ B: ['H'], C: ['H'] });
  var bAces = acesOf(st, 'B');
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'B', cardId: bAces[0].id } });
  var s = transition(r.state, { type: ACTIONS.FORCED_CHECK, payload: {} }).state;
  s = transition(s, { type: ACTIONS.ADVANCE, payload: {} }).state;
  if (s.phase === PHASES.FAN_A) s = transition(s, { type: ACTIONS.ADVANCE, payload: {} }).state;
  s = transition(s, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }).state;
  check('2.1 进入 IDENTITY_CHOICE', s.phase === PHASES.IDENTITY_CHOICE, 'phase=' + s.phase);
  check('2.2 次方 = C (持另一张大A者)', s['次方'] === 'C', '次方=' + s['次方']);
}

// ================= 3. 对照：两张A在同一玩家但走强制排查 =================
section('3. 对照 — 无主动亮A, 强制排查跳过同花色两张');

{
  // B 持两张 ♥A, 但没人亮A -> 该花色对 B 不可排查
  var st = build({ B: ['H', 'H'], C: ['D'] });
  var r = transition(st, { type: ACTIONS.FORCED_CHECK, payload: {} });
  check('3.1 强制排查成功', r.ok === true);
  if (r.ok) {
    check('3.2 跳过 B 的 ♥A×2, 命中 C 的 ♦A',
      r.state.主A && r.state.主A.suit === 'D' && r.state.主A.establishedBy === 'C',
      JSON.stringify(r.state.主A));
  }
}

// ================= 4. 边界 =================
section('4. 边界');

{
  // 底牌里的 A 不能直接亮
  var st = build({});
  st.players[0].底牌 = C('H', 14);
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: st.players[0].底牌.id } });
  check('4.1 底牌 A 不能亮', r.ok === false && r.error.type === 'CARD_NOT_IN_HAND', r.ok ? 'ok' : r.error.type);
}

{
  // 非 A 不能亮
  var st = build({});
  var nonAce = st.players[0].hand.filter(function (c) { return c.rank !== 14; })[0];
  var r = transition(st, { type: ACTIONS.LIANG_A, payload: { playerId: 'A', cardId: nonAce.id } });
  check('4.2 非 A 不能亮', r.ok === false && r.error.type === 'NOT_AN_ACE', r.ok ? 'ok' : r.error.type);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);