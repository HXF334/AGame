// scripts/preflight.js — 提交/打包前体检
//
// [为什么存在] 2026-10-24 晚上连续两个 P0 都是「本地全绿、真机崩」：
//   1. 源文件被改成 CRLF -> 微信小游戏打包器不认 -> WAGame.js:1 SyntaxError
//   2. scripts/*.js 头带 `#!/usr/bin/env node` -> 项目目录所有 .js 都进包
//      -> `#` 是 JS 语法错误 -> 同样 WAGame.js:1 SyntaxError
//   两个都**通不过 node --check**, 也**通不过 55 个套件**。所以必须有独立的一道关卡。
//
// [用法] node scripts/preflight.js            # 全跑
//         node scripts/preflight.js --fast     # 跳过全量测试(只跑静态体检)
//
// [退出码] 0 = 全过; 1 = 有失败项
//
// [注意] 本文件**不能有 shebang** —— 它自己在 scripts/ 下, 会被打进包。
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');     // da-a-game/
var FAST = process.argv.indexOf('--fast') >= 0;

var results = [];
function check(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || '' });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
  return ok;
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// 项目里**会进包**的目录（packOptions.ignore 之外的都算）
function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (n) {
    if (n === 'node_modules' || n === '.git') return;
    var p = path.join(dir, n);
    var st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}
var ALL_FILES = walk(ROOT, []);
var JS_FILES = ALL_FILES.filter(function (f) { return /\.js$/.test(f); });
var rel = function (f) { return path.relative(ROOT, f).replace(/\\/g, '/'); };

// ---------------------------------------------------------------- 1. shebang
section('1. shebang（#!）— 会被打进包的 .js 都不能有');
var shebang = JS_FILES.filter(function (f) {
  return fs.readFileSync(f, 'utf8').indexOf('#!') === 0;
});
check('无 shebang', shebang.length === 0,
  shebang.length ? shebang.map(rel).join(', ') : JS_FILES.length + ' 个 .js 全部干净');

// ---------------------------------------------------------------- 2. BOM
section('2. UTF-8 BOM');
var boms = JS_FILES.filter(function (f) {
  var b = fs.readFileSync(f);
  return b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
});
check('无 BOM', boms.length === 0, boms.length ? boms.map(rel).join(', ') : '');

// ---------------------------------------------------------------- 3. 行尾
section('3. 行尾（必须是 LF；CRLF 会让打包器报 SyntaxError）');
var crlfFiles = [], mixedFiles = [];
JS_FILES.forEach(function (f) {
  var s = fs.readFileSync(f, 'utf8');
  var crlf = 0, lf = 0, lone = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c === 13) { if (s.charCodeAt(i + 1) === 10) { crlf++; i++; } else lone++; }
    else if (c === 10) lf++;
  }
  if (crlf > 0) crlfFiles.push(rel(f) + '(CRLF=' + crlf + ')');
  if (lone > 0) mixedFiles.push(rel(f) + '(孤立CR=' + lone + ')');
});
check('无 CRLF', crlfFiles.length === 0, crlfFiles.join(' '));
check('无孤立 CR', mixedFiles.length === 0, mixedFiles.join(' '));

// ---------------------------------------------------------------- 4. 怪字符
section('4. 非标准字符（U+2028/2029、孤立代理对、控制字符）');
var SUS = { 0x2028: 1, 0x2029: 1, 0xFEFF: 1, 0x00A0: 1, 0x200B: 1, 0x200C: 1, 0x200D: 1, 0x200E: 1, 0x200F: 1, 0x2060: 1, 0xFE0F: 1, 0xFFFD: 1, 0x2066: 1, 0x2067: 1, 0x2068: 1, 0x2069: 1 };
var weird = [], weirdJs = [];
JS_FILES.forEach(function (f) {
  var s = fs.readFileSync(f, 'utf8'), hit = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (SUS[c]) hit++;
    else if (c < 32 && c !== 9 && c !== 10 && c !== 13) hit++;
    else if (c >= 0xD800 && c <= 0xDBFF) {
      var nx = s.charCodeAt(i + 1);
      if (!(nx >= 0xDC00 && nx <= 0xDFFF)) hit++;
    } else if (c >= 0xDC00 && c <= 0xDFFF) hit++;
  }
  if (hit) { (/.js$/.test(f) ? weirdJs : weird).push(rel(f) + '(' + hit + ')'); }
});
check('.js 无非标准字符(严格)', weirdJs.length === 0, weirdJs.join(' '));
// 非 .js 只报警告: 有些 U+FFFD 是**故意的**(如文档里引用 BOM 报错示例)
var others = ALL_FILES.filter(function (f) { return !/\.js$/.test(f) && fs.existsSync(f); });
var weirdOther = [];
others.forEach(function (f) {
  var s = fs.readFileSync(f, 'utf8'), hit = 0;
  for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xFFFD) hit++;
  if (hit) weirdOther.push(rel(f) + '(' + hit + ')');
});
if (weirdOther.length) {
  console.log('  WARN  非 .js 文件含 U+FFFD(可能是故意的示例, 也可能是损坏): ' + weirdOther.join(' '));
} else {
  console.log('  PASS  非 .js 文件无 U+FFFD');
}

// ---------------------------------------------------------------- 5. 语法
section('5. 语法（node --check 全部 .js）');
var syntaxBad = [];
JS_FILES.forEach(function (f) {
  try { cp.execSync('node --check "' + f + '"', { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { syntaxBad.push(rel(f)); }
});
check('全部 .js 语法正确', syntaxBad.length === 0, syntaxBad.join(' '));

// ---------------------------------------------------------------- 6. 打包配置
section('6. 打包配置（project.config.json）');
var pcPath = path.join(ROOT, 'project.config.json');
var cfg = null, cfgErr = '';
try { cfg = JSON.parse(fs.readFileSync(pcPath, 'utf8')); }
catch (e) { cfgErr = e.message; }
check('project.config.json 可解析', !!cfg, cfgErr);
if (cfg) {
  var ignored = (cfg.packOptions && cfg.packOptions.ignore || []).map(function (x) { return x.value; });
  // 项目里存在的**不该进包**的目录
  var SHOULD = ['scripts', 'tests', 'docs', 'skills'];
  var missing = SHOULD.filter(function (d) {
    return fs.existsSync(path.join(ROOT, d)) && ignored.indexOf(d) < 0;
  });
  check('packOptions.ignore 覆盖非游戏目录', missing.length === 0,
    missing.length ? '缺: ' + missing.join(', ') : '已排除: ' + ignored.join(', '));
  check('minigameRoot 存在', fs.existsSync(path.join(ROOT, cfg.minigameRoot || './')),
    'minigameRoot=' + cfg.minigameRoot);
}

// ---------------------------------------------------------------- 7. 配置 JSON
section('7. 其它配置文件');
['game.json'].forEach(function (f) {
  var p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { check(f + ' 存在', false, '缺失'); return; }
  var ok = true, msg = '';
  try { JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { ok = false; msg = e.message; }
  check(f + ' 可解析', ok, msg);
});

// ---------------------------------------------------------------- 8. Skill 镜像
section('8. Skill 镜像一致（仓库=唯一来源, Workshop=生成镜像）');
try {
  var r = cp.execSync('node "' + path.join(ROOT, 'scripts/sync-skills.js') + '" --check', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  check('sync-skills --check', true, String(r).trim().split('\n').pop());
} catch (e) {
  check('sync-skills --check', false, '镜像与仓库不一致, 跑 node scripts/sync-skills.js');
}

// ---------------------------------------------------------------- 9. 全量测试
section('9. 全量测试');
if (FAST) {
  console.log('  SKIP  (--fast)');
} else {
  var pass = 0, fail = [], names = [];
  try {
    names = fs.readdirSync(path.join(ROOT, 'tests')).filter(function (n) { return /^test-.*\.js$/.test(n); }).sort();
  } catch (e) { }
  names.forEach(function (n) {
    try {
      cp.execSync('node "' + path.join(ROOT, 'tests', n) + '"', { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
      pass++;
    } catch (e) { fail.push(n); }
  });
  check('全部套件 PASS', fail.length === 0,
    (pass + '/' + names.length) + (fail.length ? ' 失败: ' + fail.join(', ') : ''));
}

// ---------------------------------------------------------------- 汇总
var bad = results.filter(function (r) { return !r.ok; });
console.log('\n' + '='.repeat(56));
console.log('preflight: ' + (results.length - bad.length) + '/' + results.length + ' 项通过');
if (bad.length) {
  console.log('失败项:');
  bad.forEach(function (r) { console.log('  - ' + r.name + (r.detail ? '  ' + r.detail : '')); });
  process.exit(1);
}
console.log('全部通过 ✓');
process.exit(0);
