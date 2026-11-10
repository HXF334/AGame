// src/ai-policy.js — AI 决策口径的**可配置部分**(2026-11-07 用户裁定 C/D)
//
// 这里只放**口径**(常量/集合/比较器), 不放逻辑。改口径 = 改这一个文件。
//
// [用户 2026-11-07 22:26 裁定]
//   A. 推定某人是次方后, 其余未知玩家就等于队友 -> **暂时不做**(逻辑成立, 但会让 AI 突然不压一大片人)
//   B. 「X+」的精确定义: X+ = X 及以上的牌型
//        蛋子+   = 蛋子及以上
//        大蛋子+ = 大蛋子及以上
//   C. 做 AI 决策日志(见 ai.js 的 getLastTrace + game.js 的日志行)
//   D. 排序键外置成配置 + 单测锁住顺序(见下方 SORT_KEYS)
//   E. 不拆组 > 同类型优先(排在同类型之前)

// ===== 1. 「X+」牌型集合 =====
// 依据 SKILL §6.3 全局牌力链:
//   [2026-11-07 22:48 用户] 双龙**不属于**蛋子+ —— 双龙是独立牌型(§6.4 单独处理),
//     不在「蛋子及以上」这一族里(也不在大蛋子+里)。
var EGG_PLUS_TYPES = [
  'TRIPLE',              // 蛋子
  'BIG_TRIPLE',          // 大蛋子
  'DOUBLE_JOKER',        // 双王
  'STRAIGHT_TRIPLE',     // 连珠蛋
  'FAKE_EIGHT',          // 假八
  'TRUE_SEVEN',          // 真七
  'TRUE_EIGHT',          // 真八
  'TRIPLE_JOKER',        // 三王
  'BIG_STRAIGHT_TRIPLE', // 大连珠蛋
  'BIG_FAKE_EIGHT',      // 大假八
  'FOUR_JOKER',          // 四王
  'DOUBLE_BIG_A'         // 双大A
];
var BIG_EGG_PLUS_TYPES = EGG_PLUS_TYPES.filter(function (t) {
  return t !== 'TRIPLE' && t !== 'DOUBLE_STRAIGHT';
});
function toSet(list) {
  var o = {};
  list.forEach(function (t) { o[t] = 1; });
  return o;
}
var EGG_PLUS = toSet(EGG_PLUS_TYPES);            // 蛋子+ = 蛋子及以上
var BIG_EGG_PLUS = toSet(BIG_EGG_PLUS_TYPES);   // 大蛋子+ = 大蛋子及以上

// ===== 2. 排序键(数组顺序 = 优先级, 小的先用) =====
// [用户 2026-11-07 22:26 裁定 E] 不拆组 > 同类型优先
// [裁定 D] 改口径 = 改这个数组; tests/test-ai-policy.js 会锁住顺序
var SORT_KEYS = [
  // [2026-11-10 用户] 「托管最后剩KKKK, 上家出5, 托管给我出了一个K而不是KKKK; 只剩KKK后别人出牌过来托管也不出牌」
  //   -> 候选**能把手牌一次出完**时优先出完(出完=出局=大贡), 别拆着出最后几手。
  'outAll',      // 出完优先(这一手打完手牌就出局)
  'splitEgg',   // 不拆蛋子级同点组(>=3 张同点的组不拆着出)
  'sameType',   // 同牌型优先
  // [2026-11-09 用户] 「手牌有双王和9999999, 托管或者提示应该优先出双王, 因为双王牌力小于9999999。
  //   不能固定把双王优先级放在靠后, 要判断牌力大小, 三王四王也是同样的问题。」
  //   -> 原来第 3 个键 topType 把「双大A/双王/三王/四王/含大A」一刀切压到最后;
  //      但 §6.3 里 双王 < 连珠蛋 < 假八 < 真七 < 真八 < 三王 < ... < 双大A。
  //      改成 power = §6.3 牌力等级(数字小 = 牌力弱 -> 弱牌先出, 别浪费大牌)。
  'power',      // §6.3 牌力: 弱牌先出(双王 70 < 连珠蛋 80 < 假八 90 < 真七 100 < ... < 双大A 160)
  'fourEgg',    // 4 组成的蛋子+ -> 靠后
  'split',      // 不拆同点组(对子级)
  'bigGroup',   // 大组牌型 -> 靠后
  'kv',         // 保留价值低优先
  'len'         // 张数少
];
var SORT_KEY_LABELS = {
  splitEgg: '拆蛋组', outAll: '出完', sameType: '同型', power: '牌力', fourEgg: '4蛋',
  split: '拆组', bigGroup: '大组', kv: '价值', len: '张数'
};
function comparePicks(a, b) {
  for (var i = 0; i < SORT_KEYS.length; i++) {
    var k = SORT_KEYS[i];
    if (a[k] !== b[k]) return a[k] - b[k];
  }
  return 0;
}

// [2026-11-08 23:59 用户] 【提示】排序用的**牌型顺序(从小到大)**
//   (不能直接用 POWER: 双龙 POWER=0 是「只能被大蛋子+压」的特殊标记, 不是强弱)
// ===== 3.5 §6.3 全局牌力等级(数字小 = 牌力弱) =====
// 从低到高: 单张/对子/龙 < 蛋子 < 大蛋子 < 双王 < 连珠蛋 < 假八 < 真七 < 真八 < 三王
//            < 大连珠蛋 < 大假八 < 四王 < 双大A
// [2026-11-09 用户] 「不能固定把双王优先级放在靠后, 要判断牌力大小」-> AI 排序与提示共用这一张表。
var POWER_RANK = {
  SINGLE: 1, PAIR: 2, STRAIGHT: 3, TRIPLE: 4, BIG_TRIPLE: 5, DOUBLE_STRAIGHT: 6,
  DOUBLE_JOKER: 7, STRAIGHT_TRIPLE: 8, FAKE_EIGHT: 9, TRUE_SEVEN: 10, TRUE_EIGHT: 11,
  TRIPLE_JOKER: 12, BIG_STRAIGHT_TRIPLE: 13, BIG_FAKE_EIGHT: 14,
  FOUR_JOKER: 15, DOUBLE_BIG_A: 16
};

// [2026-11-09] 【提示】排序 = 同一张牌力表(从小到大); 之前单独维护一份, 容易漂移。
var HINT_TYPE_RANK = POWER_RANK;
module.exports = {
  EGG_PLUS: EGG_PLUS,
  BIG_EGG_PLUS: BIG_EGG_PLUS,
  EGG_PLUS_TYPES: EGG_PLUS_TYPES,
  BIG_EGG_PLUS_TYPES: BIG_EGG_PLUS_TYPES,
  SORT_KEYS: SORT_KEYS,
  SORT_KEY_LABELS: SORT_KEY_LABELS,
  comparePicks: comparePicks,
  HINT_TYPE_RANK: HINT_TYPE_RANK,
  POWER_RANK: POWER_RANK,
};
