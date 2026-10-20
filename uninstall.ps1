param(
  [string]$InstallDir = '',
  [switch]$Purge
)
$ErrorActionPreference = 'Continue'

$exeName = 'DeepSeek Harness.exe'
$markerPath = Join-Path $env:APPDATA 'dsh-desktop-pet\install.json'

# 逐层删除，遇到目录联接/符号链接只删链接本身，绝不顺着链接删到源码目录
function Remove-InstallTree {
  param([string]$Root)
  Get-ChildItem -LiteralPath $Root -Force | ForEach-Object {
    if (($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      $_.Delete()
    } elseif ($_.PSIsContainer) {
      Remove-InstallTree -Root $_.FullName
    } else {
      Remove-Item -LiteralPath $_.FullName -Force
    }
  }
  Remove-Item -LiteralPath $Root -Force
}

if (-not $InstallDir -and (Test-Path $markerPath)) {
  try {
    $marked = (Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json).installDir
    if ($marked) { $InstallDir = $marked }
  } catch {
    # 旧的或损坏的记录直接忽略
  }
}
if (-not $InstallDir) {
  $legacy = 'D:\deepseek-pet'
  if (Test-Path (Join-Path $legacy $exeName)) {
    $InstallDir = $legacy
  } else {
    $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\dsh-plugin-pixel-fishing'
  }
}

$InstallDir = $InstallDir.TrimEnd('\')
$repoFull = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$installFull = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$safeToDelete = $true
if ($installFull -match '^[A-Za-z]:$' -or $installFull -ieq $repoFull -or $repoFull.StartsWith($installFull + '\')) {
  Write-Host "安装目录看起来不安全，跳过删除：$InstallDir"
  $safeToDelete = $false
} elseif ((Test-Path $InstallDir) -and -not (Test-Path (Join-Path $InstallDir $exeName))) {
  Write-Host "安装目录里找不到 $exeName，跳过删除：$InstallDir"
  $safeToDelete = $false
}

Get-CimInstance Win32_Process -Filter "Name='$exeName'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($InstallDir) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 600

if ($safeToDelete -and (Test-Path $InstallDir)) {
  Remove-InstallTree -Root $InstallDir
  Write-Host "已删除 $InstallDir"
}

foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Startup'))) {
  $lnk = Join-Path $dir '像素渔场.lnk'
  if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host "已删除快捷方式 $lnk"
  }
}

if (Test-Path 'HKCU:\Software\Classes\dsh-pet') {
  Remove-Item 'HKCU:\Software\Classes\dsh-pet' -Recurse -Force
  Write-Host '已移除 dsh-pet:// 协议'
}

if ($Purge) {
  $data = Join-Path $env:APPDATA 'dsh-desktop-pet'
  if (Test-Path $data) {
    Remove-Item $data -Recurse -Force
    Write-Host "已删除存档 $data"
  }
} elseif (Test-Path $markerPath) {
  Remove-Item -LiteralPath $markerPath -Force
  Write-Host '已删除安装位置记录（存档保留）'
}

Write-Host '卸载完成。'
