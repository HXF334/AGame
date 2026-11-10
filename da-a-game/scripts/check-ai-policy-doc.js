// scripts/check-ai-policy-doc.js —— AI 口径文档 vs 代码 的一致性对账
//
// [为什么存在] 2026-11-10: AI 口径(排序键/牌力表)在文档与代码里各有一份, 改代码忘改文档 -> 口径漂移。
//   本脚本从 docs/ai/AI_POLICY.md 的机检块读出两张表, 与 src/ai-policy.js 的导出对账, 不一致退出码 1。
//   preflight 会调用它 -> 文档漂移直接被闸门拦住。
//
// [注意] 本文件**不能有 shebang** —— 它在 scripts/ 下。
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var COLON = String.fromCharCode(58);
var BT = String.fromCharCode(96);
var NL = String.fromCharCode(10);

function sliceBetween(s, startMark, endMark) {
  var a = s.indexOf(startMark);
  if (a < 0) return '';
  var b = s.indexOf(endMark, a + startMark.length);
  if (b < 0) return '';
  return s.slice(a + startMark.length, b);
}

var polPath = path.join(ROOT, 'docs', 'ai', 'AI_POLICY.md');
if (!fs.existsSync(polPath)) {
  console.log('FAIL 缺 AI 口径文档: ' + polPath);
  process.exit(1);
}
var txt = fs.readFileSync(polPath, 'utf8');
var fence = BT + BT + BT;
var block = sliceBetween(txt, fence + 'ai-policy-table', fence);
if (!block) {
  console.log('FAIL AI 口径文档缺机检块(ai-policy-table)');
  process.exit(1);
}
var doc = {};
block.split(NL).forEach(function (line) {
  var kv = line.split(COLON);
  if (kv.length >= 2) doc[kv[0].trim()] = kv.slice(1).join(COLON).trim();
});

var policy = require(path.join(ROOT, 'src', 'ai-policy.js'));
var srcKeys = policy.SORT_KEYS || [];
var srcRank = Object.keys(policy.POWER_RANK || {});

var fails = 0;
function cmp(name, docStr, codeArr) {
  var ok = (docStr || '').split('>').join(',') === codeArr.join(',');
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name);
  if (!ok) {
    console.log('      doc = ' + (docStr || '(无)'));
    console.log('      code= ' + codeArr.join('>'));
  }
}
cmp('AI_POLICY 排序键顺序 == src/ai-policy.js SORT_KEYS', doc.SORT_KEYS, srcKeys);
cmp('AI_POLICY 牌力表 == src/ai-policy.js POWER_RANK', doc.POWER_RANK, srcRank);
process.exit(fails ? 1 : 0);
