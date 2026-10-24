#!/usr/bin/env node
// scripts/sync-skills.js — 把仓库内的 Skill 同步到 Workshop（agent 加载的那份）
//
// [方向] 仓库 `da-a-game/skills/<name>/SKILL.md` = **唯一来源**。
//        Workshop `~/.openclaw/agents/work/agent/workshop-skills/<name>/SKILL.md`
//        = **自动生成的镜像**，供 agent 加载。
//
// [为什么] 2026-10-24 两份规则手册各自漂移（仓库 28.8KB / Workshop 19.8KB），
//   导致「反A 花色是否须与主A相同」这一条在两份里不一致 —— 实现方照着不够全的那份写，
//   玩家实测报「我有双大A，提示我没有反A资格」。**判据要逐条对唯一来源，不能对「看起来对」的感觉。**
//
// [用法]  node scripts/sync-skills.js            # 同步全部
//         node scripts/sync-skills.js --check    # 只校验是否一致(不写文件), 退出码 1 = 不一致
//
// [注意] Workshop 的 frontmatter **保留自己的 name**（目录名与仓库目录名可能不同，
//   例如仓库 `da-a-game-rules` ↔ Workshop `dada-a-game-rules`）；只同步正文。
var fs = require('fs');
var path = require('path');
var os = require('os');

var REPO_SKILLS = path.join(__dirname, '..', 'skills');
var WORKSHOP = path.join(os.homedir(), '.openclaw', 'agents', 'work', 'agent', 'workshop-skills');

// 仓库目录名 -> Workshop 目录名（同名则直接用）
var MAP = {
  'da-a-game-rules': 'dada-a-game-rules',
  'senior-dev-standard': 'senior-dev-standard'
};

var GENERATED_MARK = [
  '',
  '<!-- 本文件是自动生成的同步镜像，源文件: da-a-game/skills/' ,
  '     请勿直接编辑本文件 —— 改源文件后运行: node scripts/sync-skills.js -->',
  ''
].join('\n');

function splitFront(text) {
  var m = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  if (!m) return { fm: '---\nname: unknown\ndescription: (no frontmatter)\n---\n', body: text };
  return { fm: m[1], body: m[2] };
}

var checkOnly = process.argv.indexOf('--check') >= 0;
var bad = 0, synced = 0;

Object.keys(MAP).forEach(function (repoName) {
  var wsName = MAP[repoName];
  var src = path.join(REPO_SKILLS, repoName, 'SKILL.md');
  var dst = path.join(WORKSHOP, wsName, 'SKILL.md');

  if (!fs.existsSync(src)) { console.log('SKIP  源不存在: ' + src); return; }
  if (!fs.existsSync(dst)) {
    console.log('SKIP  镜像不存在(不新建): ' + dst);
    bad++;
    return;
  }

  var srcParts = splitFront(fs.readFileSync(src, 'utf8'));
  var dstParts = splitFront(fs.readFileSync(dst, 'utf8'));
  var out = dstParts.fm + '\n' + GENERATED_MARK + srcParts.body.replace(/^\r?\n+/, '');

  if (fs.readFileSync(dst, 'utf8') === out) {
    console.log('OK    ' + wsName + ' 已是最新 (' + out.length + 'B)');
    return;
  }
  if (checkOnly) {
    console.log('DIFF  ' + wsName + ' 与源不一致 (源 ' + srcParts.body.length + 'B / 镜像 ' + dstParts.body.length + 'B)');
    bad++;
    return;
  }
  fs.writeFileSync(dst, out, 'utf8');
  synced++;
  console.log('SYNC  ' + wsName + '  <- ' + path.relative(process.cwd(), src) + '  (' + out.length + 'B)');
});

if (checkOnly) {
  console.log(bad === 0 ? '\ncheck: 全部一致' : '\ncheck: ' + bad + ' 个不一致');
  process.exit(bad === 0 ? 0 : 1);
}
console.log('\n完成: 同步 ' + synced + ' 个');
