// tests/_scan_unguarded.js — 扫描 src/ + game.js 里的未守卫 state 字段解引用
// 风险模式: state.<字段>.<属性>  —— 若字段为 null/undefined 则 throw
const fs = require('fs');
const path = require('path');
const BASE = 'C:/Users/MyFirstAI/.openclaw/workspace-work/AGame/da-a-game/';

// 可为 null/undefined 的字段 (来自 transition handler 的显式赋值)
const NULLABLE = ['主A', '反A', '次方', 'mode', '主方', '抓方', '头名', '推风触发者', 'discarded', 'table', 'passedPlayers', '次方公开', '底牌公开'];

const files = [];
const srcDir = BASE + '/src';
fs.readdirSync(srcDir).filter(f => f.endsWith('.js')).forEach(f => files.push('src/' + f));
files.push('game.js');

let total = 0;
files.forEach(rel => {
  const code = fs.readFileSync(BASE + '/' + rel, 'utf8');
  const lines = code.split('\n');
  const hits = [];

  lines.forEach((line, i) => {
    NULLABLE.forEach(field => {
      // 匹配 state.<field>.<attr>  (属性名紧跟点号)
      const re = new RegExp('state\\.' + field + '\\.[A-Za-z_\\u4e00-\\u9fa5]', 'g');
      let m;
      while ((m = re.exec(line)) !== null) {
        // 检查同一行/前一行是否有守卫 (|| / ? / && / if )
        const guardWindow = (lines[i - 1] || '') + line;
        const guarded = /\?\./.test(line.slice(Math.max(0, m.index - 12), m.index)) ||
                        /&&/.test(line) || /\|\|/.test(line) ||
                        /if\s*\(/.test(line) ||
                        /null\s*\?\s*null/.test(line);
        if (!guarded) {
          hits.push({ line: i + 1, field: field, text: line.trim().substring(0, 110), guarded: false });
        }
      }
    });
  });

  if (hits.length) {
    console.log('\n=== ' + rel + ' (' + hits.length + ' 处未守卫) ===');
    hits.forEach(h => console.log('  L' + h.line + ' [' + h.field + ']  ' + h.text));
    total += hits.length;
  }
});

console.log('\n----------------------------------------');
console.log('未守卫解引用合计: ' + total);