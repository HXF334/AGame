// tests/_fix_G_final2.js — 修 handleFanA + G.4.3 (用绝对路径)
const fs = require('fs');
const BASE = 'C:/Users/MyFirstAI/.openclaw/workspace-work/AGame/da-a-game/';
let changed = 0;

// 1. 修 src/transition.js handleFanA
{
  const f = BASE + 'src/transition.js';
  let s = fs.readFileSync(f).toString('utf8');
  const o = "    phase: PHASES.FAN_A_RESOLVED,\n    players: newPlayers,\n    startPlayerIndex: state.startPlayerIndex,";
  const n = "    phase: PHASES.FAN_A_RESOLVED,\n    players: newPlayers,\n    // [G 修] SKILL §5: 反A 成功者拥有首轮出牌权\n    startPlayerIndex: ['A','B','C','D','E'].indexOf(payload.playerId),";
  if (s.indexOf(o) >= 0) {
    s = s.replace(o, n);
    fs.writeFileSync(f, s);
    changed++;
    console.log('FIX 1 (handleFanA startPlayerIndex): OK');
  } else { console.log('FIX 1: NOT FOUND'); }
}

// 2. 修 G.4.3 calculateScore 调用
{
  const f = BASE + 'tests/test-fan-a-e2e.js';
  let s = fs.readFileSync(f).toString('utf8');
  const o = "  const changes = calculateScore(state, '\u4e3b\u65b9');";
  const n = "  const changes = calculateScore(state, { winner: '\u4e3b\u65b9' });";
  if (s.indexOf(o) >= 0) {
    s = s.replace(o, n);
    fs.writeFileSync(f, s);
    changed++;
    console.log('FIX 2 (G.4.3): OK');
  } else { console.log('FIX 2: NOT FOUND'); }
}

console.log('DONE, ' + changed + ' changes');