#!/usr/bin/env node
// scripts/sync-skills.js — 仓库 -> Workshop 同步（仓库是唯一来源）
//
// [方向] 仓库 `da-a-game/skills/<name>/SKILL.md` = **唯一来源**。
//        Workshop `~/.openclaw/agents/work/agent/workshop-skills/<wsName>/SKILL.md`
//        = **自动生成的镜像**，供 agent 加载。
//
// [为什么] 2026-10-24 两份规则手册各自漂移（仓库 31KB / Workshop 20KB），
//   导致「反A 花色是否须与主A相同」在两份里不一致 —— 实现方照着不够全的那份写，
//   玩家实测报「我有双大A，提示我没有反A资格」。**判据要逐条对唯一来源。**
//
// [用法]  node scripts/sync-skills.js            # 同步全部
//         node scripts/sync-skills.js --check    # 只校验(不写文件), 退出码 1 = 不一致
//
// [SOURCE-NOTE 约定] 源文件里可用
//   <!-- SOURCE-NOTE:BEGIN --> ... <!-- SOURCE-NOTE:END -->
//   包住一段「本文件是唯一来源」的说明。同步时该段会被**替换**成镜像自己的说明，
//   避免镜像里同时出现「本文件是唯一来源」和「本文件是自动生成」这种自相矛盾。
//   没有 SOURCE-NOTE 的源文件，镜像会直接在前置生成标记。
var fs = require('fs');
var path = require('path');
var os = require('os');

var REPO_SKILLS = path.join(__dirname, '..', 'skills');
var WORKSHOP = path.join(os.homedir(), '.openclaw', 'agents', 'work', 'agent', 'workshop-skills');

// 仓库目录名 -> Workshop 目录名（不同名时映射；同名则直接用）
var ALIAS = { 'da-a-game-rules': 'dada-a-game-rules' };

var NOTE_BEGIN = '<!-- SOURCE-NOTE:BEGIN -->';
var NOTE_END = '<!-- SOURCE-NOTE:END -->';

function splitFront(text) {
  var m = text.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  if (!m) return { fm: '---\nname: unknown\ndescription: (no frontmatter)\n---\n', body: text };
  return { fm: m[1], body: m[2] };
}

function repoSkills() {
  if (!fs.existsSync(REPO_SKILLS)) return [];
  return fs.readdirSync(REPO_SKILLS).filter(function (d) {
    return fs.existsSync(path.join(REPO_SKILLS, d, 'SKILL.md'));
  }).sort();
}

// 源文件正文 -> 镜像正文：SOURCE-NOTE 段换成镜像说明；没有就前置生成标记
function toMirrorBody(body, repoName) {
  var mirrorNote = [
    '<!-- GENERATED-BY:sync-skills.js -->',
    '本文件是**自动生成的同步镜像**，源文件: `da-a-game/skills/' + repoName + '/SKILL.md`',
    '**请勿直接编辑本文件** —— 改源文件后运行: `node scripts/sync-skills.js`',
    ''
  ].join('\n');

  var i = body.indexOf(NOTE_BEGIN);
  var j = body.indexOf(NOTE_END);
  if (i >= 0 && j > i) {
    return body.slice(0, i) + mirrorNote + body.slice(j + NOTE_END.length).replace(/^\r?\n+/, '\n');
  }
  return mirrorNote + '\n' + body.replace(/^\r?\n+/, '');
}

var checkOnly = process.argv.indexOf('--check') >= 0;
var bad = 0, synced = 0, skipped = 0;

repoSkills().forEach(function (repoName) {
  var wsName = ALIAS[repoName] || repoName;
  var src = path.join(REPO_SKILLS, repoName, 'SKILL.md');
  var dst = path.join(WORKSHOP, wsName, 'SKILL.md');

  if (!fs.existsSync(dst)) {
    console.log('SKIP  镜像不存在(不新建): ' + wsName);
    skipped++;
    return;
  }

  var srcParts = splitFront(fs.readFileSync(src, 'utf8'));
  var dstParts = splitFront(fs.readFileSync(dst, 'utf8'));
  var out = dstParts.fm + '\n' + toMirrorBody(srcParts.body, repoName);

  var cur = fs.readFileSync(dst, 'utf8');
  if (cur === out) {
    console.log('OK    ' + repoName + ' -> ' + wsName + '  (' + out.length + ' chars)');
    return;
  }
  if (checkOnly) {
    console.log('DIFF  ' + repoName + ' -> ' + wsName + ' 不一致');
    bad++;
    return;
  }
  fs.writeFileSync(dst, out, 'utf8');
  synced++;
  console.log('SYNC  ' + repoName + ' -> ' + wsName + '  (' + out.length + ' chars)');
});

if (checkOnly) {
  console.log(bad === 0 ? '\ncheck: 全部一致' : '\ncheck: ' + bad + ' 个不一致');
  process.exit(bad === 0 ? 0 : 1);
}
console.log('\n完成: 同步 ' + synced + ' 个, 跳过 ' + skipped + ' 个');
