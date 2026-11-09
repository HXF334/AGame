// src/ai.js — §12 AI 行动选择
// 严格按 SKILL.md §12 实现
//
// 设计原则 (§12 / §14):
//   AI **不自行判定牌型合法性**。所有候选组合交由规则引擎裁决
//   (canBeat / canCapture), AI 只负责"从合法集合里挑一个"。
//   这样 AI 与真人玩家走完全同一套校验, 不存在 AI 绕过规则的路径。
//
// 策略 (第一版, 只求合法 + 不浪费大牌):
//   1. [4]取牌 优先 (§7)
//   2. 压制: 从候选组合中挑"最小可用的一手" (张数少者优先, 同张数按牌力低者优先)
//   3. 无合法行动 -> 过牌
//   4. 新一轮起手: 出安全牌 (非 2/3/A/王/大A), 保留大牌

const { identifyHand, canBeat, HAND_TYPES, POWER } = require('./hand-types.js');
const { canCapture } = require('./capture.js');
const { candidateCombos } = require('./combos.js');
// [2026-11-06 用户] 起手算法(与【提示】共用同一来源)
const leadChoice = require('./lead-choice.js');
// [2026-11-07 用户 D] 口径配置(排序键 / 「X+」牌型集合)单独一个文件: 改口径只改那里
const policy = require('./ai-policy.js');
// [2026-11-07 23:27 用户] 阵营可见性(敌/友/不明)统一走 src/camp.js —— 出牌决策读这个标记
const camp = require('./camp.js');

// 牌的"保留价值"(越大越该留着)。仅用于 AI 排序, 不参与任何合法性判断。
function keepValue(c) {
  if (c.isBigJoker) return 1000;
  if (c.isSmallJoker) return 900;
  if (c.is主方大A) return 800;
  if (c.rank === 3) return 700;
  if (c.rank === 2) return 600;
  if (c.rank === 14) return 500;
  if (c.rank === 4) return 50;   // 4 有取牌用途, 轻度保留
  return (c.rank || 0) * 10;
}

// [2026-11-07 用户 C] 决策日志用: 把排序键压成一行短文本
function _keyText(pick) {
  return policy.SORT_KEYS.map(function (k) {
    return (policy.SORT_KEY_LABELS[k] || k) + (pick[k] === undefined ? '' : pick[k]);
  }).join(' ');
}

// 单张出牌顺序 (§6.2: 4 < 5 < ... < K), 供起手选安全牌
function cardPowerAsc(c) {
  if (c.isBigJoker) return 180;
  if (c.isSmallJoker) return 170;
  if (c.rank === 3) return 160;
  if (c.rank === 2) return 150;
  if (c.rank === 14) return 140;
  return c.rank || 0;
}
function isFour(c) { return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker; }

// [2026-11-07 用户 C] 最近一次 AI 决策轨迹(候选集 + 排序键), 供 game.js 打日志
var _lastTrace = null;
var _lastCandidates = [];   // [2026-11-08] 最近一次 chooseAction 排好序的候选

// [2026-11-07 21:47 用户] 「蛋子+」牌型集合(用户把原来的「大蛋子+」改名为「蛋子+」):
//   蛋子级别的大组: 大蛋子/真七/真八/连珠蛋/大连珠蛋/假八/大假八/双龙, 外加双大A。
// [2026-11-07 22:26 用户 B] 「蛋子+」= 蛋子及以上; 「大蛋子+」= 大蛋子及以上 —— 定义在 src/ai-policy.js
var EGG_PLUS_TYPES = policy.EGG_PLUS;

// [2026-11-07 21:47 用户] 暗打时的「推定次方」:
//   「身份未明的人」对「另一个身份未明的人」打出蛋子+ -> 其他抓方默认把他标记为次A(本局有效),
//   于是对他可以出任何牌压制(蛋子+ 也在内)。
//   次方本人知道自己的阵营 -> 他可以出任何牌压制其他抓方玩家(见 _campUncertain)。
// [2026-11-07 23:27 用户] 「推定次方」也归 src/camp.js 管(公开信息推导)
function _inferredNext(state, viewerId) {
  return camp.inferNext(state, viewerId);
}

// 同阵营判定(§9/§10) —— **只用公开信息**, 不用引擎给的**真阵营表**。
// [2026-11-06 用户] 「AI 大牌不压制同阵营」指的是**已经公开**的同阵营:
//   - 主方 = 主A 持有者 + (次方公开/亮明时) 次方;
//   - 次方**本人**知道自己是次方 -> 也算主方(所以次方不会去压主A);
//   - 次方未亮明时, **抓方不知道谁是次方** -> 不能拿暗地里的真阵营把次方当队友,
//     否则抓方会对真正的次方(队友)不敢出王/大A/蛋子;
//   - 次方未亮明且自己不是次方时, 其余人的阵营**不明** -> 一律当"可能的对手", 允许压制。
// [2026-11-07 00:19 用户] 「在次方身份未明时抓方不出大蛋子+牌型压制身份未明的其他成员」
//   -> 次方未亮明时, 抓方视角下**别人的阵营不明**(可能是队友), 对这种人不能用大蛋子+。
//   返回 true = 阵营不明(慎用大蛋子+)。
// [2026-11-07 23:27 用户] 敌/友标记唯一来源 src/camp.js:
//   a = 桌上那人, b = 观察者(AI)。UNKNOWN = 阵营不明 -> 慎用蛋子+; ENEMY/ALLY = 已知 -> 不受限。
function _campUncertain(state, a, b) {
  if (!state || !a || !b) return false;
  // [2026-11-08 22:05 用户] 「主A在次方身份未明时可以出任意牌压任何人, 没有限制,
  //   只有抓方才考虑是否同阵营」-> 主A持有者不受「阵营不明」的蛋子+限制。
  var _holderV = state['主A'] && state['主A'].establishedBy;
  if (_holderV && _holderV === b) return false;
  return camp.campOf(state, b, a) === 'UNKNOWN';
}

// [2026-11-07 23:27 用户] 同阵营 = 敌友标记里的 ALLY(队友)
function _isSameCamp(state, a, b) {
  if (!state || !a || !b || a === b) return false;
  return camp.campOf(state, b, a) === 'ALLY';
}


// AI 选择行动: { type: 'PLAY' | 'PASS' | 'CHOOSE_IDENTITY', playerId, cardIds? / choice? }
// opts.ignoreCamp: [2026-11-08 22:40 用户] 「点提示时...只看手中符合条件的牌」->
//   提示用同一套选牌逻辑, 但**不考虑阵营**(不做同阵营/蛋子+ 的过滤)。
// opts.ignoreSplit: [2026-11-08 23:36 用户] 「提示也放开拆组」-> 提示用同一套排序, 但不罚拆组
// ===== [2026-11-09 用户] 拆组口径: 提示 / 托管 共用同一套判定 =====
// 「同点数家族牌型(对子/蛋子/大蛋子/真七/真八)不许拆组」;
// 「组合牌型(龙/双龙/连珠蛋/假八...)可以拆, 但拆 >=2 组 或 把某组拆到剩不到 3 张 -> 罚」。
// 提示候选池直接复用这里的判定 -> 提示 = 托管 口径一致。
var SAME_RANK_FAMILY = { PAIR: 1, TRIPLE: 1, BIG_TRIPLE: 1, TRUE_SEVEN: 1, TRUE_EIGHT: 1 };

function handGroups(hand) {
  var g = {};
  (hand || []).forEach(function (c) { (g[c.rank] = g[c.rank] || []).push(c); });
  return g;
}

// 同点数家族牌型拆了手里的同点组 -> true(禁)
function splitsSameRankGroup(cards, type, hand) {
  if (!SAME_RANK_FAMILY[type]) return false;
  var groups = handGroups(hand);
  var used = {};
  (cards || []).forEach(function (c) { used[c.rank] = (used[c.rank] || 0) + 1; });
  for (var rk in groups) {
    var total = groups[rk].length;
    var u = used[rk] || 0;
    if (u && u < total) return true;
  }
  return false;
}

// 组合牌型拆组罚分: 拆了 >=2 组, 或把某组拆到剩不到 3 张
function splitEggCount(cards, hand) {
  if (!cards || cards.length < 2) return 0;          // 单张拆组 -> 不罚
  var groups = handGroups(hand);
  var used = {};
  cards.forEach(function (c) { used[c.rank] = (used[c.rank] || 0) + 1; });
  var n = 0, touched = 0;
  for (var rk in groups) {
    var total = groups[rk].length;
    var u = used[rk] || 0;
    if (!u || u >= total) continue;                 // 没动 / 整组用掉 -> 不是拆
    touched++;
    if (total - u < 3) n++;                        // 该组被拆垮(剩不到 3 张) -> 罚
  }
  if (touched >= 2) n++;                            // 拆了 >=2 组 -> 罚
  return n;
}

// 这手牌按「托管」的拆组口径是否被禁掉
function splitsRejected(cards, type, hand) {
  if (splitsSameRankGroup(cards, type, hand)) return true;
  // [2026-11-09 用户] 「上家出456, 我有5677, 点提示为什么不出567」/「556677 vs JJQQQQKK 点不到JJQQKK」

  //   -> 组合牌型拆组只是**罚**(排序靠后), 不是禁止 -> 这里只禁「同点数家族牌型拆组」。
  return false;
  return false;
}
// 组合牌型拆组的罚分(拆 >=2 组, 或把某组拆到剩不到 3 张): 越大越靠后, 但**不禁用**
function splitPenalty(cards, hand) {
  return splitEggCount(cards, hand);
}

function chooseAction(state, playerId, opts) {
  opts = opts || {};
  // [2026-11-07 用户 C] AI 决策日志: 记下候选集 + 排序键, 目视报障时直接看「为什么选这手」
  var _trace = { playerId: playerId, action: null, tableType: null, tableCount: 0,
                 camp: null, candidates: [], chosen: null, note: '' };
  function _done(action) { _trace.action = action.type; _lastTrace = _trace; return action; }
  // [A2 fix] state 或 players 缺失时安全返回 PASS (不 crash)
  if (!state || !state.players || !Array.isArray(state.players)) {
    return _done({ type: 'PASS', playerId: playerId });
  }
  // §12: IDENTITY_CHOICE 阶段 AI 选 HIDDEN (隐藏身份, 避免暴露)
  if (state.phase === 'IDENTITY_CHOICE') {
    return _done({ type: 'CHOOSE_IDENTITY', playerId: playerId, choice: 'HIDDEN' });
  }

  var player = state.players.find(function (p) { return p.id === playerId; });
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    // 手牌空 (推风场景应由引擎处理推风) -> 安全过牌
    return _done({ type: 'PASS', playerId: playerId });
  }

  var hand = player.hand;
  var table = Array.isArray(state.table) ? state.table : [];
  var currentHand = table.length > 0 ? identifyHand(table) : null;
  _trace.tableType = currentHand ? currentHand.type : null;
  _trace.tableCount = table.length;

  // ================= 新一轮起手 (§5) =================
  // [2026-11-06 用户] 「看最小的牌能组龙就出龙，能出对子就出对子，组不了就出单。」
  //   「锚点能组龙包括双龙。」/「蛋子及以上排最后。」/「起手时 ≥2 张 4 全部排除出池」
  //   -> 逻辑抽到 src/lead-choice.js(与【提示】共用同一来源, 避免两处算法漂移)
  //   用户例子: 王322kkk->22 / 55567->567 / 45567->4567 / 5666778->5
  if (table.length === 0) {
    var _lead = leadChoice.pickLead(hand);
    if (_lead) {
      _trace.note = '起手(lead-choice)';
      _trace.chosen = { type: identifyHand(_lead.cards).type, count: _lead.cards.length,
        ranks: _lead.cards.map(function (c) { return c.rank; }).join(','), keyText: '' };
      return _done({ type: 'PLAY', playerId: playerId,
               cardIds: _lead.cards.map(function (c) { return c.id; }) });
    }
    // 兜底: 组不成任何牌型 -> 出最小的一张(省大牌; 4 留着取牌)
    var _safe = hand.filter(function (c) { return !isFour(c) && keepValue(c) < 500; });
    var _pick = (_safe.length ? _safe : hand)
      .slice()
      .sort(function (a, b) { return cardPowerAsc(a) - cardPowerAsc(b); })[0];
    if (!_pick) return _done({ type: 'PASS', playerId: playerId });
    _trace.note = '起手兜底(单张)';
    return _done({ type: 'PLAY', playerId: playerId, cardIds: [_pick.id] });
  }
  // ================= 1. [4]取牌 优先 (§7) =================
  // [2026-11-06 用户] 4 与取牌:
  //   「取 N 张目标用 N-1 张 4」(§7.1; 用户纠正: 取3张目标要2张4)
  //   「拆4后剩余4最少两个」-> 手上4 减去用掉的, 至少留 2 张
  //   「也避让, 不取同阵营的蛋子」
  var fours = hand.filter(isFour);
  var _sameCampTable = _isSameCamp(state, state && state.lastPlayer, playerId);
  var _need = table.length - 1;              // §7.1: N 张目标用 N-1 张 4
  var _capSubset = null;
  // [2026-11-06 用户] 取牌优先度**靠前**, 但**不能拆散 4 组**:
  //   手牌 33344  + 别人出 222 -> 4 只有 2 张(不是蛋子), 取 2 张=整组 -> 取牌;
  //   手牌 333444 + 别人出 222 -> 4 是 444(蛋子), 取 2 张会拆散它 -> **不取**, 改出 333;
  //   手牌 444    + 别人出 5555 -> 取 3 张=整组 -> 取牌 (§7.1: 取 N 张用 N-1 张 4)。
  // [2026-11-07 23:22 用户] 「44 可以取同阵营的牌, 三个 4 及以上的 4 不取同阵营的牌」
  //   -> 同阵营取牌: 只允许用 2 张 4(去取 3 张目标); 需要 3 张及以上 4 时不取同阵营的牌。
  var _sameCampCapOk = (_need <= 2);
  if ((opts.ignoreCamp || !_sameCampTable || _sameCampCapOk) && _need >= 2 && _need <= 8 && table.length >= 3 && table.length <= 8
      && fours.length >= _need) {
    var _g4 = fours.length;
    var _wholeGroup = (_g4 === _need);         // 整组用掉 -> 不拆散
    var _tinyGroup = (_g4 < 3);                // 4 组不足 3 张 -> 不是蛋子, 用掉不拆牌型
    // [2026-11-08 16:03 用户] 「手牌有 4444, 现在为什么也不会拆成 44 取牌了? 拆完 44 还剩两个 4 是可以的」
    //   -> 拆 4 组只要**还剩 >=2 张 4**就允许(老规矩: 拆 4 后至少留 2 张)。
    //      4 张 4 取 3 张目标 -> 剩 1 张 -> 不允许; 取 2 张 -> 剩 2 张 -> 允许。
    var _keepOk = (_g4 - _need >= 2);
    if (_wholeGroup || _tinyGroup || _keepOk) {
      var _sub = fours.slice(0, _need);
      if (canCapture(_sub, table).canCapture) _capSubset = _sub;
    }
  }
  // ================= 2. 压制: 候选组合交引擎裁决 =================
  // [2026-11-06 用户] 压制时的挑牌顺序:
  //   「优先用单独的同类型牌压制, 而不是直接出其他牌型或者拆其他牌」
  //   「王, 大A, 蛋子及以上牌型不主动压制同阵营的玩家」
  //   「独打的时候双大A尽量一起出, 不要和其他牌混出」
  //   「单4优先出, 两个以上的4尽量不要单出」
  //   例: 手牌 王322kkk, 别人出A -> 出3(同类型/不拆组/保留价值低)
  //
  // candidateCombos 覆盖 对子/蛋子/大蛋子/真七/真八/连张/双龙 等;
  // 单张不在其中, 需单独补 (1 张不属于任何组合枚举)
  var cands = candidateCombos(hand).slice();
  hand.forEach(function (c) { cands.push([c.id]); });
  // 1V4 独打: 手上有两张同花色主方大A -> 候选里加「双大A」整手
  var _bigAs = hand.filter(function (c) { return c.is主方大A && c.rank === 14; });
  var _hasDoubleA = false;
  if (_bigAs.length === 2 && _bigAs[0].suit === _bigAs[1].suit) {
    _hasDoubleA = true;
    cands.push([_bigAs[0].id, _bigAs[1].id]);
  }
  // [2026-11-06 用户] 大A 与王都是**成组**的, 不能拆开打, 也不能和别的牌混打:
  //   - 双大A(两张同花色主A): 要么两张**一起出**(且不带别的牌), 要么一张都不出
  //     (用户 2026-11-06 报障: AI 打出 ♣A♣A♠A -> 正常是双大A一起出, 不和其他A一起出)
  //   - 双王(大王+小王): 要么两个**一起出**, 要么都不出(不拆开出单王)
  var _bigAIds = hand.filter(function (c) { return !!c.is主方大A; }).map(function (c) { return c.id; });
  var _jokerIds = hand.filter(function (c) { return c.isBigJoker || c.isSmallJoker; }).map(function (c) { return c.id; });
  // [2026-11-06 用户] 「多个王拆开出了」-> 把「双王」整手加进候选
  //   (candidateCombos 不枚举王对; 不加的话 AI 只能拆开出单王 -> 违反「不拆王」)
  if (_jokerIds.length === 2) cands.push([_jokerIds[0], _jokerIds[1]]);
  function _cntGroup(ids, comboCards) {
    return comboCards.filter(function (c) { return ids.indexOf(c.id) >= 0; }).length;
  }
  var byId = {};
  hand.forEach(function (c) { byId[c.id] = c; });
  var uniq = {};
  var dedup = [];
  cands.forEach(function (c) {
    var key = c.slice().sort().join('|');
    if (!uniq[key]) { uniq[key] = true; dedup.push(c); }
  });
  // 手牌里的同点组(判断「拆其他牌」)
  var _hgroups = {};
  hand.forEach(function (c) { (_hgroups[c.rank] = _hgroups[c.rank] || []).push(c); });
  function _splitCount(cards) {
    var used = {};
    cards.forEach(function (c) { used[c.rank] = (used[c.rank] || 0) + 1; });
    var n = 0;
    for (var rk in _hgroups) {
      if (used[rk] && used[rk] < _hgroups[rk].length) n++;   // 拿了组里的一部分 = 拆牌
    }
    return n;
  }
  // [2026-11-08 13:59 用户] 「正常拆组只针对组合牌型(龙/双龙/连珠蛋/假八等),
  //   同点数的牌尽量不拆(对子/蛋子/大蛋子/真七/真八等)」
  //   两条罚则:
  //   (1) **同点数家族**的候选(对子/蛋子/大蛋子/真七/真八)部分用了手里的同点组 -> 罚。
  //       例: 手里 333 出了 33 -> 罚(用户 13:59 报障); 手里 22222 出了 222 -> 罚; 4444 出 44 -> 罚。
  //       单张拆组**不罚**(手里 66 出 6 仍然正常, 否则会出现没牌可出)。
  //   (2) **组合牌型**(龙/双龙/连珠蛋/假八...)拆了 >=2 个同点组 -> 罚。
  //       例: QQKKKKA 不能出 QKA(动了 QQ + KKKKK); QKKKKA 可以出 QKA(只动了 KKKKK)。
  var _sameRankFamily = { PAIR: 1, TRIPLE: 1, BIG_TRIPLE: 1, TRUE_SEVEN: 1, TRUE_EIGHT: 1 };
  // [2026-11-08 13:59 用户] 「同点数的牌尽量不拆(对子/蛋子/大蛋子/真七/真八)」
  //   -> 同点数家族的候选只要**拆了**手里的同点组, 就**不进候选**(硬过滤):
  //      例: 手里 333, 桌面 22 -> 不许出 33(拆蛋子), 只能出 333 整组或者过牌。
  //      单张拆组不罚(手里 66 出 6 正常, 否则会出现没牌可出)。
  function _splitsSameRankGroup(cards, type) { return splitsSameRankGroup(cards, type, hand); }
  // (2) 组合牌型(龙/双龙/连珠蛋/假八...)拆组 -> 罚(排序降权)
  //   [2026-11-08 16:20 用户] 「上出 5678, 手牌有 67888899, 为什么会出 6789」-> 两条:
  //     a. 拆了 >=2 个同点组 -> 罚(QKKKKA 可以出 QKA, 只动一组; QQKKKKA 不行, 动了两组)
  //     b. 把某个同点组**拆到剩不到 3 张**(对子被拆成单张 / 大蛋子被拆成对子) -> 罚
  //        (6789 拿走 99 里的一张 -> 那个对子没了; 8888 拿走一张 -> 剩 888 仍是蛋子, 不罚)
  //   单张拆组仍然不罚(手里 66 出 6 正常, 否则会出现没牌可出)。
  function _splitEggCount(cards) { return splitEggCount(cards, hand); }
  // 「重手」: 王 / 大A / 蛋子及以上 -> 同阵营时不主动用
  function _isHeavy(cards, type) {
    // [2026-11-07 22:26 用户 B] 「蛋子及以上」= policy.EGG_PLUS(含双龙)
    if (policy.EGG_PLUS[type]) return true;
    return cards.some(function (c) {
      return c.isBigJoker || c.isSmallJoker || c.is主方大A;
    });
  }
  // [2026-11-09 用户] 牌力等级(§6.3): 数字小 = 牌力弱 -> 弱牌先出(别浪费大牌)
  //   例: 手牌「双王 + 真七(9999999)」-> 先出双王(§6.3: 双王 < 假八 < 真七)。
  function _powerOf(cards, type) {
    var p = (policy.POWER_RANK[type] || 0) * 10;
    // 含大A(不是双大A)的牌: 当最后手段(大A 混进组合就不算大A, 但牌本身很重)
    if (type !== HAND_TYPES.DOUBLE_BIG_A && cards.some(function (c) { return !!c.is主方大A; })) p += 500;
    return p;
  }

  // [2026-11-06 23:54 用户] 优先度要按**实际牌力**排, 不能只按张数/点数:
  //   - topType: 双大A(最大牌型)/双王/三王/四王, 以及任何**含大A**的牌 -> 优先度**最后**(最后手段)
  //   - bigGroup: 大组牌型(大蛋子/真七/真八/连珠蛋/大连珠蛋/假八/大假八/双龙) -> 靠后,
  //     但排在「不拆同点组」之后(拆开假八能管上时, 别直接出整个假八)
  // [2026-11-07 22:26 用户 B] 「蛋子+」= 蛋子及以上(含双龙/大蛋子/王/双大A), 集合见 src/ai-policy.js
  // [2026-11-07 00:19] 阵营不明时不能用大蛋子+ 去压
  var _uncertain = _campUncertain(state, state && state.lastPlayer, playerId);
  var _bigGroupTypes = {
    BIG_TRIPLE: 1, TRUE_SEVEN: 1, TRUE_EIGHT: 1, STRAIGHT_TRIPLE: 1,
    BIG_STRAIGHT_TRIPLE: 1, FAKE_EIGHT: 1, BIG_FAKE_EIGHT: 1, DOUBLE_STRAIGHT: 1
  };
  var _sameCamp = _isSameCamp(state, state && state.lastPlayer, playerId);
  // [2026-11-07 用户 C] 决策日志用: 阵营三态(公开/推定/不明)
  _trace.camp = {
    uncertain: _uncertain,
    sameCamp: _sameCamp,
    inferred: _inferredNext(state, playerId)
  };
  var _mode = (state && state.mode) || '';
  var _solo = _mode.indexOf('1V4') === 0;      // 1V4 独打
  var _picks = [];
  dedup.forEach(function (combo) {
    var comboCards = combo.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!comboCards.length) return;
    var h = identifyHand(comboCards);
    if (!h || h.type === 'INVALID') return;
    if (!canBeat(h, currentHand)) return;
    var _nBig = comboCards.filter(function (c) { return c.is主方大A; }).length;
    // 双大A: 不许拆开(出一张留一张), 也不许和别的牌(含另一张普通A)混出
    if (_bigAIds.length >= 2) {
      var _inBig = _cntGroup(_bigAIds, comboCards);
      if (_inBig > 0 && (_inBig < _bigAIds.length || comboCards.length > _bigAIds.length)) return;
    }
    // 双王: 不许拆开出单王
    if (_jokerIds.length >= 2) {
      var _inJk = _cntGroup(_jokerIds, comboCards);
      if (_inJk > 0 && _inJk < _jokerIds.length) return;
    }
    // [2026-11-06 23:54 用户] 「单张大A不加在龙里出, 单张普通A可以加在龙里出」
    if ((h.type === HAND_TYPES.STRAIGHT || h.type === HAND_TYPES.DOUBLE_STRAIGHT) &&
        comboCards.some(function (c) { return !!c.is主方大A; })) return;
    // [2026-11-07 00:19 用户] 阵营不明(次方未亮明)时, 不用大蛋子+ 去压
    if (!opts.ignoreCamp && _uncertain && policy.EGG_PLUS[h.type]) return;
    // [2026-11-08 13:59 用户] 同点数的牌不拆: 拆了同点组的对子/蛋子/大蛋子/真七/真八 不进候选
    if (!opts.ignoreSplit && _splitsSameRankGroup(comboCards, h.type)) return;
    // [2026-11-08 16:20 用户] 「上出 5678, 手牌有 67888899, 为什么会出 6789」-> 组合牌型拆组也不进候选:
    //   6789 拿走 99 里的一张 -> 那个对子被拆垮; 而整组的 8888 被「阵营不明不用蛋子+」挡住
    //   -> 两条规则叠起来的结果就是**过牌**(而不是拆组去拼一条龙)。
    //   双大A(两张同花色主A)是**特殊无敌牌型**, 不按拆组论(手里 3 张 A 时出双大A 是正常的)。
    if (!opts.ignoreSplit && _splitEggCount(comboCards) > 0 && h.type !== HAND_TYPES.DOUBLE_BIG_A) return;
    // 同阵营: 不用 王/大A/蛋子及以上 去压
    //   [2026-11-07 23:22 用户] 「如果本次手牌打出后就全部出完, 则队友的牌也要跟」
    //   -> 这手能一次出完(马上走完)时, 连队友的牌也压。
    var _willEmpty = (comboCards.length === hand.length);
    if (!opts.ignoreCamp && _sameCamp && _isHeavy(comboCards, h.type) && !_willEmpty) return;
    var _pick = {
      cards: comboCards,
      type: h.type,
      sameType: (currentHand && h.type === currentHand.type) ? 0 : 1,   // 同类型优先
      // [2026-11-06 23:54] 双大A/双王/大A 单张 -> 优先度最后; 大组 -> 靠后
      // [2026-11-09 用户] 「不能固定把双王优先级放在靠后, 要判断牌力大小, 三王四王也是同样的问题」
      //   -> §6.3 牌力等级(数字小 = 弱): 双王 70 < 连珠蛋 80 < 假八 90 < 真七 100 < 真八 110
      //      < 三王 120 < 大连珠蛋 130 < 大假八 140 < 四王 150 < 双大A 160。
      //      含大A(不是双大A)的牌仍是最后手段(大A 不与别的牌混出, 见上面的硬规则)。
      power: _powerOf(comboCards, h.type),
      bigGroup: _bigGroupTypes[h.type] ? 1 : 0,                        // 大组牌型当最后手段
      split: _splitCount(comboCards),                                  // 不拆牌优先
      // [2026-11-07 21:47] 不拆蛋子级同点组(手里 22222 不该拆出 222)
      splitEgg: opts.ignoreSplit ? 0 : _splitEggCount(comboCards),
      // [2026-11-06 用户] 「4 当作蛋子及以上牌型出的时候, 优先度靠后」
      //   (必须出蛋子时, 手上有 444 和别的蛋子 -> 优先出别的蛋子)
      fourEgg: (comboCards.length >= 3 && comboCards.every(function (c) {
        return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker;
      })) ? 1 : 0,
      kv: Math.max.apply(null, comboCards.map(keepValue)),
      len: comboCards.length
    };
    _picks.push(_pick);
    _trace.candidates.push({
      type: _pick.type, count: _pick.cards.length,
      ranks: _pick.cards.map(function (c) { return c.rank; }).join(','),
      keyText: _keyText(_pick)
    });
  });
  // [2026-11-07 22:26 用户 D] 排序键顺序外置到 src/ai-policy.js 的 SORT_KEYS
  //   (顺序即优先级; 不拆组 > 同类型优先, 见裁定 E)。改口径只改那个文件。
  _picks.sort(policy.comparePicks);
  // [2026-11-08 22:40] 把排好序的候选暴露出去(提示按同一顺序列候选)
  _lastCandidates = _picks.slice();
  // [2026-11-07 用户 C] 决定键: 选中的这手和「第二名」在哪个键上分出胜负
  if (_picks.length >= 2) {
    for (var _di = 0; _di < policy.SORT_KEYS.length; _di++) {
      var _dk2 = policy.SORT_KEYS[_di];
      if (_picks[0][_dk2] !== _picks[1][_dk2]) { _trace.decidingKey = policy.SORT_KEY_LABELS[_dk2] || _dk2; break; }
    }
  }
  // [2026-11-06 用户] 「4 用来取牌时, 优先度靠前」-> 取牌排在普通压制之前
  //   (手牌 33344 + 别人出 222 -> 直接用 4 取, 不出 333)
  if (_capSubset) {
    _trace.note = '用4取牌';
    return _done({ type: 'PLAY', playerId: playerId,
             cardIds: _capSubset.map(function (c) { return c.id; }) });
  }
  if (_picks.length) {
    _trace.chosen = { type: _picks[0].type, count: _picks[0].cards.length,
      ranks: _picks[0].cards.map(function (c) { return c.rank; }).join(','),
      keyText: _keyText(_picks[0]) };
    _trace.note = _trace.note || '压制';
    return _done({ type: 'PLAY', playerId: playerId,
             cardIds: _picks[0].cards.map(function (c) { return c.id; }) });
  }
  // ================= 3. 无合法行动 -> 过牌 =================
  _trace.note = '无合法行动';
  return _done({ type: 'PASS', playerId: playerId });
}

module.exports = {
  // [2026-11-09 用户] 提示与托管共用的拆组判定
  splitsRejected: splitsRejected,
  splitPenalty: splitPenalty,
  chooseAction: chooseAction,
  // [2026-11-07 用户 C] 最近一次决策轨迹(候选集 + 排序键 + 阵营三态)
  getLastTrace: function () { return _lastTrace; },
  // [2026-11-08] 排好序的候选(提示用同一套顺序)
  getLastCandidates: function () { return _lastCandidates; }
};