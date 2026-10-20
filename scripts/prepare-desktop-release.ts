import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuildCommand } from './build-version';

export const RELEASE_REPOSITORY = 'ngankt2/kiwi-password-manager';
export const releaseTag = (version: string) => `v${version}`;
export const releaseAssets = (version: string) => {
  const archive = `KiwiPassword_${version}_universal.app.tar.gz`;
  return { archive, signature: archive + '.sig', installer: `KiwiPassword_${version}_universal.dmg`, manifest: 'latest.json', notes: 'release-notes.md' };
};

export async function prepareDesktopRelease(root: string, directory: string, bundle: string, version: string, notes: string) {
  if (process.platform !== 'darwin') throw new Error('Desktop releases are packaged on macOS.');
  const assets = releaseAssets(version);
  const source = join(bundle, 'macos/Kiwi Password.app.tar.gz');
  const signature = (await readFile(source + '.sig', 'utf8')).trim();
  // Tauri v2 binds its signed archive to the announced version.
  const decoded = Buffer.from(signature, 'base64').toString('utf8');
  if (!decoded.includes(`version:${version}`)) throw new Error('The updater signature must be bound to this build version.');
  await copyFile(source, join(directory, assets.archive));
  await copyFile(source + '.sig', join(directory, assets.signature));
  await copyFile(join(root, 'desktop/tauri/updater.pub'), join(directory, 'updater.pub'));
  await createInstaller(join(directory, 'Kiwi Password.app'), join(directory, assets.installer));
  const url = `https://github.com/${RELEASE_REPOSITORY}/releases/download/${releaseTag(version)}/${assets.archive}`;
  // One universal archive serves both Apple Silicon and Intel installations.
  const manifest = {
    version, notes, pub_date: new Date().toISOString(),
    platforms: { 'darwin-aarch64': { url, signature }, 'darwin-x86_64': { url, signature } },
  };
  await writeFile(join(directory, assets.manifest), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(directory, assets.notes), notes.trimEnd() + '\n');
}

// A plain drag-to-Applications image; avoids Finder scripting so it also builds headless.
async function createInstaller(application: string, output: string) {
  const stage = await mkdtemp(join(tmpdir(), 'kiwi-dmg-'));
  try {
    runBuildCommand(stage, 'ditto', [application, join(stage, 'Kiwi Password.app')]);
    await symlink('/Applications', join(stage, 'Applications'));
    runBuildCommand(stage, 'hdiutil', ['create', '-volname', 'Kiwi Password', '-srcfolder', stage, '-fs', 'HFS+', '-format', 'UDZO', '-ov', output]);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
