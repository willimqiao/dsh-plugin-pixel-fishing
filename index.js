/**
 * Host half of the pixel-fishing bundle.
 *
 * The game itself is the standalone Electron pet in ./app. This plugin only
 * makes sure the pet is running while the Desktop Harness runs: it spawns the
 * app once per Host lifetime, and the app's single-instance lock turns later
 * launches into "bring the existing window to front".
 *
 * Config (profile cordis.patch.yml):
 *   autoStart: false            disable the automatic launch
 *   autoInstall: false          do not install the pet when it is missing
 *   petPath: 'D:\...\exe'       override the installed location
 */
import { spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'pixel-fishing';

const EXE = 'DeepSeek Harness.exe';
const BUNDLE = 'dsh-plugin-pixel-fishing';
const PET_APP = 'dsh-desktop-pet';
const PKG_DIR = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = () => join(process.env.APPDATA || '', PET_APP);

/** One attempt per module instance: an HMR reload retries, a duplicate apply does not. */
let launched = false;
let installing = false;
let warned = false;
let cleanupScheduled = false;
let disposing = false;

function readMarker() {
  if (!process.env.APPDATA) return null;
  const marker = join(process.env.APPDATA, 'dsh-desktop-pet', 'install.json');
  try {
    const raw = readFileSync(marker, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function markerPaths() {
  const data = readMarker();
  if (!data) return [];
  const list = [];
  if (data.petPath) list.push(data.petPath);
  if (data.installDir) list.push(join(data.installDir, EXE));
  return list;
}

function petCandidates(config) {
  const list = [];
  if (config.petPath) list.push(config.petPath);
  if (process.env.DSH_PIXEL_FISHING_PET) list.push(process.env.DSH_PIXEL_FISHING_PET);
  list.push(...markerPaths());
  list.push(join('D:\\deepseek-pet', EXE));
  if (process.env.LOCALAPPDATA) {
    list.push(join(process.env.LOCALAPPDATA, 'Programs', 'dsh-plugin-pixel-fishing', EXE));
    list.push(join(process.env.LOCALAPPDATA, 'dsh-plugin-pixel-fishing', EXE));
  }
  return list;
}

function resolvePetPath(config) {
  return petCandidates(config).find((file) => file && existsSync(file)) || null;
}

/** Launch the pet app detached so it outlives the Harness process. */
function launch(petPath) {
  const env = { ...process.env };
  // The Harness shell exports ELECTRON_RUN_AS_NODE=1; the pet must start as a GUI.
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const child = spawn(petPath, [], { detached: true, stdio: 'ignore', env });
    child.on('error', () => {});
    child.unref();
  } catch {
    /* A missing or moved pet app must not break the Host. */
  }
}

function isDesktopHost() {
  return Boolean(process.versions && process.versions.electron) || process.env.DSH_PROFILE === 'desktop';
}

function warnMissing() {
  if (warned) return;
  warned = true;
  console.warn('[pixel-fishing] 未找到桌面宠物，自动安装也没有成功；请在插件目录运行 install.ps1');
}

/** Copy the pet next to DSH's Electron runtime using the bundled installer. */
function installPet() {
  const script = join(PKG_DIR, 'install.ps1');
  if (!existsSync(script)) return null;

  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-CopyApp'];
  // The plugin normally runs inside the packaged Harness exe; point the installer at it.
  if (basename(process.execPath).toLowerCase() === EXE.toLowerCase()) {
    args.push('-DshDir', dirname(process.execPath));
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    return spawn('powershell.exe', args, { env, stdio: 'ignore', windowsHide: true });
  } catch {
    return null;
  }
}

/** Walk up until the profile manifest: covers hoisted and .pnpm-virtual-store layouts. */
function profileDir() {
  let dir = PKG_DIR;
  for (let i = 0; i < 8; i += 1) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (manifest.dsh?.profile) return dir;
    } catch {
      /* keep walking */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function bundleSelected() {
  const profile = profileDir();
  if (!profile) return true;
  try {
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'));
    return (manifest.dsh?.profile?.bundles ?? []).includes(BUNDLE);
  } catch {
    return true;
  }
}

function looksLikePet(dir) {
  if (!dir) return false;
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'resources', 'app', 'package.json'), 'utf8'));
    return manifest.name === PET_APP && existsSync(join(dir, EXE));
  } catch {
    return false;
  }
}

/**
 * The marker names the install. If it went missing, fall back to the default
 * location, but only when it really contains our app.
 */
function managedInstallDir() {
  const marker = readMarker();
  if (marker?.installDir && existsSync(join(marker.installDir, EXE))) return marker.installDir;
  const fallback = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', BUNDLE)
    : null;
  if (looksLikePet(fallback)) return fallback;
  return marker?.installDir || null;
}

function cleanupLog(message) {
  try {
    mkdirSync(DATA_DIR(), { recursive: true });
    appendFileSync(join(DATA_DIR(), 'uninstall.log'), `${new Date().toISOString()} [plugin] ${message}\r\n`);
  } catch {
    /* Diagnostics must never break unloading. */
  }
}

/**
 * DSH removes a bundle from the running tree before pnpm deletes its package.
 * A normal quit still lists the bundle, so only a real uninstall schedules this.
 * The copied script waits for the package directory to settle, which keeps a
 * disable, an update, or a plain restart from deleting the pet.
 */
function scheduleUninstallCleanup(config) {
  if (cleanupScheduled) return;
  const profile = profileDir();
  if (!profile) return;
  if (bundleSelected()) return;
  // An explicit path belongs to the user; uninstalling the plugin must not delete it.
  if (config.petPath || process.env.DSH_PIXEL_FISHING_PET) return;
  const installDir = managedInstallDir();
  if (!installDir) {
    cleanupLog('检测到卸载，但找不到宠物安装位置，跳过清理。');
    return;
  }
  const source = join(PKG_DIR, 'uninstall.ps1');
  if (!existsSync(source)) return;

  cleanupScheduled = true;
  try {
    const dir = join(tmpdir(), `dsh-pixel-fishing-cleanup-${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const script = join(dir, 'uninstall.ps1');
    copyFileSync(source, script);

    // A detached powershell.exe gets no console and exits before running the
    // script; wscript is a GUI host, so this launcher survives the Harness.
    const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const vbs = [
      'Set sh = CreateObject("WScript.Shell")',
      'q = Chr(34)',
      `cmd = q & ${vbsString(powershell)} & q & " -NoProfile -ExecutionPolicy Bypass -File " & q & ${vbsString(script)} & q & " -InstallDir " & q & ${vbsString(installDir)} & q & " -WaitForPath " & q & ${vbsString(PKG_DIR)} & q & " -ProfilePackageJson " & q & ${vbsString(join(profile, 'package.json'))} & q & " -PackageName " & q & ${vbsString(BUNDLE)} & q`,
      'sh.Run cmd, 0, False',
      '',
    ].join('\r\n');
    const launcher = join(dir, 'run.vbs');
    writeFileSync(launcher, '\uFEFF' + vbs, 'utf16le');

    cleanupLog(`检测到 DSH 卸载，安排清理：${installDir}`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const wscript = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
    const child = spawn(existsSync(wscript) ? wscript : 'wscript.exe', [launcher], {
      env, stdio: 'ignore', windowsHide: true, detached: true,
    });
    child.on('error', (error) => cleanupLog(`清理进程启动失败：${error.message}`));
    child.unref();
  } catch (error) {
    cleanupScheduled = false;
    cleanupLog(`安排清理失败：${error.message}`);
  }
}

function vbsString(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function apply(ctx, config = {}) {
  if (!isDesktopHost()) return;

  ctx.effect(() => () => {
    disposing = true;
    scheduleUninstallCleanup(config);
  });

  if (config.autoStart === false) return;

  const petPath = resolvePetPath(config);
  if (petPath) {
    if (launched) return;
    launched = true;

    ctx.effect(() => {
      const timer = setTimeout(() => {
        if (!disposing) launch(petPath);
      }, 900);
      return () => clearTimeout(timer);
    });
    return;
  }

  if (installing) return;
  // An explicit path that no longer exists should be fixed by hand, not shadowed by a fresh install.
  if (config.autoInstall === false || config.petPath || process.env.DSH_PIXEL_FISHING_PET) {
    warnMissing();
    return;
  }

  const child = installPet();
  if (!child) {
    warnMissing();
    return;
  }
  installing = true;
  console.log('[pixel-fishing] 首次运行，正在安装桌面宠物…');

  ctx.effect(() => {
    let disposed = false;
    const done = (ok) => {
      if (disposed || disposing) return;
      installing = false;
      const found = ok ? resolvePetPath(config) : null;
      if (!found) {
        warnMissing();
        return;
      }
      launched = true;
      launch(found);
    };
    child.once('error', () => done(false));
    child.once('exit', (code) => done(code === 0));
    return () => {
      disposed = true;
    };
  });
}
