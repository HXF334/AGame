// scripts/commit-gate.js — 提交闸门：preflight 不过就不许提交
//
// [2026-10-24 血的教训] 今晚我把源文件写成 CRLF 后直接提交了 ——
//   preflight **明明查到了**(检查 3「无 CRLF」), 但我的脚本**没看它的退出码**,
//   于是 CRLF 进了仓库, 真机报 `WAGame.js:1 SyntaxError: Invalid or unexpected token`。
//   这道闸门就是把「体检结果」真正变成「能不能提交」的硬条件。
//
// 用法:
//   node scripts/commit-gate.js            # 只体检, 打印结果
//   node scripts/commit-gate.js MSG.txt    # 体检通过才 git add + commit
var cp = require('child_process');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

var r = cp.spawnSync(process.execPath, [path.join(__dirname, 'preflight.js')],
  { encoding: 'utf8', maxBuffer: 1 << 26, cwd: ROOT });
var out = (r.stdout || '') + (r.stderr || '');
out.split(/\r?\n/).forEach(function (l) { if (l.trim()) console.log(l); });

if (r.status !== 0) {
  console.log('\n[commit-gate] preflight FAILED -> 拒绝提交');
  process.exit(1);
}
console.log('\n[commit-gate] preflight PASSED');

var msgPath = process.argv[2];
if (!msgPath) { process.exit(0); }

var c = cp.spawnSync('git', ['add', '-A'], { cwd: ROOT, stdio: 'inherit' });
if (c.status !== 0) process.exit(c.status);
c = cp.spawnSync('git', ['commit', '-q', '-F', msgPath], { cwd: ROOT, stdio: 'inherit' });
process.exit(c.status);
