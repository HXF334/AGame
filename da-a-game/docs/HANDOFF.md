# 交接文档（HANDOFF）

**最后更新**：2026-10-21 13:15
**目标读者**：未来接手本项目的开发者 / AI 协作会话

---

## 1. 项目一句话

用 OpenClaw + MiniMax API 独立开发内蒙古打大A微信小游戏。当前 **43 套件 / 700+ 项测试全过**，规则引擎 < 1ms/局。`game.js` 已可在 node 里做无头测试（mock wx/canvas），**仅像素留 IDE 实测**。

---

## 2. 必读清单（新会话第一件事）

按顺序读完以下 6 份文档，约 18 分钟：

1. **`docs/PROJECT_STATUS.md`** —— 当前完成度、关键修复、风险、下一步建议
2. **`docs/PROGRESS.md`** —— 开发批次与里程碑，按时间顺序
3. **`docs/TEST_REPORT.md`** —— 43 套件 / 700+ 项 / 性能数据 / 已知局限
4. **`docs/KNOWN_ISSUES.md`** —— 真实 bug / 性能特征 / 设计陷阱（**B28 P1 等 11 个修复条目**）
5. **`docs/PROGRESS.md` 阶段 4：自主全面审查 + 大规模修复**
6. **`README` 之外的 `tests/lib/state-builder.js`** —— 共享局面构造器，避免测试与诊断各写一份导致补丁漏落

然后读：

7. **`skills/da-a-game-rules/SKILL.md`** —— 唯一规则来源（15 章）
8. **`src/index.js`** —— 规则引擎统一出口
9. **`src/transition.js`** —— 9 个 handler + transition 入口
10. **`src/hand-types.js`** —— 含 B18 P0 修复（与牌序解耦）

---

## 3. 快速命令清单

```bash
cd "C:\Users\MyFirstAI\.openclaw\workspace-work\AGame\da-a-game"

# 全部 53 个测试套件(2026-10-23 实测) — PowerShell 前台分块
#   注意: 必须**前台分块**跑(每块 5~16 个)。后台/单次全量会被 exec 会话切断,
#   且后台启动会连带清掉同目录临时脚本(2026-10-23 丢过三轮回归)。
$all = @(Get-ChildItem tests/test-*.js | Sort-Object Name)
$all[0..15] | ForEach-Object { node $_.FullName }

# 前一版本文档写的 `node tests/_runall.js` —— **该文件已不存在**, 不要照抄

# 无头对局压测(四模式: 2V3明/暗 + 1V4明/暗), 结果落盘 tools/stress_result.txt
node tools/stress-pushwind.js 24

# SKILL §13「必测用例」覆盖对账(产出排查清单, 非判决)
node tools/audit-skill-tests.js

# 性能
node tests/test-perf.js 1000          # 引擎 1000 局耗时 ~700ms

# 语法检查
foreach ($f in Get-ChildItem src/*.js) { node --check $f.FullName }

# 触发 WeChat IDE（仅当用户可访问 IDE 时）
& ..\tools\wechat-cli.ps1 open --project "$(Resolve-Path .)" --appid "wx99808147273cdea1"

# 刷新 docs（每次任务结束 / 重大更新时）
# PROJECT_STATUS / PROGRESS / HANDOFF / KNOWN_ISSUES / TEST_REPORT
```

---

## 4. 关键架构决策

### 4.1 内部 ID = A-E，显示名 = 甲乙丙丁戊
- `state.players[i].id` 保持 `'A'`/`'B'`/`'C'`/`'D'`/`'E'` 不动
- 显示名转换在 `game.js`：`names = ['甲', '乙', '丙', '丁', '戊']`
- **不要**改 ID —— 全部测试断言都用 A-E

### 4.2 state 是不可变快照
- 每个 handler 返回 `ok({ 新字段列表 })` 或 `err({ 错误 }, 原 state)`
- `transition()` 出口统一 `Object.assign({}, state, _r.state)` 合并（零侵入）
- 失败路径返回**原 state 引用**（origState），通过性通过保证
- **不要**在 handler 里直接 mutate state

### 4.3 阵营字段的双路径推导（统一到 src/util.js）
1 处实现 `camps(state)`，4 处调用（`win-loss.js` / `push-wind.js` / `scoring.js` / 未来 `handlePlay/handlePass`）：

```js
function camps(state) {
  if (!state || typeof state !== 'object') {
    return { main: [], takers: ALL_PLAYER_IDS.slice() };
  }
  var mainA = (state.主A && state.主A.establishedBy) || null;
  var ci = state.次方 || null;
  if (mainA) {
    var main = [mainA];
    if (ci && main.indexOf(ci) < 0) main.push(ci);
    return {
      main: main,
      takers: ALL_PLAYER_IDS.filter(function (i) { return main.indexOf(i) < 0; })
    };
  }
  var main2 = (state.主方 || []).slice();
  if (ci && main2.indexOf(ci) < 0) main2.push(ci);
  return { main: main2, takers: (state.抓方 || []).slice() };
}
```
**主路径 = 主A.establishedBy + 次方（唯一真来源，transition 不会丢）**
**回退 = state.主方 / state.抓方（早期阶段 / 测试构造）**

### 4.4 N 自动推导（§11.2）
- `calculateScore(state, result, n)` 中 `n` 可选
- `autoDeriveN(state, winner)`：主方胜按抓方未出完人数，主方失败查 3 行表
- 向后兼容：显式传 `n` 仍生效

### 4.5 牌型识别与顺序解耦（**B18 P0 修复后**）
- `isValidStraight` / `isValidDoubleStraight` **必须先按 rank 升序排序**
- 不能只排序沿用旧逻辑（A-2-3 排序后变成 [2,3,14]，A 落到末尾被误当高端 A）
- 改用**点数集合**显式判定 A 的两种合法形态：
  - `rest[0] === 2` → A 作低端（A-2-3-...）
  - `rest[last] === 13` → A 作高端（m...-13-A）
- 2 张 A 不构成牌型

### 4.6 AI 决策（B25 重写）
- **`chooseAction` 不再自行判牌型**
- 用 `candidateCombos(hand)` 枚举候选 → 交引擎 `canBeat` 裁决
- 排序：手牌数多者优先（尽快减少手牌），同张数按保留价值低者优先（省大牌）
- 起手可打廉价组合（≥3 张且不含大牌）以解除连张结构性死锁
- **[4] 取牌优先于压制**

### 4.7 game.js 可测性（B29）
- 测试可借导出 `draw` / `cardDesc` / `selectedCards` / `handCardHitboxes` 验证无头 UI
- 测试可借 `__setState(st, opts)` 注入构造好的 `gameState`，并重置 `currentPlayer` / `selectedCards` / `handCardHitboxes` / `lastEmptiedPlayer` / `logHistory`
- `typeof module !== 'undefined' && module.exports` 守卫已存在，对微信零影响

---

## 5. 已知陷阱（不要踩）

| 陷阱 | 后果 |
|---|---|
| ❌ 直接 mutate state | 破坏不可变快照 |
| ❌ 在 handler 里返回 `ok({ phase, players })`（不全字段列表）| **已 OK**，transition() 出口会补全，但其他可能没用 merge 的代码会丢字段 |
| ❌ 改 `state.players[i].id` 从 `'A'` 到别的 | 全部测试断言崩 |
| ❌ 在 PowerShell 里嵌带中文双引号的复杂字符串 | mojibake 匹配失败，改用 node 脚本 + `\u` 转义 |
| ❌ **写补丁脚本时漏 `fs.writeFileSync`** | 改动在内存里但没落盘，测试白挂一轮 —— **写完立即回读验证** |
| ❌ 假设 `state.主方`/`抓方` 一定有值 | 必须用 `camps()` |
| ❌ 用单字符串 pattern 配中文字符 | 改用 ASCII 锚点（行号 / 唯一英文变量名）|
| ❌ 跑 perf 测试只关心吞吐 | 完成率 0% 就是引擎 bug 信号，调试完再看数字 |
| ❌ **line-based splice 留孤立代码** | 找 `});` 时只匹配第一个，会造成 8 行遗留；用第二遍 splice 清掉 |
| ❌ **"测试预期与 SKILL 不一致"** | 改了实现后，旧测试断言可能过期，**逐项对照** §11.2/§10 等规则 |
| ❌ **局部 const 名 = 外层函数名** | 会屏蔽外层函数（旧 bug cardDescFull_cardDesc → 局部 const 改名 cardText）|
| ❌ **`state` vs `gameState` 混用** | game.js 内全局变量叫 gameState，但 runAI 局部用 state 引用会 ReferenceError |
| ❌ **`doPlay(ids)` 参数形式** | `doPlay()` **不接受参数**，取模块级 `selectedCards`；测试须 `selectedCards().push()` 后调 |
| ❌ **断言手牌 ≤22 张作为全程不变量** | §7.1 取牌合法让手牌超 22（实测 23）| 应改为非负且 ≤108 |
| ❌ **`isValidStraight` 不排序直接读两端** | 依赖数组顺序隐含假设；handlePlay 按手牌存储顺序重排导致乱序手牌识别失败 |
| ❌ **`runAI()` 是同步 while 循环**（非异步）| init 末尾会同步打完 AI 回合，后续断言时机易错 |
| ❌ **测试与诊断各写一份 build()** | 补丁只落一份，结论反复失真；必须共用 `tests/lib/state-builder.js` |
| ❌ **桌面只保留当前最大的一手** | 被压过的牌进 `discarded`；断言"出的牌在桌上"应改为"在 table 或 discarded" |
| ❌ **构造态须牌张守恒（手牌+桌面+弃牌=108）** | 否则引擎行为不可预期 |
| ❌ **21/22 张只在 `REVEAL_BOTTOM` 后成立** | init 末尾 runAI() 已可能出过牌 |

---

## 6. 跨会话协作约定

1. **每次新任务先 grep**：发现 bug 模式时，扫整个仓库的同类依赖点（参见 B19-B24 同类修复）
2. **修改 game.js 前先在 node 里跑测试**：mock-wx.js 能让 draw/doPlay/doPass/runAI 全可测
3. **不要删临时文件 `tests/_*.js`**（除非确认落盘成功并 `Remove-Item` 真的删了）—— 上游 gitignore 隔离
4. **每次重大任务后刷新 5 份 docs**（用户要求：每天 / 重大更新时）
5. **接到新指令时，先看 `docs/PROGRESS.md` 最近的里程碑 + `docs/KNOWN_ISSUES.md`** —— 不重复造轮子
6. **遇到 flaky 测试就重复跑 10+ 轮**（PowerShell 前台循环 `1..10 | %{ node $f }`）。原推荐的 `tests/_runall.js` 批量器**已不存在**，改用前台循环

---

## 7. UI 实测现状与待办（2026-10-21）

**当前状态**：无头测试覆盖逻辑/状态/事件/信息边界/触摸映射（85 项），**仅像素未验证**。

### 无头能验的（已覆盖）
- 加载初始化无异常
- log 文案无 `undefined`/`NaN`/`[object Object]`（B27 类症状）
- 完整对局跑完 GAME_END，牌张守恒 108
- 信息边界：`draw()` 单帧 fillText 实参里没有他人手牌文案
- 触摸映射：hitbox 几何 / 点中心/边缘 / 间隙与区外不选 / 仅人类回合注入
- 注入点 `__setState` 可精确复现指定场景，触发引擎目标

### 仍需 IDE 验的
- 像素（手牌宽度 24px × 22张 = 549px 居中布局是否正常显示）
- 按钮位置（play/pass/pushWind 三个按钮的 tap 区与文本的视觉对齐）
- 字体大小与分辨率适配
- 帧率
- 横屏切换

### IDE 实测推荐清单
1. **乱序手牌出连张** —— P0 修复核心场景
2. **两张同花色 A 直接亮** —— §4.3 修复场景（应直接进 1V4明打，无 IDENTITY_CHOICE）
3. **推风后 UI 不再跨阵营** —— B28 修复
4. **出 33333 压单大A** —— §6.4
5. **手牌宽度适配** —— 22 张牌需 549px

---

## 8. 联系信息

- 项目 owner：`gateway-owner`
- AppID：`wx99808147273cdea1`
- AppID 测试者：通过 OpenClaw MiniMax API 自动开发
- 文档维护：每个任务批次 / 重大更新结束时刷新 `docs/PROGRESS.md` / `PROJECT_STATUS.md` / `TEST_REPORT.md` / `HANDOFF.md` / `KNOWN_ISSUES.md`
- **git 远程**：https://github.com/HXF334/AGame.git（当前 main == origin/main，ahead 0）