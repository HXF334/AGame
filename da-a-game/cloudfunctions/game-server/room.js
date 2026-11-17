// 云函数 game-server：房间核心（P1）
//
// 纯逻辑 + 显式 time 注入：不直接摸数据库、不依赖 wx，便于无头测试；
// index.js 负责把它和云数据库/触发器接起来。
//
// 房间对象（可直接序列化进云数据库）：
// {
//   id: '123456', ownerId, status: 'WAITING'|'PLAYING'|'SETTLED'|'FINISHED',
//   config: { rounds, baseScore, turnSeconds, showRemain, memo, aiFill, voice:false },
//   round: 0, seq: 0,
//   players: [{ openid, seat, nick, avatar, ready, ai, total }],
//   state: <引擎 state>|null,
//   moveKeys: [],
//   lastRound: [{ seat, score, total }],
//   createdAt, updatedAt
// }
var engine = require('./engine/index.js');
var pv = require('./engine/public-view.js');
var scoring = require('./engine/scoring.js');
var wl = require('./engine/win-loss.js');
var deal = require('./engine/deal.js');
var protocol = require('./engine/protocol.js');
var ai = require('./engine/ai.js');

var SEATS = deal.PLAYER_NAMES;                 // ['A'..'E']
var MAX_PLAYERS = 5;
var LIMIT = { rounds: 30, baseScore: 99, turnSeconds: 99 };

function seatId(seat) { return SEATS[seat]; }

function clampConfig(cfg) {
  cfg = cfg || {};
  var rounds = Math.min(LIMIT.rounds, Math.max(1, parseInt(cfg.rounds, 10) || 12));
  var baseScore = Math.min(LIMIT.baseScore, Math.max(1, parseInt(cfg.baseScore, 10) || 1));
  var turnSeconds = Math.min(LIMIT.turnSeconds, Math.max(0, parseInt(cfg.turnSeconds, 10) || 0));
  return {
    rounds: rounds,
    baseScore: baseScore,
    turnSeconds: turnSeconds,
    showRemain: !!cfg.showRemain,
    memo: !!cfg.memo,
    aiFill: cfg.aiFill !== false,
    voice: false
  };
}

function newRoomId(seed) {
  if (seed && /^\d{6}$/.test(String(seed))) return String(seed);
  var n = (seed || Date.now()) % 900000 + 100000;
  return String(n);
}

function createRoom(opt, now) {
  opt = opt || {};
  var t = now || Date.now();
  var room = {
    id: newRoomId(opt.roomId || t),
    ownerId: opt.ownerId || '',
    status: 'WAITING',
    config: clampConfig(opt.config),
    round: 0,
    seq: 0,
    players: [],
    state: null,
    moveKeys: [],
    lastRound: [],
    createdAt: t,
    updatedAt: t
  };
  join(room, { openid: opt.ownerId, nick: opt.nick || '', avatar: opt.avatar || '' }, t);
  return room;
}

function findPlayer(room, openid) {
  for (var i = 0; i < room.players.length; i++) {
    if (room.players[i].openid === openid) return room.players[i];
  }
  return null;
}

function join(room, player, now) {
  if (room.status !== 'WAITING') return { ok: false, error: 'ROOM_STARTED' };
  if (findPlayer(room, player.openid)) return { ok: true, room: room };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: 'ROOM_FULL' };
  var seat = 0;
  while (room.players.some(function (p) { return p.seat === seat; })) seat += 1;
  room.players.push({
    openid: player.openid,
    seat: seat,
    nick: String(player.nick || ''),
    avatar: String(player.avatar || ''),
    ready: false,
    ai: false,
    total: 0
  });
  room.updatedAt = now || Date.now();
  return { ok: true, room: room };
}

function leave(room, openid, now) {
  // [2026-11-17 用户] 允许对局中退出；最后一个真人离开 → empty，调用方删除房间记录，
  //   这样同一个房间号可以再被创建。
  room.players = room.players.filter(function (p) { return p.openid !== openid; });
  var humans = room.players.filter(function (p) { return !p.ai; });
  if (room.ownerId === openid && humans.length) room.ownerId = humans[0].openid;
  room.updatedAt = now || Date.now();
  return { ok: true, room: room, empty: humans.length === 0 };
}

function allReady(room) {
  return room.players.length === MAX_PLAYERS &&
    room.players.every(function (p) { return p.ready || p.ai; });
}

function fillAi(room) {
  for (var seat = 0; seat < MAX_PLAYERS; seat++) {
    if (room.players.some(function (p) { return p.seat === seat; })) continue;
    room.players.push({
      openid: 'ai-' + seat,
      seat: seat,
      nick: 'AI' + seatId(seat),
      avatar: '',
      ready: true,
      ai: true,
      total: 0
    });
  }
  room.players.sort(function (a, b) { return a.seat - b.seat; });
}

function setReady(room, openid, ready, now) {
  if (room.status !== 'WAITING' && room.status !== 'SETTLED') return { ok: false, error: 'NOT_READY_PHASE' };
  var p = findPlayer(room, openid);
  if (!p) return { ok: false, error: 'NOT_IN_ROOM' };
  p.ready = !!ready;
  room.updatedAt = now || Date.now();
  if (allReady(room)) return start(room, now);
  return { ok: true, room: room };
}

function start(room, now) {
  if (room.status === 'PLAYING') return { ok: false, error: 'ALREADY_PLAYING' };
  if (room.round >= room.config.rounds) return { ok: false, error: 'ROUNDS_DONE' };
  if (room.players.length < MAX_PLAYERS) {
    if (!room.config.aiFill) return { ok: false, error: 'NOT_FULL' };
    fillAi(room);
  }
  var t = now || Date.now();
  var st = engine.newGameState();
  var r = engine.transition(st, { type: 'START_GAME', payload: { progressive: false } });
  if (!r.ok) return { ok: false, error: r.error.type };
  room.state = r.state;
  room.round += 1;
  room.seq += 1;
  room.status = 'PLAYING';
  room.gateDeadline = 0;
  gateTick(room, t);
  room.moveKeys = [];
  room.deadline = room.config.turnSeconds > 0 ? t + room.config.turnSeconds * 1000 : 0;
  room.players.forEach(function (p) { p.ready = false; });
  room.updatedAt = t;
  return { ok: true, room: room };
}

// [2026-11-16 用户] 联网对局进入战斗：自动推进无需人类决策的闸门（亮A/反A/翻底牌/身份），
// 让房间从发牌直接走到 PLAY；人类决策类闸门后续再开放。
function advanceToPlay(room) {
  var guard = 0;
  while (guard++ < 12) {
    var ph = room.state && room.state.phase;
    if (!ph) break;
    var r = null;
    if (ph === 'LIANG_A') {
      r = engine.transition(room.state, { type: 'FORCED_CHECK', payload: {} });
    } else if (ph === 'LIANG_A_RESOLVED') {
      r = engine.transition(room.state, { type: 'ADVANCE', payload: {} });
    } else if (ph === 'FAN_A' || ph === 'FAN_A_RESOLVED') {
      r = engine.transition(room.state, { type: 'REVEAL_BOTTOM', payload: {} });
    } else if (ph === 'REVEAL_BOTTOM') {
      r = engine.transition(room.state, { type: 'REVEAL_BOTTOM', payload: {} });
    } else if (ph === 'IDENTITY_CHOICE') {
      var who = engine.identityChooser(room.state);
      if (!who) break;
      r = engine.transition(room.state, { type: 'CHOOSE_IDENTITY', payload: { playerId: who, choice: 'HIDDEN' } });
    } else {
      break;
    }
    if (!r || !r.ok) break;
    room.state = r.state;
    room.seq += 1;
  }
  if (room.state && room.state.phase === 'PLAY' && !room.state.currentPlayer) {
    room.state.currentPlayer = engine.determineFirstPlayer(room.state) || 'A';
    room.seq += 1;
  }
  return room;
}

// [2026-11-16 用户] 联网闸门：亮A / 反A / 身份选择各开一个等待窗口（GATE_MS），
// 超时走默认（强制排查 / 不反 / 隐藏身份）；其余闸门自动推进。
// [2026-11-17 用户] 联网闸门与单机一致：AI 座位像单机 AI 一样自己决定亮A/反A/身份；
// 只有真人可操作时才开窗口（5 秒），无人可操作立即走默认，避免停在「等待其他玩家」。
var GATE_MS = 5000;

function seatPlayer(room, id) {
  var seat = SEATS.indexOf(id);
  return room.players.filter(function (p) { return p.seat === seat; })[0];
}
function handOf(room, id) {
  var st = room.state;
  for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i].hand || [];
  return [];
}
function isAiSeat(room, id) {
  var p = seatPlayer(room, id);
  return !p || p.ai || p.offline;
}
function humanCanGate(room) {
  var st = room.state;
  var i, p, id;
  if (st.phase === 'LIANG_A') {
    for (i = 0; i < room.players.length; i++) {
      p = room.players[i]; id = seatId(p.seat);
      if (!(p.ai || p.offline) && engine.canLiangA(st, id).ok) return true;
    }
    return false;
  }
  if (st.phase === 'FAN_A') {
    for (i = 0; i < room.players.length; i++) {
      p = room.players[i]; id = seatId(p.seat);
      if (!(p.ai || p.offline) && engine.canFanA(st, id).ok) return true;
    }
    return false;
  }
  if (st.phase === 'IDENTITY_CHOICE') {
    var who = engine.identityChooser(st);
    return !!who && !isAiSeat(room, who);
  }
  return false;
}
function aiGate(room) {
  var st = room.state;
  if (!st) return false;
  var i, p, id, hand, aces, suit, ids, acted = false;
  if (st.phase === 'LIANG_A') {
    for (i = 0; i < room.players.length; i++) {
      p = room.players[i];
      if (!(p.ai || p.offline)) continue;
      id = seatId(p.seat);
      if (!engine.canLiangA(st, id).ok) continue;
      hand = handOf(room, id);
      aces = hand.filter(function (c) { return c.suit && c.rank === 14; });
      if (!aces.length) continue;
      if (gateApply(room, 'LIANG_A', { playerId: id, suit: aces[0].suit })) acted = true;
    }
    return acted;
  }
  if (st.phase === 'FAN_A') {
    var mainSuit = st['主A'] && st['主A'].suit;
    for (i = 0; i < room.players.length; i++) {
      p = room.players[i];
      if (!(p.ai || p.offline)) continue;
      id = seatId(p.seat);
      if (!engine.canFanA(st, id).ok) continue;
      hand = handOf(room, id);
      aces = hand.filter(function (c) { return c.suit && c.rank === 14 && c.suit !== mainSuit; });
      if (aces.length < 2) continue;
      suit = aces[0].suit;
      ids = hand.filter(function (c) { return c.suit === suit && c.rank === 14; }).map(function (c) { return c.id; });
      if (gateApply(room, 'FAN_A', { playerId: id, suit: suit, cardIds: ids })) acted = true;
    }
    return acted;
  }
  if (st.phase === 'IDENTITY_CHOICE') {
    var who = engine.identityChooser(st);
    if (who && isAiSeat(room, who)) return gateApply(room, 'CHOOSE_IDENTITY', { playerId: who, choice: 'HIDDEN' });
  }
  return false;
}
function gateApply(room, type, payload) {
  var r = engine.transition(room.state, { type: type, payload: payload || {} });
  if (!r || !r.ok) return false;
  room.state = r.state;
  room.seq += 1;
  return true;
}
function gateTick(room, now) {
  if (!room.state) return room;
  var t = now || Date.now();
  var guard = 0;
  while (guard++ < 12) {
    var ph = room.state.phase;
    if (ph === 'PLAY') break;
    if (ph === 'LIANG_A' || ph === 'FAN_A' || ph === 'IDENTITY_CHOICE') {
      if (aiGate(room)) { room.gateDeadline = 0; continue; }
      if (humanCanGate(room)) {
        if (!room.gateDeadline) { room.gateDeadline = t + GATE_MS; break; }
        if (t < room.gateDeadline) break;
      }
      if (ph === 'LIANG_A') gateApply(room, 'FORCED_CHECK', {});
      else if (ph === 'FAN_A') gateApply(room, 'REVEAL_BOTTOM', {});
      else {
        var who = engine.identityChooser(room.state);
        if (who) gateApply(room, 'CHOOSE_IDENTITY', { playerId: who, choice: 'HIDDEN' });
      }
      room.gateDeadline = 0;
      continue;
    }
    if (ph === 'LIANG_A_RESOLVED') { gateApply(room, 'ADVANCE', {}); room.gateDeadline = 0; continue; }
    if (ph === 'FAN_A_RESOLVED') { gateApply(room, 'REVEAL_BOTTOM', {}); room.gateDeadline = 0; continue; }
    if (ph === 'REVEAL_BOTTOM') { gateApply(room, 'REVEAL_BOTTOM', {}); room.gateDeadline = 0; continue; }
    break;
  }
  if (room.state.phase === 'PLAY' && !room.state.currentPlayer) {
    room.state.currentPlayer = engine.determineFirstPlayer(room.state) || 'A';
    room.seq += 1;
  }
  return room;
}

// [2026-11-16 用户] 联网对局：轮到 AI / 离线托管的座位时，服务端直接代打，避免房间卡住。
function autoAi(room) {
  var guard = 0;
  while (guard++ < 30 && room.status === 'PLAYING' && room.state && room.state.phase === 'PLAY') {
    var cur = room.state.currentPlayer;
    if (!cur) break;
    var p = room.players.filter(function (x) { return SEATS[x.seat] === cur; })[0];
    if (!p || !(p.ai || p.offline)) break;
    var act = ai.chooseAction(room.state, cur, { endgame: true });
    if (!act || !act.type) break;
    var env = { type: act.type, payload: { playerId: cur } };
    if (act.cardIds) env.payload.cardIds = act.cardIds;
    if (act.suit) env.payload.suit = act.suit;
    var r = engine.transition(room.state, env);
    if (!r || !r.ok) break;
    room.state = r.state;
    room.seq += 1;
    var end = wl.checkGameEnd(room.state);
    if (end && end.ended) { settle(room, Date.now()); break; }
  }
  return room;
}

function settle(room, now) {
  var end = wl.checkGameEnd(room.state);
  if (!end.ended) return false;
  var raw = scoring.calculateScore(room.state, { winner: end.winner }) || {};
  var base = room.config.baseScore;
  var rows = room.players.map(function (p) {
    var s = raw[seatId(p.seat)] || 0;
    p.total += s * base;
    return { seat: p.seat, score: s * base, total: p.total };
  });
  room.lastRound = rows;
  room.status = (room.round >= room.config.rounds) ? 'FINISHED' : 'SETTLED';
  room.deadline = 0;
  room.seq += 1;
  room.updatedAt = now || Date.now();
  return true;
}

function apply(room, env, actorId, now) {
  if (room.status !== 'PLAYING') return { ok: false, error: 'NOT_PLAYING' };
  var chk = protocol.validateEnvelope(env);
  if (!chk.ok) return { ok: false, error: chk.code };
  var me = findPlayer(room, actorId);
  if (!me) return { ok: false, error: 'NOT_IN_ROOM' };
  if (env.baseSeq !== room.seq) return { ok: false, error: 'STALE', seq: room.seq };
  var key = protocol.actionKey(env);
  if (room.moveKeys.indexOf(key) >= 0) return { ok: false, error: 'DUPLICATE' };

  var payload = Object.assign({}, env.payload, { playerId: seatId(me.seat) });
  var r = engine.transition(room.state, { type: env.type, payload: payload });
  if (!r.ok) return { ok: false, error: (r.error && r.error.type) || 'REJECTED' };
  room.state = r.state;
  room.seq += 1;
  room.moveKeys.push(key);
  room.updatedAt = now || Date.now();
  room.deadline = room.config.turnSeconds > 0 ? room.updatedAt + room.config.turnSeconds * 1000 : 0;
  var ended = settle(room, now);
  return { ok: true, room: room, ended: ended, seq: room.seq };
}

// 超时托管：到点后由服务端 AI 代当前玩家走一步；返回是否真的走了
function tick(room, now) {
  var t = now || Date.now();
  if (room.status !== 'PLAYING' || !room.deadline || t < room.deadline) {
    return { ok: true, acted: false, room: room };
  }
  var cur = room.state && room.state.currentPlayer;
  if (!cur) return { ok: true, acted: false, room: room };
  var me = null;
  for (var i = 0; i < room.players.length; i++) {
    if (seatId(room.players[i].seat) === cur) { me = room.players[i]; break; }
  }
  if (me) me.afk = (me.afk || 0) + 1;
  var act = ai.chooseAction(room.state, cur, { endgame: true });
  var type = (act && act.type === 'PLAY') ? 'PLAY' : 'PASS';
  var payload = { playerId: cur };
  if (type === 'PLAY') payload.cardIds = act.cardIds || [];
  var r = engine.transition(room.state, { type: type, payload: payload });
  if (!r.ok) return { ok: true, acted: false, room: room, error: (r.error && r.error.type) || 'AI_REJECTED' };
  room.state = r.state;
  room.seq += 1;
  room.updatedAt = t;
  room.deadline = room.config.turnSeconds > 0 ? t + room.config.turnSeconds * 1000 : 0;
  var ended = settle(room, t);
  return { ok: true, acted: true, room: room, ended: ended, seq: room.seq };
}

// 断线：标记离线；对局中由 AI 接管该座位（重连后可恢复）
function setOffline(room, openid, now) {
  var p = findPlayer(room, openid);
  if (!p) return { ok: false, error: 'NOT_IN_ROOM' };
  p.offline = true;
  if (room.status === 'PLAYING') p.ai = true;
  room.updatedAt = now || Date.now();
  return { ok: true, room: room };
}

function setOnline(room, openid, now) {
  var p = findPlayer(room, openid);
  if (!p) return { ok: false, error: 'NOT_IN_ROOM' };
  p.offline = false;
  if (!p.isAi) p.ai = false;
  room.updatedAt = now || Date.now();
  return { ok: true, room: room };
}

function poll(room, viewerId) {
  var me = findPlayer(room, viewerId);
  var view = {
    id: room.id,
    status: room.status,
    round: room.round,
    rounds: room.config.rounds,
    seq: room.seq,
    deadline: room.deadline || 0,
    gateDeadline: room.gateDeadline || 0,
    you: me ? me.seat : null,
    config: room.config,
    players: room.players.map(function (p) {
      return {
        seat: p.seat, nick: p.nick, avatar: p.avatar,
        ready: p.ready, ai: p.ai, offline: !!p.offline, afk: p.afk || 0, total: p.total,
        owner: p.openid === room.ownerId
      };
    }),
    lastRound: room.lastRound
  };
  if (room.state) view.state = pv.project(room.state, me ? seatId(me.seat) : null);
  return view;
}

module.exports = {
  LIMIT: LIMIT,
  MAX_PLAYERS: MAX_PLAYERS,
  seatId: seatId,
  clampConfig: clampConfig,
  createRoom: createRoom,
  join: join,
  leave: leave,
  setReady: setReady,
  start: start,
  settle: settle,
  apply: apply,
  tick: tick,
  advanceToPlay: advanceToPlay,
  autoAi: autoAi,
  gateTick: gateTick,
  setOffline: setOffline,
  setOnline: setOnline,
  poll: poll,
  allReady: allReady
};
