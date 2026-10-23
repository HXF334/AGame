// tools/audit-skill-tests.js —— SKILL §13「必测用例」覆盖对账
//
// 目的: SKILL 是本项目**唯一规则依据**。§13 自己列出了 20 条「必测用例」,
//   本工具以它为锚, 检查每条在 51 个测试套件里**是否真的有断言**。
//
// 为什么这比逐条对账 157 个条款更值得先做:
//   §13 是项目自己定义的下限。用它当基准, 先把「自称必测却没测」的挑出来。
//
// 方法(启发式, 可复现):
//   对每条条款提取特征词:
//     - 反引号内的标识符(如 `is主方大A`)
//     - 数字(5 / 6 / 108 / 22)
//     - 中文关键词(2-4 字)
//   再在全部测试文件里反查这些词, 统计命中文件数。
//   命中 0 个特征词 -> 标记为「无测试线索」。
//
// 【诚实边界】命中 0 只说明「**没有明显线索**」, 不等于一定没测;
//   命中 > 0 也不等于有断言(可能只是注释提到)。
//   本工具给的是**排查清单**, 不是判决 —— 判定仍需人读断言。
//
// 用法: node tools/audit-skill-tests.js
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SKILL = path.join(ROOT, 'skills', 'da-a-game-rules', 'SKILL.md');
var TESTS = path.join(ROOT, 'tests');

var lines = fs.readFileSync(SKILL, 'utf8').split('\n');

// ---- 提取 §13 的条款 ----
var secStart = -1, secEnd = lines.length;
for (var i = 0; i < lines.length; i++) {
  if (/^##\s*13\.\s*必测用例/.test(lines[i])) { secStart = i; break; }
}
if (secStart < 0) { console.log('未找到 §13'); process.exit(1); }
for (var j = secStart + 1; j < lines.length; j++) {
  if (/^##\s/.test(lines[j])) { secEnd = j; break; }
}

var clauses = [];
for (var k = secStart + 1; k < secEnd; k++) {
  var t = lines[k].trim();
  if (t === '' || t.indexOf('>') === 0) continue;
  var m = t.match(/^(\d+)[.、]\s*(.+)$/);
  if (m) clauses.push({ no: m[1], text: m[2] });
  else if (/^[-*]\s/.test(t)) clauses.push({ no: '-', text: t.replace(/^[-*]\s*/, '') });
}

// ---- 收集测试语料 ----
var files = fs.readdirSync(TESTS).filter(function (f) { return /^test-.*\.js$/.test(f); });
var corpus = files.map(function (f) {
  return { name: f, text: fs.readFileSync(path.join(TESTS, f), 'utf8') };
});

// ---- 特征词提取 ----
function tokensOf(text) {
  var out = [];
  // 反引号标识符
  var re1 = /`([^`]{2,40})`/g, m;
  while ((m = re1.exec(text))) out.push(m[1]);
  // 数字
  var re2 = /\b(\d{1,4})\b/g;
  while ((m = re2.exec(text))) {
    var n = m[1];
    if (['1', '2', '3', '4', '5'].indexOf(n) >= 0) continue;   // 太常见, 无区分度
    out.push(n);
  }
  // 中文关键词: 取 3 字及以上的连续中文片段, 再切出包含规则术语的组合
  var cn = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  cn.forEach(function (seg) {
    if (seg.length <= 4) { if (seg.length >= 2) out.push(seg); return; }
    for (var q = 0; q + 3 <= seg.length; q++) out.push(seg.slice(q, q + 3));
  });
  return out.filter(function (t, i, a) { return t && a.indexOf(t) === i; });
}

var uncovered = [], weak = [], covered = [];
clauses.forEach(function (c) {
  var toks = tokensOf(c.text);
  if (!toks.length) { uncovered.push({ c: c, hits: 0, tokens: [] }); return; }
  var hitFiles = {};
  toks.forEach(function (t) {
    corpus.forEach(function (f) {
      if (f.text.indexOf(t) >= 0) { (hitFiles[t] = hitFiles[t] || []).push(f.name); }
    });
  });
  var hitTokens = Object.keys(hitFiles);
  var fileSet = {};
  hitTokens.forEach(function (t) { hitFiles[t].forEach(function (n) { fileSet[n] = 1; }); });
  var nFiles = Object.keys(fileSet).length;
  var rec = { c: c, hits: nFiles, tokens: hitTokens, sample: Object.keys(fileSet).slice(0, 3) };
  if (nFiles === 0) uncovered.push(rec);
  else if (nFiles <= 1) weak.push(rec);
  else covered.push(rec);
});

function dump(title, arr) {
  console.log('\n=== ' + title + ' (' + arr.length + ' 条) ===');
  arr.forEach(function (r) {
    console.log('  §13.' + r.c.no + ' ' + r.c.text.slice(0, 62));
    console.log('      命中文件 ' + r.hits + (r.sample.length ? '  例: ' + r.sample.join(', ') : '')
      + (r.tokens.length ? '  词: ' + r.tokens.slice(0, 5).join('/') : ''));
  });
}

console.log('=== SKILL §13「必测用例」覆盖对账 ===');
console.log('条款 ' + clauses.length + ' 条 | 测试套件 ' + files.length + ' 个');
dump('无测试线索(优先排查)', uncovered);
dump('仅 1 个文件提及(偏弱)', weak);
console.log('\n=== 覆盖较好(>=2 个文件) ===');
covered.forEach(function (r) {
  console.log('  §13.' + r.c.no + ' ' + r.c.text.slice(0, 58) + '   -> ' + r.hits + ' 个文件');
});
console.log('\n统计: 无线索 ' + uncovered.length + ' / 偏弱 ' + weak.length + ' / 覆盖较好 ' + covered.length);
console.log('注: 命中 0 只说明「没有明显线索」, 不等于一定没测; 命中>0 也不等于有断言。');
console.log('    本表是**排查清单**, 判定需人读断言。');