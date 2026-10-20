param(
  [string]$DshDir = '',
  [string]$InstallDir = '',
  [switch]$AutoStart,
  [switch]$CopyApp
)
$ErrorActionPreference = 'Stop'

$exeName = 'DeepSeek Harness.exe'

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

function Resolve-DshDir {
  $candidates = @()
  if ($DshDir) { $candidates += $DshDir }
  $candidates += @(
    'D:\deepseek',
    (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
    (Join-Path $env:ProgramFiles 'DeepSeek Harness')
  )
  if (${env:ProgramFiles(x86)}) {
    $candidates += (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness')
  }
  foreach ($dir in $candidates) {
    if ($dir -and (Test-Path (Join-Path $dir $exeName))) { return (Resolve-Path $dir).Path }
  }
  throw '找不到 DeepSeek Harness，请用 -DshDir 指定安装目录。'
}

$DshDir = Resolve-DshDir

$appDir = Join-Path $PSScriptRoot 'app'
if (!(Test-Path (Join-Path $appDir 'main.js'))) {
  throw "找不到应用代码：$appDir"
}

function Resolve-InstallDir {
  if ($InstallDir) { return $InstallDir }
  $legacy = 'D:\deepseek-pet'
  if (Test-Path (Join-Path $legacy $exeName)) { return $legacy }
  return (Join-Path $env:LOCALAPPDATA 'Programs\dsh-plugin-pixel-fishing')
}

$InstallDir = (Resolve-InstallDir).TrimEnd('\')
$repoFull = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$installFull = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
if ($installFull -match '^[A-Za-z]:$') {
  throw '安装目录不能是盘符根目录。'
}
if ($installFull -ieq $repoFull -or $repoFull.StartsWith($installFull + '\')) {
  throw '安装目录不能是仓库目录或它的上级目录。'
}

Write-Host "安装到 $InstallDir ..."

# 关掉正在运行的宠物实例，避免 exe 被占用
Get-CimInstance Win32_Process -Filter "Name='$exeName'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($InstallDir) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 600

if (Test-Path $InstallDir) {
  Remove-InstallTree -Root $InstallDir
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'resources') | Out-Null

function Install-RuntimeFile {
  param([string]$Source, [string]$Destination)
  try {
    New-Item -ItemType HardLink -Path $Destination -Target $Source -Force | Out-Null
  } catch {
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
  }
}

# 复用 DSH 的 Electron 运行时：能硬链接就硬链接，跨盘时退回复制
$runtimeFiles = @(
  $exeName,
  'ffmpeg.dll', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll',
  'vulkan-1.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json',
  'resources.pak', 'chrome_100_percent.pak', 'chrome_200_percent.pak',
  'icudtl.dat', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'version'
)
foreach ($name in $runtimeFiles) {
  $src = Join-Path $DshDir $name
  if (Test-Path $src) {
    Install-RuntimeFile -Source $src -Destination (Join-Path $InstallDir $name)
  }
}

New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'locales') | Out-Null
foreach ($name in @('en-US.pak', 'zh-CN.pak', 'zh-TW.pak')) {
  $src = Join-Path $DshDir "locales\$name"
  if (Test-Path $src) {
    Install-RuntimeFile -Source $src -Destination (Join-Path $InstallDir "locales\$name")
  }
}

# 开发模式默认用目录联接，改 app/ 立即生效；-CopyApp 则复制一份独立副本
$appTarget = Join-Path $InstallDir 'resources\app'
if ($CopyApp) {
  Copy-Item -LiteralPath $appDir -Destination $appTarget -Recurse -Force
} else {
  try {
    New-Item -ItemType Junction -Path $appTarget -Target $appDir | Out-Null
  } catch {
    Copy-Item -LiteralPath $appDir -Destination $appTarget -Recurse -Force
  }
}

# 桌面快捷方式
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop '像素渔场.lnk'
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $InstallDir $exeName
$lnk.Arguments = '--pet'
$lnk.WorkingDirectory = $InstallDir
$lnk.IconLocation = Join-Path $InstallDir 'resources\app\renderer\icon.ico'
$lnk.Description = '像素渔场 · 桌面钓鱼宠物'
$lnk.Save()
Write-Host "桌面快捷方式：$lnkPath"

# 协议登记（dsh-pet://open），应用启动时也会自己登记
$proto = 'HKCU:\Software\Classes\dsh-pet'
New-Item -Path $proto -Force | Out-Null
Set-ItemProperty -Path $proto -Name '(default)' -Value 'URL:像素渔场'
New-Item -Path "$proto\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$proto\shell\open\command" -Name '(default)' -Value ('"' + (Join-Path $InstallDir $exeName) + '" "%1"')

if ($AutoStart) {
  $startup = [Environment]::GetFolderPath('Startup')
  $auto = $shell.CreateShortcut((Join-Path $startup '像素渔场.lnk'))
  $auto.TargetPath = Join-Path $InstallDir $exeName
  $auto.Arguments = '--pet'
  $auto.WorkingDirectory = $InstallDir
  $auto.IconLocation = Join-Path $InstallDir 'resources\app\renderer\icon.ico'
  $auto.Description = '像素渔场 · 开机自动出现'
  $auto.Save()
  Write-Host "已设置开机自启：$(Join-Path $startup '像素渔场.lnk')"
}

# 给启动器插件留一张安装位置名片，插件启动时会先读它
$dataDir = Join-Path $env:APPDATA 'dsh-desktop-pet'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$marker = [ordered]@{
  installDir = $InstallDir
  petPath = (Join-Path $InstallDir $exeName)
  repoDir = $PSScriptRoot
  updatedAt = (Get-Date).ToString('o')
}
$marker | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir 'install.json') -Encoding UTF8
Write-Host "安装位置记录：$(Join-Path $dataDir 'install.json')"

Write-Host ''
Write-Host '完成。'
Write-Host "启动：& `"$(Join-Path $InstallDir $exeName)`" --pet"
Write-Host '（如果 Windows 提示文件来源，选“仍要运行”即可）'
Write-Host ''
Write-Host "在 DSH 插件页添加本目录即可自动启动；如果之前装过 idle-fishing 启动器，请先移除它。"
