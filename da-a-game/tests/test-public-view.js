// tests/test-public-view.js
// [2026-11-16 用户] 为好友建房/上云做前置：服务端给每个客户端的状态投影必须隐藏别人的手牌、底牌、牌堆顺序。
var path = require('path');
var pv = require(path.join(__dirname, '..', 'src', 'public-view.js'));
var SB = require('./lib/state-builder.js');

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

var st = SB.build({
  handMap: { B: [SB.C('H', 5), SB.C('S', 14)], D: [SB.C('D', 7), SB.C('C', 8)] },
  table: [SB.C('H', 9)],
  lastPlayer: 'C'
});
var view = pv.project(st, 'B');
var json = JSON.stringify(view);

// 1. 自己的牌原样保留
var me = view.players.filter(function (p) { return p.id === 'B'; })[0];
check('1.1 自己的手牌保留', me && me.hand && me.hand.length === st.players.filter(function (p) { return p.id === 'B'; })[0].hand.length);

// 2. 别人的手牌一张都不出现
var dCards = st.players.filter(function (p) { return p.id === 'D'; })[0].hand;
var leaked = dCards.filter(function (c) { return json.indexOf(c.id) >= 0; });
check('2.1 别人的手牌不泄露', leaked.length === 0, leaked.map(function (c) { return c.id; }).join(','));

// 3. 只给张数
var dView = view.players.filter(function (p) { return p.id === 'D'; })[0];
check('2.2 别人只有 handCount', dView && dView.hand === undefined && dView.handCount === dCards.length, dView && dView.handCount);

// 4. 牌堆与发牌顺序不出现
check('3.1 deck/dealOrder 被剔除', view.deck === undefined && view.dealOrder === undefined);

// 5. 底牌未公开时别人底牌为 null
var st2 = SB.build({ handMap: { B: [SB.C('H', 5)], D: [SB.C('D', 7)] } });
st2['底牌公开'] = false;
// SB.build 不填底牌槽，这里手动放一张，验证投影会隐藏它
var dReal = st2.players.filter(function (p) { return p.id === 'D'; })[0];
dReal['底牌'] = SB.C('S', 13);
var v2 = pv.project(st2, 'B');
var d2 = v2.players.filter(function (p) { return p.id === 'D'; })[0];
var d2real = st2.players.filter(function (p) { return p.id === 'D'; })[0];
check('4.1 未公开时别人底牌隐藏', d2['底牌'] === null && d2real['底牌'] !== null);

// 6. 公开后可见
st2['底牌公开'] = true;
var v3 = pv.project(st2, 'B');
var d3 = v3.players.filter(function (p) { return p.id === 'D'; })[0];
check('4.2 公开后别人底牌可见', d3['底牌'] === d2real['底牌']);

// 7. 公开信息保留
check('5.1 桌面/弃牌/流水保留', view.table === st.table && view.discarded === st.discarded && view.plays === st.plays);

console.log('\ntest-public-view: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
