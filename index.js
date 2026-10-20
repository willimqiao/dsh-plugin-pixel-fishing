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
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'pixel-fishing';

const EXE = 'DeepSeek Harness.exe';
const PKG_DIR = dirname(fileURLToPath(import.meta.url));

/** One attempt per module instance: an HMR reload retries, a duplicate apply does not. */
let launched = false;
let installing = false;
let warned = false;

function markerPaths() {
  if (!process.env.APPDATA) return [];
  const marker = join(process.env.APPDATA, 'dsh-desktop-pet', 'install.json');
  try {
    const raw = readFileSync(marker, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    const list = [];
    if (data.petPath) list.push(data.petPath);
    if (data.installDir) list.push(join(data.installDir, EXE));
    return list;
  } catch {
    return [];
  }
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

export function apply(ctx, config = {}) {
  if (config.autoStart === false) return;
  if (!isDesktopHost()) return;

  const petPath = resolvePetPath(config);
  if (petPath) {
    if (launched) return;
    launched = true;

    ctx.effect(() => {
      const timer = setTimeout(() => launch(petPath), 900);
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
      if (disposed) return;
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
