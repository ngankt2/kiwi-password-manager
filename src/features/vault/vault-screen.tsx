import { useConfirmation } from '@/shared/hooks/use-confirmation';
import { useI18n } from '@/shared/hooks/use-i18n';
import { memo, useDeferredValue, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDownWideNarrow, Check, CheckSquare, Folder, FolderInput, Inbox, LockKeyhole, MoreHorizontal, Plus, Search, SlidersHorizontal, Square, Star, Trash2, X } from 'lucide-react-native';
import { Button, Chip, Dialog, EmptyState, Eyebrow, IconButton, Input, Select, T } from '@/design-system/components/ui';
import { colors, fonts, layout } from '@/design-system/tokens';
import { BrandSymbol } from '@/design-system/components/brand-symbol';
import { ITEM_TYPES, type VaultItem, type ItemType } from '@/domain/entities/vault';
import { TYPE_LABELS } from '@/domain/entities/templates';
import { DEFAULT_ITEM_SORT, searchItems, itemSubtitle, type ItemFilter, type ItemSort } from '@/domain/services/search';
import { deleteFolder, moveFolder, updateItems } from '@/domain/services/items';
import { useLayout } from '@/shared/hooks/use-layout';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { session } from '@/infrastructure/session';
import { ItemIcon } from '@/features/items/item-icon';
import { DetailPanel } from '@/features/items/detail-panel';
import { AppShell, CreateFolderDialog, lockVault, navigateFilter } from './app-shell';

export function NewItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Dialog open={open} title="What would you like to save?" description="A little less to remember. A little more peace of mind." onClose={onClose}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{ITEM_TYPES.map((type) => <Pressable key={type} accessibilityRole="button" accessibilityLabel={`New ${TYPE_LABELS[type]}`} onPress={() => { onClose(); router.push({ pathname: '/item/new', params: { type } }); }} style={({ pressed }) => [styles.typeTile, pressed && { backgroundColor: colors.fill }]}><ItemIcon type={type} /><T weight="medium" style={{ fontSize: 15 }}>{TYPE_LABELS[type]}</T></Pressable>)}</View>
  </Dialog>;
}

const ItemRow = memo(function ItemRow({ item, active, selected, selecting, compact, onPress, onActions }: { item: VaultItem; active: boolean; selected: boolean; selecting: boolean; compact: boolean; onPress: () => void; onActions: () => void }) {
  const { t, compactDateTime, dateTime } = useI18n();
  const [hovered, setHovered] = useState(false);
  return <Pressable accessibilityRole={selecting ? 'checkbox' : 'button'} accessibilityLabel={`${item.title}, ${TYPE_LABELS[item.type]}`} accessibilityHint={t('Cập nhật gần nhất') + ': ' + dateTime(item.updatedAt)} accessibilityState={selecting ? { checked: selected } : { selected: active }} onPress={onPress} onLongPress={onActions}
    onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={({ pressed }) => [styles.itemRow, compact && { paddingVertical: 6, minHeight: 56 }, { backgroundColor: active ? colors.selected : hovered || pressed ? colors.fill : 'transparent' }]}>
    {selecting ? selected ? <CheckSquare size={22} color={colors.primary} /> : <Square size={22} color={colors.secondary} /> : <ItemIcon type={item.type} metadata={item.metadata} />}
    <View style={{ flex: 1, gap: 2, minWidth: 0 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><T weight="semibold" numberOfLines={1} style={{ fontSize: 17, flexShrink: 1 }}>{item.title || 'Untitled'}</T>{item.favorite && <Star size={12} fill={colors.favorite} color={colors.favorite} />}</View><T muted numberOfLines={1} style={{ fontSize: 15, lineHeight: 20 }}>{itemSubtitle(item)}</T></View>
    <T muted style={{ flexShrink: 0, alignSelf: 'flex-start', fontSize: 13, lineHeight: 22, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{compactDateTime(item.updatedAt)}</T>
    {hovered && !selecting && <IconButton icon={MoreHorizontal} label={`Actions for ${item.title}`} onPress={onActions} />}
  </Pressable>;
});

export function VaultScreen({ search = false, detailId }: { search?: boolean; detailId?: string }) {
  const { filter = 'all' } = useLocalSearchParams<{ filter?: string }>();
  return <VaultScreenContent key={filter} search={search} detailId={detailId} />;
}

function VaultScreenContent({ search, detailId }: { search: boolean; detailId?: string }) {
  const { t } = useI18n();
  const { confirm: confirmRemoval, confirmationDialog } = useConfirmation();
  const state = useSession(); const { mobile, desktop } = useLayout(); const { run, pending } = useAction();
  const params = useLocalSearchParams<{ filter?: string; item?: string }>();
  const [query, setQuery] = useState(''); const deferredQuery = useDeferredValue(query);
  const [sort, setSort] = useState<ItemSort>(DEFAULT_ITEM_SORT); const [sortDialog, setSortDialog] = useState(false); const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all'); const [filterDialog, setFilterDialog] = useState(false);
  const sortOptions: { value: ItemSort; label: string }[] = [{ value: 'updated', label: t('Cập nhật gần nhất') }, { value: 'created', label: t('Ngày tạo') }, { value: 'title', label: t('Tên') }];
  const [newItem, setNewItem] = useState(false); const [newFolder, setNewFolder] = useState(false); const [selecting, setSelecting] = useState(false); const [selected, setSelected] = useState<string[]>([]);
  const [actions, setActions] = useState<VaultItem | null>(null); const [bulkMove, setBulkMove] = useState(false); const [destination, setDestination] = useState(''); const [folderMenu, setFolderMenu] = useState(false); const [folderName, setFolderName] = useState('');
  const input = useRef<TextInput>(null);
  const vault = state.vault;
  const filter = (params.filter && (['all', 'favorites', 'recent', 'archive', 'trash'].includes(params.filter) || params.filter.startsWith('folder:') || params.filter.startsWith('tag:')) ? params.filter : 'all') as ItemFilter;
  const found = vault ? searchItems(vault, deferredQuery, filter, sort).filter((item) => typeFilter === 'all' || item.type === typeFilter) : [];
  const activeId = detailId ?? params.item ?? (desktop && !selecting ? found[0]?.id : undefined);
  const active = vault?.items.find((item) => item.id === activeId);
  const currentFolder = filter.startsWith('folder:') ? vault?.folders.find((folder) => folder.id === filter.slice(7)) : null;
  const title = search ? 'Search' : currentFolder?.name ?? (filter.startsWith('tag:') ? filter.slice(4) : ({ all: 'All items', favorites: 'Favorites', recent: 'Recently updated', archive: 'Archive', trash: 'Trash' } as Record<string, string>)[filter] ?? 'All items');

  useEffect(() => { if (search) input.current?.focus(); }, [search]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const focus = () => input.current?.focus();
    document.addEventListener('kiro:search', focus); return () => document.removeEventListener('kiro:search', focus);
  }, []);
  if (!vault) return null;
  const openItem = (item: VaultItem) => {
    if (selecting) { setSelected((selected) => selected.includes(item.id) ? selected.filter((id) => id !== item.id) : [...selected, item.id]); return; }
    if (desktop) router.setParams({ item: item.id });
    else router.push({ pathname: '/item/[id]', params: { id: item.id } });
  };
  const bulk = (patch: Parameters<typeof updateItems>[2]) => run(async () => { await session.mutate((vault) => updateItems(vault, selected, patch, () => session.id())); setSelected([]); setSelecting(false); setBulkMove(false); });

  return <AppShell filter={filter}>
    <View style={{ flex: 1, flexDirection: 'row' }}><View style={[styles.listPane, desktop ? { width: layout.list, borderRightWidth: 1 } : { flex: 1 }]}>
      {mobile && <View style={styles.mobileTop}><View style={{ marginRight: 12 }}><BrandSymbol size={36} /></View><View style={{ flex: 1, gap: 0 }}><T muted style={{ fontSize: 13 }}>Kiwi Password</T><T weight="semibold" numberOfLines={1} style={{ fontSize: 17 }}>{vault.name}</T></View><IconButton icon={LockKeyhole} label="Lock vault" onPress={lockVault} /></View>}
      <View style={[styles.listHeader, mobile && { paddingTop: 6 }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 }}><View style={{ flex: 1 }}><T weight="bold" numberOfLines={1} style={{ fontSize: mobile ? 34 : 22, lineHeight: mobile ? 41 : 28, letterSpacing: mobile ? 0.4 : -0.3 }}>{title}</T><T muted style={{ fontSize: 13 }}>{t('{count} mục', { count: found.length })}</T></View>{!mobile && <Button title="New" icon={Plus} small onPress={() => setNewItem(true)} />}{currentFolder && <IconButton icon={MoreHorizontal} label="Folder actions" onPress={() => { setFolderName(currentFolder.name); setDestination(currentFolder.parentId ?? ''); setFolderMenu(true); }} />}</View>
        <View style={styles.searchBox}><Search size={17} color={colors.secondary} strokeWidth={2.2} /><TextInput ref={input} accessibilityLabel="Search vault" value={query} onChangeText={setQuery} placeholder="Search your vault…" placeholderTextColor={colors.muted} autoCorrect={false} autoCapitalize="none" style={styles.searchInput} />
          {query ? <IconButton icon={X} label="Clear search" onPress={() => setQuery('')} /> : !mobile ? <View style={styles.shortcut}><T muted style={{ fontSize: 10 }}>⌘ K</T></View> : null}
        </View>
        {mobile && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12 }}><Chip label="All items" selected={filter === 'all'} onPress={() => navigateFilter('all')} /><Chip label="Favorites" icon={Star} selected={filter === 'favorites'} onPress={() => navigateFilter('favorites')} /><Chip label="Recent" selected={filter === 'recent'} onPress={() => navigateFilter('recent')} /><Chip label="Archive" selected={filter === 'archive'} onPress={() => navigateFilter('archive')} /><Chip label="Trash" selected={filter === 'trash'} onPress={() => navigateFilter('trash')} /></ScrollView>}
      </View>
      <View style={styles.listMeta}><T muted style={{ flex: 1, fontSize: 13 }}>{selecting ? t('Đã chọn {count}', { count: selected.length }) : `${t('Sắp xếp theo')}: ${sortOptions.find((option) => option.value === sort)?.label}`}</T><IconButton icon={selecting ? CheckSquare : Square} label={selecting ? 'Cancel selection' : 'Select items'} active={selecting} onPress={() => { setSelecting(!selecting); setSelected([]); }} /><IconButton icon={ArrowDownWideNarrow} label={t('Sắp xếp danh sách')} onPress={() => setSortDialog(true)} /><IconButton icon={SlidersHorizontal} label="Filter item types" active={typeFilter !== 'all'} onPress={() => setFilterDialog(true)} /></View>
      <FlatList data={found} keyExtractor={(item) => item.id} initialNumToRender={20} maxToRenderPerBatch={20} windowSize={7} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.rows, found.length === 0 && { flexGrow: 1 }]} renderItem={({ item }) => <ItemRow item={item} active={activeId === item.id && desktop} selected={selected.includes(item.id)} selecting={selecting} compact={state.settings.compactRows} onPress={() => openItem(item)} onActions={() => setActions(item)} />}
        ListHeaderComponent={mobile && !query && filter === 'all' ? <View style={{ paddingHorizontal: 9, paddingBottom: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Eyebrow>Folders</Eyebrow><IconButton icon={Plus} label="Create folder" onPress={() => setNewFolder(true)} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{vault.folders.filter((folder) => !folder.parentId).map((folder) => <Chip key={folder.id} label={folder.name} icon={Folder} onPress={() => navigateFilter(`folder:${folder.id}`)} />)}{!vault.folders.length && <T muted style={{ fontSize: 15 }}>Keep things organized. Add a folder.</T>}</ScrollView></View> : null}
        ListEmptyComponent={<EmptyState icon={query ? Search : Inbox} title={query ? 'Nothing here just yet' : filter === 'all' ? 'Your vault, a fresh start' : 'A little breathing room'} detail={query ? 'Try a different name, username, website, or tag.' : filter === 'all' ? 'Add your first login, note, or secret. It will be encrypted inside your vault.' : 'Items in this collection will appear here.'} action={!query && filter === 'all' ? <Button title="Add your first item" icon={Plus} onPress={() => setNewItem(true)} /> : undefined} />}
      />
      {selecting && selected.length > 0 ? <View style={styles.bulkBar}><IconButton icon={Check} label="Select all visible items" onPress={() => setSelected(found.map((item) => item.id))} /><IconButton icon={Star} label="Favorite selected items" onPress={() => bulk({ favorite: true })} /><IconButton icon={FolderInput} label="Move selected items" onPress={() => setBulkMove(true)} /><IconButton icon={Trash2} label="Trash selected items" danger onPress={() => confirmRemoval({ title: t('Chuyển vào Thùng rác?'), description: t('Chuyển {count} mục vào Thùng rác. Bạn có thể khôi phục các mục này bất cứ lúc nào trước khi xoá vĩnh viễn.', { count: selected.length }), confirmLabel: t('Chuyển vào Thùng rác'), onConfirm: () => bulk({ deletedAt: new Date().toISOString() }) })} /></View> : <View style={styles.listFooter}><View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: colors.success }} /><T muted style={{ fontSize: 12 }}>{state.busy ? 'Saving changes…' : `${found.length} ${found.length === 1 ? 'item' : 'items'} · Stored on this device`}</T></View>}
      {mobile && <Pressable accessibilityRole="button" accessibilityLabel="New item" onPress={() => setNewItem(true)} style={styles.fab}><Plus size={26} strokeWidth={2.4} color={colors.onPrimary} /></Pressable>}
    </View>{desktop && <View style={{ flex: 1, minWidth: 0 }}><DetailPanel key={active?.id ?? 'empty'} item={active} /></View>}</View>
    <NewItemDialog open={newItem} onClose={() => setNewItem(false)} /><CreateFolderDialog open={newFolder} onClose={() => setNewFolder(false)} initialParent={currentFolder?.id} />
    <Dialog open={sortDialog} title={t('Sắp xếp theo')} onClose={() => setSortDialog(false)}>
      {sortOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: sort === option.value }} onPress={() => { setSort(option.value); setSortDialog(false); }} style={[styles.sortOption, sort === option.value && { backgroundColor: colors.fill }]}>
        <T style={{ flex: 1 }}>{option.label}</T>{sort === option.value && <Check size={18} color={colors.primary} />}
      </Pressable>)}
    </Dialog>
    <Dialog open={filterDialog} title="Show item types" onClose={() => setFilterDialog(false)}><Select label="Item type" value={typeFilter} onChange={(value) => { setTypeFilter(value as ItemType | 'all'); setFilterDialog(false); }} options={[{ label: 'All types', value: 'all' }, ...ITEM_TYPES.map((type) => ({ label: TYPE_LABELS[type], value: type }))]} /></Dialog>
    <Dialog open={actions !== null} title={actions?.title ?? 'Item actions'} onClose={() => setActions(null)}>{actions && <><Button title="Open item" variant="secondary" onPress={() => { openItem(actions); setActions(null); }} /><Button title={actions.favorite ? 'Remove favorite' : 'Add favorite'} icon={Star} variant="secondary" onPress={() => run(async () => { await session.mutate((vault) => updateItems(vault, [actions.id], { favorite: !actions.favorite }, () => session.id())); setActions(null); })} /><Button title={actions.deletedAt ? 'Restore item' : 'Move to Trash'} icon={Trash2} variant="danger" onPress={() => { const item = actions; setActions(null); const apply = () => session.mutate((vault) => updateItems(vault, [item.id], { deletedAt: item.deletedAt ? null : new Date().toISOString() }, () => session.id())); if (item.deletedAt) run(apply); else confirmRemoval({ title: t('Chuyển vào Thùng rác?'), description: t('Chuyển {count} mục vào Thùng rác. Bạn có thể khôi phục các mục này bất cứ lúc nào trước khi xoá vĩnh viễn.', { count: 1 }), confirmLabel: t('Chuyển vào Thùng rác'), onConfirm: apply }); }} /></>}</Dialog>
    <Dialog open={bulkMove} title="Move selected items" onClose={() => setBulkMove(false)} footer={<Button title="Move items" loading={pending} onPress={() => bulk({ folderId: destination || null })} />}><Select label="Destination folder" value={destination} onChange={setDestination} options={[{ label: 'No folder', value: '' }, ...vault.folders.map((folder) => ({ label: folder.name, value: folder.id }))]} /></Dialog>
    <Dialog open={folderMenu} title="Folder settings" description="Removing a folder moves its items and child folders to its parent." onClose={() => setFolderMenu(false)} footer={<><Button title="Remove folder" variant="danger" disabled={!currentFolder} onPress={() => { if (!currentFolder) return; setFolderMenu(false); confirmRemoval({ title: t('Xoá thư mục?'), description: t('Các mục trong “{name}” sẽ được chuyển lên thư mục cha.', { name: currentFolder.name }), confirmLabel: t('Xoá thư mục'), onConfirm: async () => { await session.mutate((vault) => deleteFolder(vault, currentFolder.id)); navigateFilter('all'); } }); }} /><Button title="Save folder" disabled={!folderName.trim()} onPress={() => run(async () => { if (!currentFolder) return; await session.mutate((vault) => moveFolder({ ...vault, folders: vault.folders.map((folder) => folder.id === currentFolder.id ? { ...folder, name: folderName.trim() } : folder) }, currentFolder.id, destination || null)); setFolderMenu(false); })} /></>}><Input label="Folder name" value={folderName} onChangeText={setFolderName} /><Select label="Parent folder" value={destination} onChange={setDestination} options={[{ label: 'Vault root', value: '' }, ...vault.folders.filter((folder) => folder.id !== currentFolder?.id).map((folder) => ({ label: folder.name, value: folder.id }))]} /></Dialog>
    {confirmationDialog}
  </AppShell>;
}
const styles = StyleSheet.create({
  listPane: { backgroundColor: colors.background, borderColor: colors.border }, listHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  searchBox: { minHeight: 40, borderRadius: 12, backgroundColor: colors.fill, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 4, gap: 6 }, searchInput: { flex: 1, minWidth: 0, fontFamily: fonts.regular, color: colors.text, fontSize: 17, paddingVertical: 8, outlineWidth: 0 }, shortcut: { borderRadius: 6, backgroundColor: colors.fill, paddingHorizontal: 6, height: 22, justifyContent: 'center', marginRight: 6 },
  listMeta: { flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 8, minHeight: 44 }, rows: { paddingHorizontal: 12, paddingBottom: 110, gap: 2 }, itemRow: { minHeight: 64, paddingVertical: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12 },
  sortOption: { minHeight: 50, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  listFooter: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, bulkBar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.chrome, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mobileTop: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center' }, fab: { position: 'absolute', right: 20, bottom: 56, backgroundColor: colors.primary, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px rgba(0,0,0,0.4)' }, typeTile: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', minHeight: 64, padding: 12, gap: 12, backgroundColor: colors.elevated, borderRadius: 14 },
});
