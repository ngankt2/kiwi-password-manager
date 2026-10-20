import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { equalBytes } from '@/core/bytes';
import { VaultError } from '@/core/errors';
import { MAX_VAULT_BYTES } from '@/core/vault-format/codec';
import { MAX_ATTACHMENT_BYTES } from '@/domain/entities/attachment';
import { stripVaultFileExtension, vaultFileName } from '@/core/vault-format/file-names';

export interface PickedFile { name: string; bytes: Uint8Array; sourceToken?: string; sourceLocation?: string }
export async function pickFile(_encrypted = true): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size ?? 0) > MAX_VAULT_BYTES) throw new VaultError('LIMIT_EXCEEDED');
    const bytes = await file.bytes();
    if (bytes.length > MAX_VAULT_BYTES) throw new VaultError('LIMIT_EXCEEDED');
    return { name: asset.name, bytes };
  } finally {
    // The picker did not create a cache copy; the selected source is untouched.
  }
}

/** Any file type, bounded to the attachment limit before its bytes are read. */
export async function pickAttachment(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  if ((asset.size ?? file.size ?? 0) > MAX_ATTACHMENT_BYTES) throw new VaultError('LIMIT_EXCEEDED');
  const bytes = await file.bytes();
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new VaultError('LIMIT_EXCEEDED');
  return { name: asset.name, bytes };
}

const safeName = (name: string) => name.replace(/[/\\<>:"|?*\x00-\x1f]/g, '-').slice(0, 180);
export async function exportFile(name: string, bytes: Uint8Array, plaintext = false): Promise<void> {
  if (plaintext) {
    // Write only to an explicitly selected destination. Never stage plaintext in app cache.
    const directory = await Directory.pickDirectoryAsync();
    const file = directory.createFile(`${Date.now()}-${safeName(name)}`, name.endsWith('.csv') ? 'text/csv' : name.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    file.write(bytes);
    if (!equalBytes(await file.bytes(), bytes)) throw new VaultError('SAVE_FAILED');
    return;
  }
  const file = new File(Paths.cache, `${Date.now()}-${vaultFileName(safeName(stripVaultFileExtension(name)))}`);
  try {
    file.create({ overwrite: false }); file.write(bytes);
    if (!await Sharing.isAvailableAsync()) throw new VaultError('PERMISSION');
    await Sharing.shareAsync(file.uri, { dialogTitle: 'Save encrypted vault', mimeType: 'application/octet-stream', UTI: 'public.data' });
  } finally { if (file.exists) file.delete(); }
}

export async function exportToFolder(name: string, bytes: Uint8Array) {
  const directory = await Directory.pickDirectoryAsync();
  const file = directory.createFile(`${Date.now()}-${vaultFileName(safeName(stripVaultFileExtension(name)))}`, 'application/octet-stream');
  file.write(bytes);
  if (!equalBytes(await file.bytes(), bytes)) throw new VaultError('SAVE_FAILED');
}
