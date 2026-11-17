// [2026-11-16 用户] 联网对战 P2：客户端房间控制器（不含 UI）
//
// 只依赖注入进来的 call(name, data) —— 小程序里是 wx.cloud.callFunction 的薄包装，
// 测试里是 tests/lib/fake-cloud.js。这样网络层没有 wx、可无头跑。
//   var c = online.createClient({ call: fn });
//   await c.createRoom({rounds:6}, '昵称');
//   await c.joinRoom('123456', '昵称');
//   await c.ready(true);            // 全员准备后服务端自动开局
//   await c.send('PLAY', { cardIds: [...] });
//   c.poll();                       // 轮询；也可外部定时调
var protocol = require('./protocol.js');

function createClient(opt) {
  opt = opt || {};
  var call = opt.call;
  var now = opt.now || function () { return Date.now(); };
  if (typeof call !== 'function') throw new Error('online.createClient requires call()');

  var c = {
    roomId: '',
    seq: 0,
    view: null,
    state: null,
    lastError: '',
    listeners: []
  };

  function emit() {
    for (var i = 0; i < c.listeners.length; i++) {
      try { c.listeners[i](c.view); } catch (e) { /* 监听器异常不影响主流程 */ }
    }
  }

  function absorb(res) {
    if (!res || res.ok !== true) {
      c.lastError = (res && res.error) || 'UNKNOWN';
      return { ok: false, error: c.lastError, seq: res && res.seq };
    }
    var room = res.room || null;
    if (room) {
      c.view = room;
      c.state = room.state || null;
      c.seq = room.seq;
      c.roomId = room.id;
    }
    c.lastError = '';
    emit();
    return { ok: true, room: c.view };
  }

  function invoke(action, data) {
    var payload = Object.assign({ action: action }, data || {});
    return Promise.resolve(call('game-server', payload)).then(absorb);
  }

  c.onUpdate = function (fn) { if (typeof fn === 'function') c.listeners.push(fn); return c; };

  c.createRoom = function (config, nick, avatar) {
    return invoke('create', { config: config || {}, roomId: (config && config.roomId) || '', nick: nick || '', avatar: avatar || '' });
  };
  c.joinRoom = function (roomId, nick, avatar) {
    c.roomId = String(roomId);
    return invoke('join', { roomId: c.roomId, nick: nick || '', avatar: avatar || '' });
  };
  c.ready = function (v) { return invoke('ready', { roomId: c.roomId, ready: v !== false }); };
  c.start = function () { return invoke('start', { roomId: c.roomId }); };
  c.poll = function () { return invoke('poll', { roomId: c.roomId }); };
  c.offline = function () { return invoke('offline', { roomId: c.roomId }); };
  c.online = function () { return invoke('online', { roomId: c.roomId }); };
  c.leave = function () { return invoke('leave', { roomId: c.roomId }); };

  // 发动作：自动带 baseSeq；STALE 时用服务端回给的最新 seq 直接重试
  //   [2026-11-17 用户] 原来 STALE 后先 poll 再重发：poll 自己会推进 AI/闸门，
  //   等于「刚追上的 seq 又被 poll 顶掉」，实测永远 STALE。服务端已在 STALE 里
  //   带回 room.seq，直接采纳即可，不需要再 poll。
  c.send = function (type, payload) {
    function attempt(n) {
      var env = protocol.makeAction(type, payload || {}, c.seq, now());
      return invoke('apply', { roomId: c.roomId, env: env }).then(function (r) {
        if (r && r.ok) return r;
        if (r && r.error === 'STALE' && n < 3) {
          if (typeof r.seq === 'number' && r.seq >= 0) c.seq = r.seq;
          return attempt(n + 1);
        }
        return r;
      });
    }
    return attempt(0);
  };

  // 视图快捷判断（UI 用）
  c.mySeat = function (seat) {
    if (!c.view) return null;
    for (var i = 0; i < c.view.players.length; i++) {
      if (c.view.players[i].seat === seat) return c.view.players[i];
    }
    return null;
  };
  c.isMyTurn = function () {
    return !!(c.state && c.view && c.view.status === 'PLAYING' &&
      c.state.currentPlayer && c.view.players.some(function (p) {
        return c.state.currentPlayer === ['A', 'B', 'C', 'D', 'E'][p.seat];
      }));
  };

  return c;
}

module.exports = { createClient: createClient };
