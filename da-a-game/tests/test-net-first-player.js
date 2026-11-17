// tests/test-net-first-player.js — 首出权口径（规则 §9.4 / SKILL「首出权」）
//   [2026-11-18 用户] 问「上家亮的A 为什么我先出」：先把规则口径钉死，联网/单机都走这一个函数。
//   1) 2V3 暗打：主A 持有者先出
//   2) 2V3 明打：次方先出
//   3) 反A：反A 者先出（且独打明打）
var path = require('path');
var transition = require(path.join(__dirname, '..', 'src', 'transition.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

function mkState(over) {
  var st = {
    phase: 'PLAY',
    mode: '2V3_暗打',
    players: [],
    '主A': { suit: 'S', establishedBy: 'B', viaMethod: 'LIANG_A', doubleA: false },
    '次方': 'C',
    '反A': null,
    '主方': ['B', 'C'],
    '抓方': ['A', 'D', 'E'],
    currentPlayer: null
  };
  Object.keys(over || {}).forEach(function (k) { st[k] = over[k]; });
  return st;
}

// 1) 暗打：主A 亮的人先出（不是次方，也不是房主）
var s1 = mkState({ mode: '2V3_暗打' });
check('1 2V3 暗打 → 主A 亮A 者先出', transition.determineFirstPlayer(s1) === 'B', transition.determineFirstPlayer(s1));

// 2) 明打：次方先出
var s2 = mkState({ mode: '2V3_明打' });
check('2 2V3 明打 → 次方先出', transition.determineFirstPlayer(s2) === 'C', transition.determineFirstPlayer(s2));

// 3) 反A：反A 者先出
var s3 = mkState({ mode: '1V4_明打', '反A': { by: 'D', suit: 'H' } });
check('3 反A → 反A 者先出', transition.determineFirstPlayer(s3) === 'D', transition.determineFirstPlayer(s3));

// 4) 没有主A 时不乱指人（返回 null，由上层兜底）
var s4 = mkState({ '主A': null });
check('4 无主A → null（不默认房主先出）', transition.determineFirstPlayer(s4) === null, transition.determineFirstPlayer(s4));

// 5) 1V4 暗打：独打者（主A）先出
var s5 = mkState({ mode: '1V4_暗打', '主方': ['B'], '次方': null });
check('5 1V4 暗打 → 主A 先出', transition.determineFirstPlayer(s5) === 'B', transition.determineFirstPlayer(s5));

console.log('\nchecks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
process.exit(fail ? 1 : 0);
