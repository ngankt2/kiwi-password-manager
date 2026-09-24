import { VaultError } from '@/core/errors';
import { fieldsForType } from '../entities/templates';
import { randomItemColor, withItemColor } from '../entities/item-icon';
import { ItemSchema, SnapshotSchema, validateVault, type ItemType, type Vault, type VaultItem, type Folder } from '../entities/vault';

export function createVault(id: string, name: string, now = new Date().toISOString()): Vault {
  return validateVault({ schemaVersion: 2, revision: 0, id, name: name.trim(), createdAt: now, updatedAt: now, folders: [], items: [], metadata: {} });
}

export function createItem(id: string, type: ItemType, folderId: string | null = null, now = new Date().toISOString()): VaultItem {
  return { id, type, title: '', folderId, favorite: false, tags: [], fields: fieldsForType(type), notes: '',
    attachments: [], history: [], createdAt: now, updatedAt: now, archivedAt: null, deletedAt: null, metadata: withItemColor({}, randomItemColor()) };
}

export function saveItem(vault: Vault, input: VaultItem, versionId: string, now = new Date().toISOString(), summary = 'Item updated'): Vault {
  const parsed = ItemSchema.safeParse(input);
  if (!parsed.success || !input.title.trim()) throw new VaultError('VALIDATION');
  const previous = vault.items.find((item) => item.id === input.id);
  const history = previous ? [...previous.history, { id: versionId, savedAt: now, summary, snapshot: SnapshotSchema.strip().parse(previous) }] : [];
  const saved = { ...parsed.data, title: parsed.data.title.trim(), createdAt: previous?.createdAt ?? now, updatedAt: now, history };
  return validateVault({ ...vault, updatedAt: now, items: previous ? vault.items.map((item) => item.id === saved.id ? saved : item) : [...vault.items, saved] });
}

export function restoreVersion(vault: Vault, itemId: string, historyId: string, newVersionId: string, now = new Date().toISOString()): Vault {
  const item = vault.items.find((candidate) => candidate.id === itemId);
  const version = item?.history.find((candidate) => candidate.id === historyId);
  if (!item || !version) throw new VaultError('NOT_FOUND');
  const folderId = vault.folders.some((folder) => folder.id === version.snapshot.folderId) ? version.snapshot.folderId : null;
  return saveItem(vault, { ...item, ...version.snapshot, folderId, id: item.id }, newVersionId, now, 'Version restored');
}

export function updateItems(vault: Vault, ids: string[], patch: Partial<Pick<VaultItem, 'favorite' | 'folderId' | 'archivedAt' | 'deletedAt'>>, nextId: () => string): Vault {
  const selected = new Set(ids); const now = new Date().toISOString();
  return validateVault({ ...vault, updatedAt: now, items: vault.items.map((item) => !selected.has(item.id) ? item : {
    ...item, ...patch, updatedAt: now, history: [...item.history, { id: nextId(), savedAt: now, summary: 'Item organized', snapshot: SnapshotSchema.strip().parse(item) }],
  }) });
}

export function addFolder(vault: Vault, id: string, name: string, parentId: string | null, now = new Date().toISOString(), metadata = withItemColor({}, randomItemColor())): Vault {
  if (!name.trim() || (parentId && !vault.folders.some((folder) => folder.id === parentId))) throw new VaultError('VALIDATION');
  const folder: Folder = { id, name: name.trim(), parentId, createdAt: now, updatedAt: now, notes: '', tags: [], metadata };
  return validateVault({ ...vault, updatedAt: now, folders: [...vault.folders, folder] });
}

export function canMoveFolder(vault: Vault, folderId: string, parentId: string | null): boolean {
  const folders = new Map(vault.folders.map((folder) => [folder.id, folder]));
  if (!folders.has(folderId)) return false;
  const visited = new Set<string>();
  let ancestor = parentId;
  while (ancestor !== null) {
    if (ancestor === folderId || visited.has(ancestor) || !folders.has(ancestor)) return false;
    visited.add(ancestor);
    ancestor = folders.get(ancestor)!.parentId;
  }
  return true;
}

/** Sibling order is the order in the encrypted folders array. Omitted beforeId
 * keeps the position within the same parent; null explicitly appends. */
export function moveFolder(vault: Vault, folderId: string, parentId: string | null, beforeId?: string | null): Vault {
  const target = vault.folders.find((folder) => folder.id === folderId);
  if (!target) throw new VaultError('NOT_FOUND');
  if (!canMoveFolder(vault, folderId, parentId)) throw new VaultError('VALIDATION');
  if (beforeId && (beforeId === folderId || !vault.folders.some((folder) => folder.id === beforeId && folder.parentId === parentId))) throw new VaultError('VALIDATION');
  const now = new Date().toISOString();
  const moved = { ...target, parentId, updatedAt: now };
  if (target.parentId === parentId && beforeId === undefined) {
    return validateVault({ ...vault, updatedAt: now, folders: vault.folders.map((folder) => folder.id === folderId ? moved : folder) });
  }
  const folders = vault.folders.filter((folder) => folder.id !== folderId);
  const lastSibling = folders.findLastIndex((folder) => folder.parentId === parentId);
  const index = beforeId ? folders.findIndex((folder) => folder.id === beforeId) : lastSibling < 0 ? folders.length : lastSibling + 1;
  folders.splice(index, 0, moved);
  return validateVault({ ...vault, updatedAt: now, folders });
}

export function deleteFolder(vault: Vault, folderId: string): Vault {
  const target = vault.folders.find((folder) => folder.id === folderId);
  if (!target) throw new VaultError('NOT_FOUND');
  return validateVault({ ...vault,
    folders: vault.folders.filter((folder) => folder.id !== folderId).map((folder) => folder.parentId === folderId ? { ...folder, parentId: target.parentId } : folder),
    items: vault.items.map((item) => item.folderId === folderId ? { ...item, folderId: target.parentId } : item),
  });
}
