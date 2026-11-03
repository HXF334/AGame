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
  // [2026-11-03 用户] 「AI也优先出对7, 不能为了出双龙或者单龙拆太多蛋子及以上牌型」
  //   规则(用户 4 个例子 + 「优先出对7」全部吻合):
  //   1) 池 = 手牌去掉 4 —— **只有 2 张以上 4 时才去掉**(4 是取牌专用 §7; 单张 4 可以进连张)
  //      (用户例子 45567 -> 出 4567, 连张里就带 4)
  //   2) 锚点 = 池里**最小**的一张; 跳过「属于蛋子及以上(3+ 同点)」的牌, 也跳过大牌(2/3/A/王/大A);
  //      全都跳过时退回最小的一张。
  //   3) 候选(必须**含锚点**):
  //      - 含锚点的**最长**连张 / 最长双龙(每种只看最长的那个, 短的**不**回头再试)
  //      - 锚点所在点数的**最大同点组**(对子 / 蛋子及以上)
  //      - 锚点单张(锚点不属于 3+ 同点组时才有; 4 不单独出, 留着取牌)
  //      含大牌(2/3/A/王/大A)的组合不起手(保护大牌)
  //   4) 「拆散」同点组(拿了组里的一部分、没拿全)的连张/双龙 -> **拆了超过 1 组就淘汰**
  //   5) 牌型阶梯: 双龙 > 单龙 > 对子 > 单张 > 蛋子及以上
  //
  //   用户例子:
  //     56777       -> 567        (连张; 只拆了 777 一组)
  //     5666778     -> 5          (5678 要拆 666 和 77 两组 -> 淘汰; 5 组不成任何牌型)
  //     45567       -> 4567       (连张; 拆的是 55 一组)
  //     556667788   -> 55667788   (双龙; 只拆了 666 一组)
  //     5555/666/77 -> 对7        (双龙/连张都要拆两组 -> 淘汰; 对7 不拆任何组)
  if (table.length === 0) {
    var _fours = hand.filter(isFour);
    var _pool = _fours.length >= 2
      ? hand.filter(function (c) { return !isFour(c); })   // 2 张以上 4 -> 留给取牌(§7)
      : hand.slice();
    if (!_pool.length) _pool = hand.slice();                // 全是 4 -> 只能出 4
    var _isBig = function (c) { return keepValue(c) >= 500; };   // 2/3/A/王/大A
    // 同点组(用来算「拆散了几组」)
    var _groups = {};
    _pool.forEach(function (c) { (_groups[c.rank] = _groups[c.rank] || []).push(c); });
    function _splitCount(cards) {
      var used = {};
      cards.forEach(function (c) { used[c.rank] = (used[c.rank] || 0) + 1; });
      var n = 0;
      for (var rk in _groups) {
        if (used[rk] && used[rk] < _groups[rk].length) n++;   // 拿了组里的一部分 = 拆散
      }
      return n;
    }
    // 锚点: 最小的一张(跳过蛋子及以上那一组 / 大牌)
    var _byPow = _pool.slice().sort(function (a, b) { return cardPowerAsc(a) - cardPowerAsc(b); });
    var _anchor = null;
    for (var i0 = 0; i0 < _byPow.length; i0++) {
      var _c0 = _byPow[i0];
      if (_groups[_c0.rank].length >= 3) continue;   // 蛋子及以上: 留给整组
      if (_isBig(_c0)) continue;                    // 大牌: 不做锚点
      _anchor = _c0; break;
    }
    if (!_anchor) _anchor = _byPow[0] || null;
    if (!_anchor) return { type: 'PASS', playerId: playerId };
    var _cands = [];
    var _combos = [];
    try { _combos = candidateCombos(_pool) || []; } catch (e) { }
    // 含锚点的最长「龙」: 连张 / 双龙 各自只取最长的那个
    var _chainBest = {};
    _combos.forEach(function (ids) {
      if (!ids || ids.length < 2) return;
      var cs = ids.map(function (id) { return hand.filter(function (x) { return x.id === id; })[0]; }).filter(Boolean);
      if (cs.length !== ids.length) return;
      if (cs.indexOf(_anchor) < 0) return;             // 必须含锚点
      var h = identifyHand(cs);
      if (!h || (h.type !== 'STRAIGHT' && h.type !== 'DOUBLE_STRAIGHT')) return;
      if (cs.some(_isBig)) return;                      // 保护大牌
      var cur = _chainBest[h.type];
      if (!cur || cs.length > cur.cards.length) _chainBest[h.type] = { ids: ids.slice(), cards: cs, type: h.type };
    });
    if (_chainBest.DOUBLE_STRAIGHT && _splitCount(_chainBest.DOUBLE_STRAIGHT.cards) <= 1) {
      _cands.push({ ids: _chainBest.DOUBLE_STRAIGHT.ids, cards: _chainBest.DOUBLE_STRAIGHT.cards, prio: 1 });
    }
    if (_chainBest.STRAIGHT && _splitCount(_chainBest.STRAIGHT.cards) <= 1) {
      _cands.push({ ids: _chainBest.STRAIGHT.ids, cards: _chainBest.STRAIGHT.cards, prio: 2 });
    }
    // 锚点所在点数的最大同点组
    var _grp = _groups[_anchor.rank] || [];
    if (_grp.length >= 2 && !_grp.some(_isBig)) {
      var _hg = identifyHand(_grp);
      if (_hg && _hg.type !== 'INVALID') {
        _cands.push({ ids: _grp.map(function (c) { return c.id; }), cards: _grp,
                      prio: _hg.type === 'PAIR' ? 3 : 5 });
      }
    }
    // 锚点单张(属于 3+ 同点组时那一组已整组出; 4 不单独出, 留着取牌)
    if (_grp.length < 3 && !_isBig(_anchor) && !isFour(_anchor)) {
      _cands.push({ ids: [_anchor.id], cards: [_anchor], prio: 4 });
    }
    if (_cands.length) {
      var _best = null;
      _cands.forEach(function (c) { if (!_best || c.prio < _best.prio) _best = c; });
      return { type: 'PLAY', playerId: playerId, cardIds: _best.ids.slice() };
    }
    // 兜底: 组不成任何牌型 -> 出最小的一张(省大牌; 4 留着取牌)
    var _safe = _pool.filter(function (c) { return !_isBig(c) && !isFour(c); });
    var _pick = (_safe.length ? _safe : _pool)
      .slice()
      .sort(function (a, b) { return cardPowerAsc(a) - cardPowerAsc(b); })[0];
    if (!_pick) return { type: 'PASS', playerId: playerId };
    return { type: 'PLAY', playerId: playerId, cardIds: [_pick.id] };
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