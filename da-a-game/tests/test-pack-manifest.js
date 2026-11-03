// tests/test-pack-manifest.js — 回归: **小游戏包文件集合**固定为一条断言
//
// [为什么有这个文件]
//   微信打包器只认 minigameRoot 下的文件, 任何漏网文件都会被塞进小游戏包。
//   packOptions.ignore 是**黑名单** —— 新增目录忘了加就会静默进包,
//   而包体里多一个 .js 可能在真机上报 WAGame.js:1 SyntaxError。
//   preflight 里有「陌生 .js 会不会进包」的白名单反查, 但它只查 .js,
//   查不到「多了一个 json/图片/目录」这类漏网。
//   本文件把**整个包的文件集合**钉死成一张清单 —— 任何增删都必须显式改这里。
//
// [怎么用]
//   node tests/test-pack-manifest.js
//   新增/删除游戏文件后, 把本文件的 EXPECTED_PACK 同步更新（**这是有意的摩擦**）。
//
// [范围]
//   只管「会进包的文件集合」。shebang / CRLF / BOM / 语法等由 preflight 负责。
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var passed = 0, failed = 0, failures = [];
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + name); }
  else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---- 期望打进包的文件清单（增删游戏文件时同步这里）----
var EXPECTED_PACK = [
  'game.js',
  'game.json',
  'project.config.json',
  'ui-render.js',
  'src/ai.js',
  'src/capture.js',
  'src/card.js',
  'src/combos.js',
  'src/deal.js',
  'src/hand-types.js',
  'src/index.js',
  'src/phases.js',
  'src/play.js',
  'src/push-wind.js',
  'src/scoring.js',
  'src/transition.js',
  'src/util.js',
  'src/win-loss.js'
];

// ---- 期望被排除出包的目录 ----
var EXPECTED_IGNORED_DIRS = ['scripts', 'tests', 'docs', 'skills', 'tools'];

// 按 project.config.json 的 packOptions.ignore 实际算出包文件集合
function computePack() {
  var cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
  var ignored = (cfg.packOptions && cfg.packOptions.ignore || [])
    .filter(function (x) { return x.type === 'folder'; })
    .map(function (x) { return x.value; });
  var out = [];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function (n) {
      if (n === 'node_modules' || n === '.git') return;
      var p = path.join(dir, n);
      var st = fs.statSync(p);
      if (st.isDirectory()) {
        if (ignored.indexOf(n) >= 0) return;
        walk(p);
      } else {
        // [2026-11-03] 排除**本地私有配置**(微信开发者工具生成, 已被 .gitignore 忽略,
        //   本来就不该上传) —— 它不是游戏代码, 但会落在 minigameRoot 里。
        if (n === 'project.private.config.json') return;
        out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
      }
    });
  })(ROOT);
  out.sort();
  return { files: out, ignored: ignored };
}

// ============================================================
section('1. 打包文件集合与固定清单一致');

var actual = computePack();
var actualSet = actual.files.slice().sort();
var expectedSet = EXPECTED_PACK.slice().sort();

var missing = expectedSet.filter(function (f) { return actualSet.indexOf(f) < 0; });
var extra = actualSet.filter(function (f) { return expectedSet.indexOf(f) < 0; });

check('包内文件数 = ' + expectedSet.length + ' (实际 ' + actualSet.length + ')',
  actualSet.length === expectedSet.length);
check('清单里的文件都在包里（无缺失）', missing.length === 0, missing.join(', '));
check('包里没有清单外的文件（无漏网）', extra.length === 0, extra.join(', '));

// ============================================================
section('2. 开发目录必须仍被排除出包');

EXPECTED_IGNORED_DIRS.forEach(function (d) {
  check('packOptions.ignore 覆盖 ' + d + '/',
    actual.ignored.indexOf(d) >= 0, 'ignore=' + actual.ignored.join(','));
  check(d + '/ 里没有 .js 混进包',
    actualSet.filter(function (f) { return f.indexOf(d + '/') === 0; }).length === 0);
});

// ============================================================
// 3. 顶层不该出现未知目录（新增目录忘了加 ignore 就会在这里露头）
// ============================================================
section('3. 包内顶层结构固定');
var topLevel = actualSet.map(function (f) {
  return f.indexOf('/') >= 0 ? f.split('/')[0] : f;
}).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
check('顶层只有 game.js / game.json / project.config.json / ui-render.js / src',
  topLevel.join(',') === 'game.js,game.json,project.config.json,src,ui-render.js',
  topLevel.join(','));

console.log('\ntest-pack-manifest: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
  console.log('Failed tests:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
process.exit(failed === 0 ? 0 : 1);
