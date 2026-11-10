# 交接文档（现状 / 盲区 / 坑，接手先读）

> 这份只写**当前有效的事实**。历史改动流水在 git log（`git log --oneline`），不在这里留档。

## 1. 项目概况

- 目录：`AGame/da-a-game/`
  - `src/` 纯逻辑模块（无 wx 依赖）：hand-types / combos / play / capture / transition / camp / ai / ai-policy / lead-choice
  - `game.js` + `ui-render.js`：小游戏宿主 + 渲染
  - `skills/da-a-game-rules/SKILL.md`：规则唯一来源
  - `docs/ai/AI_POLICY.md`：AI 决策口径唯一来源
  - `docs/history/`：历史归档（DECISIONS 决策流水 / 本文件）
  - `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`：画面验收清单
- 基础库 2.19.4（以 `project.config.json` 为准）。
- 微信小游戏，无登录 / 无服务端。

## 2. 规则来源与唯一权威

| 主题 | 唯一来源 |
|---|---|
| 牌型识别 / 比较 / 压制 / 轮次 / 胜负 | `skills/da-a-game-rules/SKILL.md` |
| AI 决策口径（候选 / 排序 / 阵营过滤 / 推定） | `docs/ai/AI_POLICY.md` |
| 实现 | `src/`（hand-types.js 识别层 + combos.js 枚举层 + ai.js 决策层） |

口径改动流程见 AI_POLICY §9；改完跑 `node skills/audit-rules-vs-impl/scripts/audit.js` 对账。

## 3. 怎么跑

### 测试

```
node tests/_runall.js          # 全量
node tests/test-<名字>.js     # 单个
```

每个套件自己跑、末尾打印 checks / passed / failed。

### 闸门

```
node scripts/preflight.js --fast   # 快检（不含全量测试）
node scripts/commit-gate.js         # 提交前完整闸门（含全量测试）
```

## 4. 不能动的红线

- 不擅自改 `skills/da-a-game-rules/SKILL.md`（规则改动须用户明示）。
- 不自动改 OpenClaw 全局配置、不重启 Gateway。
- **未经授权不 push**；获授权也只推一次，失败即停。
- 不擅自删除 / 覆盖原项目文件；旧工作区 `workspace-work` 只读。
- 改牌型规则必须同步识别层 + 枚举层，否则「引擎认得出但枚举不出」→ 提示 / AI 选牌 / 出牌三条路径同时失效。
- 测试断言锁**原则**，不锁具体牌。
- 脚本放仓库外 `.scratch/`，否则 preflight 报「陌生 .js 会被打进小游戏包」。

## 5. Skill 与 OpenClaw 侧

- 本仓 skill：`skills/da-a-game-rules`（规则）、`skills/audit-rules-vs-impl`（规则↔实现对账）、`skills/git-safe-workflow`、`skills/senior-dev-standard`、`skills/windows-cn-batch-encoding`。
- 启用需同时满足：仓库有 `skills/<name>/SKILL.md` **且** `agents.entries.dada-dev.skills` 白名单含该名。改 `agents.*` 会触发 Gateway 重启。

## 6. Git 状态与工作流

- 仓库根 = `AGame/`（`da-a-game` 是子目录）。
- 一批一件事；提交信息用 `git commit -F <文件>`（中文长文本别走命令行）。
- 提交前跑 `node scripts/commit-gate.js`。
- 不 push 除非用户明示。

## 7. 已知盲区与待办

### 7.1 已验证、别再怀疑的规则点

§6.4 单大A（4 张同点=false / 5-6 张=true）、单王、双王列表、双龙只被大蛋子及以上压；§6 双大A 混入第三张 A 降级为普通牌型；三张大A=普通蛋子；混合张数（8,9,9,10,10,J）= INVALID；§4.4 反A 花色不得与主A相同；§7.1 取牌 4 的张数=目标张数−1；§7.3 被取走的大A 失去大A 身份；§4.5 底牌先转移再判阵营；§11.2 2V3 两种 N 推导；§2.2 底牌独立槽位。以上均与 SKILL 一致。

### 7.2 回归测试资产

| 文件 | 锁什么 |
|---|---|
| `tests/test-rules-alignment.js` | 规则↔实现对齐（识别层 / 枚举层） |
| `tests/test-handtype-enum-reach.js` | 每个牌型在枚举层可达（历史上出过 4 次「认得出、枚举不出」） |
| `tests/test-straight-low-ace.js` | A 作低端连续段（A23…A-2-…-K 共 13 张） |
| `tests/test-pack-manifest.js` | 小游戏包文件集合固定（18 个文件）+ 5 个开发目录必须排除 |
| `tests/test-ui-play-position.js` | 牌位在按钮行 / 按钮让位 / 轮到真人清牌 / AI 等待闹钟点亮熄灭 |
| `tests/test-deal-async.js` | 异步发牌路径（无头默认同步，异步路径此前从未被测过） |

### 7.3 仍需人工目视（自动化覆盖不到）

- 微信开发者工具模拟器：牌与按钮是否真的不重叠、闹钟与「不出」文字是否打架。
- 画面验收清单：`docs/ui/UI_ACCEPTANCE_CHECKLIST.md`。

### 7.4 已知待办

- D-022「创建房间加是否显示剩余牌数（默认关闭）」——已延期，本批不实现。
- 房间设置值接入（发牌速度 / AI 等待节奏目前是常量）。
- 2V3 抓方推定的专项回归尚未补齐（需在真机对局验证）。

### 7.5 工具坑（血泪）

- **PowerShell 控制台是 GBK**：中文文件直接读会乱码 → 落盘成 `.scratch/*.txt` 再用读文件工具读，或用 node 写文件后读。
- **`edit` 工具多编辑会整体原子回滚**：任一条 oldText 不匹配 → 全部不生效。改用「JSON 载荷 + node runner（每条唯一性断言）」，脚本放仓库外。
- **上下文压缩会重复读同一批文件**：动手前一次性把事实打包成一个文件读，别分多次零碎取。
- **无头默认 `DEAL_STEP=0`**：发牌同步跑完，异步路径默认测不到 → 用 `__setDealStep` 钩子强制异步。
- `candidateCombos` 返回的是 **id 数组**，没有 `.type` 字段 → 必须逐个 `identifyHand`，别直接读 `.type`。
