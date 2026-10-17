import { useMemo, useState, type ReactNode } from 'react';
import { vaultFileName } from '@/core/vault-format/file-names';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Archive, Info, ChevronDown, ChevronRight, Clock3, Folder, FolderPlus, Grid2X2, Keyboard, LockKeyhole, Plus, Search, Settings, ShieldCheck, Star, Trash2, type LucideIcon } from 'lucide-react-native';
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
    style={[styles.navItem, { paddingLeft: 10 + indent, backgroundColor: active ? colors.primary : hover ? colors.fill : 'transparent' }]}>
    {leading ?? <Icon size={19} strokeWidth={2} color={active ? colors.onPrimary : colors.primary} />}
    <T weight={active ? 'semibold' : 'regular'} style={{ flex: 1, color: active ? colors.onPrimary : colors.text, fontSize: 17 }} numberOfLines={1}>{label}</T>
    {count !== undefined && count > 0 && <T style={{ fontSize: 15, color: active ? colors.onPrimary : colors.secondary, fontVariant: ['tabular-nums'] }}>{count}</T>}
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
    <Pressable accessibilityRole="button" accessibilityLabel="Switch vault" onPress={lockVault} style={styles.vaultSwitcher}><View style={styles.vaultMark}><ShieldCheck size={18} color={colors.onPrimary} /></View><View style={{ flex: 1 }}><T weight="semibold" numberOfLines={1} style={{ fontSize: 15 }}>{vault.name}</T><T muted style={{ fontSize: 12, lineHeight: 16 }}>Personal vault</T></View><ChevronDown size={15} color={colors.secondary} /></Pressable>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 22, gap: 2 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 10, paddingBottom: 6 }}><Eyebrow>Library</Eyebrow></View>
      {nav.map((item) => <NavItem key={item.value} label={item.label} icon={item.icon} active={pathname === '/vault' && filter === item.value} count={item.value === 'all' ? active.length : item.value === 'favorites' ? active.filter((item) => item.favorite).length : undefined} onPress={() => navigateFilter(item.value)} />)}
      <View style={styles.folderHeading}><Eyebrow>Folders</Eyebrow><IconButton icon={Plus} label="Create folder" onPress={() => setCreateFolder(true)} /></View>
      {vault.folders.filter((folder) => !folder.parentId).map((folder) => <FolderBranch key={folder.id} folder={folder} level={0} filter={filter} />)}
      {!vault.folders.length && <Pressable accessibilityRole="button" onPress={() => setCreateFolder(true)} style={{ paddingHorizontal: 14, paddingVertical: 10, minHeight: 44 }}><T style={{ fontSize: 15, color: colors.primary }}>Create your first folder</T></Pressable>}
      <View style={styles.folderHeading}><Eyebrow>{t('Thẻ')}</Eyebrow>{filter.startsWith('tag:') && <Button title={t('Bỏ lọc thẻ')} small variant="ghost" onPress={() => navigateFilter('all')} />}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 12 }} accessibilityLabel={t('Lọc theo thẻ')}>
        {tags.map(({ tag, count }) => <Pressable key={tag} accessibilityRole="button" accessibilityLabel={t('Lọc theo thẻ {tag}', { tag })} accessibilityState={{ selected: filter === `tag:${tag}` }}
          onPress={() => navigateFilter(filter === `tag:${tag}` ? 'all' : `tag:${tag}`)} style={{ minHeight: 36, maxWidth: '100%', borderRadius: 999, backgroundColor: filter === `tag:${tag}` ? colors.primary : colors.fill, paddingHorizontal: 12, gap: 6, flexDirection: 'row', alignItems: 'center' }}>
          <T numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>#{tag}</T><T muted style={{ fontSize: 12 }}>{count}</T>
        </Pressable>)}
        {!tags.length && <T muted style={{ fontSize: 15 }}>{t('Chưa có thẻ.')}</T>}
      </View>
    </ScrollView>
    <View style={styles.sidebarBottom}>
      <NavItem label="Password generator" icon={KeyIcon} onPress={() => router.push('/generator')} active={pathname === '/generator'} />
      <NavItem label="Settings" icon={Settings} onPress={() => router.push('/settings')} active={pathname.startsWith('/settings')} />
      <NavItem label={t('Giới thiệu')} icon={Info} onPress={() => router.push('/about')} active={pathname === '/about'} />
      <View style={styles.fileFooter}><View style={{ flex: 1 }}><T muted numberOfLines={1} accessibilityHint={current?.location} style={{ fontSize: 13 }}>{vaultFileName(vault.name)}</T><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} /><T muted style={{ fontSize: 12 }}>Saved locally</T></View></View><IconButton icon={LockKeyhole} label="Lock vault" onPress={lockVault} /></View>
    </View><CreateFolderDialog open={createFolder} onClose={() => setCreateFolder(false)} />
  </View>;
}

const KeyIcon = Keyboard;

export function BottomNavigation() {
  const pathname = usePathname();
  return <SafeAreaView edges={['bottom']} style={styles.bottomNavigation}><View style={{ flexDirection: 'row' }}>{[
    { label: 'Vault', icon: Grid2X2, path: '/vault' as const }, { label: 'Search', icon: Search, path: '/search' as const }, { label: 'Settings', icon: Settings, path: '/settings' as const },
  ].map(({ label, icon: Icon, path }) => <Pressable key={path} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: pathname === path }} onPress={() => router.replace(path)} style={styles.bottomItem}>
    <Icon size={24} color={pathname === path ? colors.primary : colors.secondary} strokeWidth={pathname === path ? 2.2 : 1.8} /><T weight="medium" style={{ fontSize: 10, lineHeight: 12, color: pathname === path ? colors.primary : colors.secondary }}>{label}</T>
  </Pressable>)}</View></SafeAreaView>;
}

export function AppShell({ children, filter, bottomNav = true }: { children: ReactNode; filter?: ItemFilter; bottomNav?: boolean }) {
  const { mobile } = useLayout();
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.shell}><View style={{ flex: 1, flexDirection: 'row' }}>{!mobile && <Sidebar filter={filter} />}<View style={{ flex: 1, minWidth: 0 }}>{children}</View></View>{mobile && bottomNav && <BottomNavigation />}</SafeAreaView>;
}
const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background }, sidebar: { width: layout.sidebar, backgroundColor: colors.surface, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  vaultSwitcher: { marginHorizontal: 14, padding: 10, gap: 10, backgroundColor: colors.elevated, borderRadius: 14, flexDirection: 'row', alignItems: 'center', minHeight: 56 }, vaultMark: { height: 32, width: 32, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  navItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 12, borderRadius: 10 },
  folderHeading: { marginTop: 22, marginBottom: 4, paddingLeft: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sidebarBottom: { paddingHorizontal: 12, paddingTop: 12 },
  fileFooter: { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 12, paddingBottom: 14, paddingLeft: 10, flexDirection: 'row', gap: 6, alignItems: 'center' },
  bottomNavigation: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.chrome }, bottomItem: { flex: 1, minHeight: 52, paddingTop: 7, paddingBottom: 3, alignItems: 'center', justifyContent: 'center', gap: 3 },
});
