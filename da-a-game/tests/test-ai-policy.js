// tests/test-ai-policy.js —— AI 口径配置(src/ai-policy.js)的回归(用户 2026-11-07 22:26 裁定 B/D/E)
//
// [裁定]
//   B. 「X+」= X 及以上的牌型: 蛋子+ = 蛋子及以上; 大蛋子+ = 大蛋子及以上
//      (双龙是**独立牌型**, 不属于蛋子+, 也不属于大蛋子+ —— 用户 22:48 明确)
//   D. 排序键顺序外置成配置 + 单测锁住顺序
//   E. 不拆组 > 同类型优先
//
// 跑法: node tests/test-ai-policy.js
var policy = require('../src/ai-policy.js');

var pass = 0, fail = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }

section('P1. 排序键顺序(裁定 D/E, 2026-11-13 跟牌分层): 出完 > 拆分层 > 不拆组 > 同类型优先');
{
  check('P1.1 排序键顺序固定',
    policy.SORT_KEYS.join('>') === 'outAll>breakLayer>splitEgg>sameType>power>fourEgg>split>bigGroup>kv>len',
    policy.SORT_KEYS.join('>'));
  check('P1.2 「不拆组」排在「同类型优先」之前',
    policy.SORT_KEYS.indexOf('splitEgg') < policy.SORT_KEYS.indexOf('sameType'),
    policy.SORT_KEYS.join('>'));
  check('P1.3 比较器按 SORT_KEYS 生效: 拆组的那手排后',
    policy.comparePicks({ splitEgg: 1, sameType: 0 }, { splitEgg: 0, sameType: 1 }) > 0, '');
  check('P1.4 同拆组时同类型优先',
    policy.comparePicks({ splitEgg: 0, sameType: 0 }, { splitEgg: 0, sameType: 1 }) < 0, '');
}

section('P2. 「X+」= X 及以上(裁定 B)');
{
  check('P2.1 蛋子+ 含蛋子', policy.EGG_PLUS.TRIPLE === 1, '');
  check('P2.2 蛋子+ 含大蛋子', policy.EGG_PLUS.BIG_TRIPLE === 1, '');
  check('P2.3 蛋子+ 含双大A', policy.EGG_PLUS.DOUBLE_BIG_A === 1, '');
  check('P2.4 蛋子+ 不含单张/对子/龙',
    !policy.EGG_PLUS.SINGLE && !policy.EGG_PLUS.PAIR && !policy.EGG_PLUS.STRAIGHT, '');
  check('P2.5 双龙不属于蛋子+(用户 22:48)', !policy.EGG_PLUS.DOUBLE_STRAIGHT, '');
  check('P2.6 大蛋子+ 含大蛋子但不含蛋子',
    policy.BIG_EGG_PLUS.BIG_TRIPLE === 1 && !policy.BIG_EGG_PLUS.TRIPLE, '');
  check('P2.7 大蛋子+ 是蛋子+ 的子集',
    Object.keys(policy.BIG_EGG_PLUS).every(function (k) { return policy.EGG_PLUS[k] === 1; }), '');
  check('P2.8 蛋子+ 与大蛋子+ 的差集 = 蛋子',
    Object.keys(policy.EGG_PLUS).filter(function (k) { return !policy.BIG_EGG_PLUS[k]; }).join(',') === 'TRIPLE',
    Object.keys(policy.EGG_PLUS).filter(function (k) { return !policy.BIG_EGG_PLUS[k]; }).join(','));
}

section('P3. 敌友标记(src/camp.js): 三态判定(用户 23:27)');
{
  var camp = require('../src/camp.js');
  function mk(o) {
    return Object.assign({ mode: '2V3_暗打', '次方': 'C', '次方公开': false,
      '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
      '主方': ['A','C'], '抓方': ['B','D','E'], plays: [] }, o || {});
  }
  var st = mk();
  check('P3.1 抓方视角: 主A持有者=敌', camp.campOf(st, 'D', 'A') === 'ENEMY', camp.campOf(st, 'D', 'A'));
  check('P3.2 抓方视角: 其他未知玩家=不明(还没推定)', camp.campOf(st, 'D', 'B') === 'UNKNOWN', camp.campOf(st, 'D', 'B'));
  check('P3.3 次方视角: 主A持有者=友', camp.campOf(st, 'C', 'A') === 'ALLY', camp.campOf(st, 'C', 'A'));
  check('P3.4 次方视角: 其他抓方=敌', camp.campOf(st, 'C', 'D') === 'ENEMY', camp.campOf(st, 'C', 'D'));
  check('P3.5 主A持有者视角: 暗打时不知道谁是次方 -> 不明', camp.campOf(st, 'A', 'C') === 'UNKNOWN', camp.campOf(st, 'A', 'C'));
  check('P3.6 主A持有者视角: 其他玩家也是不明', camp.campOf(st, 'A', 'D') === 'UNKNOWN', camp.campOf(st, 'A', 'D'));
  var st2 = mk({ plays: [{ playerId: 'E', type: 'BIG_TRIPLE', count: 4, beat: 'D' }] });
  check('P3.7 有推定: 推定出来的那个人=敌', camp.campOf(st2, 'D', 'E') === 'ENEMY', camp.campOf(st2, 'D', 'E'));
  check('P3.8 有推定: 其余未知玩家=友(裁定 A)', camp.campOf(st2, 'D', 'B') === 'ALLY', camp.campOf(st2, 'D', 'B'));
  var st2b = mk({ plays: [{ playerId: 'E', type: 'BIG_TRIPLE', count: 4, beat: 'D' }] });
  check('P3.11 主A持有者视角: 推定出来的次方=友', camp.campOf(st2b, 'A', 'E') === 'ALLY', camp.campOf(st2b, 'A', 'E'));
  check('P3.12 主A持有者视角: 推定后其余玩家=敌', camp.campOf(st2b, 'A', 'B') === 'ENEMY', camp.campOf(st2b, 'A', 'B'));
  check('P3.13 抓方视角: 主A持有者=敌', camp.campOf(st2b, 'D', 'A') === 'ENEMY', camp.campOf(st2b, 'D', 'A'));
  var st3 = mk({ mode: '2V3_明打', '次方公开': true });
  var st4 = mk({ mode: '1V4_暗打', '主方': ['A'], '抓方': ['B','C','D','E'] });
  check('P3.14 1V4: 主A持有者看其他四人是敌', camp.campOf(st4, 'A', 'B') === 'ENEMY', camp.campOf(st4, 'A', 'B'));
  // [2026-11-10 用户] 1V4 暗打开局不能给抓方自动标(次方身份还没露) -> 抓方之间 = 不明
  check('P3.15 1V4: 抓方之间=不明(次方未露, 不自动标)', camp.campOf(st4, 'B', 'C') === 'UNKNOWN', camp.campOf(st4, 'B', 'C'));

  // [2026-11-10 用户] 「我用大蛋子压制主A了, 其他人的视角敌友标记怎么都没变?」
  //   -> 回归: 1V4 暗打 + 有人用大蛋子+压主A -> 推定他是抓方 -> 其他抓方视角=友(队友)。
  var st5 = mk({ mode: '1V4_暗打', '主方': ['A'], '抓方': ['B','C','D','E'],
    plays: [{ playerId: 'C', type: 'BIG_TRIPLE', count: 4, beat: 'A' }] });
  check('P3.16 1V4: 用大蛋子+压主A -> 推定为抓方 -> 其他抓方视角=友',
    camp.campOf(st5, 'B', 'C') === 'ALLY', camp.campOf(st5, 'B', 'C'));
  check('P3.17 1V4: 抓方对主A=敌(确定)',
    camp.campOf(st5, 'B', 'A') === 'ENEMY', camp.campOf(st5, 'B', 'A'));
  check('P3.17 次方亮明后: 关系=确定', camp.campCertain(st3, 'D', 'E') === true, String(camp.campCertain(st3, 'D', 'E')));
  check('P3.18 主A持有者看主A持有者=确定(身份明)', camp.campCertain(st, 'D', 'A') === true, String(camp.campCertain(st, 'D', 'A')));
  check('P3.9 公开: 同阵营=友', camp.campOf(st3, 'D', 'E') === 'ALLY', camp.campOf(st3, 'D', 'E'));
  check('P3.10 公开: 不同阵营=敌', camp.campOf(st3, 'D', 'C') === 'ENEMY', camp.campOf(st3, 'D', 'C'));
}
section('P4. §6.3 全局牌力等级(2026-11-09 用户: 双王 < 真七, 不能把双王固定靠后)');
{
  var R = policy.POWER_RANK;
  check('P4.1 牌力表齐', !!R && !!R.DOUBLE_JOKER && !!R.TRUE_SEVEN && !!R.FOUR_JOKER, '');
  check('P4.2 双王 < 连珠蛋 < 假八 < 真七 < 真八 < 三王 < 大连珠蛋 < 大假八 < 四王 < 双大A',
    R.DOUBLE_JOKER < R.STRAIGHT_TRIPLE && R.STRAIGHT_TRIPLE < R.FAKE_EIGHT &&
    R.FAKE_EIGHT < R.TRUE_SEVEN && R.TRUE_SEVEN < R.TRUE_EIGHT && R.TRUE_EIGHT < R.TRIPLE_JOKER &&
    R.TRIPLE_JOKER < R.BIG_STRAIGHT_TRIPLE && R.BIG_STRAIGHT_TRIPLE < R.BIG_FAKE_EIGHT &&
    R.BIG_FAKE_EIGHT < R.FOUR_JOKER && R.FOUR_JOKER < R.DOUBLE_BIG_A,
    JSON.stringify(R));
  check('P4.3 蛋子 < 大蛋子 < 双王', R.TRIPLE < R.BIG_TRIPLE && R.BIG_TRIPLE < R.DOUBLE_JOKER, '');
  check('P4.4 单张/对子/龙 在蛋子之下', R.SINGLE < R.PAIR && R.PAIR < R.STRAIGHT && R.STRAIGHT < R.TRIPLE, '');
  check('P4.5 比较器: 牌力弱(数字小)的排前',
    policy.comparePicks({ splitEgg: 0, sameType: 0, power: R.DOUBLE_JOKER },
                       { splitEgg: 0, sameType: 0, power: R.TRUE_SEVEN }) < 0, '');
}

console.log('=== 总结 ===');
console.log('checks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
if (fail) { console.log(''); console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(fail > 0 ? 1 : 0);


