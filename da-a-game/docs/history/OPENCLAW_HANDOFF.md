# OPENCLAW_HANDOFF · 内蒙古打大A 微信小游戏

> 面向**新会话 / 新 agent** 的接手说明。
> 最后更新：2026-11-11（E26/E27/E30 收口 + 取事实机制化）· Git HEAD 见 `git log -1`
> 相关文档：**规则唯一来源** skills/da-a-game-rules/SKILL.md ｜ **AI 决策口径** ai/AI_POLICY.md
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
│  ├─ src/                     ← 规则引擎 18 个模块（CommonJS，纯逻辑，不依赖 wx.*）
│  │  ├─ index.js              统一出口
│  │  ├─ transition.js         状态机 + handler（+ 4 个资格判定纯函数）
│  │  ├─ play.js / capture.js / hand-types.js / win-loss.js / scoring.js
│  │  ├─ deal.js               发牌原语（一次发完 / 逐轮发牌共用同一套规则）
│  │  └─ ai.js / card.js / combos.js / phases.js / push-wind.js / util.js
│  ├─ game.js                  ← 界面与驱动（唯一有真实状态机的层，2302 行）
│  ├─ ui-render.js             ← 纯几何渲染层（不含规则判断，1077 行）
│  ├─ tests/                   ← 94 个 test-*.js 套件 + mock-wx.js
│  ├─ scripts/                 ← commit-gate.js / preflight.js
│  ├─ skills/                  ← 5 份: da-a-game-rules(规则唯一来源) / senior-dev-standard / git-safe-workflow / windows-cn-batch-encoding / audit-rules-vs-impl
│  ├─ tools/                   ← audit-skill-tests.js / stress-pushwind.js / ui-acceptance-{check,scene}.js（**已排除出包**）
│  ├─ docs/                    ← 不进包：ai/ 口径 + history/ 交接
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

工作区 `AGENTS.md`（已转 UTF-8）是启动入口：先读 SKILL → 再 `git -C AGame log --oneline -10` + `git -C AGame status` → 再读本文。压缩/重启后可直接 `node tools/resume.js` 一次拿全现场（git 状态/未 push/工具清单/套件数/事实表）。

---

## 3. 怎么跑

### 测试

```bash
cd AGame/da-a-game
node tests/_runall.js          # 全量：94 套件 / 失败 0 次（约 70-90 秒）
node tests/test-xxx.js         # 单套件
node tests/_runall.js 10 20    # 只跑第 10~20 个
```

当前状态：全量 **94** 套件 / 失败 0 次；`preflight` 14/14（`--fast` 12/12）；`audit-rules-vs-impl` 4/4。


**测试纪律**：
- 必须用**确定局面**（指定手牌 + 固定 human）。无头测试里 AI 会同步抢跑（`AI_STEP_DELAY=0`），随机局面必然 flaky。
- 无头测试用 `tests/mock-wx.js`（AI 延迟 0ms）；真机 / 开发者工具模拟器是 1000ms。
- 每个修复配**变异测试**：退回旧实现 → 断言必须**精确失败**（不是全挂）→ 再恢复。
- 变异测试期间**不要并行跑回归**——临时回退的源码会被并行进程读到，报出看似真实的失败。
- **临时探针脚本**：子进程必须显式 `process.exit(0)`（被测模块留有定时器，不退出会让同步等待无限挂起）；同步 spawn 必须带 `timeout`；第一条断言要是"已知为真的基线"；跑完立刻删。

### 闸门

```bash
node scripts/preflight.js          # 14 项体检（含全量测试 + AI 口径机检）
node scripts/preflight.js --fast   # 跳过全量测试
node scripts/commit-gate.js MSG.txt  # 体检通过才放行 git add + commit
```

preflight 检查项：shebang（打进包的 .js 不能有）、UTF-8 BOM、行尾（必须 LF）、非标准字符（U+2028/9、孤立代理对）、`node --check` 全量语法、打包配置 `packOptions.ignore`、**陌生 .js 会不会进包**、`game.json` 可解析、**仓库 skills 是否都在 agent 白名单里**、全量测试。

**当前状态：14/14 通过**（`--fast` 12/12 —— 跳过全量测试那一项）。

两个关键检查项说明：
- **陌生 .js 会不会进包**（第 6 项内）：`packOptions.ignore` 是**黑名单**，新增目录忘了加就会漏网进包。改成**白名单反查**：除 `src/` 与 `game.js`/`ui-render.js` 外，任何 `.js` 都不该在包里。
- **skills 白名单覆盖**（第 8 项）：仓库放了 skill 但**没加进 `agents.entries.dada-dev.skills`** → agent 看不见（显式白名单会**替换**默认并过滤其余）。这才是"加了 skill 却用不上"的根因。原先这项检查的是 `sync-skills --check`（比对 work agent 的 Workshop 镜像）——镜像与该脚本均已于 2026-11-03 删除，检查项已换掉。
- **打包文件集合断言**：`tests/test-pack-manifest.js` 把**整个小游戏包的文件集合**钉死成一张清单（当前 18 个文件）。`packOptions.ignore` 是黑名单，新增目录忘了加就会静默进包；preflight 的白名单反查只看 `.js`，漏掉 json/图片/目录。这条断言管住全部类型。

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

仓库里五份 skill：

| skill | 用途 |
|---|---|
| `da-a-game-rules` | **规则唯一来源**，改任何规则前必读 |
| `senior-dev-standard` | 代码改动纪律：最小改动、写完必测、改前先读。**只管「怎么改」，不管「规则是什么」**——规则冲突时以 `da-a-game-rules` 为准 |
| `git-safe-workflow` | Git 操作纪律：改前看状态、diff 逐行审查、一个提交一个主题、消息 `-F` 传文件、推送只推一次、reset --hard 前先看工作区 |
| `windows-cn-batch-encoding` | 中文 Windows 编码 / PowerShell 内联脚本坑（**机制**；Git 纪律已拆到 `git-safe-workflow`） |
| `audit-rules-vs-impl` | 规则 ↔ 识别层 ↔ 枚举层 三向对账。`node skills/audit-rules-vs-impl/scripts/audit.js`（只读） |

加载链路（两条路都要满足，缺一个就加载不到）：

1. `skills.load.extraDirs` 指向 `AGame\da-a-game\skills` —— 仓库文件被**发现**。
2. `agents.entries.dada-dev.skills` —— 显式白名单（当前 5 份），**替换**默认并过滤掉其余 skill。仓库里加了文件但没加白名单 = agent 看不见。

改 `agents.*` 属 `agents` 前缀 → **Gateway 重启才生效**。本项目**不走 Workshop 镜像**（work agent 的镜像已于 2026-11-03 删除，仓库是唯一来源）。

改配置用文件传参，别把 JSON 塞进命令行：

```powershell
# .bat 用 GBK / .ps1 用 UTF-8+BOM；内联 node -e 会被 PowerShell 切碎
openclaw config set --batch-file .tmp-config-batch.json
```

---

## 6. Git 状态与工作流

- 仓库根是 `AGame/`（`AGame\.git`）。**Git 只向父目录找 `.git`**，所以在 `AGame` 或 `AGame\da-a-game` 里执行 `git status` 都能找到；**在工作区根 `workspace-dada-dev` 执行会报 `not a git repository`** —— 那不是坏了，是那里确实不是仓库。
- 提交信息**走文件**（`git commit -F`），提交后核对 `git log --oneline -1`——`git commit -m` 会自掩失败（提交失败后紧跟 `git push` 仍输出 `Everything up-to-date`，读起来像成功）。
- git 进度写 stderr，PowerShell 会包成 `NativeCommandError` → **判成败看退出码，不看错误文本**。

---

## 7. 待办与注意事项

### 7.1 待办事项

1. 下一阶段真人对战。

### 7.2 注意事项

- 