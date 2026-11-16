// [2026-11-16 用户] 联网对战 P0：假云端 + 多客户端无头测试床
//
// 目的：在 P1 真正写 game-server 之前，先把「5 个客户端 + 1 个权威状态」的测试骨架搭好，
//   让服务端逻辑可以纯 node 单测，不依赖微信云开发、不碰网络。
//
// 用法：
//   var fc = require('./lib/fake-cloud.js');
//   var server = fc.createServer();         // 权威状态由测试自己喂
//   var cloud = fc.createCloud(server);     // 每个客户端一个 cloud 句柄
//   cloud.callFunction({ name:'game-server', data:{...} }) -> Promise
//
// 当前只提供最小能力：callFunction 路由 + 调用记录 + 视图广播；房间协议在 P1 扩展。
var engine = require('../../src/index.js');
var protocol = require('../../src/protocol.js');
var pv = require('../../src/public-view.js');

function createCloud(handlers) {
  var calls = [];
  return {
    __calls: calls,
    callFunction: function (opt) {
      var name = opt && opt.name;
      var data = (opt && opt.data) || {};
      calls.push({ name: name, data: data });
      var fn = handlers && handlers[name];
      if (!fn) {
        return Promise.reject(new Error('FUNCTION_NOT_FOUND: ' + name));
      }
      try {
        return Promise.resolve(fn(data));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    init: function () { /* noop */ }
  };
}

// 生成一个「假服务端」：保存权威 state、递增 seq、按 viewer 投影
function createServer(opts) {
  opts = opts || {};
  var state = opts.state || null;
  var seq = 0;
  var log = [];
  function apply(env) {
    var check = protocol.validateEnvelope(env);
    if (!check.ok) return { ok: false, error: check.code };
    if (!state) return { ok: false, error: 'NO_STATE' };
    var r = engine.transition(state, { type: env.type, payload: env.payload });
    if (!r || !r.ok) return { ok: false, error: (r && r.error && r.error.type) || 'REJECTED' };
    state = r.state;
    seq += 1;
    log.push({ seq: seq, type: env.type, playerId: (env.payload || {}).playerId || '' });
    return { ok: true, seq: seq, state: state };
  }
  return {
    setState: function (s) { state = s; seq = 0; log = []; },
    getState: function () { return state; },
    getSeq: function () { return seq; },
    getLog: function () { return log; },
    apply: apply,
    viewFor: function (viewerId) {
      if (!state) return null;
      return Object.assign({ seq: seq }, pv.project(state, viewerId));
    }
  };
}

module.exports = {
  createCloud: createCloud,
  createServer: createServer
};
