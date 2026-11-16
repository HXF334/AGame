// tests/test-record.js
// [2026-11-16 P3] 战绩记录：只含公开信息，零和，字段齐全。
var path = require('path');
var rec = require(path.join(__dirname, '..', 'src', 'record.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var st = SB.build({});
var view = {
  res: { winner: '主方', reason: '2V3_主方全空' },
  scores: { A: -1, B: 2, C: 1, D: -1, E: -1 }
};
var r = rec.buildRecord(st, view);

check('1.1 带 schemaVersion', r.schemaVersion === 1);
check('1.2 模式/胜负/原因', r.mode === st.mode && r.winner === '主方' && r.reason === '2V3_主方全空');
check('1.3 五名玩家', r.players.length === 5, String(r.players.length));
check('1.4 阵营按主A+次方标注', r.players.filter(function (p) { return p.camp === 'main'; }).length === 2,
  JSON.stringify(r.players.map(function (p) { return p.id + ':' + p.camp; })));
check('1.5 分数透传', r.players.filter(function (p) { return p.id === 'B'; })[0].score === 2);
check('1.6 零和', r.totalScore === 0, String(r.totalScore));
check('1.7 不含手牌字段', JSON.stringify(r).indexOf('"hand"') < 0);
check('1.8 不含底牌内容', JSON.stringify(r).indexOf('"底牌"') < 0);
check('1.9 有 createdAt', typeof r.createdAt === 'string' && r.createdAt.length >= 10);

var st2 = SB.build({});
var r2 = rec.buildRecord(st2, { res: { winner: 'draw', reason: '' }, scores: {} });
check('2.1 平局也能生成', r2.winner === 'draw' && r2.totalScore === 0);
check('2.2 缺主A时不崩', (function () {
  var s = SB.build({}); delete s['主A'];
  try { var x = rec.buildRecord(s, {}); return x.mainSuit === null; } catch (e) { return false; }
})());

console.log('\ntest-record: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
