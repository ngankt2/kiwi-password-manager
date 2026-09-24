import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const executable = resolve(root, 'desktop/tauri/target/debug/appkiro-password-manager');
await access(executable).catch(() => { throw new Error('Run bun run desktop:prepare before starting the desktop app.'); });
const child = spawn(executable, [], { cwd: root, env: process.env, stdio: 'inherit' });
child.once('error', () => { process.stderr.write('Could not start the prepared desktop application.\n'); process.exitCode = 1; });
child.once('exit', (code) => { process.exitCode = code ?? 1; });
