// tests/test-ui-mirror.js — src/ui-mirror.js 纯函数单测
'use strict';

var mirror = require('../src/ui-mirror.js');

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + JSON.stringify(extra))); }
}

var c1 = { id: 'c1', rank: 5 };
var c2 = { id: 'c2', rank: 6 };
var c3 = { id: 'c3', rank: 7 };

// 1. PLAY 显示 + PASS 清牌 + 不出
var r = mirror.project([
  { playerId: 'A', kind: 'PLAY', cards: [c1] },
  { playerId: 'B', kind: 'PASS' }
]);
ok('PLAY 进 uiPlays', r.plays.A && r.plays.A.length === 1);
ok('PASS 显示不出', r.passed.B === true);
ok('PASS 的清掉旧牌', r.plays.B === undefined);

// 2. CLEAR 递增轮次；轮末已出完的人不显示
var r2 = mirror.project(
  [
    { playerId: 'A', kind: 'PLAY', cards: [c1] },
    { playerId: 'B', kind: 'PASS' },
    { playerId: 'A', kind: 'CLEAR' }
  ],
  { handOf: { A: 0, B: 5 } }
);
ok('CLEAR 后 trick=1', r2.trick === 1);
ok('轮末已出完者不显示', r2.plays.A === undefined);
ok('轮末未出完者保留', mirror.project([
  { playerId: 'B', kind: 'PLAY', cards: [c2] },
  { kind: 'CLEAR' }
], { handOf: { B: 3 } }).plays.B !== undefined);

// 3. CAPTURE 标记被取者
var r3 = mirror.project([{ playerId: 'C', kind: 'CAPTURE', cards: [c3], beat: 'A' }]);
ok('CAPTURE 标记取', r3.taken.A === true);
ok('CAPTURE 的牌显示在取牌者', r3.plays.C && r3.plays.C.length === 1);

// 4. hiddenAt 隐藏旧牌；passResetAt 隐藏旧 PASS
var r4 = mirror.project([
  { playerId: 'A', kind: 'PLAY', cards: [c1] }
], { hiddenAt: { A: 1 } });
ok('hiddenAt 隐藏旧牌', r4.plays.A === undefined);

var r5 = mirror.project([
  { playerId: 'B', kind: 'PASS' }
], { passResetAt: 1 });
ok('passResetAt 隐藏旧 PASS', r5.passed.B === undefined);

console.log('test-ui-mirror: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
