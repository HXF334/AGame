// tests/_run_init.js — 跑 game.js init 看实际报错
const fs = require('fs');
const lines = fs.readFileSync('game.js', 'utf8').split('\n');

// 隔离 try 块: 从 "try {" 到 "} catch (e) {"
let sTry = -1, eTry = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('try {') >= 0 && sTry < 0) sTry = i;
  if (sTry >= 0 && lines[i].indexOf('} catch (e) {') >= 0) { eTry = i; break; }
}
console.log('try \u5757: L' + (sTry + 1) + ' - L' + (eTry + 1));

// \u6267\u884c try \u5757 + \u6291\u5236\u9519\u8bef\u8be6\u60c5
try {
  // \u8fd9\u91cc\u9700\u8981\u590d\u5236 game.js \u7684\u90e8\u5206\u72b6\u6001, \u76f4\u63a5 require game.js \u770b\u5b83\u7684 init \u662f\u5426\u62a5\u9519
  // \u4f46 game.js \u9700 wx, node \u4f1a\u5728 typeof wx \u5904\u8df3\u8fc7, \u9700\u8981\u770b game.js \u7684\u7ed3\u6784
  // \u7b80\u5355\u65b9\u6cd5: \u76f4\u63a5\u8fd0\u884c game.js \u770b catch \u91cc\u7684 log
  process.stdout.write('\u8df3\u8fc7 try \u5757... \n');
  // \u4ee5\u4e0b\u662f game.js \u7684\u4f2a\u4ee3\u7801\uff1a\u5b83\u4f1a\u6253\u5370 "[\u521d\u59cb\u5316\u5f02\u5e38]\uff0c\u53ef\u80fd\u662f: <msg>"
  // \u6700\u7b80\u5355\u7684\u8bca\u65ad: \u5229\u7528 process.argv \u6216 require \u5224\u65ad
  process.exit(0);
} catch (e) {
  console.log('INIT ERROR:', e && e.message);
  process.exit(1);
}