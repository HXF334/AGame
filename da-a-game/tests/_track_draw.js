// tests/_track_draw.js — 严格追踪 draw() 函数体的 { } 平衡
const fs = require('fs');
const src = fs.readFileSync('game.js', 'utf8');
const lines = src.split('\n');

let mode = 0; // 0=normal 1='...' 2="..." 3=// 4=/* */
let depth = 0;
let lastCloseLine = -1;
let inDraw = false;

for (let lineNo = 143; lineNo <= lines.length; lineNo++) {
  const line = lines[lineNo - 1];
  if (line.trim() === 'function draw() {') { inDraw = true; continue; }
  if (!inDraw) continue;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const n = line[i + 1];
    if (mode === 3) { if (c === '\n') mode = 0; continue; }
    if (mode === 4) { if (c === '*' && n === '/') { mode = 0; i++; } continue; }
    if (mode === 1) {
      if (c === '\\') { i++; continue; }
      if (c === "'") mode = 0;
      continue;
    }
    if (mode === 2) {
      if (c === '\\') { i++; continue; }
      if (c === '"') mode = 0;
      continue;
    }
    if (c === '/' && n === '/') { mode = 3; i++; continue; }
    if (c === '/' && n === '*') { mode = 4; i++; continue; }
    if (c === "'") { mode = 1; continue; }
    if (c === '"') { mode = 2; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      lastCloseLine = lineNo;
      // 如果 depth 回到 0 但还有 btnSelectPlayers 等后续代码, 说明 draw 提前结束
      if (depth === 0 && lineNo > 143 && lineNo < 354) {
        // 看下一行
        const next = lines[lineNo] || '';
        if (next.includes('btnSelectPlayers') || next.includes('function')) {
          console.log('draw() 提前在 L' + lineNo + ' 结束！depth=' + depth);
          console.log('L' + lineNo + ': ' + line);
          console.log('L' + (lineNo + 1) + ': ' + next);
          break;
        }
      }
    }
  }
}
console.log('final depth:', depth);
console.log('last close at L' + lastCloseLine);