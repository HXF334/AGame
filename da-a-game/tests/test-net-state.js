// tests/test-net-state.js — 联网对局：view → 牌桌状态 适配器
var assert = require('assert');
var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var netState = require('../src/net-state.js');

var meHand = [{ id: 'S-A-1', rank: 14, suit: 'S' }, { id: 'H-3-1', rank: 3, suit: 'H' }];
var view = {
  id: '123456', you: 0, status: 'PLAYING', round: 1,
  state: {
    phase: 'PLAY',
    mode: '2V3_暗打',
    table: [],
    lastPlayer: 'C',
    currentPlayer: 'A',
    '底牌公开': false,
    '主A': { suit: 'H', establishedBy: 'B' },
    players: [
      { id: 'A', name: '甲', hand: meHand, '底牌': [{ id: 'D-9-1' }], handCount: 2 },
      { id: 'B', name: '乙', handCount: 21, '底牌': [{ id: 'D-9-2' }] },
      { id: 'C', name: '丙', handCount: 20, '底牌': null }
    ]
  }
};

section('1. toRender');
var st = netState.toRender(view);
check('1.1 返回非空', !!st);
check('1.2 phase 保留', st.phase === 'PLAY' && st.mode === '2V3_暗打');
check('1.3 自己的手牌原样', st.players[0].hand.length === 2 && st.players[0].hand[0].id === 'S-A-1');
check('1.4 别人的 hand 只有长度', st.players[1].hand.length === 21 && st.players[1].hand.every(function (c) { return c === null; }));
check('1.5 别人底牌置空', st.players[1]['底牌'] === null);
check('1.6 自己的底牌保留', Array.isArray(st.players[0]['底牌']));
check('1.7 不改原 view', view.state.players[1].hand === undefined);

section('2. seatId / 边界');
check('2.1 seatId', netState.seatId(0) === 'A' && netState.seatId(4) === 'E');
check('2.2 空 view 返回 null', netState.toRender(null) === null);
check('2.3 无 state 返回 null', netState.toRender({ id: '1' }) === null);

section('3. 房间开始即进入 PLAY（服务端自动闸门）');
var roomMod = require('../cloudfunctions/game-server/room.js');
var room = roomMod.createRoom({ ownerId: 'u1', nick: '甲', config: { rounds: 6, aiFill: true } });
for (var i = 0; i < 4; i++) roomMod.join(room, { openid: 'u' + (i + 2), nick: 'P' + (i + 2) });
room.players.forEach(function (p) { p.ready = true; });
roomMod.start(room);
check('3.1 开局即 PLAY', room.state.phase === 'PLAY');
check('3.2 有当前玩家', !!room.state.currentPlayer);
var pv = roomMod.poll(room, 'u1');
check('3.3 poll 带 you', pv.you === 0);
check('3.4 别人只给 handCount', pv.state.players[1].hand === undefined && pv.state.players[1].handCount >= 20);
check('3.5 适配器可渲染', netState.toRender(pv).players[1].hand.length === pv.state.players[1].handCount);

section('4. 服务端 AI 代打（autoAi）');
var seqBefore = room.seq;
roomMod.autoAi(room);
check('4.1 autoAi 推进了 seq', room.seq >= seqBefore);
var humanSeats = room.players.filter(function (p) { return !p.ai && !p.offline; }).map(function (p) { return 'ABCDE'[p.seat]; });
check('4.2 轮到真人或已结算', room.state.phase !== 'PLAY' || humanSeats.indexOf(room.state.currentPlayer) >= 0);

console.log('\n结果: ' + passed + ' 通过 / ' + failed + ' 失败');
if (failed) { console.log('失败项: ' + failures.join(', ')); process.exit(1); }
