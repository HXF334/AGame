# 版本冻结记录 · v0.9.0

**冻结时间**：2026-10-23 21:10 (Asia/Shanghai)
**提交**：`4df6f27`  ·  **标签**：`v0.9.0`

## 回退方式

```bash
git checkout v0.9.0              # 只看这个版本，不改工作区
git reset --hard v0.9.0           # 把本地退到这一版(会丢弃之后的本地改动)
git reset --hard 4df6f27          # 等价(该版即标签所指提交)
```

## 1. 启动方式

微信原生小游戏，无构建步骤、无 npm 依赖、无打包。

```bash
# 1) 打开微信开发者工具 → 导入项目 → 目录选到:
#    C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game
# 2) 基础库版本: 3.17.5  (见 project.config.json 的 libVersion)
# 3) 编译即可。方向建议横屏(横屏是设计目标; 竖屏不保证正确)
```

**启动踩过的坑**（都在 `KNOWN_ISSUES` 有记录）：

- `project.private.config.json` 的 `libVersion` **优先级高于** `project.config.json`。
  它被写成 `"development"` 时基础库未就位，IDE 崩溃且堆栈全在 `app.asar` 内部(B34)。
- 该文件在 2026-10-23 被清空过一次，现象是「重新加载还是上回的对局」，**重新导入项目即恢复**(E8)。
  该文件在 `.gitignore` 内、由 IDE 自己管。

## 2. 测试方式

**53 个测试套件**，2026-10-23 全量实测 **53/53 PASS**（分 4 块前台跑：1-16 / 17-32 / 33-42 / 43-53）。

```bash
cd da-a-game

# 全量(必须前台分块, 后台会被会话切断并清掉临时脚本)
$all = @(Get-ChildItem tests/test-*.js | Sort-Object Name)
$all[0..15] | ForEach-Object { node $_.FullName }

# 单个套件(改了什么就跑直接覆盖它的那一两个)
node tests/test-doplay-fallback.js

# 无头对局压测: 四种模式, 结果落盘 tools/stress_result.txt
node tools/stress-pushwind.js 24

# 规则覆盖对账: 以 SKILL §13 的 20 条为锚产出排查清单(是清单, 不是判决)
node tools/audit-skill-tests.js

# 语法检查
Get-ChildItem src/*.js, game.js | ForEach-Object { node --check $_.FullName }
```

> 前一版文档写的 `node tests/_runall.js` **该文件已不存在**，不要照抄。

## 3. 构建

**无构建**。微信小游戏直接加载 `game.js` + `src/` 下的 CommonJS 模块。
发布流程（若需要）走微信开发者工具的上传/发布，不在本仓库脚本范围内。

## 4. 目录

```
da-a-game/
  game.js                  入口(状态机 + UI + 触摸)
  src/                     规则引擎(15 模块)
  tests/                   53 个测试套件 + mock-wx.js + lib/state-builder.js
  tools/                   压测 / 规则对账(不计入 53)
  skills/da-a-game-rules/   SKILL.md — 规则唯一依据
  docs/                    本文件 / HANDOFF / PROJECT_STATUS / PROGRESS /
                           TEST_REPORT / KNOWN_ISSUES
```

## 5. 微信开发者工具完整对局验证状态

**已完成（2026-10-23 20:30 用户确认「都没问题了」）**，证据来自真实对局控制台日志：

- 完整一局打到 `牌局结束`（GAME_END）
- 推风触发 **3 次**，其中 **1 次由人类(甲)出完牌触发** —— 这是 B39/B40 修复后的关键路径，
  此前只有单测、无任何真实对局证据
- 三次推风的目标**均在同阵营内**，符合 §9.3
- 组合回退只产生**一条**日志（修复前会多出一条假的「失败」）

**仍未验证**：

- 1V4 明打 / 暗打的**真实 IDE 对局**（压测已覆盖 24 局逻辑正确，但未在 IDE 人工验证）
- 像素级表现与真机表现（`test-ui-touch-contract.js` 只锁逻辑契约）

## 6. 本版遗留

**未修 Bug：0**（今日修的 P0 全部闭环并经用户验证）

**测试缺口（非 Bug，是断言缺失）**：

| SKILL 条款 | 缺口 |
|---|---|
| §13.12 | 无「4 张 5555 被 3 个 444 取走」这个具体场景（`5555/444` 组合命中 0）|
| §13.13 | 无「3 个以上 4 留桌面后可作为新目标」（`新目标` 命中 0）|

§13.14 已于本版补齐（`tests/test-capture-target-expiry.js`，6 项）。

**其他已知未闭环**：

- `tools/audit-skill-tests.js` 的信号**粒度不足**：§13.17/13.18 命中全部 53 个文件
  （词太泛），该粒度上无区分度。详见 `KNOWN_ISSUES` T6。
- 4 份文档（`HANDOFF` / `PROJECT_STATUS` / `PROGRESS` / `TEST_REPORT`）内容截至 2026-10-21，
  未覆盖今日 8 个提交。**本文件 `VERSION.md` 是当前最准的入口**。
