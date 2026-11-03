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

const { identifyHand, canBeat } = require('./hand-types.js');
const { canCapture } = require('./capture.js');
const { candidateCombos } = require('./combos.js');

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

// AI 选择行动: { type: 'PLAY' | 'PASS' | 'CHOOSE_IDENTITY', playerId, cardIds? / choice? }
function chooseAction(state, playerId) {
  // [A2 fix] state 或 players 缺失时安全返回 PASS (不 crash)
  if (!state || !state.players || !Array.isArray(state.players)) {
    return { type: 'PASS', playerId: playerId };
  }
  // §12: IDENTITY_CHOICE 阶段 AI 选 HIDDEN (隐藏身份, 避免暴露)
  if (state.phase === 'IDENTITY_CHOICE') {
    return { type: 'CHOOSE_IDENTITY', playerId: playerId, choice: 'HIDDEN' };
  }

  var player = state.players.find(function (p) { return p.id === playerId; });
  if (!player || !Array.isArray(player.hand) || player.hand.length === 0) {
    // 手牌空 (推风场景应由引擎处理推风) -> 安全过牌
    return { type: 'PASS', playerId: playerId };
  }

  var hand = player.hand;
  var table = Array.isArray(state.table) ? state.table : [];
  var currentHand = table.length > 0 ? identifyHand(table) : null;

  // ================= 新一轮起手 (§5) =================
  // [2026-11-03 用户] 「池空才兜底出安全单张, 这个理解也不对。
  //   最小的牌能组成什么就出什么, 组成龙就出龙, 组成对子就出对子, 什么也组不成出单张。
  //   双龙 > 单龙 > 对子 > 单张 > 蛋子及以上牌型。
  //   如果最小的 4 组成两个及以上的 4, 就不优先出 4。」
  // 实现:
  //   1) 起手池 = 手牌去掉 4(4 是取牌专用 §7; 有 2 张以上 4 更是绝对不碰);
  //   2) 组合候选 = 引擎枚举出的组合; 同点数**只留最大的一组**(4 张 5 不拆成 55/555);
  //      含 2/3/A/王/大A 的组合不起手(保护大牌, 沿用旧行为);
  //   3) 按牌型阶梯挑: 双龙 > 单龙 > 对子 > 蛋子及以上; 同级比牌力(小的先);
  //   4) 一个组合都组不成时 -> 才出单张(同点数只留一张, 且优先省大牌)。
  if (table.length === 0) {
    var _fours = hand.filter(isFour);
    var _pool = _fours.length === hand.length
      ? hand.slice()                                   // 全是 4 -> 只能出 4
      : hand.filter(function (c) { return !isFour(c); });
    var _cardsOf = function (ids) {
      return ids.map(function (id) { return hand.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
    };
    var _leadPrio = function (t) {
      if (t === 'DOUBLE_STRAIGHT') return 1;   // 双龙
      if (t === 'STRAIGHT') return 2;          // 单龙
      if (t === 'PAIR') return 3;              // 对子
      if (t === 'SINGLE') return 4;            // 单张
      return 5;                                // 蛋子及以上(蛋子/大蛋子/真七/真八/连珠蛋/假八/双大A…)
    };
    var _leadCands = [], _rankBest = {};
    try {
      (candidateCombos(_pool) || []).forEach(function (ids) {
        if (!ids || ids.length < 2) return;
        var cs = _cardsOf(ids);
        if (cs.length !== ids.length) return;
        var h = identifyHand(cs);
        if (!h || h.type === 'INVALID') return;
        if (cs.some(function (c) { return keepValue(c) >= 500; })) return;   // 保护大牌
        var cand = { ids: ids.slice(), cards: cs, type: h.type };
        var same = cs.every(function (c) { return c.rank === cs[0].rank; });
        if (same) {
          var rk = cs[0].rank;
          if (!_rankBest[rk] || ids.length > _rankBest[rk].ids.length) _rankBest[rk] = cand;
        } else {
          _leadCands.push(cand);
        }
      });
    } catch (e) { }
    Object.keys(_rankBest).forEach(function (rk) { _leadCands.push(_rankBest[rk]); });
    if (_leadCands.length > 0) {
      var _sortedLeads = _leadCands.slice().sort(function (a, b) {
        var pa = _leadPrio(a.type), pb = _leadPrio(b.type);
        if (pa !== pb) return pa - pb;
        var wa = Math.min.apply(null, a.cards.map(cardPowerAsc));
        var wb = Math.min.apply(null, b.cards.map(cardPowerAsc));
        if (wa !== wb) return wa - wb;
        return a.cards.length - b.cards.length;
      });
      var best = _sortedLeads[0];
      return { type: 'PLAY', playerId: playerId, cardIds: best.ids.slice() };
    }
    // 什么也组不成 -> 出单张(同点数只留一张; 省大牌: 优先不出 2/3/A/王/大A)
    var _singleSeen = {};
    var _singles = _pool.filter(function (c) {
      var k = (c.isBigJoker ? 'BJ' : c.isSmallJoker ? 'SJ' : 'R' + c.rank);
      if (_singleSeen[k]) return false;
      _singleSeen[k] = 1;
      return true;
    });
    var _safe = _singles.filter(function (c) { return keepValue(c) < 500; });
    var openCard = (_safe.length > 0 ? _safe : _singles)
      .slice()
      .sort(function (a, b) { return cardPowerAsc(a) - cardPowerAsc(b); })[0];
    if (!openCard) return { type: 'PASS', playerId: playerId };
    return { type: 'PLAY', playerId: playerId, cardIds: [openCard.id] };
  }

  // ================= 1. [4]取牌 优先 (§7) =================
  var fours = hand.filter(isFour);
  for (var n = 2; n <= fours.length && n <= 8; n++) {
    var subset = fours.slice(0, n);
    if (canCapture(subset, table).canCapture) {
      return { type: 'PLAY', playerId: playerId, cardIds: subset.map(function (c) { return c.id; }) };
    }
  }

  // ================= 2. 压制: 候选组合交引擎裁决 =================
  // candidateCombos 覆盖 对子/蛋子/大蛋子/真七/真八/连张/双龙 等;
  // 单张不在其中, 需单独补 (1 张不属于任何组合枚举)。
  // candidateCombos 只产出 2 张及以上的组合; 单张需单独补入
  var cands = candidateCombos(hand).slice();
  hand.forEach(function (c) { cands.push([c.id]); });

  // 排序策略**分场景** (2026-10-21 用户 IDE 报障后修正):
  //
  //   跟牌 (table 非空): 必须选【能压过桌面的最小手牌】。
  //     原实现一律"张数多者优先", 导致 AI 在桌上有对4 时直接甩 2222 —— 虽然
  //     2222 确实压得过对4, 但把 2 全打光极不划算, 而对7 同样能压且保留大A/2。
  //     用户原话: "2222 确实比对4大, 但也应该从合适的手牌中由小往大出"。
  //
  //   首出 (table 为空): 保持"张数多者优先"。
  //     这是当初把 AI 从"16种牌型只出单张"救到 9/16 覆盖的关键策略;
  //     若一并改成张数少者优先, AI 会退化成只出单张, 覆盖度崩盘。
  var byId = {};
  hand.forEach(function (c) { byId[c.id] = c; });
  var uniq = {};
  var dedup = [];
  cands.forEach(function (c) {
    var key = c.slice().sort().join('|');
    if (!uniq[key]) { uniq[key] = true; dedup.push(c); }
  });
  var following = !!(currentHand && table && table.length > 0);
  dedup.sort(function (a, b) {
    // [2026-10-21 再修] 主排序键必须是**保留价值**, 而不是张数。
    //   首版修复曾用"跟牌时张数少者优先", 结果引入了新问题:
    //     桌面是单张时, 单K(1张) 会排在 对Q(2张) 之前 -> AI 甩出单张,
    //     而手上明明有 QQQ/KKK/AAA 这类更大的组合可用 (用户 2026-10-21 实测报障)。
    //   用户的原意"由小往大出"指的是**牌的保留价值**, 不是张数:
    //     keepValue: 7=70 < K=130 < Q=120 < A=500 < 2=600 < 3=700
    //   两个场景都验证过:
    //     桌上有对4:  对7(70) 优于 2222(600)  -> 出对7  ✓ (张数与价值一致)
    //     桌面是单张:  对Q(120) 优于 单K(130)  -> 出对Q  ✓ (仅价值能区分)
    var va = Math.max.apply(null, a.map(function (id) { return keepValue(byId[id] || {}); }));
    var vb = Math.max.apply(null, b.map(function (id) { return keepValue(byId[id] || {}); }));
    if (va !== vb) return va - vb;                            // 保留价值低者优先 (主键)
    // 价值相同再按张数: 跟牌少消耗, 首出多减少
    if (a.length !== b.length) return following ? (a.length - b.length) : (b.length - a.length);
    return a[0] < b[0] ? -1 : 1;
  });

  for (var i = 0; i < dedup.length; i++) {
    var combo = dedup[i];
    var comboCards = combo.map(function (id) { return byId[id]; }).filter(Boolean);
    if (!comboCards.length) continue;
    var h = identifyHand(comboCards);
    if (h.type === 'INVALID') continue;                        // 枚举出的组合不合法, 跳过
    if (canBeat(h, currentHand)) {
      return { type: 'PLAY', playerId: playerId, cardIds: combo.slice() };
    }
  }

  // ================= 3. 无合法行动 -> 过牌 =================
  return { type: 'PASS', playerId: playerId };
}

module.exports = {
  chooseAction: chooseAction
};