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

// 同阵营判定(§9/§10) —— **只用公开信息**, 不用引擎给的**真阵营表**。
// [2026-11-06 用户] 「AI 大牌不压制同阵营」指的是**已经公开**的同阵营:
//   - 主方 = 主A 持有者 + (次方公开/亮明时) 次方;
//   - 次方**本人**知道自己是次方 -> 也算主方(所以次方不会去压主A);
//   - 次方未亮明时, **抓方不知道谁是次方** -> 不能拿暗地里的真阵营把次方当队友,
//     否则抓方会对真正的次方(队友)不敢出王/大A/蛋子;
//   - 次方未亮明且自己不是次方时, 其余人的阵营**不明** -> 一律当"可能的对手", 允许压制。
function _isSameCamp(state, a, b) {
  if (!state || !a || !b || a === b) return false;
  // [2026-11-06 用户] 「丙和甲是同阵营, 甲出666, 丙出222, 现在身份是公开的, 并不应该压制甲」
  //   -> **明打**(2V3_明打 / 1V4_明打)或次方已亮明时, 阵营是**公开**的:
  //      直接用引擎的真阵营表(同在主方 或 同在抓方 = 同阵营), 不用王/大A/蛋子去压队友。
  //      注: 引擎在 2V3_明打 时**不会**把 次方公开 置 true(见 src/transition.js 注释),
  //      约定上「明打=身份公开」—— 与 src/push-wind.js 的 次方明确、game.js 的 secondOpen 一致。
  var _mode = state['mode'] || '';
  var _mainList = state['主方'] || [];
  var _takerList = state['抓方'] || [];
  var _campsPublic = (state['次方公开'] === true) || (_mode.indexOf('明打') >= 0);
  if (_campsPublic && (_mainList.length || _takerList.length)) {
    var _aM = _mainList.indexOf(a) >= 0, _bM = _mainList.indexOf(b) >= 0;
    if (_aM && _bM) return true;                       // 都是主方
    if (_takerList.indexOf(a) >= 0 && _takerList.indexOf(b) >= 0) return true;   // 都是抓方
    return false;                                       // 不同阵营
  }
  var main = [];
  if (state['主A'] && state['主A'].establishedBy) main.push(state['主A'].establishedBy);
  var next = state['次方'];
  // 次方身份是否**已知**: 公开/亮明, 或**自己就是次方**(本人当然知道)
  var nextKnown = !!(next && (state['次方公开'] || next === b));
  if (nextKnown) main.push(next);
  var aMain = main.indexOf(a) >= 0;
  var bMain = main.indexOf(b) >= 0;
  if (aMain && bMain) return true;      // 都自认主方 -> 同阵营
  if (!nextKnown) return false;         // 次方未亮明: 阵营不明 -> 不当同阵营
  return !aMain && !bMain;              // 次方已知且是别人: 其余都是抓方 -> 同阵营
}


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
  // [2026-11-06 用户] 「看最小的牌能组龙就出龙，能出对子就出对子，组不了就出单。」
  //   「锚点能组龙包括双龙。」/「蛋子及以上排最后。」/「起手时 ≥2 张 4 全部排除出池」
  //   -> 逻辑抽到 src/lead-choice.js(与【提示】共用同一来源, 避免两处算法漂移)
  //   用户例子: 王322kkk->22 / 55567->567 / 45567->4567 / 5666778->5
  if (table.length === 0) {
    var _lead = leadChoice.pickLead(hand);
    if (_lead) {
      return { type: 'PLAY', playerId: playerId,
               cardIds: _lead.cards.map(function (c) { return c.id; }) };
    }
    // 兜底: 组不成任何牌型 -> 出最小的一张(省大牌; 4 留着取牌)
    var _safe = hand.filter(function (c) { return !isFour(c) && keepValue(c) < 500; });
    var _pick = (_safe.length ? _safe : hand)
      .slice()
      .sort(function (a, b) { return cardPowerAsc(a) - cardPowerAsc(b); })[0];
    if (!_pick) return { type: 'PASS', playerId: playerId };
    return { type: 'PLAY', playerId: playerId, cardIds: [_pick.id] };
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
  if (!_sameCampTable && _need >= 2 && _need <= 8 && table.length >= 3 && table.length <= 8
      && fours.length >= _need) {
    var _g4 = fours.length;
    var _wholeGroup = (_g4 === _need);         // 整组用掉 -> 不拆散
    var _tinyGroup = (_g4 < 3);                // 4 组不足 3 张 -> 不是蛋子, 用掉不拆牌型
    if (_wholeGroup || _tinyGroup) {
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
  // 「重手」: 王 / 大A / 蛋子及以上 -> 同阵营时不主动用
  var _heavyTypes = {
    TRIPLE: 1, BIG_TRIPLE: 1, TRUE_SEVEN: 1, TRUE_EIGHT: 1,
    STRAIGHT_TRIPLE: 1, BIG_STRAIGHT_TRIPLE: 1, FAKE_EIGHT: 1, BIG_FAKE_EIGHT: 1,
    DOUBLE_JOKER: 1, TRIPLE_JOKER: 1, FOUR_JOKER: 1, DOUBLE_BIG_A: 1
  };
  function _isHeavy(cards, type) {
    if (_heavyTypes[type]) return true;
    return cards.some(function (c) {
      return c.isBigJoker || c.isSmallJoker || c.is主方大A;
    });
  }
  // [2026-11-06 23:54 用户] 优先度要按**实际牌力**排, 不能只按张数/点数:
  //   - topType: 双大A(最大牌型)/双王/三王/四王, 以及任何**含大A**的牌 -> 优先度**最后**(最后手段)
  //   - bigGroup: 大组牌型(大蛋子/真七/真八/连珠蛋/大连珠蛋/假八/大假八/双龙) -> 靠后,
  //     但排在「不拆同点组」之后(拆开假八能管上时, 别直接出整个假八)
  var _topTypeSet = { DOUBLE_BIG_A: 1, DOUBLE_JOKER: 1, TRIPLE_JOKER: 1, FOUR_JOKER: 1 };
  var _bigGroupTypes = {
    BIG_TRIPLE: 1, TRUE_SEVEN: 1, TRUE_EIGHT: 1, STRAIGHT_TRIPLE: 1,
    BIG_STRAIGHT_TRIPLE: 1, FAKE_EIGHT: 1, BIG_FAKE_EIGHT: 1, DOUBLE_STRAIGHT: 1
  };
  var _sameCamp = _isSameCamp(state, state && state.lastPlayer, playerId);
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
    // 同阵营: 不用 王/大A/蛋子及以上 去压
    if (_sameCamp && _isHeavy(comboCards, h.type)) return;
    _picks.push({
      cards: comboCards,
      type: h.type,
      sameType: (currentHand && h.type === currentHand.type) ? 0 : 1,   // 同类型优先
      // [2026-11-06 23:54] 双大A/双王/大A 单张 -> 优先度最后; 大组 -> 靠后
      topType: (_topTypeSet[h.type] || comboCards.some(function (c) { return !!c.is主方大A; })) ? 1 : 0,
      bigGroup: _bigGroupTypes[h.type] ? 1 : 0,                        // 大组牌型当最后手段
      split: _splitCount(comboCards),                                  // 不拆牌优先
      // [2026-11-06 用户] 「4 当作蛋子及以上牌型出的时候, 优先度靠后」
      //   (必须出蛋子时, 手上有 444 和别的蛋子 -> 优先出别的蛋子)
      fourEgg: (comboCards.length >= 3 && comboCards.every(function (c) {
        return c.rank === 4 && !c.isBigJoker && !c.isSmallJoker;
      })) ? 1 : 0,
      kv: Math.max.apply(null, comboCards.map(keepValue)),
      len: comboCards.length
    });
  });
  _picks.sort(function (a, b) {
    if (a.sameType !== b.sameType) return a.sameType - b.sameType;
    if (a.topType !== b.topType) return a.topType - b.topType;         // 双大A/双王/大A -> 最后
    if (a.split !== b.split) return a.split - b.split;             // 不拆同点组(优先于「大组靠后」)
    if (a.bigGroup !== b.bigGroup) return a.bigGroup - b.bigGroup;   // 大组(大蛋子/假八)靠后
    if (a.fourEgg !== b.fourEgg) return a.fourEgg - b.fourEgg;   // 4 蛋子靠后
    if (a.kv !== b.kv) return a.kv - b.kv;
    if (a.len !== b.len) return a.len - b.len;
    return 0;
  });
  // [2026-11-06 用户] 「4 用来取牌时, 优先度靠前」-> 取牌排在普通压制之前
  //   (手牌 33344 + 别人出 222 -> 直接用 4 取, 不出 333)
  if (_capSubset) {
    return { type: 'PLAY', playerId: playerId,
             cardIds: _capSubset.map(function (c) { return c.id; }) };
  }
  if (_picks.length) {
    return { type: 'PLAY', playerId: playerId,
             cardIds: _picks[0].cards.map(function (c) { return c.id; }) };
  }
  // ================= 3. 无合法行动 -> 过牌 =================
  return { type: 'PASS', playerId: playerId };
}

module.exports = {
  chooseAction: chooseAction
};