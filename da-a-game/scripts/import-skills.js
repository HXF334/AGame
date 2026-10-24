#!/usr/bin/env node
// scripts/import-skills.js — 一次性: 把只在 Workshop 存在的 Skill 复制进仓库
//
// [为什么] `~/.openclaw/agents/work/agent/workshop-skills/` **不在版本控制里**。
//   那个目录被清掉，Skill 就没了。仓库是唯一来源 -> 所有 Skill 都应该有一份在仓库。
//   本脚本把 Workshop 里「仓库还没有」的 Skill 原样复制进 `da-a-game/skills/`。
//
// [安全] 只**新增**不覆盖：仓库已存在的同名 Skill 一律跳过（仓库那份才是权威）。
//   不删除任何文件，不修改任何 Skill 内容。
//
// [用法]  node scripts/import-skills.js            # 复制
//         node scripts/import-skills.js --dry-run  # 只列出会复制什么
var fs = require('fs');
var path = require('path');
var os = require('os');

var REPO_SKILLS = path.join(__dirname, '..', 'skills');
var WORKSHOP = path.join(os.homedir(), '.openclaw', 'agents', 'work', 'agent', 'workshop-skills');

// Workshop 目录名 -> 仓库目录名（不同名时映射）
var ALIAS = { 'dada-a-game-rules': 'da-a-game-rules' };

var dryRun = process.argv.indexOf('--dry-run') >= 0;
var copied = 0, skipped = 0;

if (!fs.existsSync(WORKSHOP)) {
  console.log('Workshop 目录不存在: ' + WORKSHOP);
  process.exit(1);
}

fs.readdirSync(WORKSHOP).filter(function (d) {
  return fs.existsSync(path.join(WORKSHOP, d, 'SKILL.md'));
}).sort().forEach(function (wsName) {
  var repoName = ALIAS[wsName] || wsName;
  var src = path.join(WORKSHOP, wsName, 'SKILL.md');
  var dst = path.join(REPO_SKILLS, repoName, 'SKILL.md');

  if (fs.existsSync(dst)) {
    console.log('SKIP  ' + repoName + '  (仓库已有, 仓库为准)');
    skipped++;
    return;
  }
  if (dryRun) {
    console.log('WOULD ' + repoName + '  (' + fs.statSync(src).size + 'B)');
    return;
  }
  fs.mkdirSync(path.join(REPO_SKILLS, repoName), { recursive: true });
  fs.copyFileSync(src, dst);
  copied++;
  console.log('COPY  ' + wsName + ' -> ' + repoName + '  (' + fs.statSync(dst).size + 'B)');
});

console.log('\n完成: 复制 ' + copied + ' 个, 跳过 ' + skipped + ' 个');
