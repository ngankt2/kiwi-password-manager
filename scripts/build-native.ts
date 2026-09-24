import { resolve } from 'node:path';
import { runBuildCommand, withVersionedBuild } from './build-version';

const [platform, ...args] = process.argv.slice(2);
if (!['ios', 'android', 'all'].includes(platform) || args.includes('--platform')) {
  throw new Error('Choose ios, android, or all via the package build command.');
}
const local = args.includes('--local');
if (local && platform === 'all') throw new Error('Local builds require a single platform.');
const root = resolve(import.meta.dir, '..');
await withVersionedBuild(root, async () => {
  if (local) {
    // expo run keeps existing native projects, so synchronize the newly bumped
    // version, build counters, branding and plugins through CNG first.
    runBuildCommand(root, 'bunx', ['expo', 'prebuild', '--no-clean', '--no-install', '--platform', platform]);
  }
  runBuildCommand(root, 'bunx', local
    ? ['expo', `run:${platform}`, ...args.filter((arg) => arg !== '--local')]
    : ['eas-cli', 'build', '--platform', platform, ...args]);
});
