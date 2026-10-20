import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoDir = fileURLToPath(new URL('..', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'pixel-fishing-cleanup-test-'));
const tempRoot = join(root, 'tmp');
const profileDir = join(root, 'profile');
const pkgDir = join(profileDir, 'node_modules', 'dsh-plugin-pixel-fishing');
const appData = join(root, 'appdata');
const installDir = join(root, 'install');
const saveDir = join(appData, 'dsh-desktop-pet');
const marker = join(saveDir, 'install.json');

mkdirSync(tempRoot, { recursive: true });
mkdirSync(pkgDir, { recursive: true });
mkdirSync(saveDir, { recursive: true });
mkdirSync(installDir, { recursive: true });
cpSync(join(repoDir, 'index.js'), join(pkgDir, 'index.js'));
cpSync(join(repoDir, 'package.json'), join(pkgDir, 'package.json'));
cpSync(join(repoDir, 'uninstall.ps1'), join(pkgDir, 'uninstall.ps1'));
writeFileSync(join(installDir, 'DeepSeek Harness.exe'), '');
writeFileSync(join(installDir, 'dummy.bin'), 'x');
mkdirSync(join(installDir, 'resources', 'app'), { recursive: true });
writeFileSync(join(installDir, 'resources', 'app', 'package.json'), JSON.stringify({ name: 'dsh-desktop-pet', description: '像素渔场桌面宠物：透明置顶的小窗口' }));
writeFileSync(marker, JSON.stringify({ installDir, petPath: join(installDir, 'DeepSeek Harness.exe'), repoDir: pkgDir }));
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { 'dsh-plugin-pixel-fishing': 'github:willimqiao/dsh-plugin-pixel-fishing' }, dsh: { profile: { bundles: [] } } }, null, 2));

const saved = {};
for (const [key, value] of Object.entries({ APPDATA: appData, TEMP: tempRoot, TMP: tempRoot, DSH_PROFILE: 'desktop', LOCALAPPDATA: join(root, 'localappdata') })) {
  saved[key] = process.env[key];
  process.env[key] = value;
}
delete process.env.DSH_PIXEL_FISHING_PET;

const cleanups = [];
const ctx = {
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') cleanups.push(dispose);
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(200);
  }
  throw new Error(`等待超时：${label}`);
}

function copiedCleanupScript() {
  for (const name of readdirSync(tempRoot)) {
    const file = join(tempRoot, name, 'uninstall.ps1');
    if (existsSync(file) && readFileSync(file, 'utf8').includes('WaitForPath')) return file;
  }
  return null;
}

try {
  const mod = await import(pathToFileURL(join(pkgDir, 'index.js')).href + `?t=${Date.now()}`);
  mod.apply(ctx, { autoStart: false });
  if (cleanups.length === 0) throw new Error('没有注册 dispose 清理钩子');

  for (const dispose of cleanups) dispose();
  await waitFor(() => copiedCleanupScript() !== null, 5000, '拷贝卸载脚本');

  // 模拟 pnpm remove：插件目录消失，依赖也从清单里删掉
  rmSync(pkgDir, { recursive: true, force: true });
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }, null, 2));

  await waitFor(() => !existsSync(installDir), 30000, '删除临时安装目录');
  await waitFor(() => !existsSync(marker), 5000, '删除安装位置记录');
  if (!existsSync(saveDir)) throw new Error('存档目录不应在普通卸载时被删除');

  // 停用插件 / 更新中途：包目录还在或清单仍声明依赖时，绝不能删宠物
  const script = copiedCleanupScript();
  const profile2 = join(root, 'profile2');
  const pkg2 = join(profile2, 'node_modules', 'dsh-plugin-pixel-fishing');
  const install2 = join(root, 'install2');
  const manifest2 = join(profile2, 'package.json');
  mkdirSync(pkg2, { recursive: true });
  mkdirSync(install2, { recursive: true });
  writeFileSync(join(install2, 'DeepSeek Harness.exe'), '');
  mkdirSync(join(install2, 'resources', 'app'), { recursive: true });
  writeFileSync(join(install2, 'resources', 'app', 'package.json'), JSON.stringify({ name: 'dsh-desktop-pet', description: '像素渔场桌面宠物' }));
  writeFileSync(manifest2, JSON.stringify({ dependencies: { 'dsh-plugin-pixel-fishing': 'github:willimqiao/dsh-plugin-pixel-fishing' }, dsh: { profile: { bundles: [] } } }));

  const keepalive = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-InstallDir', install2,
    '-WaitForPath', pkg2,
    '-ProfilePackageJson', manifest2,
    '-PackageName', 'dsh-plugin-pixel-fishing',
    '-TimeoutSeconds', '3',
  ], { env: { ...process.env, APPDATA: appData }, encoding: 'utf8' });
  if (keepalive.status !== 0) throw new Error(`等待脚本异常退出：${keepalive.stderr}`);
  if (!existsSync(install2)) throw new Error('插件还在清单里时不应删除安装目录');

  rmSync(pkg2, { recursive: true, force: true });
  const updating = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-InstallDir', install2,
    '-WaitForPath', pkg2,
    '-ProfilePackageJson', manifest2,
    '-PackageName', 'dsh-plugin-pixel-fishing',
    '-TimeoutSeconds', '3',
  ], { env: { ...process.env, APPDATA: appData }, encoding: 'utf8' });
  if (updating.status !== 0) throw new Error(`等待脚本异常退出：${updating.stderr}`);
  if (!existsSync(install2)) throw new Error('包目录暂时消失但依赖还在时不应删除安装目录');

  console.log('ok: DSH 卸载后宠物安装目录被清理，存档保留；停用/更新中途不会误删');
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
