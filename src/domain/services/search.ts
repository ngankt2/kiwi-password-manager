import { isSecret, type Vault, type VaultItem } from '../entities/vault';
import { envContent, parseEnv } from '../entities/env';

export type ItemFilter = 'all' | 'favorites' | 'recent' | 'archive' | 'trash' | `folder:${string}` | `tag:${string}`;
export type ItemSort = 'updated' | 'created' | 'title';
export const DEFAULT_ITEM_SORT: ItemSort = 'updated';

export function itemTags(items: readonly Pick<VaultItem, 'tags' | 'archivedAt' | 'deletedAt'>[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.archivedAt || item.deletedAt) continue;
    for (const tag of new Set(item.tags)) {
      if (tag.trim()) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
}

const folderPaths = new WeakMap<Vault['folders'], Map<string, string>>();
export function folderPath(vault: Vault, folderId: string | null): string {
  if (!folderId) return '';
  let paths = folderPaths.get(vault.folders);
  if (!paths) {
    paths = new Map();
    const folders = new Map(vault.folders.map((folder) => [folder.id, folder]));
    for (const folder of vault.folders) {
      const segments: string[] = []; const seen = new Set<string>();
      let current: typeof folder | undefined = folder;
      while (current && !seen.has(current.id)) {
        seen.add(current.id); segments.unshift(current.name);
        current = current.parentId ? folders.get(current.parentId) : undefined;
      }
      paths.set(folder.id, segments.join(' / '));
    }
    folderPaths.set(vault.folders, paths);
  }
  return paths.get(folderId) ?? '';
}

const normalize = (value: string) => value.normalize('NFKD').toLocaleLowerCase();
export function searchItems(vault: Vault, query: string, filter: ItemFilter = 'all', sort: ItemSort = DEFAULT_ITEM_SORT): VaultItem[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const items = vault.items.filter((item) => {
    if (filter === 'trash') { if (!item.deletedAt) return false; }
    else if (filter === 'archive') { if (item.deletedAt || !item.archivedAt) return false; }
    else if (item.deletedAt || item.archivedAt) return false;
    if (filter === 'favorites' && !item.favorite) return false;
    if (filter.startsWith('folder:') && item.folderId !== filter.slice(7)) return false;
    if (filter.startsWith('tag:') && !item.tags.includes(filter.slice(4))) return false;
    if (!terms.length) return true;
    const searchable = normalize([item.title, item.notes, ...item.tags, folderPath(vault, item.folderId),
      ...(item.type === 'env' ? parseEnv(envContent(item)).variables.map((variable) => variable.name) : []),
      ...item.fields.filter((field) => !isSecret(field)).flatMap((field) => [field.label, field.value])].join('\n'));
    return terms.every((term) => searchable.includes(term));
  });
  if (sort === 'title') return items.sort((a, b) => a.title.localeCompare(b.title));
  const dateField = sort === 'created' ? 'createdAt' : 'updatedAt';
  return items.sort((a, b) => Date.parse(b[dateField]) - Date.parse(a[dateField]));
}

export function itemSubtitle(item: VaultItem): string {
  if (item.type === 'env') return item.tags[0] ?? '.env';
  return item.fields.find((field) => ['username', 'holder', 'ssid', 'host', 'endpoint', 'website'].includes(field.id) && !isSecret(field) && field.value)?.value ?? item.tags[0] ?? 'No additional details';
}
