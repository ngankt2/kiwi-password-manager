import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { RELEASE_REPOSITORY, releaseAssets, releaseTag, releaseUrl } from './prepare-desktop-release';

function gh(args: string[], options: { allowFailure?: boolean; input?: string } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', input: options.input, stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim()}`);
  return { ok: result.status === 0, stdout: result.stdout.trim() };
}

const newer = (next: string, current: string) => {
  const [a, b] = [next, current].map((value) => value.replace(/^v/, '').split('.').map(Number));
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index];
  return false;
};

export async function publishDesktopRelease(directory: string) {
  const manifest = JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8'));
  const version: string = manifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('latest.json must contain a release version.');
  const assets = releaseAssets(version);
  const notes = (await readFile(join(directory, assets.notes), 'utf8')).trim();
  if (!notes || notes === `Kiwi Password ${version}.`) throw new Error('Release notes are required. Rebuild with --notes-file describing the changes.');
  const files = [...assets.builds.flatMap((build) => [build.installer, build.archive, build.signature]), assets.manifest].map((name) => join(directory, name));
  for (const file of files) if (!(await stat(file)).isFile()) throw new Error(`Missing release asset ${file}.`);
  const tag = releaseTag(version);
  for (const build of assets.builds) {
    if (manifest.platforms?.[build.platform]?.url !== releaseUrl(version, build.archive)) throw new Error(`latest.json must point ${build.platform} at ${build.archive} in this release.`);
  }

  gh(['auth', 'status']);
  if (gh(['release', 'view', tag, '-R', RELEASE_REPOSITORY], { allowFailure: true }).ok) throw new Error(`${tag} is already published. Build a new version instead of replacing a release.`);
  const latest = gh(['release', 'view', '-R', RELEASE_REPOSITORY, '--json', 'tagName', '--jq', '.tagName'], { allowFailure: true });
  if (latest.ok && latest.stdout && !newer(version, latest.stdout)) throw new Error(`${tag} is not newer than the published ${latest.stdout}.`);

  // Upload into a draft first so latest.json never announces a half-uploaded release.
  gh(['release', 'create', tag, '-R', RELEASE_REPOSITORY, '--draft', '--title', `Kiwi Password ${version}`, '--notes-file', join(directory, assets.notes), ...files]);
  gh(['release', 'edit', tag, '-R', RELEASE_REPOSITORY, '--draft=false', '--latest']);

  const channel = await fetch(`https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/latest.json`, { cache: 'no-store' });
  const published = channel.ok ? await channel.json() as { version?: string } : {};
  if (published.version !== version) throw new Error(`Release ${tag} was created, but the update channel does not report it yet. Check https://github.com/${RELEASE_REPOSITORY}/releases.`);
  process.stdout.write(`Published ${tag}: https://github.com/${RELEASE_REPOSITORY}/releases/tag/${tag}\n`);
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, '..');
  const version = process.argv[2] ?? JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  await publishDesktopRelease(join(root, 'desktop-release', `tauri-${version.replace(/^v/, '')}`));
}
