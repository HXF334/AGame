---
name: windows-cn-batch-encoding
description: 中文 Windows 编码与内联脚本坑——写 .bat 用 GBK、.ps1 用 UTF-8+BOM；读乱码先试 $OutputEncoding+chcp 再上 Start-Process 抓 raw bytes；node -e 内联被 PowerShell 切碎时改写 .js 文件再跑
---

# 中文 Windows 写 .bat / .ps1 编码

## 症状
.cmd / .bat 文件里中文路径、注释、`echo` 提示显示成乱码（典型：`寰俊web寮€鍙戣€呭伐鍏穃`），且命令被错切——某个 token 报「不是内部或外部命令，也不是可运行的程序」。

## 根因
中文 Windows 的 cmd.exe 默认按系统代码页 CP936（GBK）读 .bat。文件存什么编码都会被按 GBK 读：

- **UTF-8 无 BOM**：每个中文字节序列被当 GBK 多字节字符错解
- **UTF-8 with BOM**：BOM 的 `EF BB BF` 不被 cmd.exe 当 BOM 处理，**被读成 GBK 字符"锘緻"**，文件其他字节仍按 GBK 解
- **`chcp 65001 >nul` 写在文件第一行**也救不了——文件已经按 GBK 读完了，chcp 来不及切换
- 唯一稳的：整份文件用 **GBK 存**（系统代码页 936）

## 正确写法（PowerShell 写 .bat）

```powershell
$content = @"
@echo off
echo 项目目录: %~dp0
pause
"@
$gbk = [System.Text.Encoding]::GetEncoding(936)
[System.IO.File]::WriteAllText('C:\path\to\file.bat', $content, $gbk)
```

## 行结束符
中文 Windows 的 cmd.exe 对 **LF-only** 也很敏感——多字节字符被 LF 拆开，行解析炸。存文件时强制 CRLF：

```powershell
$content = $content -replace "`r`n", "`n" -replace "`n", "`r`n"
```

## .ps1 文件不同
PowerShell 自己认 UTF-8 BOM，**不认 GBK**。所以 .ps1 用 **UTF-8 with BOM**：

```powershell
$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText('C:\path\to\file.ps1', $content, $utf8Bom)
```

## 验证（写完必跑）

```powershell
$bytes = [System.IO.File]::ReadAllBytes('file.bat')
$gbk = [System.Text.Encoding]::GetEncoding(936)
$sample = $gbk.GetString($bytes, 0, 12)
Write-Host "首 12 字节 GBK 解码: '$sample'"
$bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
if ($bom) { Write-Host "警告: 有 UTF-8 BOM - cmd.exe 会乱码" -ForegroundColor Red }
else { Write-Host "OK: 无 BOM" -ForegroundColor Green }
$crlf = 0; $lf = 0
for ($i=0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -eq 0x0D -and $i+1 -lt $bytes.Length -and $bytes[$i+1] -eq 0x0A) { $crlf++ }
    elseif ($bytes[$i] -eq 0x0A) { $lf++ }
}
Write-Host "CRLF=$crlf  裸 LF=$lf"
```

## 调用 .bat 时的连带规则
- 不要在 .bat 第一行写 `chcp 65001`——无效
- 路径里有中文时，PowerShell 调用要用 `Start-Process -FilePath`（Unicode argv），不要用 `cmd.exe /c "..."` 字符串拼接
- `Start-Process -RedirectStandardOutput X -RedirectStandardError X` **会失败**「RedirectStandardOutput 和 RedirectStandardError 相同」。必须两个**不同**文件

## PowerShell 里跑内联脚本（node -e / -Command）

**症状**：脚本报 `参数列表中缺少参量`、`无法将"xxx"项识别为 cmdlet`、`Expected unicode escape`、`SyntaxError: Invalid or unexpected token`。看起来像代码写错，实际是 PowerShell 在把内容交给子进程**之前**就把引号切碎了。

**根因**：PowerShell 自己先解析命令行。`node -e "..."` 的内容要同时穿过一层 PowerShell 双引号和一层 JavaScript 字符串；里面任何与外层冲突的引号、括号、`$`、反引号，都会在到达 node 之前被吃掉或改写。

**已验证会炸的写法（内容全是纯 ASCII，不含中文）**：

| 写法 | 结果 |
|---|---|
| `node -e "... s.indexOf(\"x(null)\") ..."` | 内层 `\"` 不被 PowerShell 当转义，JS 字符串提前闭合 → `null` 被当成一条 PowerShell 命令，报"无法将 null 识别为 cmdlet" |
| `node -e "... 'a\'b' ..."` | node 收到字面 `\'` → `SyntaxError: Invalid or unexpected token` |
| `echo function f(){...}` | `{}` 被当脚本块解析，报"参数列表中缺少参量" |
| `node -e "... \` ... "` | 反引号是 PowerShell 转义符，内容被改写 |
| `git commit -m "... \"引号\" ..."` | 内层 `"` 被当成 PowerShell 字符串终止符，提交信息后半段被**当成命令执行**；commit 失败 |

**`git commit -m` 会自掩失败，必须单独查**：commit 失败后紧跟的 `git push` 会输出 `Everything up-to-date`（因为确实没有新 commit），**读起来像推送成功**。看到这条输出不能当作 commit 成功——它同时是"无新提交"和"提交失败"两种情况的输出。

**修法**：提交信息写入文件再提交，避免任何引号进入命令行：

```powershell
git add -A; git commit -q -F .git/COMMIT_MSG_TMP.txt; Remove-Item .git\COMMIT_MSG_TMP.txt
git log --oneline -1        # 确认 commit 真的产生了
```

**git 的 stderr 不是失败信号**：`git push` / `git commit` 把进度（`To https://...`、`* [new branch] main -> main`）写到 **stderr**。PowerShell 经管道读 stderr 时会把这些行包成错误记录，报 `NativeCommandError` 或 `Exit code 1`，**即使操作成功**。

判定顺序：

1. 先看有没有成功标志文本（`-> main`、`[new branch]`、`[main ...]`）
2. 再看退出码：`$LASTEXITCODE`
3. **两者不一致时以退出码为准**——不要把 `NativeCommandError` 当失败

```powershell
git push origin main *> $null
if ($LASTEXITCODE -eq 0) { "PUSH OK" } else { "PUSH FAILED" }
```

网络间歇性不可达时**按退出码**判断成败，不要按「出现了错误文本」判断（判定顺序见上面「判定顺序」）。

**推多少次由 `git-safe-workflow` §4 决定**（本工作区：**只推一次**，失败就停，提交留本地等下次一起推）。
不要在这里自己加重试循环。

**修法（一般形式）**：内联只保留"无嵌套引号、无括号、无 `$`、无中文"的调度命令（如 `cd x; node fix.js`）。任何超过一行的逻辑一律写成 `.js` / `.ps1` 文件再跑，**跑完立刻删掉**——遗留的临时脚本会被打包器或 IDE 扫到。

**这条与中文无关**：纯 ASCII 内联同样会炸；只是中文场景触发频率高，症状看起来像编码问题，从而把人引向错误的方向。

## 写入检查清单
- [ ] `.bat` 用 GBK 编码（`[System.Text.Encoding]::GetEncoding(936)`）
- [ ] `.ps1` 用 UTF-8 with BOM（`New-Object System.Text.UTF8Encoding $true`）
- [ ] 行结束符强制 CRLF
- [ ] 验证脚本跑一遍（首 12 字节能解出 `@echo off` / `REM ===`，无 BOM，全 CRLF）
- [ ] 调用方用 `Start-Process -FilePath` 传带中文路径

## 读中文 Windows CLI 输出（写入的反向场景）

**根因（字节级确认）**：PowerShell 默认 `$OutputEncoding = US-ASCII`（CP20127）。子进程写 UTF-8 字节到 stdout/stderr，PowerShell 通过管道读时按 US-ASCII 解码——**任何 ≥0x80 的字节全部被坏**。典型表现：`√`（U+221A，UTF-8 字节 `E2 88 9A`）显示成 `鈭?`；`退出`（`E9 80 80 E5 87 BA`）显示成 `閫€鍑?`。

**别假设编码**：现代工具（Node.js / Electron / 任何用 console.log 写 Unicode 的进程）默认写 **UTF-8**。`chcp 936` 是 shell 代码页，不等于子进程输出编码。先看字节再决定用 UTF-8 还是 GBK 解码。

**先试最简方案**（子进程是本机 Node/Electron 等默认写 UTF-8 的工具时，它通常就够）：

```powershell
$OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; node x.js
```

管道输出仍然乱码，再上下面 raw bytes 方案。

**仍然乱码时，不要靠读中文条目名判断成败。** `$OutputEncoding`+`chcp 65001` 对某些管道组合不生效（如 `node x.js | Select-Object`），中文标题全渲染成 `寮哄埃鎺掓煡`。取 ASCII 数字字段就够定论：

```powershell
node tests\x.js 2>&1 | Select-String -Pattern 'checks:|passed:|failed:|suites:'
```

实测中文全糊时，`checks: 31 | passed: 30 | failed: 1` 与 JSON 结构照样可读。**判成败靠计数与退出码，不靠文字**；要定位具体失败项时，另跑一次只看该用例的 ASCII 标识，不要从乱码里猜。

**先验字节**：

```powershell
$tmpOut = [System.IO.Path]::GetTempFileName()
$tmpErr = [System.IO.Path]::GetTempFileName()
Start-Process -FilePath "X:\path\to\cli.bat" -ArgumentList "islogin" `
    -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr -NoNewWindow -Wait
$out = [System.IO.File]::ReadAllBytes($tmpOut)
$err = [System.IO.File]::ReadAllBytes($tmpErr)
Write-Host "OUT hex: $(($out | %{ $_.ToString('X2') }) -join ' ')"
Write-Host "ERR hex: $(($err | %{ $_.ToString('X2') }) -join ' ')"
```

看头几个非 ASCII 字节：`E2 88 9A` = UTF-8 `√`、`E4 B8 AD` = UTF-8 `中`、`D6 D0` = GBK `中`。

**稳的修法**（`Start-Process` 抓 raw bytes，按流分回 console）：

```powershell
$cli = 'X:\path\to\cli.bat'
$so = [System.IO.Path]::GetTempFileName()
$se = [System.IO.Path]::GetTempFileName()
try {
    $p = Start-Process -FilePath $cli -ArgumentList $args `
        -RedirectStandardOutput $so -RedirectStandardError $se `
        -NoNewWindow -Wait -PassThru
    $stdout = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($so))
    $stderr = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($se))
    if ($stdout) { Write-Output $stdout }
    if ($stderr) { [Console]::Error.WriteLine($stderr) }
    exit $p.ExitCode
} finally {
    Remove-Item $so, $se -ErrorAction SilentlyContinue
}
```

**踩过的坑**：

- **`.ps1` 含中文路径/字符串字面量必须 UTF-8 with BOM**——PowerShell 不认无 BOM 的 UTF-8 .ps1，会按 ANSI/GBK 解读，字面量整段被坏（写 wrapper 时第一版 `wechat-cli.ps1` 就因此报 `WeChat CLI not found at: ...\寰俊...`）。修法：`[System.IO.File]::WriteAllText('file.ps1', $content, (New-Object System.Text.UTF8Encoding $true))`
- `Start-Process -RedirectStandardOutput X -RedirectStandardError X` 同文件会失败
- `& cli.bat 2>&1 | Out-String` 永远救不回来——管道里子进程字节已被坏
- `cmd /c "chcp 65001 >nul && cli.bat ..."` 不可靠——Node.js / Electron 启动时锁住输出编码，chcp 来不及
- 早期常见错误修法 `$out → [GBK]::GetBytes(...) → [GBK]::GetString(...)` **是 no-op**，已乱码字符串再编再解不会变好，必须从子进程 raw bytes 读
