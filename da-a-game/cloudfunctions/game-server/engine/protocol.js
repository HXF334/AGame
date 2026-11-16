// [2026-11-16 用户] 联网对战 P0：动作信封（客户端 → 服务端）
//   设计约束：
//   - 只允许引擎能处理的三个动作：PLAY / PASS / PUSH_WIND；
//   - 信封带 baseSeq：服务端据此做「客户端看到的是不是最新版本」的并发检查（乐观锁）；
//   - 校验函数是纯函数，客户端可以在发送前自检，服务端再校验一次（双保险）。
//   - 纯函数、无 wx、无依赖。
var version = require('./version.js');

var ACTIONS = ['PLAY', 'PASS', 'PUSH_WIND'];

function isInt(n) {
  return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
}

// 构造信封：{ v, type, payload, baseSeq, clientAt }
function makeAction(type, payload, baseSeq, clientAt) {
  return {
    v: version.PROTOCOL_VERSION,
    type: type,
    payload: payload || {},
    baseSeq: isInt(baseSeq) && baseSeq >= 0 ? baseSeq : 0,
    clientAt: isInt(clientAt) ? clientAt : 0
  };
}

// 返回 { ok:true } 或 { ok:false, code, message }
function validateEnvelope(env) {
  if (!env || typeof env !== 'object') {
    return { ok: false, code: 'BAD_ENVELOPE', message: 'envelope must be an object' };
  }
  if (!isInt(env.v) || env.v !== version.PROTOCOL_VERSION) {
    return { ok: false, code: 'BAD_VERSION', message: 'protocol version mismatch: ' + env.v };
  }
  if (ACTIONS.indexOf(env.type) < 0) {
    return { ok: false, code: 'BAD_TYPE', message: 'unsupported action: ' + env.type };
  }
  if (env.payload !== undefined && (env.payload === null || typeof env.payload !== 'object')) {
    return { ok: false, code: 'BAD_PAYLOAD', message: 'payload must be an object' };
  }
  if (env.baseSeq !== undefined && (!isInt(env.baseSeq) || env.baseSeq < 0)) {
    return { ok: false, code: 'BAD_SEQ', message: 'baseSeq must be a non-negative integer' };
  }
  if (env.type === 'PLAY') {
    var p = env.payload || {};
    if (typeof p.playerId !== 'string' || !p.playerId) {
      return { ok: false, code: 'BAD_PAYLOAD', message: 'PLAY requires payload.playerId' };
    }
    if (!Array.isArray(p.cardIds) || p.cardIds.length === 0) {
      return { ok: false, code: 'BAD_PAYLOAD', message: 'PLAY requires payload.cardIds' };
    }
  }
  return { ok: true };
}

// 幂等键：同一客户端同一局、同一 baseSeq 的同一动作视为重放
function actionKey(env) {
  if (!env) return '';
  var ids = (env.payload && env.payload.cardIds) ? env.payload.cardIds.join('+') : '';
  return [env.type, (env.payload && env.payload.playerId) || '', ids, env.baseSeq || 0].join('|');
}

module.exports = {
  PROTOCOL_VERSION: version.PROTOCOL_VERSION,
  ACTIONS: ACTIONS,
  makeAction: makeAction,
  validateEnvelope: validateEnvelope,
  actionKey: actionKey
};
