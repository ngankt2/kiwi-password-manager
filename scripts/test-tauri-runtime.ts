import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { runBuildCommand } from './build-version';
import { build } from 'esbuild';

const root = resolve(import.meta.dir, '..');
await build({ entryPoints: [join(root, 'tests/native/tauri-runtime.ts')], bundle: true, platform: 'browser', format: 'iife', outfile: join(root, 'desktop/tauri/test-runtime.js') });
const profile = await mkdtemp(join(tmpdir(), 'appkiro-tauri-native-'));
const reports = join(root, 'tests/reports/tauri-migration');
await mkdir(reports, { recursive: true });
try {
  runBuildCommand(root, 'bun', ['scripts/create-desktop-ui-fixture.ts', join(profile, 'legacy.vault')]);
  for (const phase of ['first', 'reopen']) {
    await rm(join(profile, 'native-report.json'), { force: true });
    await writeFile(join(profile, 'test-input.json'), JSON.stringify({ phase }));
    const child = spawn(join(root, 'desktop/tauri/target/debug/appkiro-password-manager'), [], { cwd: root, env: { ...process.env, KIRO_DESKTOP_TEST_DATA: profile }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (bytes: Buffer) => { if (stderr.length < 8000) stderr += bytes.toString(); });
    const status = await new Promise<number | null>((done, reject) => {
      const deadline = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Native runtime test timed out.')); }, 120_000);
      child.once('error', (error) => { clearTimeout(deadline); reject(error); });
      child.once('exit', (code) => { clearTimeout(deadline); done(code); });
    });
    let report: { ok: boolean; checks: string[]; error?: string; version?: string };
    try { report = JSON.parse(await readFile(join(profile, 'native-report.json'), 'utf8')); }
    catch { throw new Error(`Native test exited (${status}) without a report. ${stderr}`); }
    await copyFile(join(profile, 'native-report.json'), join(reports, `native-${phase}.json`));
    if (!report.ok) throw new Error(`Native ${phase}: ${report.error}`);
    process.stdout.write(`Native ${phase}: ${report.checks.length} checks passed, version ${report.version}.\n`);
  }
} finally { await rm(profile, { recursive: true, force: true }); }
