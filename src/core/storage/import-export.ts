import { text, utf8 } from '../bytes';
import { VaultError } from '../errors';
import { migrateVault } from '../migrations';
import { validateVault, type Vault } from '@/domain/entities/vault';

export function previewJson(bytes: Uint8Array): Vault {
  if (bytes.length > 67_108_864) throw new VaultError('LIMIT_EXCEEDED');
  try {
    const data: unknown = JSON.parse(text(bytes));
    if (!data || typeof data !== 'object' || !('schemaVersion' in data) || typeof data.schemaVersion !== 'number') throw new VaultError('VALIDATION');
    return migrateVault(data, data.schemaVersion).vault;
  } catch (error) { if (error instanceof VaultError) throw error; throw new VaultError('VALIDATION'); }
}

export function exportJson(vault: Vault): Uint8Array { return utf8(JSON.stringify(validateVault(vault), null, 2)); }

export function mergeImport(current: Vault, incoming: Vault, id: () => string): Vault {
  const folderIds = new Map(incoming.folders.map((folder) => [folder.id, id()]));
  return validateVault({ ...current,
    folders: [...current.folders, ...incoming.folders.map((folder) => ({ ...folder, id: folderIds.get(folder.id)!, parentId: folder.parentId ? folderIds.get(folder.parentId)! : null }))],
    items: [...current.items, ...incoming.items.map((item) => ({ ...item, id: id(), folderId: item.folderId ? folderIds.get(item.folderId)! : null,
      history: item.history.map((version) => ({ ...version, id: id(), snapshot: { ...version.snapshot,
        folderId: version.snapshot.folderId ? folderIds.get(version.snapshot.folderId) ?? null : null } })) }))],
    metadata: { ...current.metadata, [`import-${id()}`]: incoming.metadata },
  });
}
