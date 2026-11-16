// tests/test-room-gates.js — 联网闸门窗口（亮A/反A/身份）与超时默认
var path = require('path');
var roomMod = require(path.join(__dirname, '..', 'cloudfunctions', 'game-server', 'room.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
function makeRoom() {
  var room = roomMod.createRoom({ ownerId: 'u1', nick: '甲', config: { rounds: 6, aiFill: true } });
  for (var i = 0; i < 4; i++) roomMod.join(room, { openid: 'u' + (i + 2), nick: 'P' + (i + 2) });
  room.players.forEach(function (p) { p.ready = true; });
  roomMod.start(room);
  return room;
}

var room = makeRoom();
check('1.1 开局进入亮A窗口', room.state.phase === 'LIANG_A' && room.gateDeadline > 0, room.state.phase);

roomMod.gateTick(room, room.gateDeadline - 1000);
check('1.2 窗口未到期不推进', room.state.phase === 'LIANG_A');

roomMod.gateTick(room, room.gateDeadline + 10);
check('1.3 亮A超时转反A窗口', room.state.phase === 'FAN_A' && room.gateDeadline > 0, room.state.phase);

roomMod.gateTick(room, room.gateDeadline + 10);
check('1.4 反A超时转身份窗口', room.state.phase === 'IDENTITY_CHOICE', room.state.phase);

roomMod.gateTick(room, room.gateDeadline + 10);
check('1.5 身份超时进入出牌', room.state.phase === 'PLAY', room.state.phase);
check('1.6 出牌有当前玩家', !!room.state.currentPlayer, String(room.state.currentPlayer));
check('1.7 无窗口后 gateDeadline 清零', !room.gateDeadline, String(room.gateDeadline));

var room2 = makeRoom();
roomMod.gateTick(room2, room2.gateDeadline + 10); // 亮A超时 -> FAN_A
var before = room2.seq;
roomMod.gateTick(room2, room2.gateDeadline - 1000);
check('1.8 等待中不空转改 seq', room2.seq === before, String(room2.seq - before));

console.log('\nroom-gates: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
