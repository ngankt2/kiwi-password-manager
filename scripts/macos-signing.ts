import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runBuildCommand } from './build-version';

export const TEAM_ID = '943C9WTE6D';

function capture(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return { ok: result.status === 0, output: (result.stdout + result.stderr).trim() };
}

/** Resolves the Developer ID Application identity used for distribution outside the App Store. */
export function developerIdentity() {
  const requested = process.env.APPLE_SIGNING_IDENTITY;
  const identities = capture('security', ['find-identity', '-v', '-p', 'codesigning']).output;
  const found = [...identities.matchAll(/"(Developer ID Application: [^"]+)"/g)].map((match) => match[1]);
  const identity = requested ?? found.find((name) => name.endsWith(`(${TEAM_ID})`));
  if (!identity || !found.includes(identity)) {
    throw new Error(`A "Developer ID Application" certificate for team ${TEAM_ID} is required to sign release builds. Install it in the login keychain, or use --no-updater for a local ad-hoc build.`);
  }
  return identity;
}

export const notaryProfile = () => process.env.APPLE_NOTARY_PROFILE ?? 'notarytool';

export function signCode(identity: string, path: string) {
  runBuildCommand(process.cwd(), 'codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, path]);
}

/** Submits to Apple's notary service, waits for the verdict, then staples the ticket. */
export async function notarize(path: string) {
  const profile = notaryProfile();
  const stage = await mkdtemp(join(tmpdir(), 'kiwi-notary-'));
  try {
    // Apps are submitted as a zip; disk images are submitted directly.
    const upload = path.endsWith('.app') ? join(stage, 'upload.zip') : path;
    if (upload !== path) runBuildCommand(stage, 'ditto', ['-c', '-k', '--keepParent', path, upload]);
    process.stdout.write(`Notarizing ${path}\n`);
    const submission = capture('xcrun', ['notarytool', 'submit', upload, '--keychain-profile', profile, '--wait', '--output-format', 'json']);
    let verdict: { id?: string; status?: string } = {};
    try { verdict = JSON.parse(submission.output.slice(submission.output.indexOf('{'))); } catch { /* reported below */ }
    if (verdict.status !== 'Accepted') {
      const log = verdict.id ? capture('xcrun', ['notarytool', 'log', verdict.id, '--keychain-profile', profile]).output : submission.output;
      throw new Error(`Notarization of ${path} was not accepted (${verdict.status ?? 'no verdict'}).\n${log}`);
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  runBuildCommand(process.cwd(), 'xcrun', ['stapler', 'staple', path]);
  runBuildCommand(process.cwd(), 'xcrun', ['stapler', 'validate', path]);
}

/** Confirms Gatekeeper accepts the item as notarized Developer ID software. */
export function assertGatekeeper(path: string, type: 'execute' | 'open') {
  const args = ['--assess', '--verbose=2', '--type', type, ...(type === 'open' ? ['--context', 'context:primary-signature'] : []), path];
  const assessment = capture('spctl', args);
  if (!assessment.ok || !assessment.output.includes('Notarized Developer ID')) throw new Error(`Gatekeeper rejected ${path}:\n${assessment.output}`);
}
