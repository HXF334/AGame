// src/combos.js — 手牌候选组合枚举
// 纯函数: 只枚举"可能构成合法牌型"的实体卡组合, 不做任何合法性判断。
// 合法性一律由规则引擎 (transition / identifyHand / canBeat) 裁决 (§14)。
//
// 枚举两类:
//   (a) 同点数组: 同一点数 2..8 张 (对子/蛋子/大蛋子/真七/真八)
//   (b) 连续点数组: 连续点数各取 k 张 (k=1 连张 / k=2 双龙 / k=3 连珠蛋 / k=4 假八)
//
// 排序: 张数多者优先; 同张数按首张点数高者优先 (让引擎更容易接受, 减少无效尝试)
//
// 纯 JS / CommonJS, 无 wx.* 依赖。

var MIN_SAME_RANK = 2;   // 同点数组最小张数 (2 = 对子)
var MAX_SAME_RANK = 8;   // 同点数组最大张数 (8 = 真八)
var MIN_SEQ = 3;         // 连张最小张数 (§6.1: 3 张及以上)
// [B3 修正 2026-11-03] 原来写 12, 截断了 **13 张最长龙 (2..A)**。
//   §6.1 的基础序列是 2-3-...-A 共 **13** 个点数, 识别层也认 13 张 (identifyHand
//   返回 STRAIGHT len=13), 枚举层却出不来 -> 引擎认得出、玩家打不出。
//   k=2/3/4 不受影响 (双龙/连珠蛋/假八 的张数上限本来就 < 13)。
var MAX_SEQ = 13;        // 连张最大张数 (§6.1 基础序列 2..A = 13 个点数)

// 枚举单张以外的候选组合 (cardIds 数组的数组)
function candidateCombos(hand) {
  if (!Array.isArray(hand) || hand.length === 0) return [];
  var out = [];
  var i;

  // ---- (a) 同点数组 ----
  var groups = {};
  for (i = 0; i < hand.length; i++) {
    var c = hand[i];
    if (c.isBigJoker || c.isSmallJoker) continue;   // 王不参与同点数组
    var k = c.rank;
    if (!groups[k]) groups[k] = [];
    groups[k].push(c.id);
  }
  var ranks = Object.keys(groups);
  for (i = 0; i < ranks.length; i++) {
    var g = groups[ranks[i]];
    for (var n2 = MIN_SAME_RANK; n2 <= MAX_SAME_RANK && n2 <= g.length; n2++) {
      out.push(g.slice(0, n2));
    }
  }

  // ---- (b) 连续点数组 (连张) ----
  // A 不参与连张 (A 仅能作为 A23 / QKA 的端点, 交由引擎判定)
  var byRank = {};
  for (i = 0; i < hand.length; i++) {
    var cc = hand[i];
    if (cc.isBigJoker || cc.isSmallJoker) continue;
    if (cc.rank < 2 || cc.rank > 14) continue;      // 2..14 连续段
    // [2026-10-26] **A(14) 必须参与连张的高端点**(Q-K-A 连续段)。
    //   原来写成 `> 13` 把 A 排除了 -> 手里有 3A+3K+3Q(连叠蛋)时**枚举不出候选**
    //   -> 点「提示」说"当前没有可用牌"(用户: 打出的手牌不能完全显示/提示没选中)。
    //   引擎的 identifyHand 本来就认 STRAIGHT_TRIPLE, 只是候选枚举漏了。
    //   A 只能作为**高端点**(2..13 段里 14 只紧跟 13, 不会误组成 A23)。
    if (!byRank[cc.rank]) byRank[cc.rank] = [];
    byRank[cc.rank].push(cc.id);
  }
  var present = Object.keys(byRank).map(Number).sort(function (a, b) { return a - b; });
  // [2026-11-01 修复] **同一段内每个点数取相同张数 k** ——
  //   k=1 -> 连张 (STRAIGHT)           每点 1 张
  //   k=2 -> 双龙 (DOUBLE_STRAIGHT)    每点 2 张
  //   k=3 -> 连珠蛋 (STRAIGHT_TRIPLE)  每点 3 张
  // 历史: 10-26 用「该点数的所有牌都塞进同一段」-> 手里 9 有两张时枚举出
  //   [8,9,9,10,10,J] 这种**混合张数**组合, 引擎判 INVALID -> 真正能压的
  //   [9,10,J] 从没被枚举过 -> 点【提示】说「当前没有可用牌」(真机: 桌面 567, 手上有 9 10 J)
  //   10-27 改成「每点各取一张」-> 连张修好了, 但**双龙/连珠蛋再也枚举不到**
  //   -> AI 起手只会出单连张 (test-ai-lead-combo 1.3 期望双龙, 实得 STRAIGHT)
  // 现在: 混合张数天然枚举不出来, 且每种张数都覆盖到。
  var SEQ_COMBO_CAP = 400;   // 每层的组合数上限(防 2^n 爆炸)
  // [2026-11-02 修复] **k 上界原来只到 3** -> "每点取 4 张"的牌型(假八 / 三连假八)
  //   **从来没被枚举过** -> 手里有 JJJJ+QQQQ 时【提示】说「当前没有可用牌」
  //   (用户 2026-11-01 报障; 引擎侧 identifyHand/canBeat 一直是对的, 只漏在枚举)
  //   k=4 -> 每点 4 张: 2组连续 = 8张(假八 FAKE_EIGHT) / 3组连续 = 12张(三连假八)
  //   SEQ_K_MIN_LEN[k] = 该 k 下**允许的最短总张数**(少了就不是合法牌型):
  //   k=1 连张至少3张 / k=2 双龙至少3对(6张) / k=3 连珠蛋至少3组(9张) / k=4 假八至少2组(8张)
  var SEQ_K_MIN_LEN = { 1: MIN_SEQ, 2: 6, 3: 9, 4: 8 };  // k=2 至少3对, k=3 至少3组, k=4 至少2组
  function _pickCombos(pool, k) {
    var res = [];
    (function rec(start, cur) {
      if (cur.length === k) { res.push(cur.slice()); return; }
      for (var t = start; t < pool.length; t++) { cur.push(pool[t]); rec(t + 1, cur); cur.pop(); }
    })(0, []);
    return res;
  }
  for (var _k = 1; _k <= 4; _k++) {
    for (i = 0; i < present.length; i++) {
      var acc = [[]];
      for (var j = i; j < present.length; j++) {
        if (j > i && present[j] !== present[j - 1] + 1) break;   // 断点
        var _pool = byRank[present[j]];
        if (_pool.length < _k) break;          // 该点凑不出 k 张 -> 这段到此为止
        var _opts = _pickCombos(_pool, _k);
        var _next = [];
        for (var _a = 0; _a < acc.length && _next.length <= SEQ_COMBO_CAP; _a++) {
          for (var _b = 0; _b < _opts.length && _next.length <= SEQ_COMBO_CAP; _b++) {
            _next.push(acc[_a].concat(_opts[_b]));
          }
        }
        acc = _next;
        for (var _e = 0; _e < acc.length; _e++) {
          if (acc[_e].length >= SEQ_K_MIN_LEN[_k] && acc[_e].length <= MAX_SEQ) out.push(acc[_e]);
        }
      }
    }
  }

  // ---- (b2) A 作低端的连段: A,2,3,...,m (§6.1「允许A作为低端的A23」) ----
  // [B2 修正 2026-11-03] 连续段枚举只按 rank **升序**走 (A=14 排在最后, 只能接 13),
  //   于是「A,2,3」这种 **A 在低端** 的形态永远拼不出来 -> 识别层认得出
  //   (identifyHand: rest[0]===2 -> low=1) 但枚举层出不来 -> 【提示】/AI选牌/
  //   doPlay组合回退 三条路径同时失效, 玩家看到「当前没有可用牌」。
  //   §6.1 的连续顺序是**环形**的 2-3-...-K-A-2-3-... (A 可作低端也可作高端),
  //   这里补上以 A 起头的那一段: A -> 2 -> 3 -> ... -> m。
  //   k=1 连张 / k=2 双龙 / k=3 连珠蛋 / k=4 假八 都要覆盖。
  //   [注] byRank 存的是 **card id 字符串**(不是 card 对象), 别写 .id。
  for (var _ak = 1; _ak <= 4; _ak++) {
    var _aPool = byRank[14];
    if (!_aPool || _aPool.length < _ak) continue;
    var _aOpts = _pickCombos(_aPool, _ak);
    var _accA = _aOpts.slice();          // 先放 A 的 k 张
    for (var _ar = 2; _ar <= 13; _ar++) {  // 再接 2,3,...,13
      var _arp = byRank[_ar];
      if (!_arp || _arp.length < _ak) break;
      var _aro = _pickCombos(_arp, _ak);
      var _nextA = [];
      for (var _ax = 0; _ax < _accA.length && _nextA.length <= SEQ_COMBO_CAP; _ax++) {
        for (var _ay = 0; _ay < _aro.length && _nextA.length <= SEQ_COMBO_CAP; _ay++) {
          _nextA.push(_accA[_ax].concat(_aro[_ay]));
        }
      }
      _accA = _nextA;
      for (var _ae = 0; _ae < _accA.length; _ae++) {
        if (_accA[_ae].length >= SEQ_K_MIN_LEN[_ak] && _accA[_ae].length <= MAX_SEQ) {
          out.push(_accA[_ae]);
        }
      }
    }
  }

  // ---- (c) 王组合 (2026-10-21 补) ----
  // 原实现完全跳过王, 导致双王/三王/四王这类特殊牌型**永远不会被枚举**。
  // 后果: 玩家手持大小王面对单大A (按 §6.4 双王可管), 若直接点"出牌"而未选牌,
  //   doPlay 的组合回退找不到双王 -> 报"手牌不可用" (用户 2026-10-21 实测报障)。
  //   引擎侧 identifyHand/canBeat 一直正确, 只是候选枚举漏了。
  // 合法形态(SKILL L189/L190): 双王=**任意2张王**; 三王=**任意3张王**; 四王=全部 4 张。
  //   (2026-10-26 修正: 原来只生成 1大1小/2大1小/1大2小 -> 双大王漏了)
  var jokers = hand.filter(function (c) { return c.isBigJoker || c.isSmallJoker; });
  if (jokers.length >= 2) {
    // [2026-10-26] SKILL §6 牌型表 L189/L190:
    //   「双王 | **任意2张王**」「三王 | **任意3张王**」-> 2 大王 / 3 大王 也是合法牌型
    //   (引擎 identifyHand: 2 张全是王 -> DOUBLE_JOKER, 按其中大王数分级 0/1/2)
    //   之前这里只生成「1大1小」「2大1小」「1大2小」-> **双大王从来没被枚举过**
    //   -> 【提示】/ AI 选牌 / doPlay 组合回退 三条路径全都找不到双大王
    //   (用户 2026-10-26 真机实测: 桌面 5 张 10(大蛋子), 手持双大王, 点【提示】
    //    说「当前没有可用牌」—— 引擎 canBeat 明明允许双王管大蛋子)
    // 现在枚举**所有** 2/3/4 张王的组合(大王小王任意搭配)
    var _jokerCombos = function (k) {
      var res = [];
      (function rec(start, cur) {
        if (cur.length === k) { res.push(cur.slice()); return; }
        for (var j = start; j < jokers.length; j++) { cur.push(jokers[j].id); rec(j + 1, cur); cur.pop(); }
      })(0, []);
      return res;
    };
    for (var _jk = 2; _jk <= 4; _jk++) {
      if (jokers.length < _jk) break;
      _jokerCombos(_jk).forEach(function (ids) { out.push(ids); });
    }
  }

  // ---- 排序: 张数多者优先; 同张数按首张点数高者优先 ----
  var rankById = {};
  for (i = 0; i < hand.length; i++) rankById[hand[i].id] = hand[i].rank;
  out.sort(function (a, b) {
    if (b.length !== a.length) return b.length - a.length;
    return (rankById[b[0]] || 0) - (rankById[a[0]] || 0);
  });

  return out;
}

module.exports = {
  candidateCombos: candidateCombos,
  MIN_SAME_RANK: MIN_SAME_RANK,
  MAX_SAME_RANK: MAX_SAME_RANK,
  MIN_SEQ: MIN_SEQ,
  MAX_SEQ: MAX_SEQ
};