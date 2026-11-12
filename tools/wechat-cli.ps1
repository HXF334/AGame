# wechat-cli.ps1 — robust WeChat DevTools CLI wrapper for Windows PowerShell
#
# Why this exists: PowerShell's default $OutputEncoding is US-ASCII. When you
# pipe cli.bat output (`cli.bat islogin 2>&1 | Out-String`), PowerShell reads
# the child process's UTF-8 bytes as US-ASCII, mangling every Chinese char and
# every Unicode symbol like `\u221A` (`\u2713`) into mojibake such as `鈭?`.
#
# Verified via byte-level diagnosis (2026-10-17):
#   - cli.bat (this version, 2.02.2608080 + Node.js) writes UTF-8 to BOTH streams
#   - 16-byte stdout for `islogin`: pure ASCII `\n{"login":true}\n`
#   - 102-byte stderr: UTF-8 with `-` (ASCII), `\u221A` (3 bytes 0xE2 0x88 0x9A), etc.
#
# The wrapper below avoids PowerShell's pipeline entirely: it uses
# `Start-Process` to capture stdout/stderr to separate temp files, reads the
# raw bytes as UTF-8, and writes the decoded text to the correct output stream.
#
# Usage (drop-in replacement for cli.bat):
#   .\wechat-cli.ps1 islogin [--port 41957]
#   .\wechat-cli.ps1 open --project "C:\path\to\project" --port 41957
#   .\wechat-cli.ps1 preview --project "..." --qr-format terminal --port 41957
#   .\wechat-cli.ps1 upload --project "..." --port 41957
# All arguments after the script name are forwarded verbatim to cli.bat.
#
# Returns: the exit code of the underlying cli.bat process.

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = 'Continue'

# Hardcoded — the .bat path itself contains CJK characters, so we use
# Start-Process -FilePath (Unicode argv) and never string-concatenate this path.
$cli = 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat'

if (-not (Test-Path -LiteralPath $cli)) {
    Write-Error "WeChat CLI not found at: $cli"
    exit 127
}

# Make the host console render UTF-8 properly (so decoded text displays correctly)
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # Some hosts (older ISE) throw; ignore
}

$stdoutFile = [System.IO.Path]::GetTempFileName()
$stderrFile = [System.IO.Path]::GetTempFileName()

# [2026-11-12] devtools 打开项目时会改写 project.config.json（键序/行尾/末尾换行），
# 污染 git 工作区。这里在 open 前记下哈希，若打开前该文件是干净的、打开后被改写，
# 就自动按 git 版本还原；打开前本来就有改动则不碰，只提示。
$openProject = $null
if ($Arguments.Count -ge 2 -and $Arguments[0] -eq 'open') {
    for ($i = 1; $i -lt $Arguments.Count - 1; $i++) {
        if ($Arguments[$i] -eq '--project') { $openProject = $Arguments[$i + 1]; break }
    }
}
$cfgPath = $null
$cfgHashBefore = $null
$cfgRepo = $null
$cfgRel = $null
$cfgCleanBefore = $false
if ($openProject) {
    $cfgPath = Join-Path $openProject 'project.config.json'
    if (Test-Path -LiteralPath $cfgPath) {
        $cfgHashBefore = (Get-FileHash -LiteralPath $cfgPath -Algorithm SHA256).Hash
        try {
            $cfgRepo = (& git -C $openProject rev-parse --show-toplevel 2>$null)
            if ($cfgRepo) {
                $cfgRepo = $cfgRepo.Trim()
                $cfgRel = [System.IO.Path]::GetRelativePath($cfgRepo, $cfgPath) -replace '\\', '/'
                $dirty = (& git -C $cfgRepo status --porcelain -- $cfgRel 2>$null)
                $cfgCleanBefore = -not ($dirty -and $dirty.Trim().Length -gt 0)
            }
        } catch { }
    }
}

try {
    # Start-Process -FilePath $cli: Windows resolves .bat via cmd.exe automatically.
    # Redirecting to TWO DIFFERENT files avoids the
    # "RedirectStandardOutput and RedirectStandardError cannot point to the same file"
    # pitfall noted in the windows-cn-batch-encoding skill.
    $proc = Start-Process -FilePath $cli -ArgumentList $Arguments `
        -RedirectStandardOutput $stdoutFile `
        -RedirectStandardError $stderrFile `
        -NoNewWindow -Wait -PassThru

    $stdout = ''
    if ((Test-Path -LiteralPath $stdoutFile) -and (Get-Item -LiteralPath $stdoutFile).Length -gt 0) {
        $stdout = [System.IO.File]::ReadAllText($stdoutFile, [System.Text.Encoding]::UTF8)
    }

    $stderr = ''
    if ((Test-Path -LiteralPath $stderrFile) -and (Get-Item -LiteralPath $stderrFile).Length -gt 0) {
        $stderr = [System.IO.File]::ReadAllText($stderrFile, [System.Text.Encoding]::UTF8)
    }

    if ($stdout.Length -gt 0) { Write-Output $stdout }
    if ($stderr.Length -gt 0) { [Console]::Error.WriteLine($stderr) }

    if ($cfgPath -and $cfgHashBefore -and (Test-Path -LiteralPath $cfgPath)) {
        $cfgHashAfter = (Get-FileHash -LiteralPath $cfgPath -Algorithm SHA256).Hash
        if ($cfgHashAfter -ne $cfgHashBefore) {
            if ($cfgCleanBefore -and $cfgRepo -and $cfgRel) {
                & git -C $cfgRepo checkout -- $cfgRel 2>$null
                if ($LASTEXITCODE -eq 0) {
                    [Console]::Error.WriteLine("[wechat-cli] devtools 改写了 $cfgRel，已按 git 版本还原")
                }
            } else {
                [Console]::Error.WriteLine("[wechat-cli] devtools 改写了 $cfgRel（打开前已有未提交改动，未自动还原）")
            }
        }
    }

    exit $proc.ExitCode
}
finally {
    Remove-Item -LiteralPath $stdoutFile, $stderrFile -ErrorAction SilentlyContinue
}
