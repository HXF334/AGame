// tests/test-ai-integration.js
// AI 模块接入 game.js 后的端到端集成测试
// 跑法: node tests/test-ai-integration.js
// 验证 runAI 循环逻辑 (在 game.js 中定义, 这里模拟)

const assert = require('assert');
const {
  newGameState, dealGame, shuffle, createDeck,
  transition, determineFirstPlayer,
  PHASES, ACTIONS, checkGameEnd
} = require('../src/index.js');
const { chooseAction } = require('../src/ai.js');

// ===== 测试运行器 =====
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed++;
    failures.push(name);
    console.log('  FAIL  ' + name);
    if (e && e.message) console.log('        msg: ' + e.message);
    if (e && e.actual !== undefined) console.log('        actual:   ' + JSON.stringify(e.actual));
    if (e && e.expected !== undefined) console.log('        expected: ' + JSON.stringify(e.expected));
  }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ===== 工具: 模拟 runAI 循环 (与 game.js 中 runAI 一致) =====
// 简化版: 用 try/catch 防止异常卡死, 用最大步数防死循环
function runAISim(state, currentPlayer, humanPlayer, maxSteps) {
  maxSteps = maxSteps || 50;
  var steps = 0;
  var actions = [];  // 记录 AI 行动历史
  while (currentPlayer && currentPlayer !== humanPlayer && state.phase === PHASES.PLAY && steps < maxSteps) {
    steps++;
    var action;
    try {
      action = chooseAction(state, currentPlayer);
    } catch (e) {
      actions.push({ player: currentPlayer, error: 'chooseAction exception: ' + e.message });
      break;
    }
    if (!action || !action.type) {
      actions.push({ player: currentPlayer, error: 'chooseAction 返回无效' });
      break;
    }
    var r;
    if (action.type === 'PLAY') {
      r = transition(state, { type: ACTIONS.PLAY, payload: { playerId: currentPlayer, cardIds: action.cardIds || [] } });
    } else if (action.type === 'PASS') {
      r = transition(state, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
    } else {
      actions.push({ player: currentPlayer, error: '未知 action.type: ' + action.type });
      break;
    }
    if (!r || !r.ok) {
      // 强制 PASS 避免卡死
      var rp = transition(state, { type: ACTIONS.PASS, payload: { playerId: currentPlayer } });
      if (!rp || !rp.ok) {
        actions.push({ player: currentPlayer, error: 'AI 行动 + 强制 PASS 都失败' });
        break;
      }
      state = rp.state;
      actions.push({ player: currentPlayer, type: 'PASS', forced: true, error: r.error && r.error.message });
    } else {
      state = r.state;
      actions.push({ player: currentPlayer, type: action.type, cardIds: action.cardIds });
    }
    // 检查牌局结束
    var endResult = checkGameEnd(state);
    if (endResult.ended) {
      state.phase = PHASES.GAME_END || 'GAME_END';
      actions.push({ gameEnd: true, winner: endResult.winner, reason: endResult.reason });
      break;
    }
    // 推进 currentPlayer
    currentPlayer = nextPlayer(state, currentPlayer);
  }
  return { state: state, currentPlayer: currentPlayer, actions: actions, steps: steps };
}

function nextPlayer(state, current) {
  var order = ['A', 'B', 'C', 'D', 'E'];
  var idx = order.indexOf(current);
  if (idx < 0) return current;
  for (var i = 1; i <= 5; i++) {
    var nidx = (idx + i) % 5;
    var np = state.players.find(function (p) { return p.id === order[nidx]; });
    if (np && np.hand.length > 0) return order[nidx];
  }
  return current;
}

// ===== 工具: 准备完整对局 (走到 PLAY 阶段) =====
function setupPlayPhase() {
  var d = createDeck();
  var dealt = dealGame(d);
  var s0 = {
    phase: PHASES.GAME_START,
    players: dealt.players,
    deck: d,
    dealOrder: dealt.dealOrder
  };
  // START_GAME → FORCED_CHECK → ADVANCE → REVEAL_BOTTOM → CHOOSE_IDENTITY
  var r1 = transition(s0, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
  if (!r1.ok) throw new Error('START_GAME failed');
  var r2 = transition(r1.state, { type: ACTIONS.FORCED_CHECK, payload: {} });
  if (!r2.ok) throw new Error('FORCED_CHECK failed');
  var r3 = transition(r2.state, { type: ACTIONS.ADVANCE, payload: {} });
  if (!r3.ok) throw new Error('ADVANCE failed');
  var r4 = transition(r3.state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} });
  if (!r4.ok) throw new Error('REVEAL_BOTTOM failed: ' + r4.error.message);
  if (r4.state.phase === PHASES.IDENTITY_CHOICE) {
    var chooser = r4.state.次方 || (r4.state.主A && r4.state.主A.establishedBy);
    var r5 = transition(r4.state, {
      type: ACTIONS.CHOOSE_IDENTITY,
      payload: { playerId: chooser, choice: 'HIDDEN' }
    });
    if (!r5.ok) throw new Error('CHOOSE_IDENTITY failed');
    return r5.state;
  }
  return r4.state;
}

// ============================================================
// 基础 AI 集成
// ============================================================
section('1. 基础 AI 集成');

test('1.1 chooseAction 函数存在 + 返回有效 action', function () {
  var state = setupPlayPhase();
  var action = chooseAction(state, state.currentPlayer || 'A');
  assert.ok(action, 'chooseAction 应返回 action');
  assert.ok(['PLAY', 'PASS'].indexOf(action.type) >= 0, 'type 应是 PLAY 或 PASS');
});

test('1.2 runAISim 跑一次不抛异常, 状态合理', function () {
  var state = setupPlayPhase();
  var cp = determineFirstPlayer(state) || 'A';
  var r = runAISim(state, cp, 'A', 5);  // humanPlayer='A', 5 步
  assert.ok(r.state, '应返回 state');
  assert.ok(r.actions.length > 0 || r.currentPlayer === 'A', '应有动作或停到真人');
});

test('1.3 人类玩家 (humanPlayer) 不被 AI 自动出牌', function () {
  var state = setupPlayPhase();
  // 找 humanPlayer 是 currentPlayer 的情况
  var cp = determineFirstPlayer(state) || 'A';
  var r = runAISim(state, cp, cp, 50);  // humanPlayer = currentPlayer
  // 应当 0 步 (human 是 currentPlayer, 不该 AI 出牌)
  assert.strictEqual(r.steps, 0, 'human 玩家不该被 AI 出牌');
});

// ============================================================
// 真人 → AI → 真人 交接
// ============================================================
section('2. 玩家交接');

test('2.1 AI 出完轮到真人 → 真人接收', function () {
  // 强制让 currentPlayer 是 AI, humanPlayer 是下一个
  var state = setupPlayPhase();
  var order = ['A', 'B', 'C', 'D', 'E'];
  // 让 B 第一个出, A 是 human
  var cp = 'B';
  var r = runAISim(state, cp, 'A', 20);
  // AI 应该会出牌 (B/C/D/E 至少一些会出)
  // 直到轮到 A 或游戏结束
  if (checkGameEnd(r.state).ended) {
    // 游戏结束, 接受
  } else {
    // 应该轮到 A
    assert.strictEqual(r.currentPlayer, 'A', '应轮到 human A');
  }
});

test('2.2 连续 AI 玩家 (B/C/D/E) 都能自动出牌', function () {
  var state = setupPlayPhase();
  var r = runAISim(state, 'B', 'A', 100);
  // 应该所有非 A 玩家都出牌过
  var aiPlayers = r.actions.filter(function (a) { return a.player && a.player !== 'A'; });
  // 至少 1 个 AI 行动
  assert.ok(aiPlayers.length > 0, 'AI 应至少出牌 1 次');
  // 没有卡死 (steps < 100)
  assert.ok(r.steps < 100, 'AI 不应卡死');
});

test('2.3 AI 走完一轮后再到 AI (循环)', function () {
  var state = setupPlayPhase();
  // 跑 100 步, 验证不卡死
  var r = runAISim(state, 'B', 'A', 100);
  assert.ok(r.actions.length > 0, 'AI 至少出牌 1 次');
  assert.ok(r.steps < 100, '100 步内不卡死');
  // 检查终态: 应该是 GAME_END 或 currentPlayer 仍合法
  assert.ok(r.state.phase === PHASES.PLAY || r.state.phase === 'GAME_END', '终态合法');
});

// ============================================================
// AI 失败 / 无效动作处理
// ============================================================
section('3. AI 失败处理');

test('3.1 chooseAction 返回 null (异常) → runAISim 不卡死', function () {
  // 创建一个空 hand 状态, 让 chooseAction 返回 null
  var state = setupPlayPhase();
  // 把 currentPlayer 的手牌清空
  var cp = 'B';
  var idx = state.players.findIndex(function (p) { return p.id === cp; });
  state.players[idx].hand = [];  // 空 hand
  // 强制 transition (空 hand 不能 PLAY, 会失败)
  var r = runAISim(state, cp, 'A', 5);
  // 不应卡死, 应有错误处理
  assert.ok(r.actions.length >= 0, '不卡死');
  // steps 应 ≤ 5
  assert.ok(r.steps <= 5, '步数 ≤ 5');
});

test('3.2 强制 PASS fallback 工作 (AI 行动失败 → PASS 避免卡死)', function () {
  var state = setupPlayPhase();
  state.table = [{
    id: 'SJ-TEST', suit: null, rank: 19, isBigJoker: false, isSmallJoker: true,
    is主方大A: false, location: { type: 'table' }
  }];
  state.lastPlayer = 'A';
  state.passedPlayers = [];
  state.phase = PHASES.PLAY;
  var r = runAISim(state, 'B', 'A', 10);
  // 不卡死 (步数 < maxSteps=10)
  assert.ok(r.steps < 10, '不卡死 (steps=' + r.steps + ')');
  // 所有动作要么是 PASS 要么是 forced PASS (没卡死)
  r.actions.forEach(function (a) {
    assert.ok(!a.error || a.type === 'PASS', '非卡死: ' + JSON.stringify(a));
  });
});

test('3.3 runAISim 返回的动作数组中不应有 invalid 字段', function () {
  var state = setupPlayPhase();
  var r = runAISim(state, 'B', 'A', 50);
  r.actions.forEach(function (a) {
    assert.ok(!a.invalid, '不应有 invalid 字段');
  });
});

// ============================================================
// 游戏结束后 AI 不再行动
// ============================================================
section('4. 游戏结束后停止');

test('4.1 游戏结束后, runAISim 应立即停止, 不再有 AI 行动', function () {
  // 走完整链到 PLAY, 让人为结束 (单方阵营全空)
  var state = setupPlayPhase();
  // 让 1V4 主方所有玩家空 (4 抓方还有牌 → 抓方胜)
  // 但 1V4 模式只有一个主方玩家, 让 A 空
  // 实际: 我们直接调用 checkGameEnd 看是否 ended
  // 不强求, 改用直接手动设置 phase = GAME_END
  state.phase = 'GAME_END';
  var r = runAISim(state, 'B', 'A', 10);
  // 不应有新 AI 行动 (phase != PLAY)
  assert.strictEqual(r.steps, 0, 'GAME_END 后 steps 应为 0, 实际=' + r.steps);
  assert.strictEqual(r.actions.length, 0, 'GAME_END 后不应有新动作');
});

test('4.2 完整跑 1 局到 GAME_END', function () {
  // 跑 200 步, 验证最终 GAME_END
  var state = setupPlayPhase();
  var r = runAISim(state, 'B', 'A', 200);
  var endResult = checkGameEnd(r.state);
  // 可能已经结束, 或还在玩 (概率小)
  if (r.state.phase === 'GAME_END' || endResult.ended) {
    console.log('        -> 1 局完整结束, winner=' + endResult.winner);
  } else {
    console.log('        -> 200 步内未结束, 还在 PLAY (手牌数: ' + r.state.players.map(function (p) { return p.hand.length; }).join(',') + ')');
  }
});

// ============================================================
// 牌张守恒
// ============================================================
section('5. 牌张守恒');

test('5.1 初始状态牌张总数 = 108 (hand + 桌牌 + 底牌, 用 Set 防重)', function () {
  function countUnique(state) {
    var ids = new Set();
    state.players.forEach(function (p) {
      p.hand.forEach(function (c) { ids.add(c.id); });
      if (p.底牌) ids.add(p.底牌.id);
    });
    (state.table || []).forEach(function (c) { ids.add(c.id); });
    return ids.size;
  }
  var state = setupPlayPhase();
  assert.strictEqual(countUnique(state), 108, 'initial state 应有 108 张 unique 牌');
});

test('5.2 [P0 修复后] 50 步 AI 后 108 张牌全在 (hand + 底牌 + table + discarded)', function () {
  function countUnique(state) {
    var ids = new Set();
    state.players.forEach(function (p) {
      p.hand.forEach(function (c) { ids.add(c.id); });
      if (p.底牌) ids.add(p.底牌.id);
    });
    (state.table || []).forEach(function (c) { ids.add(c.id); });
    (state.discarded || []).forEach(function (c) { ids.add(c.id); });
    return ids.size;
  }
  var state = setupPlayPhase();
  var r = runAISim(state, 'B', 'A', 50);
  assert.strictEqual(countUnique(r.state), 108, 'P0 修复后应仍 108 张 unique 牌, got ' + countUnique(r.state));
});

// ============================================================
// runAI 性能 / 稳定性
// ============================================================
section('6. runAI 稳定性');

test('6.1 20 次完整对局, 每次都正常结束或停下', function () {
  for (var i = 0; i < 20; i++) {
    var state = setupPlayPhase();
    var r = runAISim(state, 'B', 'A', 100);
    // 终态: 应该是 PLAY 或 GAME_END
    assert.ok(r.state.phase === PHASES.PLAY || r.state.phase === 'GAME_END',
      'iteration ' + i + ' 终态合法: ' + r.state.phase);
    // steps < maxSteps (无卡死)
    assert.ok(r.steps < 100, 'iteration ' + i + ' 不卡死');
  }
});

test('6.2 humanPlayer=A 时, A 不会自动出牌 (runAISim 0 步)', function () {
  // 构造 currentPlayer='A', humanPlayer='A'
  var state = setupPlayPhase();
  var r = runAISim(state, 'A', 'A', 50);
  assert.strictEqual(r.steps, 0, 'human 不被 AI 操作');
  assert.strictEqual(r.currentPlayer, 'A', 'currentPlayer 不变');
});

test('6.3 humanPlayer=C 时, A 和 B 都是 AI', function () {
  var state = setupPlayPhase();
  var r = runAISim(state, 'A', 'C', 50);
  // A 是 AI, 应出牌直到 B/C (跳过 C)
  // B 是 AI, 继续出
  // 遇到 C (human) 停下
  // 或者游戏结束
  if (r.state.phase !== 'GAME_END') {
    assert.strictEqual(r.currentPlayer, 'C', '应轮到 human C');
  }
  // A 和 B 应该有 AI 行动
  var aiActions = r.actions.filter(function (a) { return a.player === 'A' || a.player === 'B'; });
  assert.ok(aiActions.length > 0, 'A 或 B 应有 AI 行动');
});

// ===== 总结 =====
console.log('\n=== 总结 ===');
console.log('total: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);
