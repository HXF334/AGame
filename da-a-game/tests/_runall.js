// tests/_runall.js — 批量跑测试套件
//
// [背景] HANDOFF.md / TEST_REPORT.md 一直引用 `node tests/_runall.js 3`,
//   但**该文件从不存在** —— 照抄必然失败。2026-10-23 补上。
//
// 用法:
//   node tests/_runall.js            # 跑一遍全部套件
//   node tests/_runall.js 3          # 跑 3 轮全部套件(旧文档写法, 兼容)
//   node tests/_runall.js 10 20      # 只跑第 11~20 个(1-based 闭区间)
//   node tests/_runall.js 10 20 3    # 上述范围跑 3 轮
//
// [为什么自带超时] 单个套件卡死会让整批跑不完 —— 每个子进程带 60s 超时,
//   失败时打印该套件的汇总行与前 3 条失败断言。
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var argv = process.argv.slice(2).map(function (a) { return parseInt(a, 10); })
  .filter(function (n) { return !isNaN(n); });

var files = fs.readdirSync(path.join(__dirname))
  .filter(function (f) { return /^test-.*\.js$/.test(f); })
  .sort();

var rounds = 1, from = 0, to = files.length - 1;
if (argv.length === 1) {
  rounds = argv[0];                                  // 旧写法: _runall.js 3
} else if (argv.length >= 2) {
  // 1-based 闭区间; 并做钳制, 避免传 0 时 from=-1 -> files[-1] 是 undefined
  from = Math.max(0, argv[0] - 1);
  to = Math.min(argv[1] - 1, files.length - 1);
  if (argv.length >= 3) rounds = argv[2];
}

var PER_SUITE_TIMEOUT = 60000;
var allBad = [];
var totalRun = 0;

for (var r = 0; r < rounds; r++) {
  for (var i = from; i <= to && i < files.length; i++) {
    var f = files[i];
    totalRun++;
    var res;
    try {
      res = cp.spawnSync(process.execPath, [path.join(__dirname, f)], {
        encoding: 'utf8', timeout: PER_SUITE_TIMEOUT,
        cwd: path.join(__dirname, '..')
      });
    } catch (e) {
      allBad.push(f + ' [spawn error: ' + e.message + ']');
      continue;
    }
    if (res.status !== 0) {
      var out = (res.stdout || '') + (res.stderr || '');
      var summary = (out.match(/checks: \d+ \| passed: \d+ \| failed: \d+/) ||
        out.match(/passed: \d+ \| failed: \d+/) ||
        out.match(/全部断言通过|全部通过/) || ['(无汇总)'])[0];
      var errs = (out.match(/^  - .*$/gm) || []).slice(0, 3).join(' ;; ');
      allBad.push(f + ' [' + summary + '] ' + errs);
    }
  }
  process.stderr.write('  第 ' + (r + 1) + '/' + rounds + ' 轮完成\n');
}

console.log('套件 ' + files.length + ' 个, 范围 ' + (from + 1) + '-' + (to + 1) +
  ', 共执行 ' + totalRun + ' 次; 失败 ' + allBad.length + ' 次');
allBad.forEach(function (b) { console.log('  FAIL ' + b); });
process.exit(allBad.length ? 1 : 0);