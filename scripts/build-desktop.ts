import { access, cp, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { exportWeb } from './build-web';
import { runBuildCommand, withVersionedBuild } from './build-version';
import { prepareDesktopHost } from './prepare-desktop-host';
import { build } from 'esbuild';
import { prepareDesktopRelease } from './prepare-desktop-release';
import { publishDesktopRelease } from './publish-desktop-release';

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
if (updater && !environment.TAURI_SIGNING_PRIVATE_KEY) {
  const key = join(homedir(), '.config/appkiro/signing/appkiro-password-manager.key');
  await access(key).catch(() => { throw new Error('An app-specific Tauri signing key is required. Set TAURI_SIGNING_PRIVATE_KEY, or use --no-updater for a local app without release payloads.'); });
  environment.TAURI_SIGNING_PRIVATE_KEY = key;
  environment.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= '';
}
await withVersionedBuild(root, async (version) => {
  await exportWeb(root, '.desktop-web');
  await prepareDesktopHost(root);
  if (runtimeTests) await build({ entryPoints: [join(root, 'tests/native/tauri-runtime.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(root, 'desktop/tauri/test-runtime.js') });
  // Release builds are universal so one update archive serves Apple Silicon and Intel Macs.
  const args = ['tauri', 'build', ...(prepare ? ['--debug', '--no-bundle'] : ['--target', 'universal-apple-darwin', '--bundles', 'app'])];
  if (!updater) args.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
  if (runtimeTests) args.push('--features', 'runtime-tests');
  runBuildCommand(join(root, 'desktop/tauri'), 'bunx', args, environment);
  if (prepare) { process.stdout.write(`Desktop runtime prepared: ${version}\n`); return; }
  const directory = join(root, 'desktop-release', `tauri-${version}`);
  await mkdir(directory, { recursive: true });
  const bundle = join(root, 'desktop/tauri/target/universal-apple-darwin/release/bundle');
  const source = join(bundle, 'macos/Kiwi Password.app');
  const application = join(directory, 'Kiwi Password.app');
  await cp(source, application, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
  runBuildCommand(root, 'codesign', ['--verify', '--deep', '--strict', application]);
  if (updater) {
    await prepareDesktopRelease(root, directory, bundle, version, releaseNotes ?? `Kiwi Password ${version}.`);
    if (publish) await publishDesktopRelease(directory);
  }
  process.stdout.write(`${application}\n`);
});
