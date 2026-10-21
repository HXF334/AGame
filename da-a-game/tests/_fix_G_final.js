// tests/_fix_G_final.js — 修 handleFanA startPlayerIndex + G.4.3 调用
const fs = require('fs');
let changed = 0;

// 1. 修 src/transition.js handleFanA: startPlayerIndex = 反A 者索引
{
  const f = 'src/transition.js';
  let s = fs.readFileSync(f).toString('utf8');
  // 找 handleFanA 末段 startPlayerIndex: state.startPlayerIndex 改为 dynamic
  const o = "    phase: PHASES.FAN_A_RESOLVED,\n    players: newPlayers,\n    startPlayerIndex: state.startPlayerIndex,";
  const n = "    phase: PHASES.FAN_A_RESOLVED,\n    players: newPlayers,\n    // [G 修] SKILL \u00a75: \u53cdA \u6210\u529f\u8005\u62e5\u6709\u9996\u8f6e\u51fa\u724c\u6743\n    startPlayerIndex: ['A','B','C','D','E'].indexOf(payload.playerId),";
  if (s.indexOf(o) >= 0) {
    s = s.replace(o, n);
    fs.writeFileSync(f, s);
    changed++;
    console.log('FIX 1 (handleFanA startPlayerIndex): OK');
  } else { console.log('FIX 1: NOT FOUND'); }
}

// 2. 修 tests/test-fan-a-e2e.js G.4.3: calculateScore(state, '主方') → calculateScore(state, { winner: '主方' })
{
  const f = 'tests/test-fan-a-e2e.js';
  let s = fs.readFileSync(f).toString('utf8');
  const o = "  const changes = calculateScore(state, '\u4e3b\u65b9');";
  const n = "  const changes = calculateScore(state, { winner: '\u4e3b\u65b9' });";
  if (s.indexOf(o) >= 0) {
    s = s.replace(o, n);
    fs.writeFileSync(f, s);
    changed++;
    console.log('FIX 2 (G.4.3 calculateScore \u53c2\u6570): OK');
  } else { console.log('FIX 2: NOT FOUND'); }
}

console.log('DONE, ' + changed + ' changes');