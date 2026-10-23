// tests/test-state-immutability.js
// 锁定 transition() 的契约 —— game.js 正确工作的前提
//
// 背景: 2026-10-23 在 game.js 找到**三处**同源 P0 ——
//   doPlay 批量分支 / doPlay 逐张分支 / doPlay 组合回退分支
//   都在 transition **之前**捕获 player 引用, 之后却拿它读 hand.length。
//   引擎的 clonePlayer() 会克隆**被该动作改动的那个玩家**, 于是那份引用
//   停在动作之前 -> 出完牌判定恒 false -> lastEmptiedPlayer 不被设置
//   -> 推风永不触发。
//
// 本测试把该前提变成**可执行断言**。
//
// 【实测出的精确契约 —— 2026-10-23 探针所得, 非假设】
//   动作        players 数组        玩家对象
//   PLAY        新数组              **只有出牌的那个玩家是新的**, 其余共享
//   PASS        **复用原数组**      全部共享
//   PUSH_WIND   **复用原数组**      全部共享
//
// 所以「引擎一律克隆全部」是**错的**(我一度这么说, 被本测试纠正)。
// 真正需要锁住的是下面两条, 它们对所有动作都成立:
//   A. 输入态**绝不被就地修改**(引用与内容都不变)
//   B. 被该动作改动的玩家, 在返回态里必须是**新对象**
//      —— 这才是「过期引用会失效」的机制前提, 也正是 game.js 三处 P0 的成因。
//
// 若哪天引擎改为就地修改输入态, 本测试会失败 —— 那是**好事**:
//   game.js 的三处修复与大量旧代码都依赖「输入态不被污染」。
var SB = require('./lib/state-builder.js');
var transition = require('../src/transition.js').transition;
var PHASES = require('../src/phases.js').PHASES;
var ACTIONS = require('../src/phases.js').ACTIONS;

var passed = 0, failed = 0, fail = [];
function check(name, cond, detail) {
  if (cond) passed++; else { failed++; fail.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function snap(state) {
  return JSON.stringify(state.players.map(function (p) {
    return { id: p.id, n: p.hand.length, ids: p.hand.map(function (c) { return c.id; }), b: p.底牌 ? p.底牌.id : null };
  }));
}

// 断言 A(所有动作都成立) + 玩家集合不变
// dealing=true 时跳过「玩家集合不变」—— START_GAME 是**发牌**动作,
// 本来就要从 0 家变成 5 家。
function assertContract(label, state, action, dealing) {
  var playersRef = state.players;
  var playerRefs = state.players.slice();
  var handRefs = state.players.map(function (p) { return p.hand; });
  var before = snap(state);

  var r = transition(state, action);

  // A. 输入态绝不被就地修改
  check(label + ' | 输入态 players 数组未被替换', state.players === playersRef);
  check(label + ' | 输入态玩家对象未被替换',
    state.players.every(function (p, i) { return p === playerRefs[i]; }));
  check(label + ' | 输入态手牌数组未被替换',
    state.players.every(function (p, i) { return p.hand === handRefs[i]; }));
  check(label + ' | 输入态手牌内容未变', snap(state) === before);

  if (!r || !r.ok) return r;

  if (!dealing) {
    check(label + ' | 返回态玩家数不变',
      r.state.players.length === playerRefs.length,
      playerRefs.length + ' -> ' + r.state.players.length);
    check(label + ' | 返回态玩家 id 集合不变',
      JSON.stringify(r.state.players.map(function (p) { return p.id; }).sort()) ===
      JSON.stringify(playerRefs.map(function (p) { return p.id; }).sort()));
  }
  return r;
}

// B. 被改动的玩家必须是新对象(过期引用才因此失效)
function assertChangedPlayerIsNew(label, state, action, playerId) {
  var playerRefs = state.players.slice();
  var r = transition(state, action);
  if (!r || !r.ok) return r;
  var idx = playerRefs.findIndex(function (p) { return p.id === playerId; });
  check(label + ' | 返回态中该玩家是新对象',
    r.state.players[idx] !== playerRefs[idx]);
  return r;
}

// ============ 1. START_GAME ============
section('1. START_GAME (phase 须为 GAME_START)');
var afterStart = null;
{
  var st = { phase: PHASES.GAME_START, players: [], actions: [], mode: null };
  var r = assertContract('START_GAME', st, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } }, true);
  check('1.1 START_GAME 成功', r && r.ok, r && r.ok ? '' : JSON.stringify(r && r.error));
  if (r && r.ok) {
    afterStart = r.state;
    var inHand = r.state.players.reduce(function (a, p) { return a + p.hand.length; }, 0);
    var inBottom = r.state.players.reduce(function (a, p) { return a + (p.底牌 ? 1 : 0); }, 0);
    // §2.2: 底牌在 REVEAL_BOTTOM 前**不在手牌里**, 存在 p.底牌 字段,
    //   翻开时才并入手牌。故手牌 103 + 底牌 5 = 108。
    check('1.2 手牌+底牌共 108 张', inHand + inBottom === 108,
      'hand=' + inHand + ' bottom=' + inBottom);
    check('1.3 手牌 103 张(5 张底牌暂存)', inHand === 103, 'hand=' + inHand);
    check('1.4 每家各持 1 张底牌', inBottom === 5, 'bottom=' + inBottom);
    check('1.5 返回态有 5 家玩家', r.state.players.length === 5, 'n=' + r.state.players.length);
  }
}

// ============ 2. FORCED_CHECK ============
section('2. FORCED_CHECK (须在真实发牌局上跑)');
{
  // 注意: FORCED_CHECK 需要**真实玩家** —— 传 players:[] 会在
  // transition.js:297 抛 TypeError(读到 undefined.hand)。
  check('2.0 前置: 有可用局面', !!afterStart);
  if (afterStart) {
    var st2 = Object.assign({}, afterStart);
    st2.phase = PHASES.LIANG_A;
    var r = assertContract('FORCED_CHECK', st2, { type: ACTIONS.FORCED_CHECK, payload: {} });
    check('2.1 FORCED_CHECK 成功', r && r.ok, r && r.ok ? '' : JSON.stringify(r && r.error));
    if (r && r.ok) {
      check('2.2 主A 归属是合法玩家ID',
        ['A', 'B', 'C', 'D', 'E'].indexOf(r.state.主A.establishedBy) >= 0,
        'establishedBy=' + r.state.主A.establishedBy);
    }
  }
}

// ============ 3. PLAY: 出牌玩家必须是新对象 ============
section('3. PLAY —— 被改动的玩家必须是新对象(B 契约)');
{
  var base = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  base.players.filter(function (p) { return p.id === 'A'; })[0].hand =
    base.players.filter(function (p) { return p.id === 'A'; })[0].hand.slice(0, 1);
  var cardId = base.players.filter(function (p) { return p.id === 'A'; })[0].hand[0].id;

  var r = assertChangedPlayerIsNew('PLAY', base, {
    type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [cardId] }
  }, 'A');
  check('3.1 PLAY 成功', r && r.ok, r && r.ok ? '' : JSON.stringify(r && r.error));
  if (r && r.ok) {
    check('3.2 出牌后甲手牌为 0',
      r.state.players.filter(function (p) { return p.id === 'A'; })[0].hand.length === 0);
    check('3.3 输入态甲手牌仍为 1(未被就地修改)',
      base.players.filter(function (p) { return p.id === 'A'; })[0].hand.length === 1);
  }
}

// ============ 4. PASS / PUSH_WIND ============
section('4. PASS / PUSH_WIND —— 只动牌桌与回合, 不动玩家');
{
  var base = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  base.players.filter(function (p) { return p.id === 'A'; })[0].hand =
    base.players.filter(function (p) { return p.id === 'A'; })[0].hand.slice(0, 1);
  var cardId = base.players.filter(function (p) { return p.id === 'A'; })[0].hand[0].id;
  var r0 = transition(base, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [cardId] } });

  var r1 = assertContract('PASS', r0.state, { type: ACTIONS.PASS, payload: { playerId: 'B' } });
  check('4.1 PASS 成功', r1 && r1.ok, r1 && r1.ok ? '' : JSON.stringify(r1 && r1.error));

  var r2 = assertContract('PUSH_WIND', r1.state, { type: ACTIONS.PUSH_WIND, payload: { trigger: 'A' } });
  check('4.2 PUSH_WIND 成功', r2 && r2.ok, r2 && r2.ok ? '' : JSON.stringify(r2 && r2.error));
}

// ============ 5. 实证「过期引用会失效」 ============
section('5. 实证过期引用失效 —— game.js 三处 P0 的机制前提');
{
  var base = SB.build({
    handMap: {}, table: [], lastPlayer: 'C',
    主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    次方: 'D', 次方公开: true, 主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
    mode: '2V3_暗打'
  });
  base.players.filter(function (p) { return p.id === 'A'; })[0].hand =
    base.players.filter(function (p) { return p.id === 'A'; })[0].hand.slice(0, 1);
  var cardId = base.players.filter(function (p) { return p.id === 'A'; })[0].hand[0].id;

  var staleRef = base.players[0];                    // 捕获(将过期)
  var r = transition(base, { type: ACTIONS.PLAY, payload: { playerId: 'A', cardIds: [cardId] } });
  check('5.1 出牌成功', r.ok, r.ok ? '' : JSON.stringify(r.error));
  check('5.2 过期引用读到旧手牌数 1', staleRef.hand.length === 1, 'len=' + staleRef.hand.length);
  check('5.3 新 state 才是真实值 0', r.state.players[0].hand.length === 0, 'len=' + r.state.players[0].hand.length);
  check('5.4 两者不同 -> 过期引用不可用于判定出完',
    staleRef.hand.length !== r.state.players[0].hand.length);
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); fail.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);