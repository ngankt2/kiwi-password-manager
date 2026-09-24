import type { Vault } from '@/domain/entities/vault';
import { canMoveFolder } from '@/domain/services/items';

export const FOLDER_DRAG_TYPE = 'application/x-appkiro-folder';
export const ITEM_DRAG_TYPE = 'application/x-appkiro-items';
export type FolderPlacement = 'before' | 'inside' | 'after';
export type FolderDestination = { parentId: string | null; beforeId: string | null };

export function folderDropDestination(vault: Vault, sourceId: string, targetId: string | null, placement: FolderPlacement): FolderDestination | null {
  if (sourceId === targetId) return null;
  const target = vault.folders.find((folder) => folder.id === targetId);
  if (targetId !== null && !target) return null;
  if (!target && placement !== 'inside') return null;
  const parentId = placement === 'inside' ? targetId : target!.parentId;
  if (!canMoveFolder(vault, sourceId, parentId)) return null;
  let beforeId: string | null = null;
  if (placement === 'before') beforeId = targetId;
  if (placement === 'after') {
    const siblings = vault.folders.filter((folder) => folder.parentId === parentId && folder.id !== sourceId);
    beforeId = siblings[siblings.findIndex((folder) => folder.id === targetId) + 1]?.id ?? null;
  }
  return { parentId, beforeId };
}
