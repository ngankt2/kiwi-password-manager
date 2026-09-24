import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bumpBuildVersion, withVersionedBuild } from '../scripts/build-version';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'appkiro-build-version-'));
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.2.9', scripts: { test: 'bun test' } }));
    await writeFile(join(root, 'app.json'), JSON.stringify({ expo: { version: '1.2.9', name: 'Appkiro', ios: { buildNumber: '12', bundleIdentifier: 'com.appkiro.vault' }, android: { versionCode: 18 } } }));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const read = async (root: string, file: string) => JSON.parse(await readFile(join(root, file), 'utf8'));

test('every build increments and synchronizes app and platform versions without changing other config', () => fixture(async (root) => {
  expect(await bumpBuildVersion(root)).toBe('1.2.10');
  expect(await bumpBuildVersion(root)).toBe('1.2.11');
  expect(await read(root, 'package.json')).toEqual({ name: 'fixture', version: '1.2.11', scripts: { test: 'bun test' } });
  expect((await read(root, 'app.json')).expo).toEqual({ version: '1.2.11', name: 'Appkiro', ios: { buildNumber: '14', bundleIdentifier: 'com.appkiro.vault' }, android: { versionCode: 20 } });
}));

test('inconsistent versions are rejected before either file changes', () => fixture(async (root) => {
  const config = await read(root, 'app.json'); config.expo.version = '1.0.0';
  await writeFile(join(root, 'app.json'), JSON.stringify(config));
  await expect(bumpBuildVersion(root)).rejects.toThrow('same major.minor.patch');
  expect((await read(root, 'package.json')).version).toBe('1.2.9');
  expect(await read(root, 'app.json')).toEqual(config);
}));

test('desktop builds synchronize the Rust package while preserving dependency versions', () => fixture(async (root) => {
  await mkdir(join(root, 'desktop/tauri'), { recursive: true });
  await writeFile(join(root, 'desktop/tauri/Cargo.toml'), '[package]\nname = "fixture"\nversion = "1.2.9"\n\n[dependencies]\ntauri = "2"\n');
  await writeFile(join(root, 'desktop/tauri/Cargo.lock'), 'version = 4\n\n[[package]]\nname = "appkiro-password-manager-desktop"\nversion = "1.2.9"\ndependencies = ["tauri"]\n\n[[package]]\nname = "tauri"\nversion = "2.11.6"\n');
  expect(await bumpBuildVersion(root)).toBe('1.2.10');
  expect(await readFile(join(root, 'desktop/tauri/Cargo.toml'), 'utf8')).toContain('version = "1.2.10"\n\n[dependencies]\ntauri = "2"');
  expect(await readFile(join(root, 'desktop/tauri/Cargo.lock'), 'utf8')).toContain('name = "appkiro-password-manager-desktop"\nversion = "1.2.10"\ndependencies = ["tauri"]');
  expect(await readFile(join(root, 'desktop/tauri/Cargo.lock'), 'utf8')).toContain('name = "tauri"\nversion = "2.11.6"');
}));

test('build version is set before work and failed builds keep their consumed version', () => fixture(async (root) => {
  await expect(withVersionedBuild(root, async (version) => {
    expect(version).toBe('1.2.10');
    expect((await read(root, 'app.json')).expo.version).toBe(version);
    await expect(withVersionedBuild(root, async () => {})).rejects.toThrow('Another app build');
    throw new Error('export failed');
  })).rejects.toThrow('export failed');
  await withVersionedBuild(root, async (version) => { expect(version).toBe('1.2.11'); });
}));
