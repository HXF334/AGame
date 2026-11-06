// tests/test-req-20261104c.js —— 2026-11-04 21:51 用户 4 项调整的定向回归
//
// [用户 2026-11-04 21:51 原话]
//   1. 发牌速度改为0.3秒。
//   2. 机器人头像太小了，占大部分按钮区域，按钮再往右移一点，大小和记牌器按钮一样，两个都再大一点。
//   3. 真人玩家头像那一片整体往上一点；左右第二排玩家头像那一片再往下移一点。
//   4. 亮A那四个花色按钮还是再分开一些。
//
// 跑法: node tests/test-req-20261104c.js
var mock = require('./mock-wx.js');
mock.install({});
var g = require('../game.js');
var uiRender = require('../ui-render.js');

var pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var VW = 844, VH = 390;
var lay = uiRender.layout(VW, VH);

// [2026-11-06 用户] 发牌速度再次调整: 0.3 秒 -> **0.2 秒**
section('1. 发牌速度改为 0.2 秒');
{
  check('1.1 发牌间隔 = 200ms', g.__dealStepMs() === 200, String(g.__dealStepMs()));
  var totalS = (22 * g.__dealStepMs()) / 1000;
  check('1.2 22 轮总时长 4.4 秒', Math.abs(totalS - 4.4) < 0.001, String(totalS));
}

section('2. 机器人图标: 与记牌器同大小 / 两个都更大 / 往右移 / 图形占满按钮');
{
  var OLD_MEMO_R = Math.round(VH * 0.034);   // 上一轮: 记牌器 13px
  var OLD_BOT_R = Math.round(VH * 0.032);    // 上一轮: 机器人 12px
  var OLD_BOT_X = VW - Math.round(VH * 0.38); // 上一轮: 让开胶囊按钮让过头了
  check('2.1 机器人图标与记牌器图标**同大小**',
    lay.autoPlay.iconR === lay.memo.iconR,
    'bot=' + lay.autoPlay.iconR + ' memo=' + lay.memo.iconR);
  check('2.2 记牌器图标比上一轮更大', lay.memo.iconR > OLD_MEMO_R,
    'new=' + lay.memo.iconR + ' old=' + OLD_MEMO_R);
  check('2.3 机器人图标比上一轮更大', lay.autoPlay.iconR > OLD_BOT_R,
    'new=' + lay.autoPlay.iconR + ' old=' + OLD_BOT_R);
  check('2.4 机器人按钮**再往右移**一点', lay.autoPlay.iconX > OLD_BOT_X,
    'new=' + lay.autoPlay.iconX + ' old=' + OLD_BOT_X);
  check('2.5 但仍避开小游戏胶囊按钮(离右边缘 >= 100px)',
    VW - (lay.autoPlay.iconX + lay.autoPlay.iconR) >= 100,
    '右缘=' + (VW - lay.autoPlay.iconX - lay.autoPlay.iconR));
  check('2.6 机器人图形占按钮大部分区域(头部宽 >= 0.7 半径)',
    !!lay.bot && lay.bot.headW >= 0.7, JSON.stringify(lay.bot));
  check('2.7 机器人头部高度也放大(>= 0.5 半径)',
    !!lay.bot && lay.bot.headH >= 0.5, JSON.stringify(lay.bot));
}
section('3. 真人玩家头像整体上移 / 左右第二排 AI 头像再下移');
{
  var OLD_ME_Y = VH * 0.805 + VH * 0.200 * 0.42;   // 上一轮: 346.7
  var OLD_ROW2_Y = VH * 0.450;                      // 上一轮: 第二排 175.5
  var ROW1_Y = VH * 0.235;                          // 第一排(上一轮已下移过, 本轮不动)
  check('3.1 真人头像整体**往上**移', lay.me.y < OLD_ME_Y,
    'new=' + lay.me.y.toFixed(1) + ' old=' + OLD_ME_Y.toFixed(1));
  check('3.2 真人头像上移幅度合理(8~20px)',
    (OLD_ME_Y - lay.me.y) >= 8 && (OLD_ME_Y - lay.me.y) <= 20,
    'delta=' + (OLD_ME_Y - lay.me.y).toFixed(1));
  check('3.3 左侧第二排 AI 头像**再往下**移', lay.seats[1].y > OLD_ROW2_Y,
    'new=' + lay.seats[1].y.toFixed(1) + ' old=' + OLD_ROW2_Y.toFixed(1));
  check('3.4 右侧第二排 AI 头像**再往下**移', lay.seats[3].y > OLD_ROW2_Y,
    'new=' + lay.seats[3].y.toFixed(1) + ' old=' + OLD_ROW2_Y.toFixed(1));
  check('3.5 第二排左右两侧对称', Math.abs(lay.seats[1].y - lay.seats[3].y) < 0.5,
    String(lay.seats[1].y - lay.seats[3].y));
  check('3.6 第一排 AI 头像位置未动(本轮只调第二排)',
    Math.abs(lay.seats[0].y - ROW1_Y) < 0.5 && Math.abs(lay.seats[2].y - ROW1_Y) < 0.5,
    'new=' + lay.seats[0].y.toFixed(1) + ' expect=' + ROW1_Y.toFixed(1));
}

section('4. 亮A 那四个花色按钮再分开一些');
{
  var suits = [{ id: 'a', kind: 'suit' }, { id: 'b', kind: 'suit' },
                { id: 'c', kind: 'suit' }, { id: 'd', kind: 'suit' }];
  var bs = uiRender.buttonLayout(suits, lay);
  var gaps = [];
  for (var i = 1; i < bs.length; i++) gaps.push(Math.round(bs[i].x - (bs[i - 1].x + bs[i - 1].w)));
  check('4.1 四个花色按钮之间**有**间隙(不再挨在一起)',
    gaps.length === 3 && gaps.every(function (gp) { return gp > 0; }), JSON.stringify(gaps));
  // [2026-11-06 用户] 「亮A那四个花色按钮距离再小一些」-> 上轮的 ">=12px" 改为 6~10px
  check('4.2 间隙在 6~10px(比上轮更小)',
    gaps.every(function (gp) { return gp >= 6 && gp <= 10; }), JSON.stringify(gaps));
  check('4.3 四个花色按钮等距',
    Math.abs(gaps[0] - gaps[1]) < 0.5 && Math.abs(gaps[1] - gaps[2]) < 0.5, JSON.stringify(gaps));
  check('4.4 整排仍居中',
    Math.abs((bs[0].x) - (VW - (bs[3].x + bs[3].w))) < 1.5,
    'left=' + bs[0].x.toFixed(1) + ' right=' + (VW - (bs[3].x + bs[3].w)).toFixed(1));
  check('4.5 整排宽度没超出屏幕', bs[3].x + bs[3].w < VW, String(bs[3].x + bs[3].w));
  // 普通按钮(出牌/不出/提示)之间的间隙不受影响
  var other = uiRender.buttonLayout([{ id: 'p' }, { id: 'q' }, { id: 'r' }], lay);
  var og = Math.round(other[1].x - (other[0].x + other[0].w));
  check('4.6 普通按钮之间的间隙不变(约 10px)', Math.abs(og - Math.round(VW * 0.012)) <= 1, 'gap=' + og);
}

console.log('\ntest-req-20261104c: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
process.exit(0);
