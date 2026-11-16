// tests/test-history.js
// [2026-11-16 战绩页] 格式化层：模式/胜负/时间/得分文本，汇总统计，异常输入不崩。
var path = require('path');
var H = require(path.join(__dirname, '..', 'src', 'history.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

// 1. 模式/胜负文案
check('1.1 2V3 明打', H.modeText('2V3_明打') === '2V3明打', H.modeText('2V3_明打'));
check('1.2 1V4 暗打', H.modeText('1V4_暗打') === '1V4暗打', H.modeText('1V4_暗打'));
check('1.3 未知模式原样', H.modeText('X') === 'X');
check('1.4 主胜', H.resultText('主方') === '主胜');
check('1.5 抓胜', H.resultText('抓方') === '抓胜');
check('1.6 平局', H.resultText('draw') === '平局');

// 2. 得分文本
check('2.1 正分带 +', H.deltaText(6) === '+6', H.deltaText(6));
check('2.2 负分原样', H.deltaText(-3) === '-3');
check('2.3 零分', H.deltaText(0) === '0');

// 3. 时间格式（本地时区无关：只断言形状）
check('3.1 时间形如 MM-DD HH:mm', /^\d\d-\d\d \d\d:\d\d$/.test(H.timeText('2026-11-16T05:03:00.000Z')), H.timeText('2026-11-16T05:03:00.000Z'));
check('3.2 空时间不崩', H.timeText('') === '');

// 4. rows：自己得分按 humanId 取
var recs = [
  { _id: 'r1', mode: '2V3_暗打', winner: '主方', humanId: 'A', createdAt: '2026-11-16T05:03:00.000Z', players: [{ id: 'A', score: -3, camp: 'taker' }, { id: 'B', score: 6, camp: 'main' }] },
  { _id: 'r2', mode: '1V4_明打', winner: '抓方', humanId: 'A', createdAt: '2026-11-15T09:00:00.000Z', players: [{ id: 'A', score: 16, camp: 'taker' }, { id: 'B', score: -4, camp: 'main' }] }
];
var rows = H.rows(recs);
check('4.1 行数', rows.length === 2, String(rows.length));
check('4.2 第一行模式/我方结果/得分', rows[0].mode === '2V3暗打' && rows[0].result === '负' && rows[0].delta === '-3', JSON.stringify(rows[0]));
check('4.3 第二行胜/得分', rows[1].result === '胜' && rows[1].delta === '+16', JSON.stringify(rows[1]));
check('4.4 无 humanId 时显示 —', H.rows([{ _id: 'z', mode: '2V3_暗打', winner: '主方', players: [{ id: 'A', score: 5 }] }])[0].delta === '—');
check('4.5 key 使用 _id', rows[0].key === 'r1');

// 5. summary
var sum = H.summary(recs);
check('5.1 汇总一胜一负（按阵营）', /1 胜 1 负 0 平/.test(sum), sum);
check('5.3 未知记录单独计数、不混算成平', /0 胜 1 负 0 平，1 局身份未知/.test(H.summary([recs[0], { _id: 'u', mode: '2V3_暗打', winner: '主方', players: [{ id: 'A', score: 5 }] }])), H.summary([recs[0], { _id: 'u', mode: '2V3_暗打', winner: '主方' }]));
check('5.2 空记录汇总', /0 胜 0 负 0 平/.test(H.summary([])));

// 6. 脏数据不崩
check('6.1 null 记录被跳过', H.rows([null, recs[0]]).length === 1);
check('6.3 记录无 humanId 时显示 —', H.rows([{ _id: 'y', mode: '2V3_暗打', winner: '主方', players: [{ id: 'A', score: 5 }] }])[0].delta === '—');
check('6.2 缺 players 显示 —', H.rows([{ _id: 'x', mode: '2V3_暗打', winner: '主方' }])[0].delta === '—');

console.log('\ntest-history: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
