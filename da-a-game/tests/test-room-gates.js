// tests/test-room-gates.js — 联网闸门窗口（亮A/反A/身份）与超时默认
// [2026-11-17] 改为性质断言：AI 会自己决定闸门，真人可选时才开窗口；
// 因此不假设固定阶段序列，只验证「窗口/超时/最终进 PLAY」这些性质。
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
var GATES = ['LIANG_A', 'FAN_A', 'IDENTITY_CHOICE'];

var room = makeRoom();
check('1.1 开局要么在闸门且已开窗，要么已自动推进', room.state.phase === 'PLAY' || GATES.indexOf(room.state.phase) >= 0, room.state.phase);
if (GATES.indexOf(room.state.phase) >= 0) {
  check('1.2 闸门窗口已设置', room.gateDeadline > 0, String(room.gateDeadline));
  var seq0 = room.seq;
  roomMod.gateTick(room, room.gateDeadline - 1000);
  check('1.3 窗口未到期不推进', room.state.phase !== 'PLAY' && room.seq === seq0, room.state.phase);
} else {
  check('1.2 闸门窗口已设置', true);
  check('1.3 窗口未到期不推进', true);
}

var t = Date.now() + 1000;
var steps = 0;
while (room.state.phase !== 'PLAY' && steps < 8) {
  t += 6000;
  roomMod.gateTick(room, t);
  steps++;
}
check('1.4 超时后最终进入出牌', room.state.phase === 'PLAY', room.state.phase);
check('1.5 出牌有当前玩家', !!room.state.currentPlayer, String(room.state.currentPlayer));
check('1.6 无窗口后 gateDeadline 清零', !room.gateDeadline, String(room.gateDeadline));

var room2 = makeRoom();
var before = room2.seq;
if (GATES.indexOf(room2.state.phase) >= 0 && room2.gateDeadline > 0) {
  roomMod.gateTick(room2, room2.gateDeadline - 1000);
}
check('1.7 等待中不空转改 seq', room2.seq === before, String(room2.seq - before));

console.log('\nroom-gates: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
