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
  'splitEgg',   // 不拆蛋子级同点组(>=3 张同点的组不拆着出)
  'sameType',   // 同牌型优先
  'topType',    // 双大A/双王/三王/四王/含大A -> 最后
  'fourEgg',    // 4 组成的蛋子+ -> 靠后
  'split',      // 不拆同点组(对子级)
  'bigGroup',   // 大组牌型 -> 靠后
  'kv',         // 保留价值低优先
  'len'         // 张数少
];
var SORT_KEY_LABELS = {
  splitEgg: '拆蛋组', sameType: '同型', topType: '重手', fourEgg: '4蛋',
  split: '拆组', bigGroup: '大组', kv: '价值', len: '张数'
};
function comparePicks(a, b) {
  for (var i = 0; i < SORT_KEYS.length; i++) {
    var k = SORT_KEYS[i];
    if (a[k] !== b[k]) return a[k] - b[k];
  }
  return 0;
}

module.exports = {
  EGG_PLUS: EGG_PLUS,
  BIG_EGG_PLUS: BIG_EGG_PLUS,
  EGG_PLUS_TYPES: EGG_PLUS_TYPES,
  BIG_EGG_PLUS_TYPES: BIG_EGG_PLUS_TYPES,
  SORT_KEYS: SORT_KEYS,
  SORT_KEY_LABELS: SORT_KEY_LABELS,
  comparePicks: comparePicks
};
