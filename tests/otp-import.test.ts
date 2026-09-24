import { expect, test } from 'bun:test';
import { Credentials, Kdbx, ProtectedValue, XmlUtils } from 'kdbxweb';
import { previewKeePass } from '../src/core/kdbx/importer';
import { parseKeePassXml } from '../src/core/kdbx/xml';
import { deriveContext, openVault, sealVault } from '../src/core/vault-format/codec';
import { wipe } from '../src/core/bytes';
import { generateFieldOtp } from '../src/domain/services/otp';
import { testCrypto, TEST_KDF } from './helpers/crypto';

const password = 'totp-import-fixture';
const base32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
function database() {
  const db = Kdbx.create(new Credentials(ProtectedValue.fromString(password)), 'TOTP fixture');
  db.setVersion(3);
  db.header.keyEncryptionRounds = 50;
  return db;
}

async function saveFixture(db: Kdbx) {
  // The production importer bridges XML reads; fixture creation also needs the maintained parser.
  const original = XmlUtils.create;
  Object.assign(XmlUtils, { create: (root: string) => parseKeePassXml('<' + root + '/>') });
  try { return new Uint8Array(await db.save()); }
  finally { Object.assign(XmlUtils, { create: original }); }
}

test('KeePass native TOTP, raw seeds, URIs and history survive import and encrypted reopen', async () => {
  const db = database();
  const native = db.createEntry(db.groups[0]);
  native.fields.set('Title', 'Native TOTP');
  native.fields.set('TimeOtp-Secret-Base32', base32);
  native.fields.set('TimeOtp-Length', '8');
  native.fields.set('TimeOtp-Period', '30');
  native.fields.set('TimeOtp-Algorithm', 'HMAC-SHA-1');
  native.pushHistory();
  native.fields.set('TimeOtp-Period', '60');
  for (const [label, value] of [['otp', base32], ['Custom setup', ` otpauth://totp/Fixture?secret=${base32} `]]) {
    const entry = db.createEntry(db.groups[0]); entry.fields.set('Title', label); entry.fields.set(label, ProtectedValue.fromString(value));
  }
  const source = await saveFixture(db);
  const preview = await previewKeePass(testCrypto, source, password, 'totp-vault', 'fixture.kdbx');
  expect(preview.warnings.some((warning) => /T?OTP/.test(warning))).toBe(false);
  const item = preview.vault.items.find((item) => item.title === 'Native TOTP')!;
  const seed = item.fields.find((field) => field.label === 'TimeOtp-Secret-Base32')!;
  expect(seed).toMatchObject({ value: base32, kind: 'otp', protected: true });
  expect(generateFieldOtp(seed, item.fields, 119000).code).toBe('94287082');
  const history = item.history[0].snapshot;
  expect(history.fields.find((field) => field.label === 'TimeOtp-Period')?.value).toBe('30');
  const oldSeed = history.fields.find((field) => field.label === seed.label)!;
  expect(generateFieldOtp(oldSeed, history.fields, 59000).code).toBe('94287082');
  for (const other of preview.vault.items.filter((entry) => entry.id !== item.id)) {
    const otp = other.fields.find((field) => field.kind === 'otp')!;
    expect(generateFieldOtp(otp, other.fields, 59000).code).toBe('287082');
  }
  const context = await deriveContext(testCrypto, password, TEST_KDF);
  try {
    const encrypted = await sealVault(testCrypto, preview.vault, context);
    const reopened = await openVault(testCrypto, encrypted, password);
    try { expect(reopened.vault).toEqual(preview.vault); }
    finally { wipe(reopened.context.key); }
  } finally { wipe(context.key); }
});

test('unsupported OTP values remain protected with an accurate import warning', async () => {
  const db = database();
  const entry = db.createEntry(db.groups[0]);
  const value = `otpauth://hotp/Fixture?secret=${base32}&counter=1`;
  entry.fields.set('otp', value);
  const preview = await previewKeePass(testCrypto, await saveFixture(db), password, 'unsupported-vault', 'fixture.kdbx');
  expect(preview.vault.items[0].fields.find((field) => field.label === 'otp')).toMatchObject({ value, kind: 'otp', protected: true });
  expect(preview.warnings).toContain('Some TOTP configurations are invalid or unsupported. Their original values are preserved.');
});
