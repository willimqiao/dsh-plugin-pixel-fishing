param(
  [string]$InstallDir = '',
  [switch]$Purge,
  [string]$WaitForPath = '',
  [string]$ProfilePackageJson = '',
  [string]$PackageName = '',
  [int]$TimeoutSeconds = 60,
  [int]$RetryCount = 20,
  [int]$RetryDelayMs = 500
)
$ErrorActionPreference = 'Continue'

$exeName = 'DeepSeek Harness.exe'
$dataDir = Join-Path $env:APPDATA 'dsh-desktop-pet'
$markerPath = Join-Path $dataDir 'install.json'
$logPath = Join-Path $dataDir 'uninstall.log'

function Write-Log {
  param([string]$Message)
  try {
    if (-not (Test-Path -LiteralPath $dataDir)) {
      New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    }
    Add-Content -LiteralPath $logPath -Value ('{0} {1}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Message) -Encoding UTF8
  } catch {
    # 记录日志失败不能影响卸载
  }
  Write-Host $Message
}

# 组合包仍在 profile 清单里，说明只是停用/重载，不能当成卸载
function Test-PluginGone {
  if (-not $ProfilePackageJson -or -not $PackageName) { return $true }
  if (-not (Test-Path -LiteralPath $ProfilePackageJson)) { return $true }
  try {
    $manifest = Get-Content -LiteralPath $ProfilePackageJson -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.dependencies -and ($manifest.dependencies.PSObject.Properties.Name -contains $PackageName)) {
      return $false
    }
    if ($manifest.dsh.profile.bundles -contains $PackageName) { return $false }
    return $true
  } catch {
    return $false
  }
}

# 只认真正的宠物目录：exe 和 app/package.json 都在，且包名对得上
function Test-PetInstall {
  param([string]$Dir)
  if (-not $Dir) { return $false }
  if (-not (Test-Path -LiteralPath (Join-Path $Dir $exeName))) { return $false }
  $pkg = Join-Path $Dir 'resources\app\package.json'
  if (-not (Test-Path -LiteralPath $pkg)) { return $false }
  try {
    $manifest = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json
    return ($manifest.name -eq 'dsh-desktop-pet')
  } catch {
    return $false
  }
}

# 逐层删除，遇到目录联接/符号链接只删链接本身，绝不顺着链接删到源码目录
function Remove-InstallTree {
  param([string]$Root)
  $failed = $false
  foreach ($entry in @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue)) {
    try {
      if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        $entry.Delete()
      } elseif ($entry.PSIsContainer) {
        if (-not (Remove-InstallTree -Root $entry.FullName)) { $failed = $true }
      } else {
        Remove-Item -LiteralPath $entry.FullName -Force -ErrorAction Stop
      }
    } catch {
      $failed = $true
      Write-Log ("删除失败：" + $entry.FullName + "：" + $_.Exception.Message)
    }
  }
  try {
    Remove-Item -LiteralPath $Root -Force -ErrorAction Stop
  } catch {
    $failed = $true
    Write-Log ("删除目录失败：" + $Root + "：" + $_.Exception.Message)
  }
  return (-not $failed)
}

# 路径和命令行都按大小写不敏感比较；只动这个安装目录里的 DeepSeek Harness.exe
function Get-PetProcesses {
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    if ($_.Name -ne $exeName) { return $false }
    $exe = [string]$_.ExecutablePath
    $cmd = [string]$_.CommandLine
    if ($exe -and $exe.StartsWith($installFull + '\', [StringComparison]::OrdinalIgnoreCase)) { return $true }
    if ($cmd -and $cmd.IndexOf($installFull, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
    return $false
  })
}

function Stop-PetProcesses {
  for ($i = 0; $i -lt $RetryCount; $i++) {
    $procs = @(Get-PetProcesses)
    if ($procs.Count -eq 0) { return $true }
    foreach ($proc in $procs) {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      } catch {
        $taskkill = Join-Path $env:SystemRoot 'System32\taskkill.exe'
        try { & $taskkill /PID $proc.ProcessId /T /F 2>$null | Out-Null } catch {}
      }
    }
    Start-Sleep -Milliseconds $RetryDelayMs
  }
  return (@(Get-PetProcesses).Count -eq 0)
}

function Remove-PetShortcuts {
  try {
    $shell = New-Object -ComObject WScript.Shell
    foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))) {
      foreach ($lnk in @(Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -ErrorAction SilentlyContinue)) {
        try {
          $target = $shell.CreateShortcut($lnk.FullName).TargetPath
          if (-not $target) { continue }
          $targetFull = [IO.Path]::GetFullPath($target)
          if (($targetFull -ieq $installFull) -or
              $targetFull.StartsWith($installFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $lnk.FullName -Force -ErrorAction Stop
            Write-Log ("已删除快捷方式：" + $lnk.FullName)
          }
        } catch {
          # 读不出目标的快捷方式保持原样
        }
      }
    }
  } catch {
    Write-Log '检查快捷方式失败，跳过。'
  }
}

Write-Log '开始卸载检查。'

# DSH 先摘插件、再 pnpm remove；等包目录和清单都安静下来才真正动手。
# 只停用或只是重载时包目录还在，等到超时就放弃。
if ($WaitForPath) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $absentSince = $null
  while ((Get-Date) -lt $deadline) {
    $stillInstalled = (Test-Path -LiteralPath $WaitForPath) -or -not (Test-PluginGone)
    if ($stillInstalled) {
      $absentSince = $null
    } elseif ($null -eq $absentSince) {
      $absentSince = Get-Date
    } elseif (((Get-Date) - $absentSince).TotalSeconds -ge 5) {
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if ((Test-Path -LiteralPath $WaitForPath) -or -not (Test-PluginGone)) {
    Write-Log '插件仍在安装，跳过自动卸载。'
    exit 0
  }
}

if (-not $InstallDir -and (Test-Path -LiteralPath $markerPath)) {
  try {
    $marked = (Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json).installDir
    if ($marked) { $InstallDir = $marked }
  } catch {
    Write-Log '安装位置记录损坏，按默认位置查找。'
  }
}
if (-not $InstallDir) {
  $default = Join-Path $env:LOCALAPPDATA 'Programs\dsh-plugin-pixel-fishing'
  $legacy = 'D:\deepseek-pet'
  if (Test-PetInstall $default) {
    $InstallDir = $default
  } elseif (Test-PetInstall $legacy) {
    $InstallDir = $legacy
  }
}
if (-not $InstallDir) {
  Write-Log '没有找到已安装的桌面宠物，跳过。'
  if (Test-Path -LiteralPath $markerPath) {
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
  }
  exit 0
}

$InstallDir = $InstallDir.TrimEnd('\')
$repoFull = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$installFull = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$existed = Test-Path -LiteralPath $InstallDir
$safeToDelete = $true
if ($installFull -match '^[A-Za-z]:$' -or $installFull -ieq $repoFull -or $repoFull.StartsWith($installFull + '\')) {
  Write-Log "安装目录看起来不安全，跳过删除：$InstallDir"
  $safeToDelete = $false
} elseif ($existed -and -not (Test-PetInstall $InstallDir)) {
  Write-Log "目录里找不到像素渔场，跳过删除：$InstallDir"
  $safeToDelete = $false
}

if ($safeToDelete -and $existed) {
  $running = @(Get-PetProcesses)
  if ($running.Count -gt 0) {
    Write-Log ('停止宠物进程：' + (($running | ForEach-Object { $_.ProcessId }) -join ', '))
    if (Stop-PetProcesses) {
      Write-Log '宠物进程已结束。'
    } else {
      Write-Log '仍有宠物进程无法结束，稍后重试删除。'
    }
  }

  for ($i = 0; $i -lt $RetryCount; $i++) {
    if (@(Get-PetProcesses).Count -gt 0) { Stop-PetProcesses | Out-Null }
    Remove-InstallTree -Root $InstallDir | Out-Null
    if (-not (Test-Path -LiteralPath $InstallDir)) { break }
    Start-Sleep -Milliseconds $RetryDelayMs
  }
}

$deleted = -not (Test-Path -LiteralPath $InstallDir)
if ($deleted) {
  if ($existed) { Write-Log "已删除宠物安装目录：$InstallDir" }
  Remove-PetShortcuts

  # 协议登记也只在指向这个安装时移除
  $proto = 'HKCU:\Software\Classes\dsh-pet'
  if (Test-Path $proto) {
    $registered = $null
    try {
      $registered = (Get-ItemProperty -Path "$proto\shell\open\command" -ErrorAction Stop).'(default)'
    } catch {
      # 没有 command 子键就保持原样
    }
    if ($registered -and $registered.IndexOf($installFull, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      Remove-Item $proto -Recurse -Force -ErrorAction SilentlyContinue
      Write-Log '已移除 dsh-pet:// 协议'
    }
  }

  if (-not $Purge -and (Test-Path -LiteralPath $markerPath)) {
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
    Write-Log '已删除安装位置记录（存档保留）。'
  }
} else {
  Write-Log "宠物安装目录未能完全删除：$InstallDir"
  Write-Log '已保留安装位置记录；关闭占用文件的程序后可重新运行本脚本重试。'
}

if ($Purge) {
  if (Test-Path -LiteralPath $dataDir) {
    Write-Log "删除存档：$dataDir"
    Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  exit 0
}

if ($deleted) {
  Write-Log '卸载完成。'
  exit 0
}
exit 1
