// tests/test-flow.js
// [2026-11-16 P1] 流程层：闸门表 + 发牌推进只在 src/flow.js 定义，game.js 只引用。
var path = require('path');
var fs = require('fs');
var flow = require(path.join(__dirname, '..', 'src', 'flow.js'));
var engine = require(path.join(__dirname, '..', 'src', 'index.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var ids = flow.GATE_PLAN.map(function (s) { return s.id; });
check('1.1 六档顺序固定',
  ids.join(',') === 'DEAL,FORCED_CHECK,ADVANCE,REVEAL,IDENTITY,PLAY', ids.join(','));
check('1.2 每档都有中文标签',
  flow.GATE_PLAN.every(function (s) { return !!s.label; }));
check('2.1 gateIndexOf 正确', flow.gateIndexOf('REVEAL') === 3, String(flow.gateIndexOf('REVEAL')));
check('2.2 未知阶段返回 -1', flow.gateIndexOf('NOPE') === -1, String(flow.gateIndexOf('NOPE')));
check('3.1 nextStage 指向下一档', (flow.nextStage('DEAL') || {}).id === 'FORCED_CHECK');
check('3.2 最后一档没有下一档', flow.nextStage('PLAY') === null);
check('3.3 isFinalStage 只认 PLAY', flow.isFinalStage('PLAY') === true && flow.isFinalStage('IDENTITY') === false);
check('4.1 stageAt 越界返回 null', flow.stageAt(-1) === null && flow.stageAt(6) === null);

// 发牌推进：从 newGameState 开始，逐轮发起码到不处于 DEALING
var st = engine.newGameState();
check('5.1 初始不是 DEALING', flow.isDealing(st) === false);
var r = flow.startDeal(st);
check('5.2 startDeal 成功且进入 DEALING', !!r && r.ok === true && flow.isDealing(r.state), r && r.error && r.error.message);
var s = r.state, guard = 0, okAll = true;
while (flow.isDealing(s) && guard++ < 40) {
  var rr = flow.dealRound(s);
  if (!rr || !rr.ok) { okAll = false; break; }
  s = rr.state;
}
check('5.3 逐轮发牌能发完', okAll && !flow.isDealing(s) && guard === 22, 'guard=' + guard);
check('5.4 发完后每人手牌 20~21 张、底牌各 1 张、合计 108', (function () {
  var counts = s.players.map(function (p) { return p.hand.length; }).join(',');
  var bottoms = s.players.filter(function (p) { return p['底牌']; }).length;
  var total = s.players.reduce(function (n, p) { return n + p.hand.length + (p['底牌'] ? 1 : 0); }, 0);
  var hands = s.players.map(function (p) { return p.hand.length; });
  return bottoms === 5 && total === 108 && hands.every(function (n) { return n === 20 || n === 21; });
})(), JSON.stringify(s.players.map(function (p) { return p.id + ':' + p.hand.length; })));

// game.js 必须引用同一张表（防止两处各写一份后漂移）
var src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
check('6.1 game.js 从 flow.js 取表',
  src.indexOf("require('./src/flow.js')") >= 0);
check('6.2 game.js 不再自带表定义',
  src.indexOf("id: 'FORCED_CHECK', label: '强制排查'") < 0);
check('6.3 game.js 的发牌走 flow',
  src.indexOf('flowMod.dealRound') >= 0 && src.indexOf('flowMod.startDeal') >= 0);

console.log('\ntest-flow: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
