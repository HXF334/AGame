// tests/test-ui-netgate.js — 联网闸门浮层（亮A可操作 / 等待态）
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}
// SB.build 会把每人手牌补到 22 张：把指定玩家多余的牌移进 discarded
function trim(st, pid, keepIds) {
  var p = st.players.filter(function (x) { return x.id === pid; })[0];
  var keep = [], rest = [];
  p.hand.forEach(function (c) { (keepIds.indexOf(c.id) >= 0 ? keep : rest).push(c); });
  p.hand = keep;
  st.discarded = (st.discarded || []).concat(rest);
}

var s1 = SB.C('S', 14), h5 = SB.C('H', 5);
var st = SB.build({ handMap: { B: [s1, h5] }, phase: 'LIANG_A' });
st['主A'] = null; st['次方'] = null; st['主方'] = null; st['抓方'] = null;
trim(st, 'B', [s1.id, h5.id]);
g.__setState(st, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setNet(true);
var texts = g.__renderTexts();
var hits = g.__netGateHits();
check('1.1 出现四个花色按钮', hits.filter(function (b) { return b.id === 'gateSuit'; }).length === 4, String(hits.length));
check('1.2 标题为亮A', texts.some(function (t) { return /^亮A$/.test(t); }), texts.join(' | '));
check('1.3 有跳过按钮', hits.some(function (b) { return b.id === 'gateSkip'; }));
check('1.4 提示可操作', texts.some(function (t) { return /请选择/.test(t); }));

var h6 = SB.C('H', 6);
var st2 = SB.build({ handMap: { B: [h5, h6] }, phase: 'LIANG_A' });
st2['主A'] = null; st2['次方'] = null; st2['主方'] = null; st2['抓方'] = null;
trim(st2, 'B', [h5.id, h6.id]);
g.__setState(st2, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setNet(true);
var texts2 = g.__renderTexts();
check('2.1 无A时无花色按钮', g.__netGateHits().filter(function (b) { return b.id === 'gateSuit'; }).length === 0);
check('2.2 无A时显示等待', texts2.some(function (t) { return /等待其他玩家/.test(t); }), texts2.join(' | '));

var st3 = SB.build({ handMap: { B: [h5] }, table: [SB.C('D', 9)], lastPlayer: 'C' });
trim(st3, 'B', [h5.id]);
g.__setState(st3, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setNet(true);
g.__renderTexts();
check('3.1 出牌阶段无闸门按钮', g.__netGateHits().length === 0, String(g.__netGateHits().length));

console.log('\nnetgate: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
