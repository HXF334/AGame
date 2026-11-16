// [2026-11-16 用户] 联网对战 P1：房间核心（创建/加入/准备/开局/动作/轮询）
var assert = require('assert');
var roomMod = require('../cloudfunctions/game-server/room.js');
var protocol = require('../src/protocol.js');
var SB = require('./lib/state-builder.js');

var checks = 0;
function ok(name, cond) { checks++; assert.ok(cond, name); }

var NOW = 1700000000000;

// 1) 配置上限
var cfg = roomMod.clampConfig({ rounds: 999, baseScore: 999, turnSeconds: 999 });
ok('rounds clamp 30', cfg.rounds === 30);
ok('baseScore clamp 99', cfg.baseScore === 99);
ok('turnSeconds clamp 99', cfg.turnSeconds === 99);
ok('voice always false', cfg.voice === false);

// 2) 创建 + 加入 + 准备 + 自动开局
var room = roomMod.createRoom({ ownerId: 'u0', nick: '甲', config: { rounds: 2, baseScore: 2 } }, NOW);
ok('room id 6 digits', /^\d{6}$/.test(room.id));
ok('owner joined seat 0', room.players.length === 1 && room.players[0].seat === 0);
ok('status waiting', room.status === 'WAITING');

for (var i = 1; i < 5; i++) {
  roomMod.join(room, { openid: 'u' + i, nick: 'p' + i }, NOW);
}
ok('5 players', room.players.length === 5);
ok('seat unique', new Set(room.players.map(function (p) { return p.seat; })).size === 5);

var startRes = null;
for (var j = 0; j < 5; j++) {
  var rr = roomMod.setReady(room, 'u' + j, true, NOW);
  if (rr.room.status === 'PLAYING') startRes = rr;
}
ok('auto start when all ready', !!startRes);
ok('status playing', room.status === 'PLAYING');
ok('round 1', room.round === 1);
ok('seq advanced', room.seq >= 1);

// 3) 轮询裁剪：别人手牌不出现
var v0 = roomMod.poll(room, 'u0');
ok('poll id', v0.id === room.id);
ok('poll players 5', v0.players.length === 5);
ok('poll no others hand', v0.state.players.every(function (p) {
  return p.id === roomMod.seatId(0) ? Array.isArray(p.hand) : !p.hand;
}));
ok('poll has handCount', typeof v0.state.players[1].handCount === 'number');
ok('poll no deck', v0.state.deck === undefined && v0.state.dealOrder === undefined);

// 4) 动作：STALE / 非本人 / 幂等
var st = SB.build({
  handMap: { A: ['H-4-1'], B: ['D-5-1'], C: ['C-6-1'], D: ['S-7-1'], E: ['H-8-1'] },
  table: [{ id: 'S-9-1', suit: 'S', rank: 9 }],
  lastPlayer: 'B', phase: 'PLAY', mode: '2V3_暗打'
});
room.state = st;
room.seq = 7;
room.status = 'PLAYING';

var envStale = protocol.makeAction('PLAY', { playerId: 'A', cardIds: ['H-4-1'] }, 6);
var rStale = roomMod.apply(room, envStale, 'u0', NOW);
ok('stale rejected', rStale.ok === false && rStale.error === 'STALE');

// 5) 结算与累计：构造抓方全空（抓方胜）
var stEnd = SB.build({
  handMap: { B: ['H-9-1'], C: ['H-9-2'] }, emptyPlayers: ['A', 'D', 'E'],
  phase: 'PLAY', mode: '2V3_暗打',
  主方: ['B', 'C'], 抓方: ['A', 'D', 'E']
});
room.state = stEnd;
room.config.rounds = 2;
room.config.baseScore = 2;
room.seq = 100;
room.moveKeys = [];
var settled = roomMod.settle(room, NOW);
ok('settle reachable', settled === true);
ok('lastRound rows', room.lastRound.length === 5);
ok('totals accumulated', room.players.every(function (p) { return typeof p.total === 'number'; }));
ok('settle status SETTLED', room.status === 'SETTLED');

// 6) 超时托管：到点由 AI 代当前玩家走一步
var stTick = SB.build({
  handMap: { A: ['H-3-1', 'H-4-1'], B: ['D-5-1'], C: ['C-6-1'], D: ['S-7-1'], E: ['H-8-1'] },
  table: [], phase: 'PLAY', mode: '2V3_暗打'
});
stTick.currentPlayer = 'A';
room.state = stTick;
room.status = 'PLAYING';
room.seq = 200;
room.deadline = NOW - 1;
var before = room.seq;
var tickRes = roomMod.tick(room, NOW);
ok('tick acted', tickRes.acted === true);
ok('tick seq advanced', room.seq === before + 1);
ok('tick marks afk', room.players[0].afk >= 1);

// 7) 断线交给 AI
var offRes = roomMod.setOffline(room, 'u1', NOW);
ok('offline ok', offRes.ok === true);
ok('offline ai takeover', room.players[1].ai === true);
var onRes = roomMod.setOnline(room, 'u1', NOW);
ok('online restores', onRes.ok === true && room.players[1].ai === false);

console.log('room core: ' + checks + ' checks passed');
