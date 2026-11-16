// tests/test-flow.js
// [2026-11-16 P1] 流程层第一步：阶段闸门表只在 src/flow.js 定义，game.js 直接引用。
var path = require('path');
var flow = require(path.join(__dirname, '..', 'src', 'flow.js'));

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

// game.js 必须引用同一张表（防止两处各写一份后漂移）
var fs = require('fs');
var src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
check('5.1 game.js 从 flow.js 取表',
  src.indexOf("require('./src/flow.js').GATE_PLAN") >= 0);
check('5.2 game.js 不再自带表定义',
  src.indexOf("id: 'FORCED_CHECK', label: '强制排查'") < 0);

console.log('\ntest-flow: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
