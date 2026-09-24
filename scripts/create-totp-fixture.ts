import { writeFile } from 'node:fs/promises';
import { createItem, createVault } from '../src/domain/services/items';
import { deriveContext, sealVault } from '../src/core/vault-format/codec';
import { wipe } from '../src/core/bytes';
import { testCrypto, TEST_KDF } from '../tests/helpers/crypto';

const path = Bun.argv[2];
if (!path) throw new Error('A fixture output path is required');
const vault = createVault('totp-regression', 'TOTP regression fixture');
const legacy = createItem('legacy-totp', 'login'); legacy.title = 'Legacy KeePass TOTP';
legacy.fields = [
  { id: 'native-seed', label: 'TimeOtp-Secret-Base32', value: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', kind: 'text', protected: false },
  { id: 'native-digits', label: 'TimeOtp-Length', value: '8', kind: 'text', protected: false },
  { id: 'native-period', label: 'TimeOtp-Period', value: '30', kind: 'text', protected: false },
];
const invalid = createItem('invalid-totp', 'login'); invalid.title = 'Unsupported TOTP';
invalid.fields.find((field) => field.id === 'otp')!.value = 'unsupported-fixture!';
vault.items = [legacy, invalid];
const context = await deriveContext(testCrypto, 'Desktop-usability-fixture-2026', TEST_KDF);
try { await writeFile(path, await sealVault(testCrypto, vault, context)); }
finally { wipe(context.key); }
