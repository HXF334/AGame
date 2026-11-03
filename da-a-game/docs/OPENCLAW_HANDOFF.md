# OPENCLAW_HANDOFF · 内蒙古打大A 微信小游戏

> 面向**新会话 / 新 agent** 的接手说明。
> 最后更新：2026-11-03 01:20 (Asia/Shanghai) · Git HEAD `0faca39`（工作区 `main`，领先 `origin/main` 1 个提交，**未 push**）
> 本文只覆盖「怎么接、怎么跑、不能动什么」。游戏规则一律以 `skills/da-a-game-rules/SKILL.md` 为准。

---

## 1. 项目概况

| 项 | 内容 |
|---|---|
| 游戏 | 内蒙古打大A（微信小游戏），5 人局，2V3 / 1V4 模式，108 张牌（两副） |
| 形态 | 微信小游戏，**无构建**：开发者工具直接加载 `game.js` + `src/`，基础库 **2.19.4** |
| 技术栈 | 原生 JavaScript（CommonJS，**不打包、不转 ESM**）+ 微信小游戏运行时 `wx.*` + Canvas 2D 自绘 |
| 路径 | `C:\Users\MyFirstAI\.openclaw\workspace-dada-dev\AGame\da-a-game` |
| Git | 仓库根 `AGame/`（远端 `https://github.com/HXF334/AGame.git`，分支 `main`） |
| appid | `wx99808147273cdea1`，横屏（`landscape`），`minigameRoot=./` |

`docs/` 已被 `project.config.json` 的 `packOptions.ignore` 排除，**不会打进小游戏包**，文档放这里安全。

### 目录结构

```
AGame/                         ← Git 仓库根（.git 在这里）
├─ da-a-game/                  ← 游戏项目根
│  ├─ src/                     ← 规则引擎 14 个模块（CommonJS，纯逻辑，不依赖 wx.*）
│  │  ├─ index.js              统一出口
│  │  ├─ transition.js         状态机 + handler（+ 4 个资格判定纯函数）
│  │  ├─ play.js / capture.js / hand-types.js / win-loss.js / scoring.js
│  │  └─ ai.js / card.js / combos.js / deal.js / phases.js / push-wind.js / util.js
│  ├─ game.js                  ← 界面与驱动（唯一有真实状态机的层，1866 行）
│  ├─ ui-render.js             ← 纯几何渲染层（不含规则判断，918 行）
│  ├─ tests/                   ← 68 个 test-*.js 套件 + mock-wx.js + lib/state-builder.js
│  ├─ scripts/                 ← commit-gate.js / preflight.js / sync-skills.js / import-skills.js
│  ├─ skills/                  ← da-a-game-rules（规则唯一来源）+ windows-cn-batch-encoding
│  ├─ tools/                   ← audit-skill-tests.js / stress-pushwind.js
│  ├─ docs/                    ← 交接文档（不进包）
│  ├─ game.json  project.config.json
├─ tools/                      ← wechat-cli.ps1（微信开发者工具 CLI 的 PowerShell 包装）
└─ .gitattributes              ← 强制 LF，见 §4
```

**分层铁律**：`src/` 不依赖 `wx.*`；`game.js` 不实现规则，只调用引擎。改动不得越层。

---

## 2. 规则来源与唯一权威

```
AGame/da-a-game/skills/da-a-game-rules/SKILL.md
```

15 章，含牌型库、亮A/反A、4 取牌、推风、胜负、计分、必测用例。**改规则先改它**，代码里不得私设规则。
规则与实现冲突时以规则为准；规则没写的不许自行裁定。

工作区 `AGENTS.md`（已转 UTF-8）是启动入口：先读 SKILL → 再 `git -C AGame log --oneline -10` + `git -C AGame status` → 再读本文。

---

## 3. 怎么跑

### 测试

```bash
cd AGame/da-a-game
node tests/_runall.js          # 全量：68 套件 / 68 次执行 / 失败 0 次（约 90 秒）
node tests/test-xxx.js         # 单套件
node tests/_runall.js 10 20    # 只跑第 10~20 个
```

2026-11-03 实测：`套件 68 个, 范围 1-68, 共执行 68 次; 失败 0 次`，退出码 0。

**测试纪律**：
- 必须用**确定局面**（指定手牌 + 固定 human）。无头测试里 AI 会同步抢跑（`AI_STEP_DELAY=0`），随机局面必然 flaky。
- 无头测试用 `tests/mock-wx.js`（AI 延迟 0ms）；真机 / 开发者工具模拟器是 1000ms。
- 每个修复配**变异测试**：退回旧实现 → 断言必须**精确失败**（不是全挂）→ 再恢复。
- 变异测试期间**不要并行跑回归**——临时回退的源码会被并行进程读到，报出看似真实的失败。

### 闸门

```bash
node scripts/preflight.js          # 12 项体检（含全量测试）
node scripts/preflight.js --fast   # 跳过全量测试
node scripts/commit-gate.js MSG.txt  # 体检通过才放行 git add + commit
```

preflight 检查项：shebang（打进包的 .js 不能有）、UTF-8 BOM、行尾（必须 LF）、非标准字符（U+2028/9、孤立代理对）、`node --check` 全量语法、打包配置 `packOptions.ignore`、`game.json` 可解析、skill 镜像一致、全量测试。

**当前状态：11/12 通过。** 唯一失败项是第 8 项 `sync-skills --check`（镜像与仓库不一致）——这是**既有偏差，非本次改动引入**：`scripts/sync-skills.js` 的镜像目标写死在 `~/.openclaw/agents/work/agent/workshop-skills`（旧 work agent 的目录），而仓库在 `7f58612` 重写过 skill 却没重跑同步。两份的 frontmatter description 就不一样（镜像多一句"以及1真人对4个AI的第一版开发"）。

对当前 agent **无影响**：dada-dev 的 skill 走 `skills.load.extraDirs`（直接读仓库目录），根本不用那个镜像。跑 `node scripts/sync-skills.js` 会写进旧 agent 的目录，未经用户同意不要跑。

---

## 4. 不能动的红线

1. **不迁移 Cocos Creator** —— 保持原生小游戏 + Canvas 自绘。
2. **不重建项目** —— 不换目录结构、不换模块划分、不重写渲染层。
3. **不换技术栈** —— 不引入构建工具、打包器、框架、TypeScript、npm 依赖。
4. **规则改动只认一个来源** —— 见 §2，代码里不得私设规则。
5. **规则有疑问先查 SKILL 原文**，不要靠"看起来对"补规则。
6. **未经用户明确授权，禁止 Git push 或其他远端推送。** 提交可以（`add`/`commit`/`diff`/`status`/`log` 都正常用）。
7. **行尾必须 LF**。`.gitattributes` 已强制 `* text=auto eol=lf`；把源文件写成 CRLF 会让微信打包器报 `WAGame.js:1 SyntaxError`——`node --check` 是过的，打包器不认。这条有过血的教训，preflight 第 3 项专门拦它。
8. **不擅自修改 OpenClaw 全局配置，不擅自重启 Gateway。**

---

## 5. Skill 与 OpenClaw 侧

仓库里五份 skill（2026-11-03）：

| skill | 用途 |
|---|---|
| `da-a-game-rules` | **规则唯一来源**，改任何规则前必读 |
| `senior-dev-standard` | 代码改动纪律：最小改动、写完必测、改前先读。**只管「怎么改」，不管「规则是什么」**——规则冲突时以 `da-a-game-rules` 为准 |
| `git-safe-workflow` | Git 操作纪律：改前看状态、diff 逐行审查、一个提交一个主题、消息 `-F` 传文件、推送只推一次、reset --hard 前先看工作区 |
| `windows-cn-batch-encoding` | 中文 Windows 编码 / PowerShell 内联脚本坑（**机制**；Git 纪律已拆到 `git-safe-workflow`） |
| `audit-rules-vs-impl` | 规则 ↔ 识别层 ↔ 枚举层 三向对账。`node skills/audit-rules-vs-impl/scripts/audit.js`（只读） |

加载链路（两条路都要满足，缺一个就加载不到）：

1. `skills.load.extraDirs` 指向 `AGame\da-a-game\skills` —— 仓库文件被**发现**。
2. `agents.entries.dada-dev.skills = ["da-a-game-rules","windows-cn-batch-encoding"]` —— 显式白名单，**替换**默认并过滤掉其余 skill。仓库里加了文件但没加白名单 = agent 看不见。

改 `agents.*` 属 `agents` 前缀 → **Gateway 重启才生效**。本项目**不走 Workshop 镜像**（那是旧 work agent 的机制）。

改配置用文件传参，别把 JSON 塞进命令行：

```powershell
# .bat 用 GBK / .ps1 用 UTF-8+BOM；内联 node -e 会被 PowerShell 切碎
openclaw config set --batch-file .tmp-config-batch.json
```

---

## 6. Git 状态与工作流

- 仓库根是 `AGame/`（`AGame\.git`）。**Git 只向父目录找 `.git`**，所以在 `AGame` 或 `AGame\da-a-game` 里执行 `git status` 都能找到；**在工作区根 `workspace-dada-dev` 执行会报 `not a git repository`** —— 那不是坏了，是那里确实不是仓库。
- 当前 HEAD `0faca39`（清理项目根遗留 txt），`origin/main` = `7f58612`，**本地领先 1 个提交，未 push**。tag：v0.9.0 / v0.10.0 / v0.11.0。
- 最近功能提交：`8e868d1` 修 3 条用户反馈（假八提示 / AI 出牌停顿 / 真人出牌显示），对应版本 v0.34.0。
- 提交信息**走文件**（`git commit -F`），提交后核对 `git log --oneline -1`——`git commit -m` 会自掩失败（提交失败后紧跟 `git push` 仍输出 `Everything up-to-date`，读起来像成功）。
- git 进度写 stderr，PowerShell 会包成 `NativeCommandError` → **判成败看退出码，不看错误文本**。

---

## 7. 已知盲区与待办

### 7.1 引擎与规则的偏差（2026-11-03 全面审查发现，**尚未修**）

| # | 位置 | 偏差 | SKILL 依据 | 影响 |
|---|---|---|---|---|
| B1 | `src/hand-types.js` `canBeat` | 三王/四王的可压范围写成**硬编码列表**（抄自双王条目），没走 §6.3 全局顺序 | §6 表「三王 遵守全局牌力顺序」「四王 除双大A外为最强」+ §6.3 | 三王压不过 真八/真七/假八/连珠蛋/双王；四王压不过 真八/三连假八/四连珠蛋。AI 与真人同时受影响 |
| B2 | `src/combos.js` `candidateCombos` | 枚举层**没有「低端 A」形态**（只把 A 当 13 后面的高端点） | §6.1「允许A作为低端的A23」 | 识别层认 A23，枚举层一张都出不来 →【提示】/AI选牌/doPlay回退**三条路径同时失效**（老坑复发） |
| B3 | `src/combos.js` `MAX_SEQ = 12` | **13 张最长龙（2..A）枚举不到** | §6.1 基础序列 13 点 | 识别层认 13 张，枚举层只出 12 张 |
| B4 | `src/hand-types.js` `canBeat` | 双大A 打 单大A 返回 **false** | §6 表「双大A 无敌，可压制所有牌型」 ↔ §6.4 单大A 条目「其他未明确允许的类型不能管单大A」 | **规则文本自相矛盾 → 需用户裁定**。现有 `test-hand-types-batch2.js` 已把 false 锁死 |
| B5 | `game.js` `GATE_PLAN` 'DEAL' | `startPlayerIndex: 0` **写死** | §2.2「每局随机选择发牌起始玩家」 | 每局发牌起点固定（引擎 `dealGame` 本支持随机，被 game.js 覆盖）——需确认是否有意为之 |

### 7.2 审查中**验证通过**的规则点（别再怀疑）

§6.4 单大A（4 张同点=false / 5-6 张=true）、单王、双王列表、双龙只被大蛋子及以上压；§6 双大A 混入第三张 A 降级为普通牌型；三张大A=普通蛋子；混合张数（8,9,9,10,10,J）= INVALID；§4.4 反A 花色不得与主A相同；§7.1 取牌 4 的张数=目标张数−1；§7.3 被取走的大A 失去大A 身份；§4.5 底牌先转移再判阵营；§11.2 2V3 两种 N 推导；§2.2 底牌独立槽位。以上均与 SKILL 一致。

### 7.3 其它

1. **第 3 条用户反馈（真人出牌居中显示 / 轮到自己时上一手牌是否还在）** —— 无头测试只能证明、不能目视，需在**微信开发者工具模拟器**人工确认。
2. **preflight 第 8 项长期红**（见 §3），成因已定位，等用户决定是否处理旧 agent 镜像。
3. **基础库 2.19.4**，文档里早期版本曾写 3.17.5——以 `project.config.json` 为准。
4. `skills/windows-cn-batch-encoding/SKILL.md` 末尾原引用 `git-safe-workflow §4`（该 skill 已删），**2026-11-03 已改指 `AGENTS.md` 开发纪律第 4 条**，悬空引用消除。

---

## 8. 旧工作区（只读）

`C:\Users\MyFirstAI\.openclaw\workspace-work` 是上一代工作区，**只读参考**：

- 它自己的 `AGame/` 克隆停在 `8268ce6`，比本仓库旧。
- 它的 `MEMORY.md` / `memory/*.md` / `docs/` 里有大量踩坑结论（枚举、渲染、测试纪律等）。
- **不迁移、不删除、不擅自取用**。命中同类问题可以去那里查答案；要把内容带回本项目，**必须先向用户确认**，只取精华。
