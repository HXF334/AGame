// src/phases.js — 第二阶段常量枚举
// 纯 JS、CommonJS；无 wx.* 依赖。
//
// 三类枚举：
//   PHASES  — 游戏阶段（SKILL §3 阶段状态机）
//   ACTIONS — 玩家/系统可发起的动作
//   ERR     — transition() 拒绝动作时返回的错误类型
//
// 本阶段只实现到 LIANG_A_RESOLVED；其它阶段为占位常量，不允许进入。

// === 阶段（§3） ===
// 本阶段实现：
//   GAME_START         1. 对局开始
//   LIANG_A            5. 亮A阶段（含 §4.1 主动亮A + §4.2 强制排查）
//   LIANG_A_RESOLVED   主A花色已确立，等待反A
//   FAN_A              7. 反A阶段（ADVANCE 从 LIANG_A_RESOLVED 进来）
//   FAN_A_RESOLVED     反A 结束（成功 / 无人反A 都进这里）
// 本阶段不实现（占位，禁止进入）：
//   REVEAL_BOTTOM      8. 底牌翻开
//   IDENTITY_CHOICE    9. 次方身份选择
//   PLAY               11. 出牌阶段
//   GAME_END           12. 对局结束
//   SCORING            13. 计分结算
const PHASES = Object.freeze({
  GAME_START:         'GAME_START',
  LIANG_A:            'LIANG_A',
  LIANG_A_RESOLVED:   'LIANG_A_RESOLVED',
  FAN_A:              'FAN_A',
  FAN_A_RESOLVED:     'FAN_A_RESOLVED',
  REVEAL_BOTTOM:      'REVEAL_BOTTOM',
  IDENTITY_CHOICE:    'IDENTITY_CHOICE',
  PLAY:               'PLAY',
  GAME_END:           'GAME_END',
  SCORING:            'SCORING'
});

// 本阶段允许的动作
const ACTIONS = Object.freeze({
  START_GAME:       'START_GAME',     // GAME_START → LIANG_A（含发牌）
  LIANG_A:          'LIANG_A',        // 主动亮A
  FORCED_CHECK:     'FORCED_CHECK',   // 触发强制排查
  FAN_A:            'FAN_A',          // 反A（§4.4）
  REVEAL_BOTTOM:    'REVEAL_BOTTOM',  // 底牌翻开 + 判定 1V4/2V3（§4.5）
  CHOOSE_IDENTITY:  'CHOOSE_IDENTITY',// 身份选择：明/暗打（§4.5）
  ADVANCE:          'ADVANCE',        // 推进到下一阶段
  // C-4 v3 新增
  PLAY:             'PLAY',           // 出牌 / 取牌（§7 + §8）
  PASS:             'PASS',           // 过牌（§8）
  PUSH_WIND:        'PUSH_WIND'       // 推风（§9）
});

// transition() 拒绝动作时返回的错误类型
const ERR = Object.freeze({
  UNKNOWN_ACTION:         'UNKNOWN_ACTION',
  ILLEGAL_ACTION:         'ILLEGAL_ACTION',
  MISSING_PAYLOAD:        'MISSING_PAYLOAD',
  PLAYER_NOT_FOUND:       'PLAYER_NOT_FOUND',
  CARD_NOT_FOUND:         'CARD_NOT_FOUND',
  NOT_AN_ACE:             'NOT_AN_ACE',
  CARD_NOT_IN_HAND:       'CARD_NOT_IN_HAND',
  LIANG_A_REJECTED:       'LIANG_A_REJECTED',
  FORCED_CHECK_REJECTED:  'FORCED_CHECK_REJECTED',
  FAN_A_REJECTED:         'FAN_A_REJECTED',
  REVEAL_BOTTOM_REJECTED: 'REVEAL_BOTTOM_REJECTED',
  SUIT_MISMATCH:          'SUIT_MISMATCH',
  DOUBLE_A_REQUIRED:      'DOUBLE_A_REQUIRED',
  INVALID_CHOICE:         'INVALID_CHOICE',
  IDENTITY_NOT_AUTHORIZED:'IDENTITY_NOT_AUTHORIZED',
  NO_NEXT_PHASE:          'NO_NEXT_PHASE',
  // C-4 v3 新增
  CANNOT_BEAT:            'CANNOT_BEAT',
  CANNOT_PASS:            'CANNOT_PASS',
  ALREADY_PASSED:         'ALREADY_PASSED',
  NO_TRIGGER:             'NO_TRIGGER',
  TRIGGER_NOT_OUT:        'TRIGGER_NOT_OUT',
  NO_TARGET:              'NO_TARGET',
  NOT_PLAY_PHASE:         'NOT_PLAY_PHASE'
});

module.exports = { PHASES: PHASES, ACTIONS: ACTIONS, ERR: ERR };
