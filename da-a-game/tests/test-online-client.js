// [2026-11-16 用户] 联网 P2：客户端房间控制器（online.js）+ 内存假服务端
var assert = require('assert');
var online = require('../src/online.js');
var roomMod = require('../cloudfunctions/game-server/room.js');

var checks = 0;
function ok(name, cond) { checks++; assert.ok(cond, name); }

var rooms = {};
function callAs(user) {
  return function (name, data) {
    if (name !== 'game-server') return { ok: false, error: 'NO_FUNCTION' };
    var d = Object.assign({ openid: user }, data || {});
    var a = d.action;
    if (a === 'create') {
      var r = roomMod.createRoom({ ownerId: user, nick: d.nick, config: d.config });
      rooms[r.id] = r;
      return { ok: true, room: roomMod.poll(r, user) };
    }
    var room = rooms[d.roomId];
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (a === 'join') {
      var j = roomMod.join(room, { openid: user, nick: d.nick });
      return j.ok ? { ok: true, room: roomMod.poll(room, user) } : { ok: false, error: j.error };
    }
    if (a === 'ready') {
      var rr = roomMod.setReady(room, user, d.ready !== false);
      return rr.ok ? { ok: true, room: roomMod.poll(room, user) } : { ok: false, error: rr.error };
    }
    if (a === 'apply') {
      var ar = roomMod.apply(room, d.env, user);
      return ar.ok ? { ok: true, room: roomMod.poll(room, user), seq: room.seq } : { ok: false, error: ar.error, seq: room.seq };
    }
    if (a === 'offline') {
      var of = roomMod.setOffline(room, user);
      return of.ok ? { ok: true, room: roomMod.poll(room, user) } : { ok: false, error: of.error };
    }
    if (a === 'poll') return { ok: true, room: roomMod.poll(room, user) };
    return { ok: false, error: 'UNKNOWN_ACTION' };
  };
}

async function main() {
  var c0 = online.createClient({ call: callAs('u0') });
  var c1 = online.createClient({ call: callAs('u1') });
  var c2 = online.createClient({ call: callAs('u2') });
  var c3 = online.createClient({ call: callAs('u3') });
  var c4 = online.createClient({ call: callAs('u4') });

  var created = await c0.createRoom({ rounds: 2, baseScore: 1 }, '甲');
  ok('create ok', created.ok === true && /^\d{6}$/.test(c0.roomId));
  ok('owner seat 0', c0.view.players[0].seat === 0 && c0.view.status === 'WAITING');

  var joins = [c1, c2, c3, c4];
  for (var i = 0; i < joins.length; i++) {
    var jr = await joins[i].joinRoom(c0.roomId, 'p' + (i + 1));
    ok('join ' + i, jr.ok === true);
  }
  await c0.poll();
  ok('5 players', c0.view.players.length === 5);

  var all = [c0, c1, c2, c3, c4];
  for (var k = 0; k < all.length; k++) await all[k].ready(true);
  await c0.poll();
  ok('auto start', c0.view.status === 'PLAYING');
  ok('seq tracked', c0.seq === c0.view.seq);

  ok('no others hand', c0.view.state.players.every(function (p, idx) {
    return idx === 0 ? Array.isArray(p.hand) : !p.hand;
  }));
  ok('handCount present', typeof c0.view.state.players[1].handCount === 'number');
  ok('no deck', c0.view.state.deck === undefined && c0.view.state.dealOrder === undefined);

  c0.seq = 0;
  var sent = await c0.send('PASS', {});
  ok('stale retried', sent.ok === false ? sent.error !== 'STALE' : true);
  ok('seq repaired', c0.seq === c0.view.seq);

  var off = await c1.offline();
  ok('offline view', off.ok === true && c1.view.players[1].offline === true && c1.view.players[1].ai === true);

  console.log('online client: ' + checks + ' checks passed');
}

main().catch(function (e) { console.error(e); process.exit(1); });
