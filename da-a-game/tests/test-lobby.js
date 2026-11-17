// tests/test-lobby.js — 联网房间等待页：数据层 + 渲染命中区
var assert = require('assert');
var path = require('path');
var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var lobby = require('../src/lobby.js');

section('1. seatRows');
var view = {
  id: '123456', status: 'WAITING', round: 0, rounds: 6, seq: 3, you: 0,
  config: { rounds: 6, baseScore: 1, turnSeconds: 0, showRemain: true, memo: false, aiFill: true },
  players: [
    { seat: 0, nick: '甲', avatar: '', ready: false, ai: false, offline: false, afk: 0, total: 0, owner: true },
    { seat: 1, nick: '', avatar: '', ready: true, ai: false, offline: false, afk: 0, total: 0, owner: false },
    { seat: 3, nick: 'AI丁', avatar: '', ready: true, ai: true, offline: false, afk: 0, total: 0, owner: false }
  ]
};
var rows = lobby.seatRows(view);
check('1.1 固定 5 行', rows.length === 5);
check('1.2 空位标记', rows[2].empty === true && rows[2].label === '空位');
check('1.3 房主标记', rows[0].owner === true);
check('1.4 我标记', rows[0].you === true);
check('1.5 已备', rows[1].ready === true && rows[1].status === '已备');
check('1.6 AI 状态', rows[3].ai === true && rows[3].status === 'AI');
check('1.7 空昵称兜底', rows[1].label === '玩家2');

section('2. myRow / canStart / statusText');
check('2.1 myRow', lobby.myRow(view).seat === 0);
check('2.2 房主可开局（aiFill）', lobby.canStart(view) === true);
var noFill = JSON.parse(JSON.stringify(view));
noFill.config.aiFill = false;
check('2.3 不满员且不补 AI 时不可开局', lobby.canStart(noFill) === false);
var notOwner = JSON.parse(JSON.stringify(view));
notOwner.you = 1;
check('2.4 非房主不可开局', lobby.canStart(notOwner) === false);
check('2.5 statusText', lobby.statusText(view) === '等待准备');
check('2.6 空 view 不崩', lobby.statusText(null) === '连接中');

section('3. ui-render 命中区');
var uiRender = require('../ui-render.js');
var calls = [];
var ctx = new Proxy({}, {
  get: function (t, k) {
    if (k === 'createLinearGradient') return function () { return { addColorStop: function () {} }; };
    if (k === 'measureText') return function () { return { width: 10 }; };
    return function () { calls.push(String(k)); };
  },
  set: function () { return true; }
});
var st = { W: 800, H: 400, room: view, page: 'LOBBY', cfg: view.config };
var out = uiRender.render(ctx, st);
var ids = (out.lobbyHits || []).map(function (b) { return b.id; });
check('3.1 返回 lobbyHits', out.page === 'LOBBY' && ids.length >= 2);
check('3.2 房主看到开始（无准备）', ids.indexOf('lobbyStart') >= 0 && ids.indexOf('lobbyReady') < 0);
check('3.3 不再有离开按钮', ids.indexOf('lobbyLeave') < 0);
check('3.4 房主看到开始', ids.indexOf('lobbyStart') >= 0);
check('3.5 非房主看不到开始', (function () {
  var v2 = JSON.parse(JSON.stringify(view)); v2.you = 1;
  var o2 = uiRender.render(ctx, { W: 800, H: 400, room: v2, page: 'LOBBY', cfg: v2.config });
  return (o2.lobbyHits || []).map(function (b) { return b.id; }).indexOf('lobbyStart') < 0;
})());

section('4. game.js 钩子');
require('./mock-wx.js');
var g = require('../game.js');
g.__setRoomView(view);
check('4.1 进 LOBBY', g.__page() === 'LOBBY');
check('4.2 命中区暴露', g.__pageHits().length >= 2);
check('4.3 roomView 可读', g.__roomView() && g.__roomView().id === '123456');
g.__setPage('HOME');
check('4.4 回首页', g.__page() === 'HOME');

console.log('\n结果: ' + passed + ' 通过 / ' + failed + ' 失败');
if (failed) { console.log('失败项: ' + failures.join(', ')); process.exit(1); }
process.exit(0);
