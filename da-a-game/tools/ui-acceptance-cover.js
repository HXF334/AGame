// tools/cover-report.js — 70 项清单的覆盖盘点: 已被自动判定 / 有回归锁 / 仍需人眼
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');   // 仓库内: tools/ 的上一级 = da-a-game
var CK = path.join(ROOT, 'docs', 'ui', 'UI_ACCEPTANCE_CHECKLIST.md');
var lines = fs.readFileSync(CK, 'utf8').split(/\r?\n/);

var AUTO = ['E1','E4','E5','E8','E15','E22','E23','E24','E28','E29','E31','E32','E33','E38','E40','E41','E45','E47','B6'];

var items = [];
lines.forEach(function (L) {
  if (!/^\|/.test(L)) return;
  var c = L.split('|').slice(1, -1).map(function (x) { return x.trim(); });
  if (c.length < 5) return;
  if (!/^[A-E][0-9]+$/.test(c[0])) return;
  items.push({ id: c[0], act: c[1], want: c[2], bad: c[3], lock: c[4] });
});

function isVisual(lock) { return lock.indexOf('目视') >= 0; }
function hasTestFile(lock) {
  var m = lock.match(/([A-Za-z0-9_\-]+\.js)/g);
  if (!m) return null;
  for (var i = 0; i < m.length; i++) {
    if (fs.existsSync(path.join(ROOT, 'tests', m[i])) || fs.existsSync(path.join(ROOT, m[i]))) return m[i];
  }
  return m[0];
}

var auto = [], tested = [], visual = [];
items.forEach(function (it) {
  if (AUTO.indexOf(it.id) >= 0) { auto.push(it.id); return; }
  if (isVisual(it.lock)) { visual.push(it.id + ' ' + it.act.slice(0, 22)); return; }
  tested.push(it.id + ' -> ' + (hasTestFile(it.lock) || '?'));
});

var out = [];
out.push('总条目 = ' + items.length);
out.push('已自动判定(离线渲染) = ' + auto.length + ' : ' + auto.join(' '));
out.push('已有回归锁 = ' + tested.length);
out.push('仍需人眼/真机(锁点=目视) = ' + visual.length);
out.push('--- 仍需人眼明细 ---');
visual.forEach(function (v) { out.push('  ' + v); });
out.push('--- 已有回归锁明细 ---');
tested.forEach(function (v) { out.push('  ' + v); });
var OUTDIR = process.env.DADA_ACCEPT_OUT || path.join(require('os').tmpdir(), 'dada-ui-accept');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'cover-report.txt'), out.join('\n') + '\n', 'utf8');
console.log(out[0]);
console.log(out[1]);
console.log(out[2]);
console.log(out[3]);
process.exit(0);