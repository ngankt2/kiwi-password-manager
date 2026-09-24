import { BinaryStream, ByteUtils, Consts, Credentials, CryptoEngine, Int64, Kdbx, KdbxBinaries, KdbxContext, KdbxError, KdbxHeader, ProtectedValue, type KdbxEntry, type KdbxGroup, type KdbxTimes } from 'kdbxweb';
import { buffer, toBase64, wipe } from '../bytes';
import { validateKdf } from '../crypto/calibrate';
import type { CryptoProvider } from '../crypto/types';
import { VaultError } from '../errors';
import { validateVault, type Attachment, type CustomField, type ItemSnapshot, type Vault, type VaultItem } from '@/domain/entities/vault';
import { createVault } from '@/domain/services/items';
import { isOtpField } from '@/domain/entities/otp';
import { invalidOtpFieldIds } from '@/domain/services/otp';
import './xml';

export interface ImportCounts { entries: number; folders: number; customFields: number; history: number; attachments: number }
export interface KeePassPreview {
  vault: Vault;
  counts: ImportCounts;
  warnings: string[];
  source: { version: string; cipher: string; kdf: string; generator: string };
}

const MAX_KDBX_BYTES = 33_554_432;
const date = (value: Date | undefined) => value && Number.isFinite(value.getTime()) ? value.toISOString() : new Date(0).toISOString();
const valueText = (value: string | ProtectedValue | undefined) => value instanceof ProtectedValue ? value.getText() : value ?? '';
type Json = Vault['metadata'][string];
const json = (value: unknown): Json => value === undefined ? null : JSON.parse(JSON.stringify(value, (_key, current: unknown) => current instanceof Map ? Object.fromEntries(current) : current)) as Json;

function inspectHeader(bytes: Uint8Array) {
  if (bytes.length > MAX_KDBX_BYTES) throw new VaultError('LIMIT_EXCEEDED');
  if (bytes.length < 12) throw new VaultError('UNSUPPORTED_KDBX');
  const major = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(10, true);
  const minor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(8, true);
  if (![3, 4].includes(major) || minor > 1) throw new VaultError('UNSUPPORTED_KDBX');
  const header = KdbxHeader.read(new BinaryStream(buffer(bytes)), new KdbxContext({ kdbx: new Kdbx() }));
  const number = (value: unknown) => value instanceof Int64 ? value.value : typeof value === 'number' ? value : NaN;
  if (header.keyEncryptionRounds !== undefined && (!Number.isSafeInteger(header.keyEncryptionRounds) || header.keyEncryptionRounds > 10_000_000)) throw new VaultError('LIMIT_EXCEEDED');
  const dictionary = header.kdfParameters;
  const idValue = dictionary?.get('$UUID');
  const kdf = idValue instanceof ArrayBuffer ? ByteUtils.bytesToBase64(idValue) : Consts.KdfId.Aes;
  if (dictionary && kdf === Consts.KdfId.Aes) {
    const rounds = number(dictionary.get('R'));
    if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 10_000_000) throw new VaultError('LIMIT_EXCEEDED');
  } else if (dictionary) {
    if (kdf !== Consts.KdfId.Argon2d && kdf !== Consts.KdfId.Argon2id) throw new VaultError('UNSUPPORTED_KDBX');
    const version = number(dictionary.get('V'));
    if (version !== 16 && version !== 19) throw new VaultError('UNSUPPORTED_KDBX');
    validateKdf({ algorithm: kdf === Consts.KdfId.Argon2id ? 'argon2id' : 'argon2d', version,
      memoryKiB: number(dictionary.get('M')) / 1024, iterations: number(dictionary.get('I')), parallelism: number(dictionary.get('P')) });
    if (dictionary.get('K') || dictionary.get('A')) throw new VaultError('UNSUPPORTED_KDBX');
  }
  return { version: `${major}.${minor}`, cipher: header.dataCipherUuid?.toString() === Consts.CipherId.ChaCha20 ? 'ChaCha20' : 'AES-256',
    kdf: kdf === Consts.KdfId.Aes ? 'AES-KDF' : kdf === Consts.KdfId.Argon2id ? 'Argon2id' : 'Argon2d' };
}

function timesMetadata(times: KdbxTimes): Json { return json(times); }

function snapshot(entry: KdbxEntry, folderId: string | null, counts?: ImportCounts): ItemSnapshot {
  const fields: CustomField[] = [];
  let index = 0;
  const standard: Record<string, [string, string, CustomField['kind']]> = {
    UserName: ['username', 'Username', 'text'], Password: ['password', 'Password', 'secret'], URL: ['website', 'Website', 'url'],
  };
  const title = entry.fields.get('Title');
  const notes = entry.fields.get('Notes');
  for (const [label, value] of entry.fields) {
    if ((label === 'Title' || label === 'Notes') && !(value instanceof ProtectedValue)) continue;
    const known = standard[label];
    const text = valueText(value);
    const otp = isOtpField({ label, value: text, kind: 'text' });
    const secret = value instanceof ProtectedValue || label === 'Password' || otp;
    fields.push({ id: known?.[0] ?? `keepass-field-${index++}`, label: known?.[1] ?? label,
      kind: otp ? 'otp' : secret ? 'secret' : known?.[2] ?? 'text', value: text, protected: secret });
    if (counts && !known) counts.customFields++;
  }
  const attachments: Attachment[] = [];
  for (const [name, attachment] of entry.binaries) {
    const value = KdbxBinaries.isKdbxBinaryWithHash(attachment) ? attachment.value : attachment;
    const bytes = value instanceof ProtectedValue ? value.getBinary() : new Uint8Array(value);
    if (bytes.length > MAX_KDBX_BYTES) throw new VaultError('LIMIT_EXCEEDED');
    attachments.push({ id: `${entry.uuid.id}:attachment:${attachments.length}`, name, mimeType: 'application/octet-stream', size: bytes.length, data: toBase64(bytes) });
    if (value instanceof ProtectedValue) wipe(bytes);
    if (counts) counts.attachments++;
  }
  return {
    type: 'login', title: title instanceof ProtectedValue ? 'Protected KeePass title' : valueText(title), folderId,
    favorite: false, tags: [...entry.tags], fields, notes: notes instanceof ProtectedValue ? '' : valueText(notes), attachments,
    createdAt: date(entry.times.creationTime), updatedAt: date(entry.times.lastModTime),
    metadata: { keepass: json({ icon: entry.icon, customIcon: entry.customIcon?.id, foreground: entry.fgColor, background: entry.bgColor,
      overrideUrl: entry.overrideUrl, autoType: entry.autoType, customData: entry.customData, qualityCheck: entry.qualityCheck,
      previousParentGroup: entry.previousParentGroup?.id, times: timesMetadata(entry.times) }) },
  };
}

export async function previewKeePass(crypto: CryptoProvider, bytes: Uint8Array, password: string, vaultId: string, sourceName: string, keyFile?: Uint8Array): Promise<KeePassPreview> {
  if (keyFile && keyFile.length > 1_048_576) throw new VaultError('LIMIT_EXCEEDED');
  try {
    const source = inspectHeader(bytes);
    CryptoEngine.setArgon2Impl(async (passwordBytes, salt, memoryKiB, iterations, length, parallelism, type, version) => {
      const result = await crypto.argon2(new Uint8Array(passwordBytes), new Uint8Array(salt), {
        algorithm: type === 2 ? 'argon2id' : 'argon2d', version, memoryKiB, iterations, parallelism,
      }, length);
      const output = buffer(result); wipe(result); return output;
    });
    const protectedPassword = ProtectedValue.fromString(password);
    const credentials = new Credentials(protectedPassword, keyFile ? buffer(keyFile) : undefined);
    let database: Kdbx;
    try { database = await Kdbx.load(buffer(bytes), credentials); }
    finally { protectedPassword.value.fill(0); protectedPassword.salt.fill(0); }
    const counts: ImportCounts = { entries: 0, folders: 0, customFields: 0, history: 0, attachments: 0 };
    const vault = createVault(vaultId, (database.meta.name || sourceName.replace(/\.kdbx$/i, '') || 'Imported vault').slice(0, 200));
    vault.createdAt = date(database.meta.nameChanged);
    const visit = (group: KdbxGroup, parentId: string | null, trashed: boolean, depth: number) => {
      if (depth > 100 || counts.folders > 20_000 || counts.entries > 100_000) throw new VaultError('LIMIT_EXCEEDED');
      const deleted = trashed || group.uuid.id === database.meta.recycleBinUuid?.id;
      vault.folders.push({ id: group.uuid.id, name: group.name || 'Unnamed group', parentId,
        createdAt: date(group.times.creationTime), updatedAt: date(group.times.lastModTime), notes: group.notes ?? '', tags: [...group.tags],
        metadata: { keepass: json({ icon: group.icon, customIcon: group.customIcon?.id, expanded: group.expanded,
          defaultAutoTypeSeq: group.defaultAutoTypeSeq, enableAutoType: group.enableAutoType, enableSearching: group.enableSearching,
          customData: group.customData, previousParentGroup: group.previousParentGroup?.id, times: timesMetadata(group.times) }) } });
      counts.folders++;
      for (const entry of group.entries) {
        const mapped = snapshot(entry, group.uuid.id, counts);
        const item: VaultItem = { ...mapped, id: entry.uuid.id, archivedAt: null, deletedAt: deleted ? date(entry.times.lastModTime) : null,
          history: entry.history.map((version, index) => ({ id: `${entry.uuid.id}:history:${index}`, savedAt: date(version.times.lastModTime),
            summary: 'Imported KeePass version', snapshot: snapshot(version, group.uuid.id) })) };
        counts.entries++; counts.history += entry.history.length;
        vault.items.push(item);
      }
      for (const child of group.groups) visit(child, group.uuid.id, deleted, depth + 1);
    };
    for (const group of database.groups) visit(group, null, false, 0);
    vault.metadata.keepass = {
      sourceName, sourceVersion: source.version, generator: database.meta.generator ?? 'Unknown',
      encryptedSource: toBase64(bytes), ...(keyFile ? { sourceKeyFile: toBase64(keyFile) } : {}),
      customData: json(database.meta.customData), deletedObjects: json(database.deletedObjects),
      description: database.meta.desc ?? '', defaultUser: database.meta.defaultUser ?? '',
      customIcons: json([...database.meta.customIcons].map(([id, icon]) => ({ id, ...icon, data: toBase64(new Uint8Array(icon.data)) }))),
    };
    const warnings = [
      'KeePass auto-type rules, icons, plugin settings and original timestamps are preserved as encrypted metadata; Kiro does not execute auto-type rules.',
      'The original encrypted KDBX is preserved inside this vault. Keep its original password to open that source archive.',
    ];
    if (vault.items.some((item) => invalidOtpFieldIds(item.fields).size)) warnings.push('Some TOTP configurations are invalid or unsupported. Their original values are preserved.');
    return { vault: validateVault(vault), counts, warnings, source: { ...source, generator: database.meta.generator ?? 'Unknown' } };
  } catch (error) {
    if (error instanceof VaultError) throw error;
    if (error instanceof KdbxError) {
      if (error.code === Consts.ErrorCodes.InvalidKey) throw new VaultError('AUTHENTICATION');
      if (error.code === Consts.ErrorCodes.Unsupported || error.code === Consts.ErrorCodes.InvalidVersion || error.code === Consts.ErrorCodes.NotImplemented) throw new VaultError('UNSUPPORTED_KDBX');
    }
    throw new VaultError('CORRUPT');
  }
}
