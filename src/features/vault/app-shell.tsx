import { useMemo, useState, type ReactNode } from 'react';
import { vaultFileName } from '@/core/vault-format/file-names';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Archive, ChevronDown, ChevronRight, Clock3, Folder, FolderPlus, Grid2X2, Keyboard, LockKeyhole, Plus, Search, Settings, ShieldCheck, Star, Trash2, type LucideIcon } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout } from '@/design-system/tokens';
import { Button, Dialog, Eyebrow, IconButton, Input, Logo, Select, T } from '@/design-system/components/ui';
import { useLayout } from '@/shared/hooks/use-layout';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useI18n } from '@/shared/hooks/use-i18n';
import { session } from '@/infrastructure/session';
import { clipboard } from '@/infrastructure/clipboard';
import { addFolder, canMoveFolder, moveFolder } from '@/domain/services/items';
import { randomItemColor, withItemColor } from '@/domain/entities/item-icon';
import { ItemIcon } from '@/features/items/item-icon';
import { ItemIconPicker } from '@/features/items/item-icon-picker';
import { itemTags, type ItemFilter } from '@/domain/services/search';
import type { Folder as FolderEntity } from '@/domain/entities/vault';

const nav: { label: string; value: ItemFilter; icon: LucideIcon }[] = [
  { label: 'All items', value: 'all', icon: Grid2X2 }, { label: 'Favorites', value: 'favorites', icon: Star },
  { label: 'Recent', value: 'recent', icon: Clock3 }, { label: 'Archive', value: 'archive', icon: Archive }, { label: 'Trash', value: 'trash', icon: Trash2 },
];
export function lockVault() { session.lock(); void clipboard.clear().catch(() => undefined); router.replace('/'); }
export function navigateFilter(filter: ItemFilter) { router.push({ pathname: '/vault', params: { filter } }); }

function NavItem({ label, icon: Icon, active, count, onPress, indent = 0, leading }: { label: string; icon: LucideIcon; active?: boolean; count?: number; onPress: () => void; indent?: number; leading?: ReactNode }) {
  const [hover, setHover] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
    style={[styles.navItem, { paddingLeft: 14 + indent, backgroundColor: active ? colors.elevated : hover ? '#202020' : 'transparent' }]}>
    {active && <View style={styles.activeBar} />}{leading ?? <Icon size={17} strokeWidth={1.7} color={active ? colors.primary : colors.secondary} />}
    <T weight={active ? 'semibold' : 'regular'} style={{ flex: 1, color: active ? colors.text : '#B9B9B9', fontSize: 13 }} numberOfLines={1}>{label}</T>
    {count !== undefined && count > 0 && <T style={{ fontSize: 11, color: active ? '#D0D0D0' : colors.muted }}>{count}</T>}
  </Pressable>;
}

export function CreateFolderDialog({ open, onClose, initialParent = '', folder }: { open: boolean; onClose: () => void; initialParent?: string; folder?: FolderEntity }) {
  const { t } = useI18n();
  return <Dialog open={open} title={t(folder ? 'Sửa thư mục' : 'Thư mục mới')} onClose={onClose}>
    {open && <NativeFolderForm folder={folder} initialParent={initialParent} onClose={onClose} />}
  </Dialog>;
}

function NativeFolderForm({ folder, initialParent, onClose }: { folder?: FolderEntity; initialParent: string; onClose: () => void }) {
  const { t } = useI18n();
  const { vault } = useSession();
  const { pending, run } = useAction();
  const [name, setName] = useState(folder?.name ?? '');
  const [parent, setParent] = useState(folder?.parentId ?? initialParent);
  const [metadata, setMetadata] = useState(() => folder?.metadata ?? withItemColor({}, randomItemColor()));
  if (!vault) return null;
  const submit = () => run(async () => {
    await session.mutate((current) => folder
      ? moveFolder({ ...current, folders: current.folders.map((entry) => entry.id === folder.id ? { ...entry, name: name.trim(), metadata } : entry) }, folder.id, parent || null)
      : addFolder(current, session.id(), name, parent || null, undefined, metadata));
    onClose();
  });
  return <View style={{ gap: 18 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><ItemIconPicker item={{ type: 'custom', metadata }} folder onChange={setMetadata} /><T muted>{t('Biểu tượng và màu')}</T></View>
    <Input label={t('Tên thư mục')} value={name} onChangeText={setName} autoFocus autoCapitalize="words" maxLength={4096} placeholder={t('Ví dụ: Công việc')} />
    <Select label={t('Thư mục cha')} value={parent} onChange={setParent} options={[{ label: t('Vault gốc'), value: '' }, ...vault.folders.filter((entry) => !folder || canMoveFolder(vault, folder.id, entry.id)).map((entry) => ({ label: entry.name, value: entry.id }))]} />
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}><Button title={t('Huỷ')} variant="ghost" onPress={onClose} /><Button title={t(folder ? 'Lưu' : 'Tạo thư mục')} icon={FolderPlus} loading={pending} disabled={!name.trim()} onPress={submit} /></View>
  </View>;
}

function FolderBranch({ folder, level, filter }: { folder: FolderEntity; level: number; filter: ItemFilter }) {
  const { t } = useI18n();
  const { vault } = useSession(); const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const children = vault?.folders.filter((candidate) => candidate.parentId === folder.id) ?? [];
  return <View><View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><NavItem label={folder.name} icon={Folder} leading={<ItemIcon type="custom" metadata={folder.metadata} folder size={24} />} active={filter === `folder:${folder.id}`} onPress={() => navigateFilter(`folder:${folder.id}`)} indent={level * 13} /></View>
    <IconButton icon={Settings} label={`${t('Sửa thư mục')}: ${folder.name}`} onPress={() => setEditing(true)} />
    {children.length > 0 && <IconButton icon={expanded ? ChevronDown : ChevronRight} label={`${expanded ? 'Collapse' : 'Expand'} ${folder.name}`} onPress={() => setExpanded(!expanded)} />}</View>
    {expanded && children.map((child) => <FolderBranch key={child.id} folder={child} level={level + 1} filter={filter} />)}
    <CreateFolderDialog open={editing} folder={folder} onClose={() => setEditing(false)} />
  </View>;
}

export function Sidebar({ filter = 'all' }: { filter?: ItemFilter }) {
  const { vault, current } = useSession(); const [createFolder, setCreateFolder] = useState(false); const pathname = usePathname();
  const { t } = useI18n();
  const tags = useMemo(() => itemTags(vault?.items ?? []), [vault?.items]);
  if (!vault) return null;
  const active = vault.items.filter((item) => !item.archivedAt && !item.deletedAt);
  return <View style={styles.sidebar}>
    <View style={{ paddingHorizontal: 19, paddingTop: 24, paddingBottom: 28 }}><Logo small /></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Switch vault" onPress={lockVault} style={styles.vaultSwitcher}><View style={styles.vaultMark}><ShieldCheck size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><T weight="semibold" numberOfLines={1} style={{ fontSize: 13 }}>{vault.name}</T><T muted style={{ fontSize: 10, lineHeight: 16 }}>Personal vault</T></View><ChevronDown size={15} color={colors.secondary} /></Pressable>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 22, gap: 2 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}><Eyebrow>LIBRARY</Eyebrow></View>
      {nav.map((item) => <NavItem key={item.value} label={item.label} icon={item.icon} active={pathname === '/vault' && filter === item.value} count={item.value === 'all' ? active.length : item.value === 'favorites' ? active.filter((item) => item.favorite).length : undefined} onPress={() => navigateFilter(item.value)} />)}
      <View style={styles.folderHeading}><Eyebrow>FOLDERS</Eyebrow><IconButton icon={Plus} label="Create folder" onPress={() => setCreateFolder(true)} /></View>
      {vault.folders.filter((folder) => !folder.parentId).map((folder) => <FolderBranch key={folder.id} folder={folder} level={0} filter={filter} />)}
      {!vault.folders.length && <Pressable accessibilityRole="button" onPress={() => setCreateFolder(true)} style={{ paddingHorizontal: 14, paddingVertical: 10, minHeight: 44 }}><T muted style={{ fontSize: 12 }}>Create your first folder</T></Pressable>}
      <View style={styles.folderHeading}><Eyebrow>{t('Thẻ')}</Eyebrow>{filter.startsWith('tag:') && <Button title={t('Bỏ lọc thẻ')} small variant="ghost" onPress={() => navigateFilter('all')} />}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 12 }} accessibilityLabel={t('Lọc theo thẻ')}>
        {tags.map(({ tag, count }) => <Pressable key={tag} accessibilityRole="button" accessibilityLabel={t('Lọc theo thẻ {tag}', { tag })} accessibilityState={{ selected: filter === `tag:${tag}` }}
          onPress={() => navigateFilter(filter === `tag:${tag}` ? 'all' : `tag:${tag}`)} style={{ minHeight: 44, maxWidth: '100%', borderWidth: 1, borderRadius: 9, borderColor: filter === `tag:${tag}` ? colors.primary : colors.border, backgroundColor: filter === `tag:${tag}` ? colors.elevated : 'transparent', paddingHorizontal: 9, gap: 6, flexDirection: 'row', alignItems: 'center' }}>
          <T numberOfLines={1} style={{ fontSize: 12, flexShrink: 1 }}>#{tag}</T><T muted style={{ fontSize: 10 }}>{count}</T>
        </Pressable>)}
        {!tags.length && <T muted style={{ fontSize: 12 }}>{t('Chưa có thẻ.')}</T>}
      </View>
    </ScrollView>
    <View style={styles.sidebarBottom}>
      <NavItem label="Password generator" icon={KeyIcon} onPress={() => router.push('/generator')} active={pathname === '/generator'} />
      <NavItem label="Settings" icon={Settings} onPress={() => router.push('/settings')} active={pathname.startsWith('/settings')} />
      <View style={styles.fileFooter}><View style={{ flex: 1 }}><T muted numberOfLines={1} accessibilityHint={current?.location} style={{ fontSize: 11 }}>{vaultFileName(vault.name)}</T><View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><View style={{ width: 4, height: 4, borderRadius: 3, backgroundColor: colors.primary }} /><T muted style={{ fontSize: 9 }}>Saved locally</T></View></View><IconButton icon={LockKeyhole} label="Lock vault" onPress={lockVault} /></View>
    </View><CreateFolderDialog open={createFolder} onClose={() => setCreateFolder(false)} />
  </View>;
}

const KeyIcon = Keyboard;

export function BottomNavigation() {
  const pathname = usePathname();
  return <SafeAreaView edges={['bottom']} style={styles.bottomNavigation}><View style={{ flexDirection: 'row' }}>{[
    { label: 'Vault', icon: Grid2X2, path: '/vault' as const }, { label: 'Search', icon: Search, path: '/search' as const }, { label: 'Settings', icon: Settings, path: '/settings' as const },
  ].map(({ label, icon: Icon, path }) => <Pressable key={path} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: pathname === path }} onPress={() => router.replace(path)} style={styles.bottomItem}>
    <Icon size={20} color={pathname === path ? colors.primary : colors.secondary} strokeWidth={1.8} /><T style={{ fontSize: 10, color: pathname === path ? colors.text : colors.secondary }}>{label}</T>
  </Pressable>)}</View></SafeAreaView>;
}

export function AppShell({ children, filter, bottomNav = true }: { children: ReactNode; filter?: ItemFilter; bottomNav?: boolean }) {
  const { mobile } = useLayout();
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.shell}><View style={{ flex: 1, flexDirection: 'row' }}>{!mobile && <Sidebar filter={filter} />}<View style={{ flex: 1, minWidth: 0 }}>{children}</View></View>{mobile && bottomNav && <BottomNavigation />}</SafeAreaView>;
}
const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background }, sidebar: { width: layout.sidebar, backgroundColor: colors.surface, borderRightWidth: 1, borderColor: colors.border },
  vaultSwitcher: { marginHorizontal: 17, padding: 11, gap: 10, borderWidth: 1, borderColor: colors.strong, borderRadius: 10, flexDirection: 'row', alignItems: 'center', minHeight: 59 }, vaultMark: { height: 33, width: 30, alignItems: 'center', justifyContent: 'center' },
  navItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 13, borderRadius: 7 }, activeBar: { position: 'absolute', left: 0, width: 3, height: 16, borderRadius: 3, backgroundColor: colors.primary },
  folderHeading: { marginTop: 24, marginBottom: 5, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sidebarBottom: { paddingHorizontal: 12, paddingTop: 18 },
  fileFooter: { marginTop: 14, borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, paddingBottom: 17, paddingLeft: 13, flexDirection: 'row', gap: 6, alignItems: 'center' },
  bottomNavigation: { borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, bottomItem: { flex: 1, minHeight: 62, paddingTop: 9, paddingBottom: 5, alignItems: 'center', justifyContent: 'center', gap: 3 },
});
