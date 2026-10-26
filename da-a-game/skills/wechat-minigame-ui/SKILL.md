---
name: "wechat-minigame-ui"
description: "微信小游戏 Canvas 界面实现——横屏画布与 dpr、手牌布局、hitbox 单一来源、按钮由状态推导"
---

# 微信小游戏 Canvas 界面实现

微信小游戏是 **Canvas 单页**（不是小程序 WXML/WXSS 栈）：没有 DOM、没有 CSS、没有
`pageOrientation`，布局全靠自己算像素。本 Skill 只讲**怎么把界面写对**。

## 归属判断（先分流，别走错 Skill）

| 你遇到的是 | 去哪里 |
|---|---|
| 小程序（WXML/WXSS/JSON）错误类、`pageOrientation` 漏配、config 验证 | `wechat-miniprogram-fix-class` |
| 引擎测试全绿但 UI 无响应/元素缺失/重复渲染 | `game-ui-engine-contract` |
| **规则本身算错** | `dada-a-game-rules`（唯一依据），实现坑见 `dada-a-game-impl` |
| **Canvas 界面怎么写对**：画布尺寸、手牌布局、hitbox、按钮模型、面板几何 | 本 Skill |

---

## 1. 画布尺寸：CSS 像素 vs 物理像素

小游戏拿到的 `screenWidth` / `windowWidth` 是 **CSS 像素**；`canvas.width` 若乘了
`pixelRatio` 就是**物理像素**。两套混用会让所有坐标错位一个倍数，且**高分屏才错**。

**定死一条规矩：画布逻辑坐标一律用 CSS 像素，绘制前统一缩放。**

```js
var dpr = wx.getSystemInfoSync().pixelRatio || 1;
canvas.width = W * dpr;   // 物理像素, 只给 GPU
canvas.height = H * dpr;
ctx.scale(dpr, dpr);      // 之后 ctx 的坐标就是 CSS 像素
var W = wx.getSystemInfoSync().windowWidth;   // CSS 像素
var H = wx.getSystemInfoSync().windowHeight;
```

**触摸坐标必须用同一套**：触摸事件的 `clientX/clientY` 是 CSS 像素，直接与 CSS 像素的
hitbox 比较，**不要再乘除 dpr**。判定方式：一行日志同时打出
`canvas.width / windowWidth / pixelRatio` —— `canvas.width / windowWidth ≈ dpr` 就说明
画布是物理像素而触摸是 CSS 像素，此时**要么 `ctx.scale` 统一，要么 hitbox 全部换算**，
二选一，不能各算各的。

**完成判据**：在任意 dpr 下，同一个视觉位置用手指点到，与用代码模拟的 `clientX/Y`
命中的实体一致。

---

## 2. 横屏布局：先定可用矩形，再摆元素

横屏不等于「宽」——**高度才是稀缺资源**（常见 844×390，可用高度不到 400px）。

**先算可用矩形，别边写边调**：

```
顶部条     y ∈ [0,      0.08H]     玩家切换/开关按钮
信息区     y ∈ [0.10H,  0.34H]     phase/mode/主A 等黄字
中央区     y ∈ [0.30H,  0.60H]     桌牌
手牌区     y ∈ [0.62H,  0.88H]     玩家手牌
操作区     y ∈ [0.88H,  1.00H]     按钮行
```

**铁律**：
- 任何元素的上沿**不得低于它所属区的上沿**，下沿不得越过下一区的上沿。
- 按钮行固定在 `H*0.93` 附近，**其它元素不得压到 `H*0.88` 以下**。
- 加元素前先算它落在哪一区；**跨区就说明分区错了**，先改分区。

**完成判据**：每个元素的 `y` 与 `y + height` 都能说出它属于哪一区，且不越界。

---

## 3. 手牌布局：手牌满时不能溢出

手牌最多 22 张。横屏常见可用宽度约 700~800px。

**用「重叠 + 抬升」而不是「缩小」**：

```
牌宽 w = 46
第 i 张 (0-based) 的 x = startX + i * step
step = 固定步长（按最大手牌数一次算定，不随手牌数变）
重叠时给选中/可点的牌加 y 偏移抬起来
```

- **`step` 取整数**（`Math.round`）：浮点步长会让相邻命中框边界抖到「相接」，被命中测试判成**重叠**；
  各框宽度也会因浮点尾数**不相等**。步长算出后全程复用同一个数。
- **步长固定，不随手牌数自适应**：手牌变少 → 总宽缩小 → 整条**居中**，间距保持不变（用户要求）。
  按最大手牌数一次算定 `step`，牌数变少只是少画几张。
- `step < w` 就是重叠。**重叠必须有抬升**，否则后一张完全盖住前一张的点数。
- 抬升偏移量与重叠量成正比：`lift = (w - step) * 0.6`。
- **命中框契约（与渲染分离）**：命中框**数量 = 可点手牌数**、**全部等宽**、相邻不重叠、
  按命中框外接盒**居中**。**装饰元素（底牌牌背）只画不占命中框**，否则数量对不上。
- **完成判据**：n=22 时最后一张的右沿 `<= 可用宽`；相邻两张至少露出牌点数所在的宽度；
  命中框「数量 / 等宽 / 不重叠 / 居中」四项全过（`tests/test-game-touch.js` 即此契约）。

> **取舍**：等宽 + 不重叠 + 外接盒居中 三条同时成立时，最后一张只能露出 `step` 宽，**无法完整显示**。
> 要「最后一张完整显示」就得放宽等宽或居中其中一条 —— 那是**改契约**，先跟用户确认，别擅自改测试标准。

**反过来：不要让手牌区被按钮行压住。** 手牌下沿 = `手牌区下沿`，按钮行起点 = `操作区上沿`，
两者必须留 4~8px 间隙。

---

## 4. 触摸 hitbox：**写坐标的对象与读坐标的对象必须是同一份**

这是小游戏最常见的「点了没反应」根因。

**反模式**（会 100% 点不到）：

```js
function hitTest(x, y) {
  var list = buildButtons();          // ← 新对象，没有 x/y/w/h
  for (...) if (x >= b.x && ...)      // x >= undefined → 恒 false
}
```

**正确模式**：

```js
var hitboxes = [];                     // 模块级持有
function layout() {                    // 布局阶段：只算坐标
  hitboxes = buildButtons().map(assignGeometry);
}
function hitTest(x, y) {               // 命中阶段：只读已算好的
  return hitboxes.filter(function (b) { return b.enabled; })
    .filter(function (b) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; })[0];
}
```

**铁律**：
1. 坐标**只在布局阶段算一次**，存进模块级数组。
2. 命中测试**只读那个数组**，绝不重新生成。
3. 禁用元素**从命中集合里剔除**（`enabled=false` 的按钮不该吃掉点击）。
4. 布局与绘制**分离**：无 canvas 时也把坐标算出来（用默认视口尺寸），
   这样无头测试能验证命中区，不用真机。

**完成判据**：按钮中心点命中自己；按钮之间的间隙与区外不命中；禁用按钮不命中。

---

## 5. UI 状态由游戏状态推导；语义不等时用受管的影子量

多个位置各自判断 `phase` / `currentPlayer` 来决定显示什么，必然出现互相冲突
（这个按钮亮了那个没亮）。

**单一来源**：

```js
function uiButtons() {                 // 唯一入口: 返回 [{id, label, enabled}]
  var out = [];
  if (phase !== PLAY && phase !== GAME_END) {
    if (gateChoice && gateChoice.kind === 'LIANG_A') {
      out.push({ id: 'liangA',   label: '亮A', enabled: !!gateChoice.eligible });
      out.push({ id: 'noLiangA', label: '不亮', enabled: !!gateChoice.eligible });
    }
    // [2026-10-24 用户要求] **不提供【下】**: 各阶段自动判断能否进入下一阶段。
    //   需要真人决策时**停下等真人点**, 决策完自动续跑(gateAutoAdvance)。
    //   若保留「跳过」按钮且在有待决策时可用, 等于给了一条绕过玩家决策的路径。
  }
  if (phase === PLAY) {
    out.push({ id: 'play', label: '出牌', enabled: currentPlayer === humanPlayer });
  }
  if (phase === GAME_END) out.push({ id: 'newGame', label: '下一局', enabled: true });
  return out;
}
```

**要点**：
- **资格不具备时按钮仍然显示，但 `enabled=false`** —— 玩家需要知道「有这个操作但我不符合条件」，
  直接不显示会让玩家以为自己漏看了什么。
- **不要提供「跳过后续阶段」的按钮**。让「跳过」在需要亮A/反A选择时仍然可用，
  等于给了一条绕过玩家决策的路径。
- **每一档状态的「进入该状态后要做的事」收进统一入口函数**，所有能触发状态转换的地方都调它。
  分散在多个入口的补丁逻辑必然漏一处（漏掉的那处会表现为「某个阶段按钮全灰 / AI 不出手」）。

**完成判据**：把 UI 相关的判断全部收进 `uiButtons()` 后，`grep` 渲染与命中代码里
不再出现独立的 `phase ===` 判断。

**例外：引擎语义 ≠ 用户可见语义时，影子量是必需的**。
本项目引擎的 `passedPlayers` 每次出牌就清空（`play.js` 里 `passedPlayers: []`），
而用户要的是「该玩家过牌后一直显示，直到他自己出牌」—— 两者不等，
所以 UI 侧必须维护自己的 `uiPassed`。

**影子量一旦存在，就必须登记生命周期**：谁置位、谁清位、**清位时机**
（「轮结束」/「该玩家自己出牌」/「推风」）。没有时机定义的清位 = bug 温床。
显示类问题的定位方法见 `game-ui-engine-contract` §2.4。

---

## 6. 面板与提示几何：行数 × 间距 × 起点 联动

日志面板、结算面板、提示条都吃同一套几何。

```
末行 y = 起点 + (n - 1) × 间距
```

**三条上界都要查**：
1. `末行 y < H` —— 没出屏
2. `末行 y < 交互区上沿` —— 没压到按钮（**只看 H 会漏掉这一条**）
3. `间距 × H > 字体像素` —— 不视觉粘连（13px 字体实测 `间距 ≈ 0.029H` 偏挤，`0.023H` 太挤）

**加行数必然要压间距或抬起点**，先算再改。面板宽度同理：`起点 + 宽度 <= 画布宽`。

**提示条**：用「有文字 → 显示，N 秒后自动消失」的 toast，不要常驻。宽度按
`measureText` 量出来 + padding，**不要写死**，否则中文与英文宽度不同会溢出。

**完成判据**：面板最坏情况（最长的一行文本 + 最大行数）不越界、不压按钮。

---

## 7. 打包期崩溃：两类根因，同一个报错

微信小游戏把项目目录下的源文件合成一个 `WAGame.js`。合成失败时真机只报一行：

```
WAGame.js:1 SyntaxError: MiniProgramError
Invalid or unexpected token(env: Windows,mg,2.02.2608080; lib: 3.17.5)
```

**报错位置是打包产物第 1 行，与源文件行号无关**；**`node --check` 过、测试全绿** ——
本地测不到打包期才发生的事。所以「本地全绿 + 真机崩在第 1 行」只有两类根因：

| 根因 | 判据 | 修法 |
|---|---|---|
| **源文件是 CRLF** | 打包器不容忍 CRLF | 行尾改回 LF（§7.1） |
| **被打进包的 .js 带 shebang** | `#` 在 JS 里不合法，打包器不剥 | 去 shebang，或把该目录排除出包（§7.2） |

### 7.1 源文件必须是 LF

**排查**（CRLF 与裸 LF 必须分清；`crlf`=CRLF 数，`lone`=孤立 CR 数，`lf`=裸 LF 数）：

```js
var s = fs.readFileSync(f, 'utf8');
var crlf = 0, lone = 0, lf = 0;
for (var i = 0; i < s.length; i++) {
  var c = s.charCodeAt(i);
  if (c === 13) { if (s.charCodeAt(i + 1) === 10) { crlf++; i++; } else lone++; }
  else if (c === 10) lf++;
}
console.log(f, { crlf: crlf, lone: lone, lf: lf });   // 期望 crlf=0
```

**写文件时保持原行尾**：`split(/\r?\n/)` 之后要用**与原文件一致**的分隔符 join。
仓库是 **LF**（`.gitattributes` 的 `eol=lf` 锁定），`join('\r\n')` 会把整个文件改坏。

### 7.2 shebang 与打包范围

`minigameRoot: "./"` 意味着**项目目录下每一个 .js 都会被打进包里**，包括你以为是「工具」的 `scripts/`、`tests/`。

```js
#!/usr/bin/env node     // ← 打包后 -> Invalid or unexpected token
```

`#` 在 JS 里不合法。Node 只允许 CommonJS 入口文件带 shebang，打包器不会帮你剥掉 ——
**同一个报错、同一个位置**，但根因不同。

两条修法（任选）：**去掉 shebang**（用 `node xxx.js` 显式调用），或**把该目录排除出包**：

```json
{ "packOptions": { "ignore": [
  { "type": "folder", "value": "scripts" },
  { "type": "folder", "value": "tests" }
] } }
```

**同时也是打包体积与安全**：测试套件、文档、Skill 源码都不该进包。
新增 `scripts/`、`tests/` 这类目录后，**立刻把 packOptions.ignore 补上**。

### 7.3 提交/打包前跑体检

本仓库已有 `scripts/preflight.js`，把上面的检查（shebang / BOM / CRLF / 非标准字符 / 语法 / packOptions / Markdown 结构）串成一道关：

```powershell
node scripts/preflight.js            # 全跑
node scripts/preflight.js --fast     # 只跑静态体检
```

**不要手写一次性扫描脚本** —— 体检已有实现，重复造只会漏项。

**完成判据**：被打包的 `.js` 全部纯 LF、无 shebang/BOM；`packOptions.ignore` 覆盖所有非游戏目录；
`node scripts/preflight.js` 退出码 0；**真机能正常启动**。

## 8. 收尾自检


- [ ] `node --check` 所有改过的 `.js` 通过
- [ ] `node scripts/preflight.js` 退出码 0（shebang / BOM / CRLF / packOptions / Markdown 结构全过）
- [ ] 被打包的 `.js` 全部纯 LF（无 CRLF、无孤立 CR）
- [ ] 画布逻辑坐标与触摸坐标是**同一套**（CSS 像素或物理像素，二选一并贯穿）
- [ ] 每个元素都属于某个分区，不越区、不压按钮行
- [ ] 手牌满（22 张）不溢出，重叠时抬升可见
- [ ] hitbox 与按钮坐标**来自同一份对象**，禁用按钮不参与命中
- [ ] UI 判断全部收在 `uiButtons()`，渲染与命中代码里没有独立的 phase 判断
- [ ] 面板最坏情况不越界；提示条宽度按文字实测
- [ ] 在**没有 IDE** 的情况下，无头测试能验证命中区（布局与绘制已分离）
- [ ] **真机点一遍**：每个按钮、每张手牌都点过，确认响应与预期一致
      （无头测试没有「点」这个动作，触达性只有真机能验）


---

## 相关 SKILL

- `game-ui-engine-contract` — 界面/引擎**契约排错**（导出未转发、动作形状、驱动循环死锁）、无头 UI 测试、触摸映射四档必测
- `wechat-miniprogram-fix-class` — 小程序（WXML/WXSS）错误类与 IDE 配置
- `dada-a-game-rules` — 规则手册，改规则前必查
- `windows-cn-batch-encoding` — 中文 Windows 编码与 PowerShell 内联脚本切碎
