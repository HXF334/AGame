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

section('P1. 排序键顺序(裁定 D/E): 不拆组 > 同类型优先');
{
  check('P1.1 排序键顺序固定',
    policy.SORT_KEYS.join('>') === 'splitEgg>sameType>topType>fourEgg>split>bigGroup>kv>len',
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

console.log('=== 总结 ===');
console.log('checks: ' + (pass + fail) + ' | passed: ' + pass + ' | failed: ' + fail);
if (fail) { console.log(''); console.log('FAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
