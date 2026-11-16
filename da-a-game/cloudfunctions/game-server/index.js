// 云函数 game-server：房间入口（P1）
//   action: ping | create | join | ready | start | apply | poll
//   房间存放在云数据库 rooms（_id = 房间号）；权威状态只存在服务端。
var cloud = require('wx-server-sdk');
var roomMod = require('./room.js');
var manifest = require('./engine/MANIFEST.json');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
var db = cloud.database();
var COL = 'rooms';

function ctxOpenid(event) {
  var c = cloud.getWXContext();
  return (event && event.openid) || c.OPENID || '';
}

function ok(data) { return Object.assign({ ok: true }, data || {}); }
function fail(error, extra) { return Object.assign({ ok: false, error: error }, extra || {}); }

async function loadRoom(id) {
  var r = await db.collection(COL).doc(String(id)).get();
  return r.data;
}

async function saveRoom(room) {
  room.updatedAt = Date.now();
  await db.collection(COL).doc(String(room.id)).set({ data: room });
}

async function ensureCollection() {
  try {
    await db.createCollection(COL);
  } catch (e) {
    // 已存在
  }
}

exports.main = async function (event) {
  var action = (event && event.action) || 'ping';
  var openid = ctxOpenid(event);
  if (action === 'ping') {
    return ok({
      engineHash: manifest.hash,
      protocolVersion: 1,
      rulesVersion: 1,
      serverTime: Date.now()
    });
  }
  if (!openid) return fail('NO_OPENID');

  if (action === 'create') {
    var room = roomMod.createRoom({
      ownerId: openid,
      nick: event.nick || '',
      avatar: event.avatar || '',
      roomId: event.roomId,
      config: event.config
    });
    try {
      await saveRoom(room);
    } catch (e) {
      if (e.errCode === -502005) {
        await ensureCollection();
        await saveRoom(room);
      } else {
        return fail('WRITE_FAILED', { message: String(e.errMsg || e.message || e) });
      }
    }
    return ok({ room: roomMod.poll(room, openid) });
  }

  if (!event.roomId) return fail('NO_ROOM_ID');
  var room;
  try {
    room = await loadRoom(event.roomId);
  } catch (e) {
    return fail('ROOM_NOT_FOUND');
  }

  if (action === 'join') {
    var jr = roomMod.join(room, { openid: openid, nick: event.nick || '', avatar: event.avatar || '' });
    if (!jr.ok) return fail(jr.error);
    await saveRoom(room);
    return ok({ room: roomMod.poll(room, openid) });
  }
  if (action === 'ready') {
    var sr = roomMod.setReady(room, openid, event.ready !== false);
    if (!sr.ok) return fail(sr.error);
    await saveRoom(room);
    return ok({ room: roomMod.poll(room, openid) });
  }
  if (action === 'start') {
    if (room.ownerId !== openid) return fail('NOT_OWNER');
    var tr = roomMod.start(room);
    if (!tr.ok) return fail(tr.error);
    await saveRoom(room);
    return ok({ room: roomMod.poll(room, openid) });
  }
  if (action === 'apply') {
    var ar = roomMod.apply(room, event.env, openid);
    if (!ar.ok) return fail(ar.error, { seq: room.seq });
    await saveRoom(room);
    return ok({ room: roomMod.poll(room, openid), seq: room.seq, ended: !!ar.ended });
  }
  if (action === 'poll') {
    return ok({ room: roomMod.poll(room, openid) });
  }
  return fail('UNKNOWN_ACTION');
};
