import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuildCommand } from './build-version';
import { assertGatekeeper, notarize, signCode } from './macos-signing';

export const RELEASE_REPOSITORY = 'ngankt2/kiwi-password-manager';
export const DESKTOP_ARCHITECTURES = ['aarch64', 'x86_64'] as const;
export type DesktopArchitecture = typeof DESKTOP_ARCHITECTURES[number];
/** Names users see on the download page. */
const INSTALLER_LABEL: Record<DesktopArchitecture, string> = { aarch64: 'apple-silicon', x86_64: 'intel' };

export const releaseTag = (version: string) => `v${version}`;
export const releaseAssets = (version: string) => ({
  manifest: 'latest.json',
  notes: 'release-notes.md',
  builds: DESKTOP_ARCHITECTURES.map((architecture) => {
    const archive = `KiwiPassword_${version}_${architecture}.app.tar.gz`;
    return { architecture, platform: `darwin-${architecture}`, archive, signature: archive + '.sig', installer: `KiwiPassword_${version}_${INSTALLER_LABEL[architecture]}.dmg` };
  }),
});
export const releaseUrl = (version: string, file: string) => `https://github.com/${RELEASE_REPOSITORY}/releases/download/${releaseTag(version)}/${file}`;

/**
 * Packages the signed, notarized and stapled app of each architecture (in `<directory>/<arch>/`):
 * its updater archive and Minisign signature, a notarized DMG, and one update manifest.
 */
export async function prepareDesktopRelease(root: string, directory: string, version: string, notes: string, identity: string, environment: NodeJS.ProcessEnv) {
  if (process.platform !== 'darwin') throw new Error('Desktop releases are packaged on macOS.');
  const assets = releaseAssets(version);
  const platforms: Record<string, { url: string; signature: string }> = {};
  for (const build of assets.builds) {
    const application = join(directory, build.architecture, 'Kiwi Password.app');
    // The updater drops the first path component, so the archive must hold only the bundle:
    // no AppleDouble `._*` siblings or extended-attribute metadata.
    runBuildCommand(join(directory, build.architecture), 'tar', ['--no-mac-metadata', '-czf', join(directory, build.archive), 'Kiwi Password.app'], { ...environment, COPYFILE_DISABLE: '1' });
    await signUpdate(root, join(directory, build.archive), version, environment);
    const signature = (await readFile(join(directory, build.signature), 'utf8')).trim();
    // Tauri v2 binds its signed archive to the announced version.
    if (!Buffer.from(signature, 'base64').toString('utf8').includes(`version:${version}`)) throw new Error('The updater signature must be bound to this build version.');
    platforms[build.platform] = { url: releaseUrl(version, build.archive), signature };
    const installer = join(directory, build.installer);
    await createInstaller(application, installer);
    signCode(identity, installer);
    await notarize(installer);
    assertGatekeeper(installer, 'open');
  }
  await copyFile(join(root, 'desktop/tauri/updater.pub'), join(directory, 'updater.pub'));
  const manifest = { version, notes, pub_date: new Date().toISOString(), platforms };
  await writeFile(join(directory, assets.manifest), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(directory, assets.notes), notes.trimEnd() + '\n');
}

async function signUpdate(root: string, archive: string, version: string, environment: NodeJS.ProcessEnv) {
  const key = environment.TAURI_SIGNING_PRIVATE_KEY ?? '';
  const signer: NodeJS.ProcessEnv = { ...environment, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '' };
  // The signer takes either key contents or a key path; the build passes a path by default.
  if (existsSync(key)) { delete signer.TAURI_SIGNING_PRIVATE_KEY; signer.TAURI_SIGNING_PRIVATE_KEY_PATH = key; }
  runBuildCommand(root, 'bunx', ['tauri', 'signer', 'sign', '--app-version', version, archive], signer);
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
