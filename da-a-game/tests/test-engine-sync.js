// [2026-11-16 用户] 联网对战 P0：服务端引擎副本必须与 src/ 同步
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var DEST = path.join(ROOT, 'cloudfunctions', 'game-server', 'engine');
var checks = 0;
function ok(name, cond) { checks++; assert.ok(cond, name); }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

ok('engine dir exists', fs.existsSync(DEST));
ok('manifest exists', fs.existsSync(path.join(DEST, 'MANIFEST.json')));

var manifest = JSON.parse(fs.readFileSync(path.join(DEST, 'MANIFEST.json'), 'utf8'));
var srcFiles = fs.readdirSync(SRC).filter(function (f) { return /\.js$/.test(f); }).sort();
ok('manifest schemaVersion', manifest.schemaVersion === 1);
ok('same file set', Object.keys(manifest.files).sort().join(',') === srcFiles.join(','));

var same = srcFiles.every(function (f) {
  var a = sha(fs.readFileSync(path.join(SRC, f)));
  var b = sha(fs.readFileSync(path.join(DEST, f)));
  return a === b && manifest.files[f] === a;
});
ok('file contents identical', same);

console.log('engine sync: ' + checks + ' checks passed');
