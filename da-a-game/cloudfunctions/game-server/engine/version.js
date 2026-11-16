// [2026-11-16 用户] 联网对战 P0：版本号（协议 / 规则）
//   - PROTOCOL_VERSION：客户端与服务端的信封/字段约定，改动不兼容时 +1；
//   - RULES_VERSION：规则口径（SKILL/DECISIONS 里会影响结算的变更）改动时 +1；
//   - 服务端在握手时回传这两个值，客户端不一致就提示「版本不一致，请更新」。
//   纯常量、无 wx、无依赖，客户端与服务端（cloudfunctions/game-server/engine 副本）共用。
var PROTOCOL_VERSION = 1;
var RULES_VERSION = 1;

module.exports = {
  PROTOCOL_VERSION: PROTOCOL_VERSION,
  RULES_VERSION: RULES_VERSION
};
