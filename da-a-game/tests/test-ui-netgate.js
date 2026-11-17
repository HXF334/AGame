// tests/test-ui-netgate.js — 联网闸门（与单机同一套按钮模型）
//   [2026-11-17 用户] 要求联网亮A/反A/身份的画面**和单机完全一致**：
//   所以闸门按钮不再由 ui-render 另画一套，而是走 uiButtons() → drawButtons()，
//   这里断言按钮列表的形状（4 个花色按钮、同排等大、按手牌置灰、无自绘提示面板）。
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
function gateBtns() {
  return (g.uiButtonModel() || []).filter(function (b) {
    return typeof b.id === 'string' && b.id.indexOf('netSuit:') === 0;
  });
}

var s1 = SB.C('S', 14), h5 = SB.C('H', 5);
var st = SB.build({ handMap: { B: [s1, h5] }, phase: 'LIANG_A' });
st['主A'] = null; st['次方'] = null; st['主方'] = null; st['抓方'] = null;
trim(st, 'B', [s1.id, h5.id]);
g.__setState(st, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setNet(true);
var texts = g.__renderTexts();
var btns = gateBtns();
check('1.1 四个花色按钮（与单机同一套按钮模型）', btns.length === 4, 'count=' + btns.length);
check('1.2 四个花色按钮都是 suit 类（drawButtons 统一等大/同排）', btns.every(function (b) {
  return b.kind === 'suit';
}));
var sBtn = btns.filter(function (b) { return b.id === 'netSuit:S'; })[0];
var hBtn = btns.filter(function (b) { return b.id === 'netSuit:H'; })[0];
check('1.3 有 A 的花色可点', !!sBtn && sBtn.enabled === true);
check('1.4 没 A 的花色置灰', !!hBtn && hBtn.enabled === false, hBtn && String(hBtn.enabled));
check('1.5 不再自绘闸门按钮/说明面板', g.__netGateHits().length === 0 && !texts.some(function (t) {
  return /选择要亮的 A 花色/.test(t);
}));

var h6 = SB.C('H', 6);
var st2 = SB.build({ handMap: { B: [h5, h6] }, phase: 'LIANG_A' });
st2['主A'] = null; st2['次方'] = null; st2['主方'] = null; st2['抓方'] = null;
trim(st2, 'B', [h5.id, h6.id]);
g.__setState(st2, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setNet(true);
var texts2 = g.__renderTexts();
check('2.1 无A时没有可点的花色按钮', gateBtns().every(function (b) { return b.enabled === false; }), JSON.stringify(gateBtns()));
check('2.2 无A时显示等待', texts2.some(function (t) { return /等待其他玩家/.test(t); }), texts2.join(' | '));

var st3 = SB.build({ handMap: { B: [h5] }, table: [SB.C('D', 9)], lastPlayer: 'C' });
trim(st3, 'B', [h5.id]);
g.__setState(st3, { human: 'B', currentPlayer: 'B', clearLog: true });
g.__setNet(true);
g.__renderTexts();
check('3.1 出牌阶段没有闸门按钮', gateBtns().length === 0, String(gateBtns().length));

console.log('\nnetgate: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
