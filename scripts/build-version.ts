import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export async function bumpBuildVersion(root: string) {
  const packagePath = join(root, 'package.json');
  const configPath = join(root, 'app.json');
  const desktopManifestPath = join(root, 'desktop/tauri/Cargo.toml');
  const desktopLockPath = join(root, 'desktop/tauri/Cargo.lock');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const parts = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(manifest.version);
  if (!parts || config.expo?.version !== manifest.version) {
    throw new Error('package.json and app.json must have the same major.minor.patch version before building.');
  }
  const patch = Number(parts[3]) + 1;
  const ios = Number(config.expo.ios?.buildNumber ?? '1') + 1;
  const android = Number(config.expo.android?.versionCode ?? 1) + 1;
  if (![patch, ios, android].every((value) => Number.isSafeInteger(value) && value > 0) || android > 2_100_000_000) {
    throw new Error('App version and native build numbers must be valid incrementable integers.');
  }
  const version = `${parts[1]}.${parts[2]}.${patch}`;
  let desktopManifest: string | undefined;
  try { desktopManifest = await readFile(desktopManifestPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (desktopManifest !== undefined && !/^version[ \t]*=[ \t]*"[0-9]+\.[0-9]+\.[0-9]+"[ \t]*$/m.test(desktopManifest)) throw new Error('The desktop manifest must have an incrementable app version.');
  let desktopLock: string | undefined;
  try { desktopLock = await readFile(desktopLockPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const lockedPackage = /(\[\[package\]\]\r?\nname = "appkiro-password-manager-desktop"\r?\nversion = ")[^"]+("\r?\n)/;
  if (desktopLock !== undefined && !lockedPackage.test(desktopLock)) throw new Error('The desktop lockfile must contain the application package.');
  manifest.version = config.expo.version = version;
  config.expo.ios = { ...config.expo.ios, buildNumber: String(ios) };
  config.expo.android = { ...config.expo.android, versionCode: android };
  await writeFile(packagePath, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  if (desktopManifest !== undefined) await writeFile(desktopManifestPath, desktopManifest.replace(/^version[ \t]*=[ \t]*"[0-9]+\.[0-9]+\.[0-9]+"[ \t]*$/m, `version = "${version}"`));
  if (desktopLock !== undefined) await writeFile(desktopLockPath, desktopLock.replace(lockedPackage, (_match, before: string, after: string) => before + version + after));
  return version;
}

// Hold this lock through export and packaging so another build cannot change the
// renderer's version while the current application is being assembled.
export async function withVersionedBuild<T>(root: string, build: (version: string) => Promise<T>): Promise<T> {
  const lock = join(root, '.app-build.lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Another app build is running. If it was interrupted, remove .app-build.lock before rebuilding.');
    }
    throw error;
  }
  try {
    const version = await bumpBuildVersion(root);
    process.stdout.write(`Building Kiro Password Manager ${version}\n`);
    return await build(version);
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export function runBuildCommand(root: string, command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.signal ?? result.status ?? 'unknown exit'}).`);
}
