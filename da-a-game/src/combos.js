// src/combos.js — 手牌候选组合枚举
// 纯函数: 只枚举"可能构成合法牌型"的实体卡组合, 不做任何合法性判断。
// 合法性一律由规则引擎 (transition / identifyHand / canBeat) 裁决 (§14)。
//
// 枚举两类:
//   (a) 同点数组: 同一点数 2..8 张 (对子/蛋子/大蛋子/真七/真八)
//   (b) 连续点数组: 连续点数各取 1 张, 3..12 张 (连张); 每点数多张时按张数展开
//
// 排序: 张数多者优先; 同张数按首张点数高者优先 (让引擎更容易接受, 减少无效尝试)
//
// 纯 JS / CommonJS, 无 wx.* 依赖。

var MIN_SAME_RANK = 2;   // 同点数组最小张数 (2 = 对子)
var MAX_SAME_RANK = 8;   // 同点数组最大张数 (8 = 真八)
var MIN_SEQ = 3;         // 连张最小张数 (§6.1: 3 张及以上)
var MAX_SEQ = 12;        // 连张最大张数 (两副牌最多 4 张/点数, 12 为安全上界)

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
  // [2026-10-27] **连张每个点数只能取一张** ——
  //   原来用 seq.concat(byRank[rank]) 把该点数的**所有**牌都塞进同一段:
  //   手里 9 有两张时, 枚举出 [8,9,9,10,10,J] 这种**含重复点数**的组合,
  //   引擎 identifyHand 判 INVALID -> 真正能压桌面的 [9,10,J] **从来没被枚举过**
  //   -> 点【提示】说「当前没有可用牌」(用户真机: 桌面 567, 手上有 9 10 J)
  //   引擎侧一直是对的: identifyHand([9,10,J]) = STRAIGHT, canBeat(STRAIGHT, STRAIGHT) = true
  // 现在: 每个点数**各取一张**, 枚举笛卡尔积(逐层 emit, 短的连续段也覆盖到)
  var SEQ_COMBO_CAP = 400;   // 每层的组合数上限(防 2^n 爆炸)
  for (i = 0; i < present.length; i++) {
    var acc = [[]];
    for (var j = i; j < present.length; j++) {
      if (j > i && present[j] !== present[j - 1] + 1) break;   // 断点
      var _opts = byRank[present[j]];
      var _next = [];
      for (var _a = 0; _a < acc.length; _a++) {
        for (var _b = 0; _b < _opts.length; _b++) _next.push(acc[_a].concat([_opts[_b]]));
      }
      acc = _next;
      if (acc.length > SEQ_COMBO_CAP) acc = acc.slice(0, SEQ_COMBO_CAP);
      for (var _e = 0; _e < acc.length; _e++) {
        if (acc[_e].length >= MIN_SEQ && acc[_e].length <= MAX_SEQ) out.push(acc[_e]);
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