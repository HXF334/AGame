// tests/test-deal-liang.js —— 逐轮发牌 + 发牌过程中可亮A
//
// [用户 2026-11-04 裁定]
//   1) 发牌阶段逐轮发牌(每轮 0.5 秒), 期间持有可亮A的玩家可以亮A
//   2) 四个大A按钮: 有的可用、没有的置灰, 挨在一起
//   3) 底牌不算可亮A (§4.2)
//
// 跑法: node tests/test-deal-liang.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var engine = require('../src/index.js');
var { createNormalCard } = require('../src/card.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

section('1. 引擎: 逐轮发牌 (DEALING -> DEAL_ROUND)');
{
  var st = engine.newGameState();
  var r = engine.transition(st, { type: engine.ACTIONS.START_GAME, payload: { progressive: true, startPlayerIndex: 0 } });
  check('1.1 START_GAME(progressive) -> DEALING', r.ok && r.state.phase === engine.PHASES.DEALING,
    r.ok ? r.state.phase : JSON.stringify(r.error));
  check('1.2 刚开始没人有牌', r.state.players.every(function (p) { return p.hand.length === 0; }));
  check('1.3 共 22 轮', r.state.dealRoundsTotal === 22, String(r.state.dealRoundsTotal));
  for (var i = 0; i < 5; i++) r = engine.transition(r.state, { type: engine.ACTIONS.DEAL_ROUND, payload: {} });
  check('1.4 发5轮后每人5张', r.state.players.every(function (p) { return p.hand.length === 5; }),
    r.state.players.map(function (p) { return p.hand.length; }).join(','));
  check('1.5 仍在 DEALING', r.state.phase === engine.PHASES.DEALING, r.state.phase);
  for (var j = 5; j < 22; j++) r = engine.transition(r.state, { type: engine.ACTIONS.DEAL_ROUND, payload: {} });
  check('1.6 发完 -> LIANG_A', r.state.phase === engine.PHASES.LIANG_A, r.state.phase);
  check('1.7 张数 21/21/21/20/20',
    r.state.players.map(function (p) { return p.hand.length; }).join(',') === '21,21,21,20,20',
    r.state.players.map(function (p) { return p.hand.length; }).join(','));
  check('1.8 每人底牌各 1 张', r.state.players.every(function (p) { return !!p.底牌; }));
  var total = r.state.players.reduce(function (a, p) { return a + p.hand.length + (p.底牌 ? 1 : 0); }, 0);
  check('1.9 总牌数 108', total === 108, String(total));
}

section('2. 引擎: 发牌中亮A (DEALING 阶段允许 LIANG_A)');
{
  var st = engine.newGameState();
  var r = engine.transition(st, { type: engine.ACTIONS.START_GAME, payload: { progressive: true, startPlayerIndex: 0 } });
  for (var i = 0; i < 4; i++) r = engine.transition(r.state, { type: engine.ACTIONS.DEAL_ROUND, payload: {} });
  var me = r.state.players[0];
  check('2.1 发4轮后手里 4 张', me.hand.length === 4, String(me.hand.length));
  var aceCard = createNormalCard('H', 14, 'dl1');
  aceCard.location = { type: 'hand', playerId: me.id };
  var st2 = Object.assign({}, r.state, {
    players: r.state.players.map(function (p) {
      return p.id === me.id ? { id: p.id, hand: p.hand.concat([aceCard]), 底牌: p.底牌 } : p;
    })
  });
  var e = engine.canLiangA(st2, me.id);
  check('2.2 发牌中(DEALING) 亮A 资格成立', e.ok === true, e.reason);
  var rr = engine.transition(st2, { type: engine.ACTIONS.LIANG_A, payload: { playerId: me.id, cardId: aceCard.id } });
  check('2.3 DEALING 阶段亮A 引擎接受', rr.ok === true, rr.ok ? '' : JSON.stringify(rr.error));
  check('2.4 亮A 后主A确立', !!(rr.state && rr.state['主A']), '');
  // [2026-11-04 用户报障 #3] 「发牌过程中亮完大A后不发牌了」
  //   -> 亮A 只确立主A, phase **保持 DEALING**(牌继续发完);
  //      发完最后一轮才由 handleDealRound 转 LIANG_A_RESOLVED(跳过亮A阶段)。
  check('2.5 亮A 后 phase 仍是 DEALING(发牌不中断)', rr.state.phase === engine.PHASES.DEALING, rr.state.phase);
  check('2.6 亮A 后发牌轮次没被重置', rr.state.dealRoundIndex === 4, String(rr.state.dealRoundIndex));
}

section('3. 引擎: 底牌不能亮A (§4.2)');
{
  var st = engine.newGameState();
  var r = engine.transition(st, { type: engine.ACTIONS.START_GAME, payload: { progressive: true, startPlayerIndex: 0 } });
  for (var i = 0; i < 22; i++) r = engine.transition(r.state, { type: engine.ACTIONS.DEAL_ROUND, payload: {} });
  var p0 = r.state.players[0];
  check('3.1 有底牌', !!p0.底牌, '');
  var rr = engine.transition(r.state, { type: engine.ACTIONS.LIANG_A, payload: { playerId: p0.id, cardId: p0.底牌.id } });
  check('3.2 底牌亮A 被引擎拒绝', rr.ok === false, rr.ok ? '' : 'rejected ok');
  check('3.3 拒绝原因是底牌不可用', !!(rr.error && /底牌/.test(rr.error.message)), rr.error ? rr.error.message : '');
}

section('4. 引擎: 逐轮与一次性发牌结果一致 (同一套规则)');
{
  var a = engine.transition(engine.newGameState(), { type: engine.ACTIONS.START_GAME, payload: { startPlayerIndex: 0 } });
  var b = engine.transition(engine.newGameState(), { type: engine.ACTIONS.START_GAME, payload: { progressive: true, startPlayerIndex: 0 } });
  for (var i = 0; i < 22; i++) b = engine.transition(b.state, { type: engine.ACTIONS.DEAL_ROUND, payload: {} });
  check('4.1 一次性发牌也是 21/21/21/20/20',
    a.state.players.map(function (p) { return p.hand.length; }).join(',') === '21,21,21,20,20',
    a.state.players.map(function (p) { return p.hand.length; }).join(','));
  check('4.2 两条路径张数一致',
    a.state.players.map(function (p) { return p.hand.length; }).join(',') ===
    b.state.players.map(function (p) { return p.hand.length; }).join(','), '');
  check('4.3 两条路径底牌槽都填满',
    a.state.players.every(function (p) { return !!p.底牌; }) &&
    b.state.players.every(function (p) { return !!p.底牌; }), '');
}

console.log('\ntest-deal-liang: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
