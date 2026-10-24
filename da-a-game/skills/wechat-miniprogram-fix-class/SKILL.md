---
name: wechat-miniprogram-fix-class
description: 微信小程序/小游戏错误横展开修复（WXSS BOM / 不支持的选择器 / 未导出函数 / pageOrientation 漏配 / 小游戏 config 验证），以及用 node 脚本逐锚点替换源码时的验收与破坏性编辑红线
---

# WeChat 小程序：错误类横展开修复

## 适用
devtools 控制台或构建日志出现**一类**问题（不是孤立一个文件）。用户没明确要求"横展开"也按此流程走——这是 WeChat 小程序的硬约束（配置文件成对存在、utils 模块被多页引用）。

## 5 步流程

### 1. 归类错误
读报错，把症状归到下面的"常见错误类"里。归类后才知道用什么扫法。

### 2. 批量扫所有同类文件
**不要**逐个 `read`——read 工具会隐藏不可见字符（如 BOM）。用 PowerShell byte 级扫：

```powershell
# 模板：扫某类文件的某类问题
Get-ChildItem -Path 'C:\path\to\project' -Recurse -Include *.wxss | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    # 把条件换成你要查的（如 BOM、tab、特定 token）
    if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        [System.IO.File]::WriteAllBytes($_.FullName, $bytes[3..($bytes.Length-1)])
        Write-Output "FIXED $($_.FullName)"
    } else {
        Write-Output "clean  $($_.FullName)"
    }
}
```

写到一个 `.ps1` 文件再 `exec` 跑——exec 工具会吃掉 inline `$_`，直接 `powershell -Command "..."` 大概率语法错（之前反复试出来的）。

### 3. 修复
用 `edit` 逐文件改。`edit` 对多行 oldText 经常因缩进/换行不匹配失败——失败就回退（按下面顺序，前者优先）。

#### 进阶回退：node Buffer.from 精准替换

`edit` 反复报"Failed to find expected lines"，但 `read` 出来一比一对得上时，用 `write` 整文件重写是**次优**——要重新拿全文、丢失注释、引入新错。更稳的是写个 .js 脚本用 `Buffer.from` 做精准替换：

```js
// 写到 .js 文件再 node 跑（不要 `node -e "..."`，长中文 PowerShell 解析会炸）
const fs = require('fs');
const path = 'target.js';
let s = fs.readFileSync(path).toString('utf8');

const o = Buffer.from("旧中文内容", 'utf8').toString('utf8');
const n = Buffer.from("新中文内容", 'utf8').toString('utf8');

if (s.indexOf(o) >= 0) {
  s = s.replace(o, n);
  fs.writeFileSync(path, s);
  console.log('FIXED');
} else {
  // 调试：打上下文片段
  const idx = s.indexOf('特征子串');
  console.log('NOT FOUND, 当前内容片段:');
  console.log(idx >= 0 ? s.substring(idx, idx + 200) : s.substring(0, 200));
}
```

**为什么有效**：
- `Buffer.from(text, 'utf8').toString('utf8')` 规范化中文字节序列，消除 read 工具显示与文件实际字节的差异
- `indexOf` 先检查再 replace，避免误改
- 不动文件其它部分，注释/格式都保留

**坑**：
- **不要用 `node -e "..."` 内联跑改动逻辑**——PowerShell 会在把内容交给 node 之前先切碎引号/括号（纯 ASCII 也会炸）。必须先写一个 .js 文件再 `node file.js`；完整症状表与修法见 `windows-cn-batch-encoding`
- **多次 edit 同一文件**：如果第二次替换依赖第一次的结果，**分开两次调用**——`edits` 数组的多次替换都按**原文件**匹配，line 漂移时第二次会失败
- 写完 .js 跑完后**立刻删**——别让它留在 `tests/` 下（微信开发者工具会扫整个目录，语法错的 helper 会让 IDE 启动报红字错）

**逐锚点替换的两条硬规则**：

1. **每个锚点各自打印 `OK` / `NOT FOUND`，跑完读完每一行再汇报。** 任何一行 `NOT FOUND` 都表示那条没改成——回复里如实写"未改成 + 已重新定位锚点"，不要因为其它锚点 `OK` 就整条报修完。`NOT FOUND` 之后按**特征串**重新定位，不要按记忆中的行号（文件已变，锚点通常只是不再逐字匹配）。
2. **不用启发式脚本批量删/插结构性字符。** 括号计数、正则批量删 `}`、按"孤儿闭合符号"清理，会把真实闭合符号一起删掉——实测一次孤儿括号清理按计数删掉约 50 个真实 `}`，22.5KB 主文件报废，当时无 commit / stash / backup，只能整体重写。**破坏性改动前先 commit 或复制备份**，改完立刻 `node --check`，不要等跑测试才发现。

### 4. 验证
跑 `node --test 'utils\*.test.js'` 确认无回归。WeChat 自身不能跑 JS，但 utils/ 是纯函数，测试在 Node 跑能挡住大多数重构错。

### 5. 报告
报告里**主动说**"横展开扫了 X 个文件 / 发现 Y 个同类问题 / 修了 Z 个"——让用户知道没漏。

---

## WeChat 小程序常见错误类

### A. WXSS UTF-8 BOM
- **症状**：`./pages/xxx/xxx.wxss(1:1): unexpected '�' at pos 1`
- **根因**：UTF-8 BOM（3 字节 `EF BB BF`）被 WXSS 解析器当字符
- **坑**：`read` 工具不显示 BOM，`read` 看到 `/* xxx */` 开头 ≠ 没 BOM
- **修法**：上面模板，扫所有 `*.wxss` 一次清干净

### B. WXSS 不支持的 CSS
- **症状**：`error at token '*'` 或类似
- **不支持**：`.center > *`（子选择器 + 通配符组合）、某些 CSS3 高级选择器
- **支持**：`.center > .child-class`、`.center .descendant`
- **修法**：用具体 class 名代替通配符

### C. JS 工具函数未导出
- **症状**：`getRoleByNickname is not a function` / `xxx is not defined`
- **根因**：`utils/xxx.js` 改了 API（重命名 / 删字段），调用方没跟上；或新加的函数忘了 `module.exports` 加
- **横展开**：
  ```powershell
  Get-ChildItem -Path 'C:\...' -Recurse -Include *.js | Select-String -Pattern 'require.*roleUtil' -List
  ```
- **修法**：在 `module.exports` 加导出；保留旧字段做兼容（`function getRoleByOpenid() { return getRoleByNickname(); }`）

### D. pageOrientation 漏配
- **症状**：某个页面还是竖屏，其它正常
- **根因**：`app.json` 顶层加了，但**每个 `page.json` 也要加**
- **横展开**：所有 `pages/*/page.json` + 兄弟 `components/*/component.json`（组件也要）
- **同时**：所有页面 WXSS 都要重做横屏布局（`100vw × 100vh`、flex 横向、`overflow: hidden`），不止一个

### E. `wx.getUserProfile` 在 onLaunch
- **症状**：`getUserProfile:fail can only be invoked by user TAP gesture`
- **根因**：官方限制，必须用户手势触发
- **修法**：
  - `onLaunch` 只读 `wx.getStorageSync` 缓存
  - 新增 `app.fetchUserProfile()` 方法
  - 绑定到按钮 `bindtap`（首页/设置页有"完善资料"入口就调）
- **横展开**：所有 `app.js` / `onLaunch` / `onShow` 都要检查

### F. `wx.cloud.callFunction` 在 onLaunch（如果用云开发）
- **症状**：`cloud.callFunction:fail Error: errCode: -601034`（无权限）或 -404
- **根因**：`wx.cloud.init({ env })` 用了不存在的环境 ID
- **修法**：去云开发控制台 https://cloud.weixin.qq.com/ 创建环境，把真实 env ID 填进 `app.js`

### G. 小游戏 `project.config.json` / `game.json` 验证错
- **症状**（例）：`启动报错[ game.json 文件内容错误] game.json: ["openDataContext"] 不能为 ''`
- **识别小游戏**：项目根是 `game.json`（不是 `app.json`）；`project.config.json` 里 `compileType: "minigame"`
- **根因**：小游戏配置校验比小程序**严格得多**——`game.json` 不接受空串/空数组作为"未设置"标记，必须**整字段删掉**；`project.config.json` 必须显式声明 `minigameRoot` + `compileType: "minigame"` + `appid`
- **不要做**：
  - 不要把 `openDataContext: ""` 当成"关掉"——整字段删掉
  - 不要把 `workers: ""` 当成"没有 workers"——会报 `["workers"] 不能为 ''`
  - 不要直接删除 `workers` 字段——某些 IDE 版本会报 `worker path empty`
  - 正解：创建 `workers/worker.js`（noop 桩：`console.log` 即可）+ 在 `game.json` 加 `"workers": "workers/"`
  - `subpackages: []`、`navigateToMiniProgramAppIdList: []` 同理——整字段删掉，不是空数组
  - 不要把 `appid` 放在 `app.json`（小游戏**没有** `app.json`，`appid` 在 `project.config.json` 顶层）
- **修法**：
  - `game.json` 只留实际有值的字段：
    ```json
    {
      "deviceOrientation": "landscape",
      "showStatusBar": false,
      "networkTimeout": {
        "request": 5000, "connectSocket": 5000,
        "uploadFile": 5000, "downloadFile": 5000
      }
    }
    ```
  - `project.config.json` 必备项：
    ```json
    {
      "minigameRoot": "./",
      "compileType": "minigame",
      "appid": "wx...",
      "setting": { "es6": true, "minified": false }
    }
    ```
- **横展开**：只此一处（配置成对但 `project.config.json` 的子字段如 `setting.es6` 对小游戏无意义但也不报错，无须展开）

---

## 报告模板

```
## ✅ 横展开修完 [错误类名]
扫了 X 个文件，发现 Y 个同类问题，修了 Z 个。
- [文件 1]: [问题描述 + 修法]
- [文件 2]: ...
测试：node --test → N/N 通过
手动验证：devtools 清缓存重编，看 [具体表现]
```

横展开报告的标志：列出**每个**被扫到的文件（不只是报错那一个），让用户立刻看出覆盖范围。

---

## 验证清单
- [ ] 错误已归类，扫描用了正确的文件类型
- [ ] 扫描用 byte 级 PowerShell，不用 `read`（read 隐藏不可见字符）
- [ ] 修复后跑了 `node --test` 无回归
- [ ] 报告列了所有被扫到的文件，不只报错那一个
- [ ] 小游戏 config 错改完，**在微信开发者工具模拟器里实际跑过**才标完成（不要只看 node 端断言）
