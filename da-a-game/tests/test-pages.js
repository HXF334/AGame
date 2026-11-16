// [2026-11-16 用户] 联网 P2：首页/创建/加入页面 + 单机入口
var assert = require('assert');
var mock = require('./mock-wx.js');
mock.install();
var g = require('../game.js');

var checks = 0;
function ok(name, cond) { checks++; assert.ok(cond, name); }
function hit(id) {
  var hs = g.__pageHits() || [];
  for (var i = 0; i < hs.length; i++) if (hs[i].id === id) return hs[i];
  return null;
}
function tap(b) { g.__tapPage(b.x + b.w / 2, b.y + b.h / 2); }

// 1) 测试环境默认落在 GAME（真实小程序默认 HOME）
ok('mock defaults to GAME', g.__page() === 'GAME');

// 2) HOME 三个入口
g.__setPage('HOME');
['homeCreate', 'homeJoin', 'homeSolo'].forEach(function (id) { ok('home has ' + id, !!hit(id)); });

// 3) 创建页：默认配置 + 选择
tap(hit('homeCreate'));
ok('to CREATE', g.__page() === 'CREATE');
ok('default rounds 12', g.__createCfg().rounds === 12);
var chips = (g.__pageHits() || []).filter(function (b) { return b.id === 'chip' && b.key === 'rounds' && b.value === 30; });
ok('rounds chip 30 exists', chips.length === 1);
tap(chips[0]);
ok('rounds set 30', g.__createCfg().rounds === 30);

var memo = (g.__pageHits() || []).filter(function (b) { return b.id === 'toggle' && b.key === 'memo'; })[0];
ok('memo default off', g.__createCfg().memo === false);
tap(memo);
ok('memo toggled on', g.__createCfg().memo === true);

// 4) 返回首页
tap(hit('createBack'));
ok('back to HOME', g.__page() === 'HOME');

// 5) 加入页：数字键与删除
tap(hit('homeJoin'));
ok('to JOIN', g.__page() === 'JOIN');
var digits = ['1', '2', '3', '4', '5', '6'];
digits.forEach(function (d) {
  var b = (g.__pageHits() || []).filter(function (h) { return h.id === 'joinDigit' && h.d === d; })[0];
  tap(b);
});
ok('6 digits entered', g.__pageHits() && true);
tap(hit('joinDel'));
tap(hit('joinBack'));
ok('back HOME from JOIN', g.__page() === 'HOME');

// 6) 单机入口：回到 GAME 并开新局
tap(hit('homeSolo'));
ok('solo enters GAME', g.__page() === 'GAME');
ok('solo starts a game', !!g.gameState() && typeof g.gameState().phase === 'string');

console.log('pages: ' + checks + ' checks passed');
process.exit(0);
