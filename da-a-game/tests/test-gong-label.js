// tests/test-gong-label.js —— 出完顺序(大贡/二贡/三贡/四贡) + 被4取走的牌加标志(用户 2026-11-08 22:40)
var SB = require('./lib/state-builder.js');
var card = require('../src/card.js');
var eng = require('../src/index.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log(''); console.log('=== ' + t + ' ==='); }

section('1. 出完顺序: 第一个出完=大贡, 依次二贡/三贡/四贡');
{
  var hand = [card.createNormalCard('S', 5, 'g1'), card.createNormalCard('H', 5, 'g2')];
  var st = SB.build({ handMap: { D: hand }, table: [], lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false, '主方': ['A', 'C'], '抓方': ['B', 'D', 'E'], mode: '2V3_暗打' });
  var me = st.players.filter(function (p) { return p.id === 'D'; })[0];
  st.discarded = st.discarded.concat(me.hand.slice(hand.length));
  me.hand = hand;
  var r = eng.transition(st, { type: 'PLAY', payload: { playerId: 'D', cardIds: [hand[0].id, hand[1].id] } });
  check('1.1 出牌成功', r && r.ok === true, r && r.ok ? '' : JSON.stringify(r && r.error));
  var ord = (r.state && r.state['出完顺序']) || [];
  check('1.2 出完顺序里有出完的人', ord.indexOf('D') >= 0, JSON.stringify(ord));
  check('1.3 第一个出完的人就是头名', r.state && r.state['头名'] === 'D', String(r.state && r.state['头名']));
}

section('2. 被4取走的牌带「取自」标记');
{
  var hand2 = [card.createNormalCard('S', 4, 'c1'), card.createNormalCard('H', 4, 'c2')];
  var table2 = [card.createNormalCard('S', 9, 't1'), card.createNormalCard('H', 9, 't2'), card.createNormalCard('D', 9, 't3')];
  var st2 = SB.build({ handMap: { D: hand2 }, table: table2, lastPlayer: 'B',
    '主A': { suit: 'H', establishedBy: 'A', viaMethod: 'FORCED_CHECK' },
    '次方': 'C', '次方公开': false, '主方': ['A', 'C'], '抓方': ['B', 'D', 'E'], mode: '2V3_暗打' });
  var me2 = st2.players.filter(function (p) { return p.id === 'D'; })[0];
  st2.discarded = st2.discarded.concat(me2.hand.slice(hand2.length));
  me2.hand = hand2;
  var r2 = eng.transition(st2, { type: 'PLAY', payload: { playerId: 'D', cardIds: [hand2[0].id, hand2[1].id] } });
  check('2.1 取牌成功', r2 && r2.ok === true, r2 && r2.ok ? '' : JSON.stringify(r2 && r2.error));
  var d2 = r2 && r2.state && r2.state.players.filter(function (p) { return p.id === 'D'; })[0];
  var taken = (d2 && d2.hand ? d2.hand : []).filter(function (c) { return c.取自; });
  check('2.2 被取走的牌带「取自」标记', taken.length === 3, 'taken=' + taken.length);
}

console.log('');
console.log('test-gong-label: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
