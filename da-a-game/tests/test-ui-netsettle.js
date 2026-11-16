// tests/test-ui-netsettle.js — 联网结算页（单局/总积分榜）
var path = require('path');
var g = require(path.join(__dirname, '..', 'game.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var st = SB.build({ handMap: { B: [SB.C('H', 5), SB.C('H', 6)] }, table: [SB.C('D', 9)], lastPlayer: 'C' });
g.__setState(st, { human: 'B', currentPlayer: 'B', clearLog: true });

function roomView(status) {
  return {
    id: '164721', status: status, round: 2, rounds: 6, you: 0,
    players: [
      { seat: 0, nick: '甲', total: 4, ready: false },
      { seat: 1, nick: '乙', total: -2, ready: false },
      { seat: 2, nick: '丙', total: 0, ready: false },
      { seat: 3, nick: '丁', total: 1, ready: false },
      { seat: 4, nick: '戊', total: -3, ready: false }
    ],
    lastRound: [
      { seat: 0, score: 4, total: 4 },
      { seat: 1, score: -2, total: -2 },
      { seat: 2, score: 0, total: 0 },
      { seat: 3, score: 1, total: 1 },
      { seat: 4, score: -3, total: -3 }
    ]
  };
}

g.__setRoomView(roomView('SETTLED'));
g.__setPage('NETSETTLE');
var texts = g.__renderTexts();
function has(re) { return texts.some(function (t) { return re.test(t); }); }

check('1.1 标题为单局结算', has(/^单局结算$/), texts.join(' | '));
check('1.2 显示第 2 / 6 局', has(/第 2 \/ 6 局/));
check('1.3 显示准备按钮', has(/^准备下一局$/));
check('1.4 显示累计分', has(/累计 \+4/) && has(/累计 -3/));
check('1.5 有准备命中区', g.__pageHits().some(function (b) { return b.id === 'settleReady'; }));
check('1.6 单局页没有返回首页命中区', !g.__pageHits().some(function (b) { return b.id === 'settleHome'; }));

g.__setRoomView(roomView('FINISHED'));
g.__setPage('NETSETTLE');
texts = g.__renderTexts();
check('2.1 总结算标题', texts.some(function (t) { return /^总积分榜$/.test(t); }), texts.join(' | '));
check('2.2 返回首页命中区', g.__pageHits().some(function (b) { return b.id === 'settleHome'; }));

console.log('\nnetsettle: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
