// tests/test-audit-ui.js — 自主审查: game.js 状态同步与信息边界 (§12/§14)
var fs = require('fs');
var srcUI = (function () { try { return fs.readFileSync(require('path').join(__dirname, '..', 'ui-render.js'), 'utf8'); } catch (e) { return ''; } })();
var src = fs.readFileSync('game.js', 'utf8');

var passed = 0, failed = 0;
var failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ================= 1. 所有玩家动作都经过 transition =================
section('1. §14 所有合法动作由规则引擎产生和校验');

check('1.1 需 require 引擎 transition', src.indexOf('transition') >= 0);
check('1.2 出牌经 transition(ACTIONS.PLAY)', src.indexOf('ACTIONS.PLAY') >= 0);
check('1.3 过牌经 transition(ACTIONS.PASS)', src.indexOf('ACTIONS.PASS') >= 0);
check('1.4 推风经 transition(ACTIONS.PUSH_WIND)', src.indexOf('ACTIONS.PUSH_WIND') >= 0);
// 不允许直接改 gameState.players
check('1.5 UI 不直接改写 players (绕过引擎)',
  !/gameState\.players\s*=/.test(src), '发现直接赋值');
check('1.6 UI 不直接改写 table (绕过引擎)',
  !/gameState\.table\s*=/.test(src), '发现直接赋值');

// ================= 2. 信息边界 §12 / §14 =================
section('2. §12 信息边界 (隐藏手牌/底牌不泄露)');

// draw() 里只能渲染 humanPlayer 的手牌
var drawIdx = src.indexOf('function draw()');
var drawEnd = src.indexOf('// === 首次 draw');
// [2026-10-24 UI 重做] 渲染层拆到 ui-render.js, 断言要**同时**看两个文件
// [2026-10-24 UI 重做] 渲染层拆到 ui-render.js -> 断言要**同时**看两个文件
var drawBody = src.substring(drawIdx, drawEnd > 0 ? drawEnd : drawIdx + 6000) + '\n' + srcUI;

check('2.1 draw 渲染手牌时限定 humanPlayer',
  drawBody.indexOf('p.id === humanPlayer') >= 0, '未按 humanPlayer 过滤');
// 其他玩家手牌计数可用, 但不得出现遍历他人 hand 渲染牌面的代码
var foreignHandRender = /players\.(map|forEach)\([^)]*\)[\s\S]{0,200}?\.hand[\s\S]{0,200}?(fillRect|fillText\([^)]*cardDesc)/.test(drawBody);
check('2.2 draw 不渲染他人手牌内容', !foreignHandRender, '疑似渲染他人手牌');
// [P3] draw 只显示"底牌公开: 是/否"这一公开状态标记 (§4.5 底牌翻开时机人人可见),
//      不渲染任何底牌明面。收紧断言: draw 内不得访问玩家 底牌 对象。
var accessesBottomCard = /\.底牌\b/.test(drawBody) && !/底牌公开/.test(
  drawBody.substring(Math.max(0, drawBody.indexOf('.底牌') - 10), drawBody.indexOf('.底牌') + 10)
);
check('2.3 draw 不访问任何玩家底牌明面 (§14 每张牌只在一处可见)',
  !/\.底牌[\s\W]/.test(drawBody.replace(/底牌公开/g, '')), 'draw 内出现 .底牌 访问');

// ================= 3. 阶段约束 §3 =================
section('3. §3 阶段约束 (结束后不能再出牌)');
check('3.1 doPlay 检查 phase === PHASES.PLAY', /function doPlay[\s\S]{0,200}?PHASES\.PLAY/.test(src));
check('3.2 doPass 检查 phase === PHASES.PLAY', /function doPass[\s\S]{0,200}?PHASES\.PLAY/.test(src));

// ================= 4. 健壮性 §14 =================
section('4. §14 健壮性');
  // [2026-10-24 UI 重做] 新契约: 无 canvas 时用 **noopCtx 兜底并仍然算几何**(命中区),
  //   比旧的「直接 return」更强 —— 旧写法无头测试拿不到命中区。
  check("4.1 draw 对无 canvas 时兜底(noopCtx, 仍算几何)",
    /noopCtx|if \(!ctx\)/.test(src) && /noopCtx/.test(srcUI), "缺 ctx 兜底");
check('4.2 runAI 有循环上限保护', /guard\s*[<>=]/.test(src), 'AI 循环无上限');
check('4.3 AI cardIds 空守卫', src.indexOf('action.cardIds &&') >= 0, '缺 cardIds 守卫');
check('4.4 相册文本访问已加下标越界守卫', src.indexOf("['A','B','C','D','E'].indexOf") >= 0 || src.indexOf("indexOf(currentPlayer)") >= 0, '玩家名映射无守卫');

// ================= 5. 语法 =================
section('5. 语法完整性');
var okSyntax = true, synErr = '';
try { new Function(src.replace(/require\(/g, 'void 0 && require(')); } catch (e) { synSyntax: synErr = e.message; okSyntax = false; }
check('5.1 game.js 可解析', okSyntax, synErr);

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) {
  console.log('\nFAILED:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed > 0 ? 1 : 0);