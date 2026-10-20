import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoDir = fileURLToPath(new URL('..', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'pixel-fishing-relaunch-test-'));
const appData = join(root, 'appdata');
const dataDir = join(appData, 'dsh-desktop-pet');
const pet = join(root, 'DeepSeek Harness.exe');
const logPath = join(dataDir, 'plugin.log');
mkdirSync(dataDir, { recursive: true });
copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ping.exe'), pet);

const saved = {};
for (const key of ['APPDATA', 'DSH_PROFILE']) saved[key] = process.env[key];
process.env.APPDATA = appData;
process.env.DSH_PROFILE = 'desktop';
delete process.env.DSH_PIXEL_FISHING_PET;
delete process.env.ELECTRON_RUN_AS_NODE;

const disposers = [];
const makeCtx = () => ({
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') disposers.push(dispose);
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const launches = () => existsSync(logPath)
  ? (readFileSync(logPath, 'utf8').match(/拉起宠物/g) ?? []).length
  : 0;

try {
  const mod = await import(pathToFileURL(join(repoDir, 'index.js')).href + `?t=${Date.now()}`);
  mod.apply(makeCtx(), { petPath: pet });
  await sleep(1300);
  if (launches() !== 1) throw new Error(`首次应用应拉起一次，实际 ${launches()}`);

  for (const dispose of disposers.splice(0)) dispose();
  mod.apply(makeCtx(), { petPath: pet });
  await sleep(1300);
  if (launches() !== 2) throw new Error(`停用后重新应用应再次拉起，实际 ${launches()}`);

  console.log('ok: 停用后重新应用插件会再次拉起宠物');
  rmSync(root, { recursive: true, force: true });
} catch (error) {
  console.error(error.message);
  console.error(`测试目录保留：${root}`);
  process.exitCode = 1;
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
