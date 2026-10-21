// tests/audit-rules.js — 自主审查: 阶段机 / 底牌 / 反A / 首出权 / 计分公式 / AI 边界
var engine = require('../src/index.js');
var { transition, determineFirstPlayer, _runForcedCheck } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var { createNormalCard, createBigJoker, createSmallJoker, createDeck, shuffle } = require('../src/card.js');
var { chooseAction } = require('../src/ai.js');
var { calculateScore } = require('../src/scoring.js');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var uid = 0;
function C(s, r) { return createNormalCard(s, r, 'c' + (++uid)); }
function mkPlayers(spec) {
  var ids = ['A', 'B', 'C', 'D', 'E'];
  return ids.map(function (id) {
    var n = spec[id] || 0;
    var hand = [];
    for (var i = 0; i < n; i++) hand.push(C('H', (i % 10) + 4));
    return { id: id, hand: hand, 底牌: null };
  });
}

// ================= 1. 牌组 §2.1 =================
section('1. 牌组 §2.1 (108 张, ID 唯一)');
{
  var deck = createDeck();
  check('1.1 牌组 108 张', deck.length === 108, 'actual=' + deck.length);
  var ids = {};
  var dup = 0;
  deck.forEach(function (c) { if (ids[c.id]) dup++; ids[c.id] = 1; });
  check('1.2 ID 无重复', dup === 0, 'dup=' + dup);
  var bj = deck.filter(function (c) { return c.isBigJoker; }).length;
  var sj = deck.filter(function (c) { return c.isSmallJoker; }).length;
  check('1.3 王 2 大 2 小', bj === 2 && sj === 2, 'bj=' + bj + ' sj=' + sj);
  var aces = deck.filter(function (c) { return c.rank === 14 && !c.isBigJoker && !c.isSmallJoker; });
  check('1.4 A 共 8 张 (4 花色 x2)', aces.length === 8, 'actual=' + aces.length);
  check('1.5 每花色 A 恰好 2 张', ['H', 'D', 'C', 'S'].every(function (s) {
    return aces.filter(function (c) { return c.suit === s; }).length === 2;
  }));
  // 每花色每点数 2 张
  var cnt = {};
  deck.forEach(function (c) { if (!c.isBigJoker && !c.isSmallJoker) { var k = c.suit + '-' + c.rank; cnt[k] = (cnt[k] || 0) + 1; } });
  check('1.6 每花色每点数恰好 2 张', Object.keys(cnt).every(function (k) { return cnt[k] === 2; }));
}

// ================= 2. 发牌 §2.2 =================
section('2. 发牌 §2.2 (22/22/22/21/21 + 底牌)');
{
  var st = engine.newGameState();
  var r = transition(st, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
  check('2.1 START_GAME 成功', r.ok === true, JSON.stringify(r.error));
  if (r.ok) {
    var s = r.state;
    var sizes = s.players.map(function (p) { return p.hand.length + (p.底牌 ? 1 : 0); });
    check('2.2 总张数 108', sizes.reduce(function (a, b) { return a + b; }, 0) === 108, JSON.stringify(sizes));
    var sorted = sizes.slice().sort(function (a, b) { return b - a; });
    check('2.3 前三 22 后二 21', sorted[0] === 22 && sorted[1] === 22 && sorted[2] === 22 && sorted[3] === 21 && sorted[4] === 21, JSON.stringify(sorted));
    check('2.4 每人恰好 1 底牌', s.players.filter(function (p) { return !!p.底牌; }).length === 5);
    check('2.5 hand 不含底牌', s.players.every(function (p) { return p.hand.indexOf(p.底牌) < 0; }));
    check('2.6 phase = LIANG_A (SKILL §3 阶段5)', s.phase === PHASES.LIANG_A || s.phase === PHASES.FORCED_CHECK, s.phase);
  }
}

// ================= 3. 阶段机 §3 =================
section('3. 阶段机约束 §3');
{
  var st = engine.newGameState();
  // 未发牌就想出牌
  var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [] } });
  check('3.1 GAME_START 出牌 → 拒绝', r.ok === false, JSON.stringify(r.error));

  // 底牌翻开前不能 CHOOSE_IDENTITY
  var st2 = engine.newGameState();
  var d = transition(st2, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } }).state;
  var f = transition(d, { type: ACTIONS.FORCED_CHECK, payload: {} }).state;
  var a = transition(f, { type: ACTIONS.ADVANCE, payload: {} }).state;
  var ci = transition(a, { type: ACTIONS.CHOOSE_IDENTITY, payload: { playerId: 'A', choice: 'HIDDEN' } });
  check('3.2 REVEAL_BOTTOM 前 CHOOSE_IDENTITY → 拒绝', ci.ok === false, JSON.stringify(ci.error));
}

// ================= 4. 计分公式 §11 =================
section('4. 计分公式 §11');

function scoreTry(desc, args) {
  try { var r = calculateScore.apply(null, args); console.log('    ' + desc + ' => ' + JSON.stringify(r)); return r; }
  catch (e) { console.log('    ' + desc + ' => THROW ' + e.message); return null; }
}

scoreTry('1V4明打 独打胜', ['1V4_明打', '主方', 0]);
scoreTry('1V4暗打 独打胜', ['1V4_暗打', '主方', 0]);
scoreTry('2V3暗打 主方胜 N=2', ['2V3_暗打', '主方', 2]);
scoreTry('2V3明打 主方胜 N=2', ['2V3_明打', '主方', 2]);

// ================= 5. 首出权 §5 =================
section('5. 首轮出牌权 §5');
{
  var st = {
    phase: PHASES.PLAY, mode: '2V3_明打', 次方: 'C', 次方公开: true,
    主方: ['A', 'C'], 抓方: ['B', 'D', 'E'],
    table: [], passedPlayers: [], passCount: 0, lastPlayer: null, discarded: [],
    主A: { suit: 'H', establishedBy: 'A' }, players: mkPlayers({ A: 3, B: 3, C: 3, D: 3, E: 3 })
  };
  var fp = determineFirstPlayer(st);
  check('5.1 2V3明打 → 次方首出', fp === 'C', 'actual=' + fp);

  var st2 = Object.assign({}, st, { mode: '2V3_暗打', 次方公开: false });
  var fp2 = determineFirstPlayer(st2);
  check('5.2 2V3暗打 → 亮A主方首出', fp2 === 'A', 'actual=' + fp2);

  var st3 = Object.assign({}, st, { mode: '1V4_明打', 次方: null, 主方: ['A'], 抓方: ['B', 'C', 'D', 'E'] });
  var fp3 = determineFirstPlayer(st3);
  check('5.3 1V4 → 主方首出', fp3 === 'A', 'actual=' + fp3);
}

// ================= 6. AI 信息边界 §12 =================
section('6. AI 信息边界 §12');
{
  // 构造: C 的手牌里藏 1 张 K, 桌上是 PAIR A
  // 观察 AI 返回的 cardIds 是否全在自己手牌内 (不能凭空造牌)
  var st = {
    phase: PHASES.PLAY, mode: '2V3_暗打', 次方: 'C', 次方公开: false,
    主方: ['A', 'C'], 抓方: ['B', 'D', 'E'],
    主A: { suit: 'H', establishedBy: 'A' },
    table: [], passedPlayers: [], passCount: 0, lastPlayer: null, discarded: [],
    players: mkPlayers({ A: 3, B: 3, C: 3, D: 3, E: 3 })
  };
  var c = st.players.find(function (p) { return p.id === 'C'; });
  c.hand = [C('S', 13), C('D', 13), C('C', 13)];
  var act = chooseAction(st, 'C');
  check('6.1 AI 返回动作', !!act, JSON.stringify(act));
  if (act && act.cardIds) {
    var myIds = c.hand.map(function (x) { return x.id; });
    var allMine = act.cardIds.every(function (id) { return myIds.indexOf(id) >= 0; });
    check('6.2 AI 只用自己手牌', allMine, JSON.stringify(act.cardIds));
  }
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);