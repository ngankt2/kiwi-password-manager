import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createI18n, LOCALES, type MessageKey } from '../src/core/i18n';
import { DEFAULT_SETTINGS } from '../src/core/security/settings';
import { runBuildCommand } from './build-version';

const nativeMessages: MessageKey[] = ['Khoá Vault', 'Xem', 'Lưu file không mã hoá', 'Lưu kho mã hoá', 'File xuất', 'Kho mã hoá', 'Chọn thư mục lưu Vault', 'Mở kho hoặc file để nhập', 'Kho và file nhập', 'Tất cả file', 'Chọn tệp đính kèm', 'Chọn thư mục sao lưu mã hoá', 'Kiểm tra cập nhật…'];
export async function prepareDesktopHost(root: string) {
  await mkdir(join(root, '.desktop-stage'), { recursive: true });
  const iconset = join(root, '.desktop-stage/appkiro.iconset');
  await mkdir(iconset, { recursive: true });
  // Supply a native icon family instead of relying on the bundler's PNG conversion.
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      runBuildCommand(root, 'sips', ['-z', String(size * scale), String(size * scale), join(root, 'assets/images/macos-icon.png'), '--out', join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)]);
    }
  }
  runBuildCommand(root, 'iconutil', ['--convert', 'icns', '--output', join(root, '.desktop-stage/appkiro.icns'), iconset]);
  // The helper ships inside the universal app, so it must carry both architectures.
  const slices = ['arm64', 'x86_64'].map((arch) => {
    const slice = join(root, `.desktop-stage/kiro-security-${arch}`);
    runBuildCommand(root, 'xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos13.0`, 'desktop/macos-security.swift', '-o', slice]);
    return slice;
  });
  runBuildCommand(root, 'lipo', ['-create', ...slices, '-output', join(root, '.desktop-stage/kiro-security')]);
  const locales = Object.fromEntries(LOCALES.map((locale) => [locale, Object.fromEntries(nativeMessages.map((key) => [key, createI18n(locale).t(key)]))]));
  await writeFile(join(root, 'desktop/tauri/native-catalog.json'), JSON.stringify({ defaults: DEFAULT_SETTINGS, locales }, null, 2) + '\n');
}
if (import.meta.main) await prepareDesktopHost(resolve(import.meta.dir, '..'));
