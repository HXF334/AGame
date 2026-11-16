// [2026-11-16 用户] 联网对战 P0：把客户端规则引擎同步到云函数目录，并生成哈希清单
//
// 背景：微信云函数只能部署自己目录下的文件，不能 require 到项目根的 src/。
//   为了避免「两份代码漂移」，这里把 da-a-game/src/*.js 原样复制到
//   da-a-game/cloudfunctions/game-server/engine/，并写 MANIFEST.json 记录每个文件 sha256。
//
// 用法：
//   node tools/sync-engine.js           # 同步（覆盖 engine/ 下的 .js 与 MANIFEST.json）
//   node tools/sync-engine.js --check   # 只校验，不一致时退出码 1（测试用）
//
// 依赖：仅 node 内置模块。
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var DEST = path.join(ROOT, 'cloudfunctions', 'game-server', 'engine');
var MANIFEST = path.join(DEST, 'MANIFEST.json');
var checkOnly = process.argv.indexOf('--check') >= 0;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function listSrc() {
  return fs.readdirSync(SRC).filter(function (f) {
    return /\.js$/.test(f);
  }).sort();
}

function buildManifest() {
  var files = {};
  listSrc().forEach(function (f) {
    files[f] = sha256(fs.readFileSync(path.join(SRC, f)));
  });
  var names = Object.keys(files).sort();
  var joined = names.map(function (n) { return n + ':' + files[n]; }).join('\n');
  return {
    schemaVersion: 1,
    hash: sha256(Buffer.from(joined, 'utf8')),
    files: files
  };
}

function main() {
  var manifest = buildManifest();
  if (checkOnly) {
    if (!fs.existsSync(MANIFEST)) {
      console.error('engine/MANIFEST.json missing; run: node tools/sync-engine.js');
      process.exit(1);
    }
    var cur = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    if (cur.hash !== manifest.hash) {
      var changed = Object.keys(manifest.files).filter(function (n) {
        return !cur.files || cur.files[n] !== manifest.files[n];
      });
      console.error('engine out of sync (hash ' + cur.hash + ' -> ' + manifest.hash + ')');
      if (changed.length) console.error('changed: ' + changed.join(', '));
      process.exit(1);
    }
    console.log('engine in sync: ' + manifest.hash);
    return;
  }
  if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });
  listSrc().forEach(function (f) {
    fs.writeFileSync(path.join(DEST, f), fs.readFileSync(path.join(SRC, f)));
  });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log('synced ' + listSrc().length + ' files; hash=' + manifest.hash);
}

main();
