var SB = require('./lib/state-builder.js');
var { transition } = require('../src/transition.js');
var { ACTIONS } = require('../src/phases.js');
var { identifyHand, canBeat } = require('../src/hand-types.js');
var C = SB.C;

var st = SB.build({
  handMap: { B: [C('S', 3), C('H', 3), C('D', 8), C('C', 11), C('S', 13), C('H', 2)] },
  table: [C('D', 9), C('S', 9)],
  lastPlayer: 'A',
  主A: { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
  次方: 'D', 次方公开: true,
  主方: ['A', 'D'], 抓方: ['B', 'C', 'E'],
  mode: '2V3_暗打'
});

var bh = st.players.find(function (p) { return p.id === 'B'; }).hand;
var threes = bh.filter(function (c) { return c.rank === 3; });
console.log('\u4e59\u624b\u4e0a\u7684 3:', threes.map(function (c) { return c.id; }).join(' + '));
console.log('\u684c\u4e0a:', st.table.map(function (c) { return c.rank; }).join(','), '=', identifyHand(st.table).type);
console.log('');

var p3 = identifyHand(threes);
console.log('identifyHand(\u5bf93) =', p3.type);
console.log('canBeat(\u5bf93, \u684c\u4e0a\u5bf99) =', canBeat(p3, identifyHand(st.table)));
console.log('');

console.log('=== \u76f4\u63a5\u8c03 transition(PLAY, \u5bf93) ===');
var r = transition(st, { type: ACTIONS.PLAY, payload: { playerId: 'B', cardIds: threes.map(function (c) { return c.id; }) } });
console.log('ok:', r.ok);
if (!r.ok) console.log('error:', JSON.stringify(r.error));

console.log('');
console.log('=== \u5bf9\u6bd4: \u76f4\u63a5\u8c03 handlePlay (src/play.js) ===');
var play = require('../src/play.js');
var r2 = play.handlePlay(st, { playerId: 'B', cardIds: threes.map(function (c) { return c.id; }) });
console.log('ok:', r2.ok);
if (!r2.ok) console.log('error:', JSON.stringify(r2.error));

console.log('');
console.log('=== \u63a2\u9488: transition \u5165\u53e3\u505a\u4e86\u4ec0\u4e48 ===');
var lines = require('fs').readFileSync('src/transition.js', 'utf8').split('\n');
var i = lines.findIndex(function (l) { return /^function transition/.test(l); });
for (var j = i; j < Math.min(i + 26, lines.length); j++) console.log('L' + (j + 1) + ': ' + lines[j]);