import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function prepareDesktopRelease(root: string, directory: string, version: string, notes: string) {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) throw new Error('Only the locally built macOS architecture can be published.');
  const filename = `KiwiPassword_${version}_${process.arch}.app.tar.gz`;
  const source = join(root, 'desktop/tauri/target/release/bundle/macos/Kiwi Password.app.tar.gz');
  const signature = (await readFile(source + '.sig', 'utf8')).trim();
  // Tauri v2 binds its signed archive to the announced version.
  const decoded = Buffer.from(signature, 'base64').toString('utf8');
  if (!decoded.includes(`version:${version}`)) throw new Error('The updater signature must be bound to this build version.');
  await copyFile(source, join(directory, filename));
  await copyFile(source + '.sig', join(directory, filename + '.sig'));
  await copyFile(join(root, 'desktop/tauri/updater.pub'), join(directory, 'updater.pub'));
  const manifest = {
    version, notes, pub_date: new Date().toISOString(),
    platforms: { [process.arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x86_64']: {
      url: `https://github.com/ngankt2/appkiro.com/releases/download/appkiro-password-manager-v${version}/${filename}`, signature,
    } },
  };
  await writeFile(join(directory, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
