import { describe, expect, test } from 'bun:test';
import { Secret } from 'otpauth';
import { generateOtp } from '../src/core/security/otp';
import { isOtpField } from '../src/domain/entities/otp';
import { isSecret, type CustomField } from '../src/domain/entities/vault';
import { createItem, createVault } from '../src/domain/services/items';
import { generateFieldOtp, invalidOtpFieldIds } from '../src/domain/services/otp';
import { searchItems } from '../src/domain/services/search';

const base32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const uri = `otpauth://totp/Fixture?secret=${base32}`;
const field = (label: string, value: string, kind: CustomField['kind'] = 'text'): CustomField => ({ id: label, label, value, kind, protected: kind === 'otp' || kind === 'secret' });

describe('RFC 6238 TOTP', () => {
  const secrets = { SHA1: '12345678901234567890', SHA256: '12345678901234567890123456789012', SHA512: '1234567890123456789012345678901234567890123456789012345678901234' };
  const vectors = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ] as const;
  for (const [time, ...codes] of vectors) {
    Object.entries(secrets).forEach(([algorithm, secret], index) => {
      test(`${algorithm} at ${time} seconds`, () => {
        const configuration = `otpauth://totp/RFC?secret=${Secret.fromUTF8(secret).base32}&algorithm=${algorithm}&digits=8`;
        expect(generateOtp(configuration, time * 1000).code).toBe(codes[index]);
      });
    });
  }

  test('raw, lowercase and grouped Base32 use SHA1, six digits and 30 seconds', () => {
    for (const value of [base32, base32.toLowerCase(), ' GEZD GNBV GY3T QOJQ\nGEZD-GNBV-GY3T-QOJQ\t']) {
      expect(generateOtp(value, 59000)).toEqual({ code: '287082', remaining: 1, period: 30 });
    }
    expect(generateOtp(` \n${uri}\t `, 59000).code).toBe('287082');
    expect(generateOtp(uri.replace('otpauth://totp', 'OTPAUTH://TOTP'), 59000).code).toBe('287082');
  });

  test('codes and countdowns roll over together at the exact period boundary', () => {
    expect(generateOtp(base32, 59999)).toEqual({ code: '287082', remaining: 1, period: 30 });
    expect(generateOtp(base32, 60000)).toEqual({ code: '359152', remaining: 30, period: 30 });
    expect(generateOtp(`${uri}&period=60&digits=8`, 119999)).toEqual({ code: '94287082', remaining: 1, period: 60 });
    expect(generateOtp(`${uri}&period=60&digits=8`, 120000)).toEqual({ code: '37359152', remaining: 60, period: 60 });
  });

  test('invalid and unsupported setups fail without leaking the secret', () => {
    for (const value of ['', ' \n ', 'A', 'not-a-valid-secret!', '123456', 'https://example.invalid',
      'otpauth://totp/Fixture', `${uri}&period=0`, `${uri}&period=301`, `${uri}&period=30.5`,
      `${uri}&digits=5`, `${uri}&digits=9`, `${uri}&algorithm=MD5`, `${uri}&encoder=steam`,
      uri.replace('/totp/', '/hotp/') + '&counter=1', 'A'.repeat(16_385)]) {
      expect(() => generateOtp(value, 59000)).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
      try { generateOtp(value, 59000); } catch (error) { expect((error as Error).message).not.toContain(base32); }
    }
    for (const timestamp of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 59000.5]) expect(() => generateOtp(base32, timestamp)).toThrow();
    for (const options of [{ digits: 6.5 }, { period: 30.5 }, { period: NaN }]) expect(() => generateOtp({ secret: base32, ...options })).toThrow();
  });
});

describe('TOTP fields from existing KeePass vaults', () => {
  const encoded = [
    ['TimeOtp-Secret-Base32', base32],
    ['TimeOtp-Secret', '12345678901234567890'],
    ['TimeOtp-Secret-Hex', '3132333435363738393031323334353637383930'],
    ['TimeOtp-Secret-Base64', 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA='],
  ];
  for (const [label, value] of encoded) {
    test(`${label} works without rewriting the stored field`, () => {
      const secret = field(label, value);
      const fields = [secret, field('TimeOtp-Length', '8'), field('TimeOtp-Period', '60'), field('TimeOtp-Algorithm', 'HMAC-SHA-1')];
      const original = structuredClone(fields);
      expect(isOtpField(secret)).toBe(true);
      expect(isSecret(secret)).toBe(true);
      expect(generateFieldOtp(secret, fields, 119000)).toEqual({ code: '94287082', remaining: 1, period: 60 });
      expect(fields).toEqual(original);
      expect(invalidOtpFieldIds(fields).size).toBe(0);
    });
  }

  test('KeePass defaults and each supported algorithm match the reference codes', () => {
    const secret = field('TimeOtp-Secret-Base32', base32, 'secret');
    expect(generateFieldOtp(secret, [secret], 59000).code).toBe('287082');
    for (const [algorithm, seed, expected] of [
      ['HMAC-SHA-256', '12345678901234567890123456789012', '46119246'],
      ['HMAC-SHA-512', '1234567890123456789012345678901234567890123456789012345678901234', '90693936'],
    ]) {
      const secret = field('TimeOtp-Secret', seed);
      expect(generateFieldOtp(secret, [secret, field('TimeOtp-Length', '8'), field('TimeOtp-Algorithm', algorithm)], 59000).code).toBe(expected);
    }
  });

  test('ambiguous secrets, invalid encodings and invalid parameters cannot produce misleading codes', () => {
    const secret = field('TimeOtp-Secret-Base32', base32);
    for (const extra of [field('TimeOtp-Secret', 'another seed'), field('TimeOtp-Period', '0'), field('TimeOtp-Period', '30.5'),
      field('TimeOtp-Length', '0x6'), field('TimeOtp-Algorithm', 'unknown')]) {
      expect(() => generateFieldOtp(secret, [secret, extra], 59000)).toThrow();
    }
    for (const invalid of [field('TimeOtp-Secret-Hex', 'abc'), field('TimeOtp-Secret-Hex', 'not hex'), field('TimeOtp-Secret-Base64', '====')]) {
      expect(() => generateFieldOtp(invalid, [invalid], 59000)).toThrow();
    }
    expect(isOtpField(field('HmacOtp-Secret-Base32', base32))).toBe(false);
    expect(isOtpField(field('TimeOtp-Period', '30'))).toBe(false);
  });

  test('legacy secrets stay masked and cannot be found through ordinary search', () => {
    for (const secret of [...encoded.map(([label, value]) => field(label, value)), field('ToTp', base32), field('Custom setup', ` ${uri}`)]) {
      expect(isSecret(secret)).toBe(true);
      const item = createItem('fixture', 'login'); item.title = 'Fixture'; item.fields = [secret];
      const vault = createVault('fixture', 'Fixture'); vault.items = [item];
      expect(searchItems(vault, secret.value)).toHaveLength(0);
    }
  });

  test('invalid new or changed setups are rejected while unrelated edits preserve unsupported legacy data', () => {
    const invalid = field('otp', 'unsupported-original-value!', 'otp');
    expect([...invalidOtpFieldIds([invalid])]).toEqual(['otp']);
    expect(invalidOtpFieldIds([invalid, field('Username', 'changed')], [invalid]).size).toBe(0);
    expect([...invalidOtpFieldIds([{ ...invalid, value: 'another-invalid-value!' }], [invalid])]).toEqual(['otp']);
    expect(invalidOtpFieldIds([{ ...invalid, value: base32 }], [invalid]).size).toBe(0);
    expect(invalidOtpFieldIds([{ ...invalid, value: '' }], [invalid]).size).toBe(0);
    const secret = field('TimeOtp-Secret-Base32', base32);
    const previous = [secret, field('TimeOtp-Period', '30')];
    expect([...invalidOtpFieldIds([secret, field('TimeOtp-Period', '0')], previous)]).toEqual([secret.id]);
  });
});
