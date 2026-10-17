import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { runBuildCommand, withVersionedBuild } from './build-version';
import { expo as appConfig } from '../app.json';

const [platform, ...args] = process.argv.slice(2);
if (!['ios', 'android', 'all'].includes(platform) || args.includes('--platform')) {
  throw new Error('Choose ios, android, or all via the package build command.');
}
const local = args.includes('--local');
if (local && platform === 'all') throw new Error('Local builds require a single platform.');
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
// --archive produces a signed App Store archive with Xcode; --upload sends it to
// App Store Connect instead of exporting an .ipa next to the archive.
const archive = args.includes('--archive');
const upload = args.includes('--upload');
const team = option('--team');
if (archive && (platform !== 'ios' || !local || !team)) throw new Error('--archive requires ios --local --team <TEAM_ID>.');
if (upload && !archive) throw new Error('--upload requires --archive.');
const root = resolve(import.meta.dir, '..');
await withVersionedBuild(root, async (version) => {
  if (local) {
    // expo run keeps existing native projects, so synchronize the newly bumped
    // version, build counters, branding and plugins through CNG first.
    runBuildCommand(root, 'bunx', ['expo', 'prebuild', '--no-clean', '--no-install', '--platform', platform]);
  }
  const ios = join(root, 'ios');
  // CNG names the Xcode project after the app, so read it instead of hardcoding it.
  const project = local && platform === 'ios'
    ? (await readdir(ios)).find((name) => name.endsWith('.xcodeproj'))?.replace(/\.xcodeproj$/, '')
    : undefined;
  if (project) {
    // --no-clean keeps stale build settings, which once shipped the Expo template icon.
    const iconName = appConfig.ios.icon.endsWith('.icon') ? basename(appConfig.ios.icon, '.icon') : 'AppIcon';
    const pbxproj = await readFile(join(ios, `${project}.xcodeproj/project.pbxproj`), 'utf8');
    const stale = [...pbxproj.matchAll(/ASSETCATALOG_COMPILER_APPICON_NAME = ([^;]+);/g)].filter(([, name]) => name !== iconName);
    if (stale.length) throw new Error(`The iOS project uses app icon "${stale[0][1]}" instead of "${iconName}". Run bunx expo prebuild --clean --platform ios.`);
  }
  if (archive) {
    if (!project) throw new Error('No Xcode project was found in ios/.');
    const output = join(root, 'mobile-release/ios', version);
    const archivePath = join(output, `${project}.xcarchive`);
    const signing = ['-allowProvisioningUpdates', `DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic'];
    await mkdir(output, { recursive: true });
    // expo run:ios normally refreshes this; a stale Node path breaks Xcode script phases.
    const node = Bun.which('node');
    if (!node) throw new Error('Node is required for Xcode script phases.');
    await writeFile(join(ios, '.xcode.env.local'), `export NODE_BINARY=${node}\n`);
    runBuildCommand(ios, 'pod', ['install'], { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' });
    runBuildCommand(ios, 'xcodebuild', ['archive', '-workspace', `${project}.xcworkspace`, '-scheme', project, '-configuration', 'Release',
      '-destination', 'generic/platform=iOS', '-archivePath', archivePath, ...signing]);
    const exportOptions = join(output, 'ExportOptions.plist');
    await writeFile(exportOptions, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${upload ? 'upload' : 'export'}</string>
  <key>teamID</key><string>${team}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
`);
    runBuildCommand(ios, 'xcodebuild', ['-exportArchive', '-archivePath', archivePath, '-exportOptionsPlist', exportOptions,
      '-exportPath', join(output, 'export'), '-allowProvisioningUpdates'],
      // Xcode's IPA packaging expects Apple's rsync; Homebrew's rsync rejects its arguments.
      { ...process.env, PATH: `/usr/bin:${process.env.PATH ?? ''}` });
    process.stdout.write(`${upload ? 'Uploaded' : 'Exported'} Kiwi Password ${version}: ${output}\n`);
    return;
  }
  const passthrough = args.filter((arg) => arg !== '--local');
  runBuildCommand(root, 'bunx', local
    ? ['expo', `run:${platform}`, ...passthrough]
    : ['eas-cli', 'build', '--platform', platform, ...passthrough]);
});
