// tests/test-perf.js — K/B: 性能测试 (复用 e2e 已验证的对局循环)
const { createDeck, dealGame, transition, PHASES, ACTIONS, checkGameEnd } = require('../src/index.js');
const { chooseAction } = require('../src/ai.js');

const N = parseInt(process.argv[2] || '1000', 10);
console.log('=== B: 性能测试 ' + N + ' 局 ===');

function nextPlayer(state, cur) {
  var order = ['A', 'B', 'C', 'D', 'E'];
  var i = order.indexOf(cur);
  if (i < 0) return cur;
  for (var k = 1; k <= 5; k++) {
    var n = order[(i + k) % 5];
    var p = state.players.find(function (x) { return x.id === n; });
    if (p && p.hand.length > 0) return n;
  }
  return cur;
}

function runOneGame(seed) {
  var deck = createDeck();
  var dealt = dealGame(deck);
  var state = { phase: PHASES.GAME_START, players: dealt.players, deck: deck, dealOrder: dealt.dealOrder };
  var r = transition(state, { type: ACTIONS.START_GAME, payload: { startPlayerIndex: seed % 5 } });
  if (!r.ok) return { steps: 0, ended: false };
  state = r.state;
  r = transition(state, { type: ACTIONS.FORCED_CHECK, payload: {} }); if (!r.ok) return { steps: 1, ended: false }; state = r.state;
  r = transition(state, { type: ACTIONS.ADVANCE, payload: {} }); if (!r.ok) return { steps: 2, ended: false }; state = r.state;
  r = transition(state, { type: ACTIONS.REVEAL_BOTTOM, payload: {} }); if (!r.ok) return { steps: 3, ended: false }; state = r.state;
  if (state.phase === PHASES.IDENTITY_CHOICE) {
    var ch = state.次方 || (state.主A && state.主A.establishedBy);
    r = transition(state, { type: ACTIONS.CHOOSE_IDENTITY, payload: { playerId: ch, choice: 'HIDDEN' } });
    if (r.ok) state = r.state;
  }
  if (state.phase !== PHASES.PLAY) return { steps: 4, ended: false };

  var cp = (state.主A && state.主A.establishedBy) || 'A';
  var steps = 5;
  for (var step = 0; step < 400 && state.phase === PHASES.PLAY; step++) {
    steps++;
    var act = chooseAction(state, cp);
    if (!act || !act.type) break;
    var ar = null;
    if (act.type === ACTIONS.PLAY) ar = transition(state, { type: ACTIONS.PLAY, payload: { playerId: cp, cardIds: act.cardIds } });
    else if (act.type === ACTIONS.PASS) ar = transition(state, { type: ACTIONS.PASS, payload: { playerId: cp } });
    if (!ar) break;
    if (!ar.ok) {
      var rp = transition(state, { type: ACTIONS.PASS, payload: { playerId: cp } });
      if (!rp.ok) break;
      state = rp.state;
    } else state = ar.state;

    var end = checkGameEnd(state);
    if (end.ended) return { steps: steps, ended: true, winner: end.winner };

    // 轮次结束 -> 推风 (与 e2e 一致)
    var nonEmpty = state.players.filter(function (p) { return p.hand.length > 0; });
    if (nonEmpty.length > 0 && state.passedPlayers) {
      var allPassed = nonEmpty.every(function (p) { return state.passedPlayers.indexOf(p.id) >= 0; });
      if (allPassed) {
        var trig = state.lastPlayer;
        var tp = trig && state.players.find(function (p) { return p.id === trig; });
        if (tp && tp.hand.length === 0) {
          var pw = transition(state, { type: ACTIONS.PUSH_WIND, payload: { trigger: trig } });
          if (pw && pw.ok) {
            state = pw.state;
            if (pw.ended) return { steps: steps, ended: true, winner: pw.winner };
            cp = pw.target;
            continue;
          }
        }
        state = Object.assign({}, state, { table: [], passedPlayers: [], passCount: 0 });
      }
    }
    cp = nextPlayer(state, cp);
  }
  return { steps: steps, ended: state.phase === PHASES.GAME_END };
}

var start = process.hrtime.bigint();
var totalSteps = 0, okCount = 0, maxSteps = 0;
var winCount = { '主方': 0, '抓方': 0, 'draw': 0 };
for (var i = 0; i < N; i++) {
  var r = runOneGame(i);
  totalSteps += r.steps;
  if (r.steps > maxSteps) maxSteps = r.steps;
  if (r.ended) { okCount++; if (r.winner) winCount[r.winner] = (winCount[r.winner] || 0) + 1; }
}
var elapsed = Number(process.hrtime.bigint() - start) / 1e6;

console.log('');
console.log('=== 结果 ===');
console.log('总局数:     ' + N);
console.log('成功结束:   ' + okCount + ' (' + (okCount / N * 100).toFixed(1) + '%)');
console.log('总步数:     ' + totalSteps);
console.log('平均步数:   ' + (totalSteps / N).toFixed(1));
console.log('最大步数:   ' + maxSteps);
console.log('胜方分布:   主方=' + (winCount['主方'] || 0) + '  抓方=' + (winCount['抓方'] || 0) + '  平局=' + (winCount['draw'] || 0));
console.log('总耗时:     ' + elapsed.toFixed(1) + ' ms');
console.log('单局耗时:   ' + (elapsed / N).toFixed(3) + ' ms');
console.log('吞吐:       ' + Math.round(totalSteps / elapsed * 1000).toLocaleString() + ' ops/sec');

// 断言: 完成率 >= 70%, 平均步数 < 300
if (okCount / N < 0.7) { console.log('\nASSERT FAIL: 完成率 < 70%'); process.exit(1); }
if (totalSteps / N >= 300) { console.log('\nASSERT FAIL: 平均步数 >= 300'); process.exit(1); }
console.log('\n全部断言通过');