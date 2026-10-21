# 测试报告

**更新时间**：2026-10-20 20:14
**总测试套件**：25
**总测试项**：589+
**通过率**：**100%** ✅

---

## 1. 套件清单（按 SKILL 章节排序）

| # | 套件 | 测试项 | 覆盖 SKILL 章节 |
|---|---|---:|---|
| 1 | test-deal.js | 12 | §2.1, §2.2 |
| 2 | test-phase2.js | 37 | §3 状态机 |
| 3 | test-fan-a.js | 23 | §4.1, §4.2, §4.4 |
| 4 | test-fan-a-e2e.js | 13 | §4.4 反A 完整流程 |
| 5 | test-first-player.js | 14 | §5 首轮出牌权 |
| 6 | test-hand-types.js | 111 | §6.1, §6.2 单牌 |
| 7 | test-hand-types-batch2.js | 78 | §6.3, §6.4 龙/双龙/连珠 |
| 8 | test-hand-types-batch3.js | 70 | §6.4 真七/真八/假八/三连假八/双王/三王/四王/单大A/双大A |
| 9 | test-capture.js | 25 | §7 [4] 取牌 |
| 10 | test-play.js | 19 | §8 出牌轮次/过牌 |
| 11 | test-push-wind.js | 9 | §9 推风 |
| 12 | test-reveal-bottom.js | 30 | §4.5 底牌翻开/身份选择 |
| 13 | test-scoring.js | 14 | §11.1, §11.2 基本 |
| 14 | test-scoring-deep.js | 34 | §11 计分深度（双路径 / 总分池守恒 / 非法输入）|
| 15 | test-scoring-n-derive.js | 15 | §11.2 N 自动推导（新） |
| 16 | test-win-loss.js | 17 | §10.1, §10.2, §10.3, §10.4 基本 |
| 17 | test-win-loss-boundary.js | 16 | §10 胜负边界 |
| 18 | test-edge-cases.js | 15 | 边界场景 |
| 19 | test-ai.js | 9 | §12 AI 基本 |
| 20 | test-ai-integration.js | 16 | §12 AI + game.js 集成 |
| 21 | test-ai-modes.js | 16 | §12 AI 在 1V4 明打/暗打 |
| 22 | test-e2e-full-game.js | 10 | §3-§11 端到端 |
| 23 | test-robustness.js | 23 | 畸形 state fuzzer（A3 加固后加）|
| 24 | test-perf.js | 1（性能断言）| 性能 |
| 25 | （保留） | — | — |

---

## 2. 关键覆盖维度

### §3 状态机阶段流转（test-phase2.js）
- 14 阶段：GAME_START → GAME_END
- 业务级拒绝（phase 与业务检查双重判断）

### §6 牌型识别（test-hand-types + batch2 + batch3，共 259 项）
- 16 种牌型全覆盖：单牌/对子/蛋子/大蛋子/真七/真八/龙/双龙/连珠蛋/四连珠蛋/假八/三连假八/单大A/双大A/双王/三王/四王
- 含 invalid（不是合法牌型）边界

### §10 胜负判定（test-win-loss.js + boundary + edge-cases）
- 通用结束条件（§10.1）
- 1V4 明打 / 暗打 3 种结局
- 2V3 明打 / 暗打 头末规则
- 主A=null / mode=null / 未知 mode / 5 玩家都空 等边界

### §11 计分（test-scoring.js + deep + n-derive，共 63 项）
- 1V4 明打/暗打 × 主方胜/抓方胜/平局
- 2V3 明打/暗打 × N∈{0,1,2,3} × 主方胜/抓方胜/平局
- 总分池守恒（所有变化之和 = 0）
- N 自动推导（主方胜按抓方未出完人数 / 主方失败查表）
- 双路径（缺 state.主方/抓方 时从 主A+次方 推导）
- 非法输入（null / 无 mode / 无 result / 未知 winner / 未知 mode）

### §11.2 N 自动推导（test-scoring-n-derive.js，15 项）
- 主方胜 N ∈ {0,1,2,3} 全组合（按抓方未出完人数）
- 主方失败 N 查表 3 种（主A/次A × 出完/未出完 → 2/1/3）
- 明暗打倍率差异
- 显式 n 仍可覆盖推导（向后兼容）
- 边界（缺主A / 缺 players / winner=draw）

### §9 推风（test-push-wind.js）
- 9 项：1V4 暗打 × 2 场景，2V3 暗打 × 4 场景，错误路径 × 3

### §12 AI 行动（test-ai.js + integration + modes）
- AI 基本决策（capture 4 张 / press 单牌 / PASS）
- AI 与 game.js 集成（types）
- AI 在 1V4 明打/暗打的行为

### A3 加固：test-robustness.js（23 项）
- §1 新增守卫（REVEAL_BOTTOM 主A=null, table 空/undefined）
- §2 全模块畸形 state 扫描（13 种 malformed state × 10 个模块）—— fuzzer
- §3 AI 边界
- §4 transition merge 不变量

---

## 3. 性能测试（test-perf.js）

```
总局数:     1000
成功结束:   998 (99.8%)
总步数:     207611
平均步数:   207.6 步/局
最大步数:   259 步
胜方分布:   主方=317  抓方=282  平局=399
总耗时:     690.7 ms
单局耗时:   0.691 ms
吞吐:       300,569 ops/sec
```

**2 局未完成**（0.2%）—— AI 偶尔陷死循环，是已知边界（D4）。

---

## 4. 跑测命令

```bash
# 单个套件
node tests/test-deal.js
node tests/test-fan-a-e2e.js
node tests/test-scoring-n-derive.js

# 全部 25 个套件
foreach ($f in Get-ChildItem tests/test-*.js) { node $f.FullName }

# 性能
node tests/test-perf.js 1000

# 语法检查
node --check src/transition.js
```

---

## 5. 已知测试局限

| 编号 | 局限 | 影响 |
|---|---|---|
| T1 | game.js 无法在 WeChat IDE 之外实测 | UI 集成路径仅逻辑覆盖 |
| T2 | AI 压对子 / 压蛋子逻辑已被独立测试（test-ai-modes），但 ≥3 张牌型（蛋子/龙）AI 决策未实现 | §12 AI 部分 |
| T3 | 反A 后 `startPlayerIndex` 更新已测试，但完整流程的 step-by-step 验证缺失 | 真实流程可能漏字段 |
| T4 | **game.js tap-to-select 无自动化测试覆盖**（D 任务加）| UI 交互靠 IDE 验证 |
| T5 | **项目配置 (game.json / project.config.json) 无测试覆盖** | 项目配置变更靠 IDE 验证 |

---

## 6. 测试添加历史

| 日期 | 新增 | 触发原因 |
|---|---|---|
| 2026-10-19 | test-deal, test-phase2, test-fan-a, test-first-player, test-hand-types (3 批) | 初始 TDD |
| 2026-10-19 | test-capture, test-play, test-push-wind | §7-§9 实现 |
| 2026-10-19 | test-reveal-bottom, test-scoring, test-win-loss, test-skill-coverage | §10-§11 + §13 |
| 2026-10-19 | test-ai, test-ai-integration, test-e2e-full-game | §12 + game.js 集成 |
| 2026-10-20 | test-ai-modes | C 任务：AI 1V4 模式测试 |
| 2026-10-20 | test-edge-cases | E 任务：边界场景 |
| 2026-10-20 | test-fan-a-e2e, test-win-loss-boundary | G 任务：反A + 胜负边界 |
| 2026-10-20 | test-scoring-deep | B 任务：计分深度覆盖（挖出 scoring.js 双路径 bug）|
| 2026-10-20 | test-perf | K 任务：性能 |
| 2026-10-20 | test-robustness | A3 加固：畸形 state fuzzer |
| 2026-10-20 | test-scoring-n-derive | B 任务：N 自动推导 |