// src/camp.js — 阵营可见性(敌/友/不明)的**唯一来源**(2026-11-07 23:27 用户)
//
// [用户 2026-11-07 22:26 裁定 A + 23:27 补充]
//   「做A的时候可以考虑头像旁的敌友标志功能, 例如抓方直接把主方标记为敌,
//     推测的次A也标记为敌, 主A把推测的次A标记为友,
//     针对这个标记的敌友来判断该出什么牌。」
//
// 视角 = 观察者(viewerId)。每个玩家只知道自己阵营里的信息:
//   SELF    = 自己
//   ALLY    = 队友(已知)
//   ENEMY   = 敌人(已知)
//   UNKNOWN = 阵营不明(次方未亮明时, 抓方视角下的其他玩家)
//
// 判定顺序:
//   1. 公开(次方亮明 / 明打) -> 用真阵营表
//   2. 我是次方   -> 主A持有者是队友, 其余是敌人
//   3. 我是主A持有者 -> 次方是队友(主方两口子), 其余是敌人
//   4. 我是抓方   -> 主A持有者是敌人; 若从公开出牌流水**推定**出次方,
//                   该次方是敌人, 其余未知玩家都是**队友**(裁定 A); 否则全部 UNKNOWN

// 「推定次方」(公开信息推导): 暗打时, 「身份未明的人」对「另一个身份未明的人」打出蛋子+
//   -> 其他抓方默认把他标记为次方(本局有效, 第一次推定即锁定)。

// [2026-11-08 13:59 用户] 推定次方的**信号**改了:
//   用**大蛋子+**(大蛋子及以上)压身份不明的人, 或者用**三个 4 及以上的 4**取身份不明的人的牌。
//   (普通蛋子不再算信号了 —— 那太常见, 推定会乱套。)
var BIG_EGG_PLUS_TYPES = require('./ai-policy.js').BIG_EGG_PLUS;

// 公开信息推出的次方(第一次推定即锁定); excludeId = 观察者自己(自己打的牌不算线索)
function inferNext(state, excludeId) {
  if (!state) return null;
  // [2026-11-08 16:03 用户] 「戊自己出牌时的 AI 决策说丙(抓方)是次方」
  //   -> 我就是次方的话, 我知道自己的阵营, **不推定**别人(别把我自己推成别人)。
  var _selfNext = state['次方'];
  if (_selfNext && _selfNext === excludeId) return null;
  if (state['次方公开'] === true) return null;             // 次方已亮明 -> 不需要推定
  var mode = state.mode || '';
  if (mode.indexOf('暗打') < 0) return null;               // 只在暗打
  var holder = state['主A'] && state['主A'].establishedBy;
  var plays = state.plays || [];
  for (var i = 0; i < plays.length; i++) {
    var p = plays[i];
    if (!p || !p.type) continue;
    // 信号1: 用大蛋子+(大蛋子及以上)压制; 信号2: 用三个4及以上的4取牌
    var _isSignal = (BIG_EGG_PLUS_TYPES[p.type] === 1)
      || (p.kind === 'CAPTURE' && p.useFours >= 3);
    if (!_isSignal) continue;
    if (!p.beat) continue;                                     // 必须是压/取别人(起手不算)
    if (p.playerId === p.beat) continue;
    if (excludeId && p.playerId === excludeId) continue;       // 是我自己打的 -> 我知道自己的阵营
    if (holder && (p.playerId === holder || p.beat === holder)) continue;  // 主A持有者身份是明的
    return p.playerId;
  }
  return null;
}

// 观察者视角下, targetId 是敌是友
function campOf(state, viewerId, targetId) {
  if (!state || !viewerId || !targetId) return 'UNKNOWN';
  if (viewerId === targetId) return 'SELF';
  // [2026-11-08 23:36 用户] 真人**手动标的**敌友最优先(他标了敌 -> AI 就当他是敌人, 可以用蛋子压)
  var _manual = _manualCamp(state, viewerId, targetId);
  if (_manual) return _manual;
  var mode = state.mode || '';
  var next = state['次方'];
  var holder = state['主A'] && state['主A'].establishedBy;
  // [2026-11-08 16:01 用户] 「1V4 的时候主A 默认设定其他 4 名玩家都是敌方, 现在什么也没设定」
  //   -> 1V4 **没有次方**: 主方就主A持有者一个, 其余 4 个全是抓方 -> 阵营是**确定的**, 当公开处理。
  var publicCamps = (state['次方公开'] === true) || (mode.indexOf('明打') >= 0)
    || (mode.indexOf('1V4') >= 0);
  if (publicCamps) {
    var main = state['主方'] || [];
    var taker = state['抓方'] || [];
    var aMain = main.indexOf(targetId) >= 0, vMain = main.indexOf(viewerId) >= 0;
    var aTaker = taker.indexOf(targetId) >= 0, vTaker = taker.indexOf(viewerId) >= 0;
    if ((aMain && vMain) || (aTaker && vTaker)) return 'ALLY';
    return 'ENEMY';
  }
  // 我是次方 -> 主方两口子: 主A持有者是队友, 其余都是敌人
  if (next && next === viewerId) {
    if (holder && targetId === holder) return 'ALLY';
    return 'ENEMY';
  }
  // 我是主A持有者 -> [2026-11-08 用户] 「暗打时主A也不知道谁是次A」
  //   -> 开局时其他人对他一律**不明**; 推定出次方之后, 那个次方是**友**(主方两口子), 其余是**敌**。
  if (holder && holder === viewerId) {
    var inferredM = inferNext(state, viewerId);
    if (inferredM) {
      if (targetId === inferredM) return 'ALLY';
      return 'ENEMY';
    }
    return 'UNKNOWN';
  }
  // 我是抓方(暗打, 次方未亮明)
  if (holder && targetId === holder) return 'ENEMY';        // 主A持有者: 身份明的敌人
  var inferred = inferNext(state, viewerId);
  if (inferred) {
    if (targetId === inferred) return 'ENEMY';              // 推定的次方: 敌人
    return 'ALLY';                                          // 裁定 A: 其余未知玩家 = 队友
  }
  return 'UNKNOWN';
}

// 真人手动标的敌友(state.uiMarks, 由 game.js 注入): 'friend'/'enemy'/null
function _manualCamp(state, viewerId, targetId) {
  // [2026-11-08 23:59] 手动标记只在「**该观察者本来就能手改**」时生效:
  //   阵营公开(次方亮明/明打)或观察者已知全部阵营 -> 一律按真实阵营, 手动标记作废。
  if (!canManualMark(state, viewerId)) return null;
  var marks = state && state.uiMarks;
  if (!marks) return null;
  var row = marks[viewerId];
  if (!row) return null;
  var m = row[targetId];
  if (m === 'friend') return 'ALLY';
  if (m === 'enemy') return 'ENEMY';
  return null;
}

// 该关系是「**确定**」还是「**推测**」:
//   确定 = 阵营公开(次方亮明/明打/1V4) 或 自己的阵营;
//   推测 = 靠「推定次方」推出来的(暗打时次方没亮明之前都是推测)。
// [2026-11-08 16:15 用户] 「暗打时的敌友标记只是推测, 等次A实际打出后需要更新敌友标志」
function campCertain(state, viewerId, targetId) {
  if (!state || !viewerId || !targetId) return false;
  if (viewerId === targetId) return true;
  var mode = state.mode || '';
  if ((state['次方公开'] === true) || (mode.indexOf('明打') >= 0)) return true;
  // [2026-11-09 用户] 「1V4暗打开局不能给抓方自动标(次方身份还没露)」
  //   -> 1V4 暗打: 只有**对主A**的关系是确定的(主A 必是敌人);
  //      抓方之间(谁可能是次方)仍是推测 -> 不自动标。
  if (mode.indexOf('1V4') >= 0) {
    var _h14 = state['主A'] && state['主A'].establishedBy;
    if (_h14 && viewerId === _h14) return true;    // 我是主A: 其他四家都是抓方 -> 确定
    if (_h14 && targetId === _h14) return true;    // 主A 是身份明的敌人 -> 确定
    return false;                                   // 抓方之间 -> 推测
  }
  var next = state['次方'];
  var holder = state['主A'] && state['主A'].establishedBy;
  if (next && next === viewerId) return true;        // 我是次方: 主A持有者是队友, 其余是抓方 -> 确定
  if (holder && holder === viewerId) return false;   // 我是主A: 暗打时不知道谁是次方 -> 推测
  if (holder && targetId === holder) return true;    // 主A持有者: 身份明的敌人 -> 确定
  return false;                                     // 其余靠推定 -> 推测
}

// [2026-11-08 22:33 用户] 谁能手动改敌友标记(按**观察者自己**的知情程度):
//   - 1V4 暗打: 主A持有者知道其他四家的身份 -> 不能改; 其余四个抓方 -> 可以改。
//   - 2V3 暗打且次方未明: 次A(次方)知道所有玩家阵营 -> 不能改; 其余人 -> 可以改。
//   - 次方身份亮明(次方公开/明打) -> 自动更新敌友标记, 所有人不能改。
function canManualMark(state, viewerId, targetId) {
  if (!state || !viewerId) return false;
  var mode = state.mode || '';
  var holder = state['主A'] && state['主A'].establishedBy;
  if (mode.indexOf('1V4') >= 0) return !(holder && holder === viewerId);
  if (state['次方公开'] === true || mode.indexOf('明打') >= 0) return false;
  var next = state['次方'];
  // [2026-11-09 用户] 「我是抓方, 还能修改主A的敌友标记」
  //   -> 抓方对**主A**的关系是确定的(主A 必是主方 = 自己的敌) -> 必须用真实关系, 不能手改。
  //      抓方之间(谁可能是次方)才需要手改。
  if (targetId && holder && targetId === holder && viewerId !== holder) return false;
  return !(next && next === viewerId);
}

module.exports = { campOf: campOf, inferNext: inferNext, campCertain: campCertain, canManualMark: canManualMark };
