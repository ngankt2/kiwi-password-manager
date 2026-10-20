import { access, copyFile, cp, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { exportWeb } from './build-web';
import { runBuildCommand, withVersionedBuild } from './build-version';
import { prepareDesktopHost } from './prepare-desktop-host';
import { build } from 'esbuild';
import { DESKTOP_ARCHITECTURES, prepareDesktopRelease, type DesktopArchitecture } from './prepare-desktop-release';
import { publishDesktopRelease } from './publish-desktop-release';
import { assertGatekeeper, developerIdentity, notarize, signCode } from './macos-signing';

const root = resolve(import.meta.dir, '..');
if (process.platform !== 'darwin') throw new Error('This desktop target requires macOS. Mobile builds remain available through Expo/EAS.');
const runtimeTests = process.argv.includes('--runtime-tests');
const prepare = process.argv.includes('--prepare');
const updater = !prepare && !process.argv.includes('--no-updater');
const publish = process.argv.includes('--publish');
const notesIndex = process.argv.indexOf('--notes-file');
if (publish && (!updater || notesIndex < 0)) throw new Error('Publishing requires a signed updater build and --notes-file with the release notes.');
// Read notes before the version bump so a bad path fails without consuming a version.
const releaseNotes = notesIndex < 0 ? undefined : await readFile(resolve(process.argv[notesIndex + 1] ?? ''), 'utf8');
if (publish && !releaseNotes?.trim()) throw new Error('The release notes file is empty.');
if (runtimeTests && !process.argv.includes('--prepare')) throw new Error('Runtime test instrumentation is allowed only in a prepared debug build.');
const environment = { ...process.env };
// Release builds are Developer ID signed and notarized; --no-updater builds stay ad-hoc for local use.
const identity = updater ? developerIdentity() : undefined;
if (updater && !environment.TAURI_SIGNING_PRIVATE_KEY) {
  const key = join(homedir(), '.config/appkiro/signing/appkiro-password-manager.key');
  await access(key).catch(() => { throw new Error('An app-specific Tauri signing key is required. Set TAURI_SIGNING_PRIVATE_KEY, or use --no-updater for a local app without release payloads.'); });
  environment.TAURI_SIGNING_PRIVATE_KEY = key;
  environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
}
const hostArchitecture: DesktopArchitecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
// Releases ship a separate app for Apple Silicon and for Intel; local packages build only this Mac's architecture.
const architectures = updater ? DESKTOP_ARCHITECTURES : [hostArchitecture];
await withVersionedBuild(root, async (version) => {
  await exportWeb(root, '.desktop-web');
  await prepareDesktopHost(root);
  if (runtimeTests) await build({ entryPoints: [join(root, 'tests/native/tauri-runtime.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(root, 'desktop/tauri/test-runtime.js') });
  if (prepare) {
    const args = ['tauri', 'build', '--debug', '--no-bundle'];
    if (runtimeTests) args.push('--features', 'runtime-tests');
    runBuildCommand(join(root, 'desktop/tauri'), 'bunx', args, environment);
    process.stdout.write(`Desktop runtime prepared: ${version}\n`);
    return;
  }
  const directory = join(root, 'desktop-release', `tauri-${version}`);
  const applications: Partial<Record<DesktopArchitecture, string>> = {};
  for (const architecture of architectures) {
    // Bundle only the helper slice for this architecture, signed like the app around it.
    const helper = join(root, '.desktop-stage/kiro-security');
    await copyFile(join(root, `.desktop-stage/kiro-security-${architecture === 'aarch64' ? 'arm64' : 'x86_64'}`), helper);
    if (identity) signCode(identity, helper);
    const config = { bundle: { createUpdaterArtifacts: false, ...(identity && { macOS: { signingIdentity: identity } }) } };
    runBuildCommand(join(root, 'desktop/tauri'), 'bunx', ['tauri', 'build', '--target', `${architecture}-apple-darwin`, '--bundles', 'app', '--config', JSON.stringify(config)], environment);
    const application = join(directory, architecture, 'Kiwi Password.app');
    await mkdir(join(directory, architecture), { recursive: true });
    await cp(join(root, `desktop/tauri/target/${architecture}-apple-darwin/release/bundle/macos/Kiwi Password.app`), application, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
    runBuildCommand(root, 'codesign', ['--verify', '--deep', '--strict', application]);
    if (identity) {
      await notarize(application);
      assertGatekeeper(application, 'execute');
    }
    applications[architecture] = application;
  }
  if (updater) {
    await prepareDesktopRelease(root, directory, version, releaseNotes ?? `Kiwi Password ${version}.`, identity!, environment);
    if (publish) await publishDesktopRelease(directory);
  }
  for (const application of Object.values(applications)) process.stdout.write(`${application}\n`);
});
