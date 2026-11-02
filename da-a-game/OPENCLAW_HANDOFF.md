# OPENCLAW_HANDOFF · 内蒙古打大A 微信小游戏

> 面向**新会话 / 新 agent** 的接手说明。
> 最后更新：2026-11-02 18:00 (Asia/Shanghai) · 对应代码版本 **v0.34.0** · Git HEAD `8e868d1`
> 本文只覆盖「怎么接、怎么跑、不能动什么」。细节进度见 `docs/` 下 7 份文档。

---

## 1. 项目概况

| 项 | 内容 |
|---|---|
| 游戏 | 内蒙古打大A（微信小游戏），5 人局，2V3 / 1V4 模式，108 张牌（两副） |
| 形态 | 微信小游戏，**无构建**：开发者工具直接加载 `game.js` + `src/`，基础库 **3.17.5** |
| 技术栈 | 原生 JavaScript（CommonJS，**不打包、不转 ESM**）+ 微信小游戏运行时 `wx.*` + Canvas 2D 自绘 |
| 目录 | `C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game` |
| Git | 仓库根 `AGame/`，远端 `https://github.com/HXF334/AGame.git`，分支 `main` |

### 目录结构

```
game.js                      界面与驱动（唯一有真实状态机的一层）
ui-render.js                 纯几何渲染层（不含规则判断）
src/                         规则引擎 14 个模块（纯逻辑，无 wx.* 依赖）
  ai.js capture.js card.js combos.js deal.js hand-types.js index.js
  phases.js play.js push-wind.js scoring.js transition.js util.js win-loss.js
tests/                       68 个 test-*.js 套件 + mock-wx.js + lib/state-builder.js
docs/                        7 份交接文档（见 §4）
skills/                      8 个 skill 仓库副本（与 ~/.openclaw 镜像同源）
scripts/                     commit-gate.js import-skills.js preflight.js sync-skills.js
tools/                       audit-skill-tests.js stress-pushwind.js
game.json  project.config.json  project.private.config.json
```
原目录结构，现在docs项目交接文档都已删除
```
da-a-game/
├─ src/            规则引擎 12 模块（CommonJS, 纯逻辑, 无 wx.* 依赖）
│  ├─ index.js       统一出口
│  ├─ transition.js  状态机 + handler（+ 4 个资格判定纯函数）
│  ├─ play.js / capture.js / hand-types.js / win-loss.js / scoring.js …
├─ game.js         界面与驱动（唯一有真实状态机的层，~1300 行）
├─ tests/          68 个套件 + mock-wx.js + lib/state-builder.js
├─ skills/         项目内 Skill 文档（见 §5）
└─ docs/           VERSION / HANDOFF / PROJECT_STATUS / PROGRESS / TEST_REPORT / KNOWN_ISSUES
```

**分层铁律**：`src/` 不依赖 `wx.*`；`game.js` 不实现规则，只调用引擎。
---

## 2. 开发约束（硬约束，勿突破）

1. **不迁移 Cocos Creator** —— 保持原生小游戏 + Canvas 自绘。
2. **不重建项目** —— 不换目录结构、不换模块划分、不重写渲染层。
3. **不随意更换技术栈** —— 不引入构建工具、打包器、框架、TypeScript、npm 依赖。
4. **规则改动只认一个来源**（见 §3），代码里**不得私设规则**。
5. **规则有疑问先查 SKILL 原文**，不要靠「看起来对」的感觉补规则。
6. **测试必须用确定局面**：指定手牌 + 固定 human。无头测试里 AI 会同步抢跑
   （`AI_STEP_DELAY=0`），随机局面必然 flaky。
7. **每个修复配变异测试**：退回旧实现 → 断言必须**精确失败**（不是全挂）→ 再恢复。
8. **不擅自 push**：提交后由用户确认再推；push 最多尝试一次，失败不重试、不后台重试。

---

## 3. 规则来源与权威性

### 唯一权威来源（改规则先改它）

```
AGame/da-a-game/skills/da-a-game-rules/SKILL.md
```
