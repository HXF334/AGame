// 云函数：game-server（联网对战房间核心）
// [2026-11-16 用户] 联网对战 P1 骨架 —— 当前只做健康检查与版本握手，
// 房间/动作/轮询接口在 P1 逐步补齐。engine/ 由 tools/sync-engine.js 从 src/ 复制，
// 这样服务端与客户端跑**同一份规则代码**（哈希清单见 engine/MANIFEST.json）。
var cloud = require('wx-server-sdk');
var version = require('./engine/version.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async function (event, context) {
  var action = (event && event.action) || 'ping';
  if (action === 'ping') {
    return {
      ok: true,
      action: 'ping',
      engineHash: require('./engine/MANIFEST.json').hash,
      protocolVersion: version.PROTOCOL_VERSION,
      rulesVersion: version.RULES_VERSION,
      serverTime: Date.now()
    };
  }
  return { ok: false, error: 'NOT_IMPLEMENTED', action: action };
};
