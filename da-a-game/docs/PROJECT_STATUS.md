# 内蒙古打大A · 项目状态报告

**更新时间**：2026-10-23 21:10 (Asia/Shanghai) · 版本 v0.9.0
**项目路径**：`C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game\`
**总测试**：43 套件 / **700+ 项全过** ✅
**git**：main == origin/main @ 1355d0e，未推送 0 / 未拉取 0，工作区干净，73 文件

---

## 1. 完成度总览

| SKILL 章节 | 实现位置 | 测试套件 | 状态 |
|---|---|---|---|
| §1 核心职责 | meta | — | ✅ |
| §2.1 牌组 | `src/card.js` | test-deal | ✅ |
| §2.2 座位与发牌 | `src/deal.js` | test-deal | ✅ |
| §3 状态机（14 阶段）| `src/phases.js` + `src/transition.js` 9 个 handler | test-phase2 + test-fan-a-e2e | ✅ |
| §4.1 主A 与身份 | transition.js handleLiangA | test-fan-a + test-fan-a-e2e + test-liang-double-a | ✅ |
| §4.2 强制排查 | handleForcedCheck | test-fan-a | ✅ |
| **§4.3** 直接亮双大A | handleLiangA + handleRevealBottom (B24 修) | test-fan-a + **test-liang-double-a (16 项)** | ✅ |
| §4.4 反A | handleFanA（已修 startPlayerIndex）| test-fan-a + test-fan-a-e2e + test-game-scenarios | ✅ |
| §4.5 底牌翻开+身份选择 | handleRevealBottom + handleChooseIdentity | test-reveal-bottom + test-game-scenarios | ✅ |
| §5 首轮出牌权 | transition.js determineFirstPlayer | test-first-player | ✅ |
| **§6.1-6.4 牌型+压制** | `src/hand-types.js`（B18 P0 修后与牌序解耦）| test-hand-types + batch2 + batch3 + test-order-independence | ✅ |
| §7.1-7.3 [4] 取牌 | `src/capture.js` + play.js | test-capture + test-game-scenarios | ✅ |
| §8 出牌轮次+过牌 | `src/play.js` | test-play | ✅ |
| §9 推风 | `src/push-wind.js`（引擎层，引擎曾 B19/B21 修）| test-push-wind + test-push-wind-camp + test-game-scenarios | ✅ |
| **§10 胜负** | `src/win-loss.js` | test-win-loss + boundary + edge-cases | ✅ |
| **§11 计分** | `src/scoring.js` | test-scoring + deep + n-derive | ✅ |
| **§12 AI 行动** | `src/ai.js`（**B25 重写**，候选枚举+引擎裁决）| test-ai + ai-integration + ai-modes + ai-capability | ✅ |
| §13 必测用例 | 43 套件 | 全部 ✅ | ✅ |
| **§14 完成标准** | `tests/mock-wx.js` + 无头 UI 测试 3 套件（**75 项**）| test-game-headless + test-game-scenarios + test-game-touch | ⚠️ 逻辑可达，**像素仍待 IDE 验证** |
| §15 完成每项开发任务后的汇报 | 已在每次任务后做 | — | ✅ |

**15 章 SKILL 全部实现 + 测试**；§14 逻辑层可无头验证，仅视觉留 IDE 实测。

---

## 2. 关键修复历史（重大更新 2026-10-21）

### 阶段 4 总览（17h 内）
- **9 项独立修复**（P0 ×1 / P1 ×6 / AI ×1 / UI ×2）—— 详见 `KNOWN_ISSUES.md` B18-B30
- **9 项测试新增**：mock-wx, state-builder + 4 套 UI 测试合计 **109 项**
- **AI 能力大幅提升**：牌型覆盖 1/16 → 9/16，300 局压测全过
- **抓到 1 个真实现存 UI 缺陷**：`doPushWind` 未同步 `currentPlayer`（A/B 对照证明）
- **43 套件 / 700+ 项全绿**，分批验证 400+ 次套件执行 0 失败

### P0 [B18] 连张/双龙识别与牌序解耦（最关键）
- **症状**：手牌非点数升序时，连张/双龙永远识别失败（INVALID_HAND）；真实玩家与 AI 同样中招
- **根因**：`play.js handlePlay` 用 `player.hand.filter(c => cardIds.indexOf(c.id) >= 0)` 取牌，按**手牌存储顺序**重排，丢弃调用方给的顺序；而 `isValidStraight` / `isValidDoubleStraight` 逐位比较 `cards[i+1].rank === cards[i].rank + 1` 并直接读 `cards[0]`/`cards[len-1]`，隐含"已按点数升序"
- **附带收益**：D4「AI 死循环」根因即此（AI 反复尝试打不出的连张形成活锁），300 局压测不再复现
- **测试**：`test-order-independence.js`（13 项，含全排列验证）

### P1 [B19-B24, B28] 引擎与 UI 修复集
| # | 概要 |
|---|---|
| B19 | POWER 表压平 §6.3 末档，蛋子无法跳型压制 |
| B20 | PAIR/TRIPLE 比较泄露大A 加成，新增 `pairRankEncoding()` 分离点数编码 |
| B21 | 推风跳阵营（分支条件误用 mode） |
| B22 | 单大A 压制张数写反（4‖6 → 5‖6） |
| B23 | isValidStraight 循环起点错误（4-4-5 被误判为连张） |
| B24 | §4.3 直接亮双大A 未按 1V4明打 处理（代码注释写了意图但条件没实现） |
| **B28** | **PUSH_WIND 引擎算对的 `currentPlayer` 在 UI 被丢弃**（`doPushWind` 未同步模块级变量 → 跨阵营行动）|

### AI [B25] 决定性改动
- 旧 `ai.js`：逐张单牌 + PAIR 特例，16 种牌型只出 SINGLE（100%）
- 新 `ai.js`：`candidateCombos` 枚举 + `canBeat` 引擎裁决，AI 不再自行判牌型
- 新增 `src/combos.js`：纯函数枚举手牌候选组合
- 排序：手牌数多者优先（尽快减少手牌），同张数按保留价值低者优先（省大牌）
- **实测 40 局**：牌型覆盖 1/16 → 9/16
- **300 局压测**：0 卡死 / 0 非法 / 0 牌张守恒违规

### UI [B26-B27]
- game.js 对子回退声称修复但未落盘 → 改用 `candidateCombos`
- 15 项 UI 修复（详见 `KNOWN_ISSUES.md` B27）

---

## 3. 当前架构

```
da-a-game/
├── game.js              微信小游戏入口（含 tap-to-select）
│                        [新增为可测试导出] draw / cardDesc / selectedCards /
│                        handCardHitboxes / __setState 注入点
├── game.json            小游戏配置
├── project.config.json  微信开发者工具配置
├── src/                 规则引擎 + AI（13 模块）
│   ├── card.js          牌组工厂
│   ├── deal.js          发牌
│   ├── phases.js        PHASES / ACTIONS / ERR 常量
│   ├── transition.js    9 个 handler + transition 入口（B24 §4.3 + B28 sync）
│   ├── hand-types.js    牌型识别 + 比较 + 压制（B18 P0 牌序解耦）
│   ├── capture.js       [4] 取牌
│   ├── play.js          出牌/过牌/轮次判断
│   ├── push-wind.js     推风（B19/B21 修）
│   ├── win-loss.js      胜负判定（双路径）
│   ├── scoring.js       计分（双路径 + N 自动推导）
│   ├── ai.js            AI 决策（B25 重写）
│   ├── combos.js        候选组合枚举（人类/AI 复用）
│   ├── util.js          共享 camps() helper
│   └── index.js         统一导出
├── skills/da-a-game-rules/SKILL.md   唯一规则来源
├── tests/               43 套件（700+ 项）
│   ├── 引擎测试 36 套: deal / phase2 / fan-a / fan-a-e2e / liang-double-a[B24] /
│   │                    first-player / hand-types(×3) / order-independence[B18] /
│   │                    capture / play / push-wind(-camp)[B21] / reveal-bottom /
│   │                    fan-a / win-loss(-boundary) / edge-cases /
│   │                    scoring / scoring-deep / scoring-n-derive /
│   │                    ai / ai-integration / ai-modes / ai-capability[B25] /
│   │                    audit-integration / e2e-full-game / robustness / perf
│   ├── game.js 测试 3 套: test-game-headless[B29 信息边界] / 
│   │                    test-game-scenarios[B28 推风同步+6场景]
│   │                    test-game-touch[触摸映射]
│   ├── mock-wx.js       wx 运行时 mock
│   ├── lib/state-builder.js   共享确定性局面构造器
│   └── _*.js            临时文件（gitignore 隔离）
└── docs/                项目文档（本目录 + KNOWN_ISSUES.md）
```

---

## 4. 风险与已知问题

| 编号 | 问题 | 状态 |
|---|---|---|
| R1 [2026-10-20] UI 验证 R4/R5/R6 → B27 已修 15 项 UI bug | ✅ 已修 |
| **新增 R7** [2026-10-21，2026-10-23 更新] 微信 IDE 实测曾是验证盲区 | **已于 2026-10-23 完成实测并通过**：完整一局到 GAME_END，且日志证实人类出完牌触发推风(触发=甲 同阵营=主方[甲,戊] 目标=戊)。像素级与真机仍待验证 | 已闭环 |
| **新增 R8** [2026-10-21] `test-audit-integration.js` 间歇失败 | 200+ 次执行未复现，根因未查明（不是 22-张上限那类断言错误）|
| **新增 R9** [2026-10-21] push 网络到 `github.com` 间歇不可达 | 实测 `github.com:443=False` 而 `api.github.com:443=True`；当前已全部同步，不影响开发 |

---

## 5. 性能指标

### 引擎层面（test-perf.js 1000 局 2026-10-20）
```
总局数:     1000
成功结束:   998 (99.8%)
平均步数:   207.6 步/局
单局耗时:   0.691 ms
吞吐:       300,569 ops/sec
```

### AI 可靠性层面（阶段 4 的 300 局压测 2026-10-21）
```
正常结束: 300/300
卡死:     0
引擎拒绝的非法行动: 0
牌张不守恒违规:     0
平均步数: 142
最大步数: 195  (远低于 400 阈值)
```

AI 性能/覆盖率：
```
牌型分布 (40 局):
  SINGLE 72.1%  TRIPLE 14.3%  BIG_TRIPLE 7.9%  PAIR 3.2%
  STRAIGHT 1.7%  DOUBLE_STRAIGHT 0.8%
  TRUE_SEVEN / STRAIGHT_TRIPLE / FAKE_EIGHT
覆盖: 9/16  (含 6 种常规 + 3 种稀有)
```

---

## 6. 下一步建议

| 优先级 | 任务 | 说明 |
|---|---|---|
| ~~**P0**~~ | ~~微信 IDE 实测~~ | **已于 2026-10-23 完成**：乱序手牌出连张 / 两张同花色 A 直接亮 / 推风目标 三项均已验证；其中「推风」在真实对局中触发了 3 次(含人类触发 1 次)，目标均同阵营 |
| P3 | D7：`handlePlay`/`handlePass` 内改走 `camps()` | 防止再次出现 B19/B20 这类直接依赖阵营字段的同类 bug |
| — | 网络恢复后重推（已全部同步，无需操作）| — |