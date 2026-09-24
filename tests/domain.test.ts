import { expect, test } from 'bun:test';
import { addFolder, createItem, createVault, deleteFolder, moveFolder, restoreVersion, saveItem } from '../src/domain/services/items';
import { searchItems, itemSubtitle, itemTags } from '../src/domain/services/search';
import { validateVault } from '../src/domain/entities/vault';
import { folderDropDestination } from '../src/features/desktop/folder-drag';

test('sidebar tags count distinct active items and match exact Unicode tag filters', () => {
  const vault = createVault('v', 'Tags');
  const tagged = (id: string, tags: string[]) => ({ ...createItem(id, 'login'), title: id, tags });
  vault.items = [tagged('a', ['Công việc', 'Công việc', 'a/b:#', '']), tagged('b', ['Công việc']),
    { ...tagged('archived', ['Archived only', 'Công việc']), archivedAt: new Date().toISOString() },
    { ...tagged('deleted', ['Deleted only', 'Công việc']), deletedAt: new Date().toISOString() }];
  const tags = itemTags(vault.items);
  expect(tags).toHaveLength(2);
  for (const { tag, count } of tags) expect(searchItems(vault, '', `tag:${tag}`)).toHaveLength(count);
  expect(tags.find(({ tag }) => tag === 'Công việc')?.count).toBe(2);
  expect(searchItems(vault, '', 'tag:a/b:#').map(({ id }) => id)).toEqual(['a']);
});

test('history restore creates a new version and retains newer history', () => {
  let vault = createVault('v', 'Vault');
  const item = { ...createItem('i', 'login'), title: 'First' };
  vault = saveItem(vault, item, 'unused');
  vault = saveItem(vault, { ...vault.items[0], title: 'Second' }, 'version1');
  vault = saveItem(vault, { ...vault.items[0], title: 'Third' }, 'version2');
  const restored = restoreVersion(vault, 'i', 'version1', 'version3');
  expect(restored.items[0].title).toBe('First');
  expect(restored.items[0].history.map((entry) => entry.id)).toEqual(['version1', 'version2', 'version3']);
  expect(restored.items[0].history[2].snapshot.title).toBe('Third');
});

test('search never indexes secrets, OTP seeds or protected custom fields', () => {
  const vault = createVault('v', 'Vault'); const item = createItem('i', 'login'); item.title = 'Example';
  item.fields[0].value = 'public-user'; item.fields[1].value = 'never-find-password'; item.fields[3].value = 'never-find-otp';
  item.fields.push({ id: 'custom', label: 'Protected field', kind: 'text', value: 'never-find-custom', protected: true });
  vault.items.push(item);
  expect(searchItems(vault, 'never-find')).toHaveLength(0);
  expect(searchItems(vault, 'public-user')).toHaveLength(1);
  expect(itemSubtitle({ ...item, fields: item.fields.filter((field) => field.protected) })).not.toContain('never-find');
});

test('nested folders reject cycles and deleting a folder preserves items and children', () => {
  let vault = addFolder(createVault('v', 'Vault'), 'work', 'Work', null);
  vault = addFolder(vault, 'dev', 'Development', 'work');
  expect(() => moveFolder(vault, 'work', 'dev')).toThrow();
  vault.items.push({ ...createItem('i', 'login', 'work'), title: 'Kept' });
  vault = deleteFolder(vault, 'work');
  expect(vault.items[0].folderId).toBeNull(); expect(vault.folders[0].parentId).toBeNull();
});

test('duplicate identifiers and dangling folders are rejected', () => {
  const vault = createVault('v', 'Vault'); const item = { ...createItem('i', 'login'), title: 'Entry' };
  expect(() => validateVault({ ...vault, items: [item, item] })).toThrow();
  expect(() => validateVault({ ...vault, items: [{ ...item, folderId: 'missing' }] })).toThrow();
});

test('folder drops reorder siblings and reparent a whole subtree without changing its items', () => {
  let vault = createVault('v', 'Folders');
  for (const id of ['a', 'b', 'c']) vault = addFolder(vault, id, id, null);
  vault = addFolder(vault, 'child', 'Child', 'a');
  vault.items.push({ ...createItem('i', 'login', 'child'), title: 'Kept' });
  const original = structuredClone(vault);
  const drop = (source: string, target: string | null, placement: 'before' | 'inside' | 'after') => {
    const destination = folderDropDestination(vault, source, target, placement);
    expect(destination).not.toBeNull();
    vault = moveFolder(vault, source, destination!.parentId, destination!.beforeId);
  };
  drop('c', 'a', 'before');
  expect(vault.folders.filter((folder) => folder.parentId === null).map((folder) => folder.id)).toEqual(['c', 'a', 'b']);
  drop('c', 'a', 'after');
  expect(vault.folders.filter((folder) => folder.parentId === null).map((folder) => folder.id)).toEqual(['a', 'c', 'b']);
  drop('a', 'b', 'inside');
  expect(vault.folders.find((folder) => folder.id === 'a')?.parentId).toBe('b');
  expect(vault.folders.find((folder) => folder.id === 'child')?.parentId).toBe('a');
  drop('a', null, 'inside');
  expect(vault.folders.filter((folder) => folder.parentId === null).map((folder) => folder.id)).toEqual(['c', 'b', 'a']);
  expect(vault.items).toEqual(original.items);
  expect(original.folders.map((folder) => folder.id)).toEqual(['a', 'b', 'c', 'child']);
});

test('folder drops reject self, descendants, missing folders and invalid sibling anchors', () => {
  let vault = addFolder(createVault('v', 'Folders'), 'parent', 'Parent', null);
  vault = addFolder(vault, 'child', 'Child', 'parent');
  vault = addFolder(vault, 'nested', 'Nested', 'child');
  for (const placement of ['before', 'inside', 'after'] as const) {
    expect(folderDropDestination(vault, 'parent', 'parent', placement)).toBeNull();
    expect(folderDropDestination(vault, 'parent', 'nested', placement)).toBeNull();
  }
  expect(folderDropDestination(vault, 'missing', null, 'inside')).toBeNull();
  expect(folderDropDestination(vault, 'child', 'missing', 'inside')).toBeNull();
  expect(() => moveFolder(vault, 'child', null, 'nested')).toThrow();
  expect(() => moveFolder(vault, 'missing', null)).toThrow();
  expect(() => moveFolder(vault, 'parent', 'child')).toThrow();
  expect(moveFolder(vault, 'child', null).folders.find((folder) => folder.id === 'child')?.parentId).toBeNull();
});
