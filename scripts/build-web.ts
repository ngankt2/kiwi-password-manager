import { resolve } from 'node:path';
import { runBuildCommand, withVersionedBuild } from './build-version';

export async function exportWeb(root: string, outputDirectory: string) {
  runBuildCommand(root, 'bun', ['run', 'build:worker']);
  runBuildCommand(root, 'bunx', ['expo', 'export', '--platform', 'web', '--output-dir', outputDirectory, '--clear'],
    { ...process.env, KIRO_DESKTOP_EXPORT: outputDirectory === '.desktop-web' ? '1' : '0' });
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  await withVersionedBuild(root, () => exportWeb(root, process.argv.includes('--desktop') ? '.desktop-web' : 'dist'));
}
