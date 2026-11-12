// tests/test-turn-ownership.js — D-059 轮次归属
// 跑法：node tests/test-turn-ownership.js
//
// 覆盖：
//   1) 引擎在 state.currentPlayer 已设置时拒绝越序出牌/过牌（NOT_YOUR_TURN）
//   2) state.currentPlayer 为 null 时保持向后兼容（老测试直接构造局面）
//   3) game.js 注入状态后把快变量镜像到 gameState.currentPlayer，出牌后仍保持一致
const assert = require('assert');
const { handlePlay, handlePass } = require('../src/play.js');
const SB = require('./lib/state-builder.js');
const GAME = require('../game.js');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + name);
  } catch (e) {
    failed += 1;
    failures.push({ name: name, err: e });
    console.log('  FAIL  ' + name);
    console.log('        ' + (e && e.message ? e.message : e));
  }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

function handOf(st, pid) {
  return st.players.find(function (p) { return p.id === pid; }).hand;
}
function single(state, pid) {
  var c = handOf(state, pid)[0];
  return { playerId: pid, cardIds: [c.id] };
}

section('1. 引擎轮次校验');

test('1.1 轮到 A 时 A 出牌成功', function () {
  var st = SB.build({});
  st.currentPlayer = 'A';
  var r = handlePlay(st, single(st, 'A'));
  assert.strictEqual(r.ok, true, JSON.stringify(r.error));
});

test('1.2 轮到 A 时 B 出牌被拒（NOT_YOUR_TURN）', function () {
  var st = SB.build({});
  st.currentPlayer = 'A';
  var before = st;
  var r = handlePlay(st, single(st, 'B'));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, 'NOT_YOUR_TURN');
  assert.strictEqual(r.state, before, '失败必须返回原 state 引用');
});

test('1.3 轮到 A 时 B 过牌被拒（NOT_YOUR_TURN）', function () {
  var st = SB.build({});
  st.currentPlayer = 'A';
  st.table = [handOf(st, 'B')[0]];
  st.lastPlayer = 'B';
  var r = handlePass(st, { playerId: 'B' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.type, 'NOT_YOUR_TURN');
});

test('1.4 currentPlayer 为 null 时不校验（向后兼容）', function () {
  var st = SB.build({});
  delete st.currentPlayer;
  var r = handlePlay(st, single(st, 'B'));
  assert.strictEqual(r.ok, true, JSON.stringify(r.error));
});

test('1.5 轮到 A 时 A 正常过牌成功', function () {
  var st = SB.build({});
  st.currentPlayer = 'A';
  st.table = [handOf(st, 'B')[0]];
  st.lastPlayer = 'B';
  var r = handlePass(st, { playerId: 'A' });
  assert.strictEqual(r.ok, true, JSON.stringify(r.error));
});

section('2. game.js 镜像');

test('2.1 __setState 把当前玩家写回 gameState.currentPlayer', function () {
  var st = SB.build({});
  GAME.__setState(st, { currentPlayer: 'A', human: 'A', clearLog: true });
  assert.strictEqual(GAME.currentPlayer(), 'A');
  assert.strictEqual(GAME.gameState().currentPlayer, 'A');
});

test('2.2 真人出牌后快变量与 gameState.currentPlayer 一致且已换手', function () {
  var st = SB.build({});
  GAME.__setState(st, { currentPlayer: 'A', human: 'A', clearLog: true });
  var card = handOf(st, 'A')[0];
  GAME.__setSelected([card.id]);
  GAME.doPlay();
  assert.strictEqual(GAME.currentPlayer(), 'B', 'A 之后应轮到 B');
  assert.strictEqual(GAME.gameState().currentPlayer, GAME.currentPlayer(), '镜像必须一致');
});

section('结果');
console.log('passed=' + passed + ' failed=' + failed);
if (failed > 0) {
  failures.forEach(function (f) { console.log(' - ' + f.name + ': ' + f.err.message); });
  process.exit(1);
}
// game.js 带定时器/画布句柄，显式退出避免 node 挂住
process.exit(0);
