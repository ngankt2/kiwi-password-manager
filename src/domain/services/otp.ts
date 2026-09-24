import { VaultError } from '@/core/errors';
import { generateOtp, type OtpConfiguration } from '@/core/security/otp';
import { isKeePassOtpSecret, isOtpField } from '../entities/otp';
import type { CustomField } from '../entities/vault';

const keepassAlgorithms: Record<string, string> = { 'HMAC-SHA-1': 'SHA1', 'HMAC-SHA-256': 'SHA256', 'HMAC-SHA-512': 'SHA512' };

export function generateFieldOtp(field: CustomField, fields: CustomField[], timestamp = Date.now()) {
  if (!isKeePassOtpSecret(field.label)) return generateOtp(field.value, timestamp);
  if (fields.filter((entry) => isKeePassOtpSecret(entry.label) && entry.value).length !== 1) throw new VaultError('VALIDATION');
  const parameter = (label: string) => {
    const matches = fields.filter((entry) => entry.label.trim().toLowerCase() === label.toLowerCase());
    if (matches.length > 1) throw new VaultError('VALIDATION');
    return matches[0]?.value.trim();
  };
  const integer = (label: string, fallback: number) => {
    const value = parameter(label);
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) throw new VaultError('VALIDATION');
    return Number(value);
  };
  const label = field.label.trim().toLowerCase();
  const encoding: OtpConfiguration['encoding'] = label.endsWith('-base32') ? 'base32' : label.endsWith('-base64') ? 'base64' : label.endsWith('-hex') ? 'hex' : 'utf8';
  const algorithm = parameter('TimeOtp-Algorithm');
  if (algorithm !== undefined && !Object.hasOwn(keepassAlgorithms, algorithm.toUpperCase())) throw new VaultError('VALIDATION');
  return generateOtp({ secret: field.value, encoding, digits: integer('TimeOtp-Length', 6), period: integer('TimeOtp-Period', 30),
    algorithm: algorithm === undefined ? 'SHA1' : keepassAlgorithms[algorithm.toUpperCase()] }, timestamp);
}

const keepassConfiguration = (fields: CustomField[]) => JSON.stringify(fields
  .filter((field) => isKeePassOtpSecret(field.label) || /^TimeOtp-(?:Length|Period|Algorithm)$/i.test(field.label.trim()))
  .map((field) => [field.label.trim().toLowerCase(), field.value]).sort(([a], [b]) => a.localeCompare(b)));

/** Reject invalid new/changed setups while allowing unrelated edits to preserved legacy data. */
export function invalidOtpFieldIds(fields: CustomField[], previous: CustomField[] = []): Set<string> {
  const errors = new Set<string>();
  const originals = new Map(previous.map((field) => [field.id, field]));
  for (const field of fields) {
    if (!isOtpField(field) || !field.value) continue;
    const original = originals.get(field.id);
    if (original && original.kind === field.kind && original.label === field.label && original.value === field.value &&
        (!isKeePassOtpSecret(field.label) || keepassConfiguration(fields) === keepassConfiguration(previous))) continue;
    try { generateFieldOtp(field, fields, 0); }
    catch { errors.add(field.id); }
  }
  return errors;
}
