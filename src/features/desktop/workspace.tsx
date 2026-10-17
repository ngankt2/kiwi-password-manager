import { useI18n } from '@/shared/hooks/use-i18n';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { ITEM_TYPES, isSecret, type Folder, type VaultItem } from '@/domain/entities/vault';
import { moveFolder, saveItem, updateItems } from '@/domain/services/items';
import { DEFAULT_ITEM_SORT, folderPath, itemSubtitle, itemTags, searchItems, type ItemFilter, type ItemSort } from '@/domain/services/search';
import { session } from '@/infrastructure/session';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useConfirmation } from '@/shared/hooks/use-confirmation';
import { DesktopFrame, TrafficLights } from './frame';
import { useDesktopPreferences } from './preferences';
import { lockVault, useSecretActions } from './actions';
import { Detail } from './detail';
import { DesktopGenerator } from './generator';
import { DeleteFolderDialog, FolderDialog, FolderSelect, FolderTree } from './folders';
import { folderDropDestination, type FolderDestination, type FolderPlacement } from './folder-drag';
import { SearchPalette } from './search';
import { useLabels } from './labels';
import { Button, Dialog, EmptyState, Icon, IconButton, ItemTile, Menu, MenuItem, menuAnchor, type MenuAnchor } from './ui';
import { BrandSymbol } from '@/design-system/components/brand-symbol';
import { useDesktopUpdates } from './updates';
import { TagCloud } from './tag-cloud';

const navigation: { filter: ItemFilter; title: string; icon: string }[] = [
  { filter: 'all', title: 'Tất cả mục', icon: 'stacks' },
  { filter: 'favorites', title: 'Yêu thích', icon: 'star' },
  { filter: 'recent', title: 'Gần đây', icon: 'schedule' },
  { filter: 'archive', title: 'Mục lưu trữ', icon: 'archive' },
  { filter: 'trash', title: 'Thùng rác', icon: 'delete' },
];
type WorkspaceActions = {
  navigate: (action: () => void) => void;
  setDirty: (value: boolean) => void;
  openItem: (id: string) => void;
  backToList: () => void;
  createFolder: (parent?: string) => void;
};
const Context = createContext<WorkspaceActions | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Workspace is unavailable.');
  return value;
}
type ActiveMenu = { kind: 'new' | 'item' | 'folder' | 'list'; anchor: MenuAnchor; id?: string } | null;
function validFilter(value?: string): value is ItemFilter {
  return !!value && (navigation.some((entry) => entry.filter === value) || value.startsWith('folder:') || value.startsWith('tag:'));
}

function Resizer({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (value: number) => void; label: string }) {
  const start = useRef<{ x: number; value: number } | null>(null);
  const update = (next: number) => onChange(Math.round(Math.max(min, Math.min(max, next))));
  return <div className="desktop-resizer" role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
    onPointerDown={(event) => { event.preventDefault(); start.current = { x: event.clientX, value }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => { if (start.current) update(start.current.value + event.clientX - start.current.x); }}
    onPointerUp={(event) => { start.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { start.current = null; }}
    onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); update(value + (event.key === 'ArrowRight' ? 10 : -10)); } }} />;
}

export function DesktopWorkspace({ children, detailId, search = false, fullWidth = false, filter: filterProp }: {
  children?: ReactNode; detailId?: string; search?: boolean; fullWidth?: boolean; filter?: ItemFilter;
}) {
  const { t, text } = useI18n();
  const { itemTypes, compactDateTime, dateTime } = useLabels();
  const state = useSession();
  const preferences = useDesktopPreferences();
  const params = useLocalSearchParams<{ filter?: string; item?: string; id?: string }>();
  const pathname = usePathname();
  const { run, pending } = useAction();
  const { confirm, confirmationDialog } = useConfirmation();
  const { copy, authDialog } = useSecretActions();
  const [menu, setMenu] = useState<ActiveMenu>(null);
  const [palette, setPalette] = useState(search);
  const [generator, setGenerator] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [flyout, setFlyout] = useState<'folders' | 'tags' | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ parent?: string; folder?: Folder; editAppearance?: boolean } | null>(null);
  const [deleteFolder, setDeleteFolder] = useState<Folder | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [move, setMove] = useState<string[] | null>(null);
  const [destination, setDestination] = useState('');
  const [permanent, setPermanent] = useState<string[] | null>(null);
  const [sort, setSort] = useState<ItemSort>(DEFAULT_ITEM_SORT);
  const [dirty, setDirty] = useState(false);
  const updates = useDesktopUpdates();
  const registerRestartGuard = updates?.registerRestartGuard;
  useEffect(() => registerRestartGuard?.(() => !dirty), [dirty, registerRestartGuard]);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const newButton = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const vault = state.vault;
  const tags = useMemo(() => itemTags(vault?.items ?? []), [vault?.items]);
  const filter = filterProp ?? (validFilter(params.filter) ? params.filter : preferences.filter);
  const found = useMemo(() => vault ? searchItems(vault, '', filter, sort) : [], [vault, filter, sort]);
  const activeId = detailId ?? params.id ?? params.item;
  const active = vault?.items.find((item) => item.id === activeId);
  const menuItem = menu?.kind === 'item' ? vault?.items.find((item) => item.id === menu.id) : undefined;
  const menuFolder = menu?.kind === 'folder' ? vault?.folders.find((folder) => folder.id === menu.id) : undefined;
  const currentFolder = filter.startsWith('folder:') ? vault?.folders.find((folder) => folder.id === filter.slice(7)) : undefined;
  const title = currentFolder?.name ?? (filter.startsWith('tag:') ? '#' + filter.slice(4) : text(navigation.find((entry) => entry.filter === filter)?.title ?? 'Tất cả mục'));
  const navigate = (action: () => void) => { if (dirty) setLeave(() => action); else action(); };
  const backToList = () => router.replace({ pathname: '/vault', params: { filter } });
  const openItem = (id: string) => {
    if (pathname === '/vault') router.setParams({ item: id });
    else router.replace({ pathname: '/vault', params: { filter, item: id } });
  };
  const selectFilter = (next: ItemFilter) => navigate(() => {
    if (next === 'recent') setSort(DEFAULT_ITEM_SORT);
    preferences.setFilter(next); setSelected([]); setMobileSidebar(false); setFlyout(null);
    router.push({ pathname: '/vault', params: { filter: next } });
  });
  const editItem = (id: string) => navigate(() => router.push({ pathname: '/item/[id]/edit', params: { id } }));
  const createFolder = (parent?: string) => setFolderDialog({ parent });
  const showNewMenu = () => {
    const element = newButton.current;
    setMenu({ kind: 'new', anchor: element ? menuAnchor(element) : { x: 270, y: 110 } });
  };
  const applyOrganization = async (ids: string[], patch: Parameters<typeof updateItems>[2]) => {
    await session.mutate((vault) => updateItems(vault, ids, patch, () => session.id()));
    setMenu(null); setMove(null); setSelected([]);
    session.notify(patch.deletedAt ? 'Đã chuyển vào Thùng rác.' : patch.archivedAt ? 'Đã lưu trữ mục.' : 'Đã cập nhật.');
  };
  const organize = (ids: string[], patch: Parameters<typeof updateItems>[2]) => run(() => applyOrganization(ids, patch));
  const organizeFolder = (id: string, destination: FolderDestination) => run(async () => {
    await session.mutate((vault) => moveFolder(vault, id, destination.parentId, destination.beforeId));
    setMenu(null); session.notify('Đã di chuyển thư mục.');
  });
  const moveFolderRelative = (id: string, targetId: string, placement: FolderPlacement) => {
    if (!vault) return;
    const destination = folderDropDestination(vault, id, targetId, placement);
    if (destination) organizeFolder(id, destination);
  };
  const showItemMenu = (item: VaultItem, anchor: MenuAnchor) => setMenu({ kind: 'item', id: item.id, anchor });
  const trash = (ids: string[]) => {
    closeMenu();
    confirm({ title: t("Chuyển vào Thùng rác?"), description: t('Chuyển {count} mục vào Thùng rác. Bạn có thể khôi phục các mục này bất cứ lúc nào trước khi xoá vĩnh viễn.', { count: ids.length }), confirmLabel: t("Chuyển vào Thùng rác"), onConfirm: () => applyOrganization(ids, { deletedAt: new Date().toISOString() }) });
  };
  const choose = (event: MouseEvent, item: VaultItem) => {
    if (event.metaKey || event.ctrlKey) {
      setSelected((ids) => {
        const initial = ids.length ? ids : activeId ? [activeId] : [];
        return initial.includes(item.id) ? initial.filter((id) => id !== item.id) : [...initial, item.id];
      });
    } else if (event.shiftKey && activeId) {
      const first = found.findIndex((entry) => entry.id === activeId);
      const last = found.findIndex((entry) => entry.id === item.id);
      if (first >= 0) setSelected(found.slice(Math.min(first, last), Math.max(first, last) + 1).map((entry) => entry.id));
    } else navigate(() => { setSelected([]); openItem(item.id); });
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open],[role=menu]')) return;
      const target = event.target as HTMLElement;
      const typing = target.matches('input,textarea,select,[contenteditable=true]');
      const command = event.metaKey || event.ctrlKey;
      if (command) {
        switch (event.key.toLowerCase()) {
          case 'k': event.preventDefault(); setMenu(null); setPalette(true); break;
          case 'n': event.preventDefault(); showNewMenu(); break;
          case 'l': event.preventDefault(); navigate(lockVault); break;
          case 'e': if (active && !active.deletedAt) { event.preventDefault(); editItem(active.id); } break;
          case '/': event.preventDefault(); setShortcuts(true); break;
          case ',': event.preventDefault(); navigate(() => router.push('/settings')); break;
          case 'a': if (!typing && !children) { event.preventDefault(); setSelected(found.map((item) => item.id)); } break;
        }
        return;
      }
      if (typing || children || target.closest('aside, footer')) return;
      if (event.key === 'Escape') { setSelected([]); setMenu(null); setFlyout(null); return; }
      if (['ArrowDown', 'ArrowUp'].includes(event.key) && found.length) {
        event.preventDefault();
        const current = found.findIndex((item) => item.id === activeId);
        const next = Math.max(0, Math.min(found.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
        openItem(found[next].id);
        list.current?.querySelectorAll<HTMLElement>('[data-item-row]')[next]?.scrollIntoView({ block: 'nearest' });
      }
    };
    const searchCommand = () => setPalette(true);
    document.addEventListener('keydown', keydown);
    document.addEventListener('kiro:search', searchCommand);
    return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('kiro:search', searchCommand); };
  });
  if (!vault) return null;
  const counts = {
    all: vault.items.filter((item) => !item.deletedAt && !item.archivedAt).length,
    favorites: vault.items.filter((item) => !item.deletedAt && !item.archivedAt && item.favorite).length,
    recent: vault.items.filter((item) => !item.deletedAt && !item.archivedAt).length,
    archive: vault.items.filter((item) => !item.deletedAt && item.archivedAt).length,
    trash: vault.items.filter((item) => item.deletedAt).length,
  };
  const tree = <FolderTree vault={vault} filter={filter} onSelect={selectFilter}
    onMenu={(folder, anchor) => setMenu({ kind: 'folder', id: folder.id, anchor })}
    onMoveFolder={organizeFolder} busy={pending || state.busy}
    onMoveItems={(ids, folderId) => organize(ids, { folderId })} />;
  const folders = <><div className="desktop-folder-heading"><span className="desktop-section-label grow">{t("Các thư mục")}</span><IconButton icon="add" label={t("Thư mục mới")} onClick={() => createFolder()} /></div>
    {tree}{!vault.folders.length && <button className="desktop-nav-item muted tiny" onClick={() => createFolder()}>{t("Tạo thư mục đầu tiên…")}</button>}</>;
  const rail = preferences.layout === 'B';
  const activeNav = !children || !!detailId;
  const tagCloud = <TagCloud tags={tags} activeTag={filter.startsWith('tag:') ? filter.slice(4) : null} onSelect={(tag) => selectFilter(tag === null ? 'all' : `tag:${tag}`)} />;
  const closeMenu = () => setMenu(null);
  const folderSiblings = menuFolder ? vault.folders.filter((folder) => folder.parentId === menuFolder.parentId) : [];
  const folderIndex = folderSiblings.findIndex((folder) => folder.id === menuFolder?.id);
  return <Context.Provider value={{ navigate, setDirty, openItem, backToList, createFolder }}>
    <DesktopFrame footerStart={<>
      <span className="desktop-footer-status" title={state.current?.location}>{t(state.current?.external ? 'Đã lưu vào file' : 'Lưu trên thiết bị')}</span>
      <div className="desktop-footer-actions">
        <IconButton icon="password" data-nav="generator" label={t("Tạo mật khẩu")} onClick={() => setGenerator(true)} />
        <IconButton icon="settings" data-nav="settings" label={t("Cài đặt")} onClick={() => navigate(() => router.push('/settings'))} />
      </div>
    </>}>
      <div className={'desktop-workspace' + (active || children ? ' has-detail' : '') + (mobileSidebar ? ' show-sidebar' : '')}>
        {mobileSidebar && <button className="desktop-sidebar-backdrop desktop-mobile-only" aria-label={t("Đóng thanh bên")} onClick={() => setMobileSidebar(false)} />}
        <aside className={'desktop-sidebar' + (rail ? ' desktop-rail' : '')} aria-label={t("Điều hướng Vault")}>
          <TrafficLights />
          {rail ? <div className="desktop-rail-brand"><BrandSymbol size={34} /></div> : <div className="desktop-vault-name"><BrandSymbol size={28} /><span>Kiwi Password</span></div>}
          <nav className={rail ? 'desktop-rail-nav' : 'desktop-sidebar-scroll'}>
            {!rail && <div className="desktop-section-label">{t("Vault")}</div>}
            {navigation.map((entry) => <button key={entry.filter} data-nav={entry.filter} className={'desktop-nav-item' + (filter === entry.filter && activeNav ? ' selected' : '')}
              title={rail ? text(entry.title) : undefined} aria-label={text(entry.title)} aria-current={filter === entry.filter && activeNav ? 'page' : undefined} onClick={() => selectFilter(entry.filter)}>
              <Icon name={entry.icon} />{!rail && <><span className="grow">{text(entry.title)}</span><span className="desktop-nav-count">{counts[entry.filter as keyof typeof counts]}</span></>}
            </button>)}
            {rail ? <><div className="desktop-rail-divider" /><button data-nav="folders" className={'desktop-nav-item' + (flyout === 'folders' ? ' selected' : '')} title={t("Thư mục")} aria-label={t("Thư mục")} aria-expanded={flyout === 'folders'} onClick={() => setFlyout(flyout === 'folders' ? null : 'folders')}><Icon name="folder" /></button>
              <button data-nav="tags" className={'desktop-nav-item' + (flyout === 'tags' || filter.startsWith('tag:') ? ' selected' : '')} title={t('Lọc theo thẻ')} aria-label={t('Lọc theo thẻ')} aria-expanded={flyout === 'tags'} onClick={() => setFlyout(flyout === 'tags' ? null : 'tags')}><Icon name="tag" /></button>
            </> : <>{folders}{tagCloud}</>}
          </nav>
          {rail ? <>
            <IconButton icon="info" data-nav="about" label={t('Giới thiệu')} onClick={() => navigate(() => router.push('/about'))} />
            <IconButton icon="keyboard" data-nav="shortcuts" label={t("Phím tắt (⌘/)")} onClick={() => setShortcuts(true)} />
            <IconButton icon="lock" data-nav="lock" label={t("Khoá Vault (⌘L)")} onClick={() => navigate(lockVault)} />
            {flyout && <div className="desktop-folder-flyout">{flyout === 'folders' ? folders : tagCloud}<Button variant="ghost" small onClick={() => setFlyout(null)}>{t("Đóng")}</Button></div>}
          </> : <>
            <button className={'desktop-nav-item desktop-about-nav' + (pathname === '/about' ? ' selected' : '')} data-nav="about" aria-current={pathname === '/about' ? 'page' : undefined} onClick={() => navigate(() => router.push('/about'))}><Icon name="info" /><span className="grow">{t('Giới thiệu')}</span></button>
            <div className="desktop-sidebar-footer"><button className="desktop-nav-item" data-nav="lock" onClick={() => navigate(lockVault)}><Icon name="lock" /><span className="grow">{t("Khoá Vault")}</span><span className="desktop-nav-count">⌘L</span></button><IconButton icon="keyboard" data-nav="shortcuts" label={t("Phím tắt (⌘/)")} onClick={() => setShortcuts(true)} /></div>
          </>}
        </aside>
        {!rail && <Resizer label={t("Chiều rộng thanh bên")} value={preferences.sideWidth} min={190} max={340} onChange={preferences.setSideWidth} />}
        {!fullWidth && <section className="desktop-list" aria-label={t("Danh sách mục")}>
          <div className="desktop-list-header">
            <button className="desktop-icon-button desktop-mobile-only" aria-label={t("Mở thanh bên")} onClick={() => setMobileSidebar(true)}><Icon name="menu" /></button>
            <div className="desktop-list-title"><h1>{title}</h1><span>{t('{count} mục', { count: found.length })}</span></div>
            <div ref={newButton} className="desktop-toolbar-group">
              <button type="button" title={t("Khoá Vault (⌘L)")} aria-label={t("Khoá Vault")} onClick={() => navigate(lockVault)}><Icon name="lock" /></button>
              <i aria-hidden="true" />
              <button type="button" title={t("Mục mới (⌘N)")} aria-label={t("Mới")} onClick={showNewMenu}><Icon name="add" /></button>
            </div>
          </div>
          <div className="desktop-search-container"><button className="desktop-search-trigger" onClick={() => setPalette(true)}><Icon name="search" /><span className="grow">{t("Tìm trong vault…")}</span><kbd className="desktop-kbd">⌘K</kbd></button></div>
          {!!selected.length && <div className="desktop-bulkbar"><span className="grow">{t('Đã chọn {count}', { count: selected.length })}</span>
            <IconButton icon="star" label={t("Yêu thích các mục đã chọn")} onClick={() => organize(selected, { favorite: true })} />
            <IconButton icon="drive_file_move" label={t("Di chuyển các mục đã chọn")} onClick={() => { setDestination(''); setMove(selected); }} />
            <IconButton icon={filter === 'trash' ? 'restore_from_trash' : 'delete'} label={filter === 'trash' ? t("Khôi phục các mục đã chọn") : t("Xoá các mục đã chọn")} onClick={() => filter === 'trash' ? organize(selected, { deletedAt: null }) : trash(selected)} />
            <IconButton icon="close" label={t("Bỏ chọn (Esc)")} onClick={() => setSelected([])} />
          </div>}
          {filter === 'trash' && <div className="desktop-trash-note"><span>{t("Mục trong Thùng rác chỉ bị xoá vĩnh viễn khi bạn dọn sạch.")}</span><Button small variant="danger" disabled={!found.length} onClick={() => setPermanent(found.map((item) => item.id))}>{t("Dọn sạch")}</Button></div>}
          <div className="desktop-table-header"><div className="desktop-table-columns"><span>{t("Tên")}</span><span>{t("Tài khoản / Host")}</span><span>{t("Thư mục")}</span><span>{t("Cập nhật")}</span></div></div>
          <div ref={list} className="desktop-item-list" role="listbox" aria-label={title} aria-multiselectable="true" onContextMenu={(event) => {
            if (event.target === event.currentTarget) { event.preventDefault(); setMenu({ kind: 'list', anchor: { x: event.clientX, y: event.clientY } }); }
          }}>
            {!found.length && <EmptyState icon={filter === 'trash' ? 'delete' : 'folder_open'} title={filter === 'all' ? t("Vault của bạn đã sẵn sàng") : t("Chưa có mục nào")} description={filter === 'all' ? t("Thêm mật khẩu, ghi chú hoặc thông tin cần bảo vệ.") : t("Các mục thuộc bộ sưu tập này sẽ xuất hiện ở đây.")}>
              {filter === 'all' && <Button small onClick={showNewMenu}>{t("Tạo mục mới · ⌘N")}</Button>}
            </EmptyState>}
            {found.map((item) => {
              const subtitle = itemSubtitle(item);
              const updatedDate = compactDateTime(item.updatedAt);
              const updatedDescription = t('Cập nhật gần nhất') + ': ' + dateTime(item.updatedAt);
              const username = item.fields.find((field) => field.id === 'username' && !isSecret(field));
              const password = item.fields.find((field) => field.id === 'password');
              return <div key={item.id} data-item-row role="option" tabIndex={activeId === item.id || !activeId && found[0]?.id === item.id ? 0 : -1}
                aria-selected={selected.includes(item.id) || activeId === item.id} aria-label={item.title + ', ' + itemTypes[item.type].label} aria-description={updatedDescription}
                className={'desktop-item-row' + (activeId === item.id ? ' selected' : '') + (selected.includes(item.id) ? ' multiselected' : '')}
                draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-appkiro-items', JSON.stringify(selected.includes(item.id) ? selected : [item.id])); event.dataTransfer.effectAllowed = 'move'; }}
                onClick={(event) => choose(event, item)} onDoubleClick={() => { if (!item.deletedAt) editItem(item.id); }}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(() => openItem(item.id)); } }}
                onContextMenu={(event) => { event.preventDefault(); showItemMenu(item, { x: event.clientX, y: event.clientY }); }}>
                <ItemTile type={item.type} metadata={item.metadata} size={preferences.comfortable ? 36 : 32} />
                <div className="desktop-row-text"><div className="desktop-row-title"><span>{item.title}</span>{item.favorite && <Icon name="star" filled />}</div><div className="desktop-row-subtitle">{subtitle === 'No additional details' ? itemTypes[item.type].label : subtitle}</div></div>
                <time className="desktop-row-updated" dateTime={item.updatedAt} title={updatedDescription}>{updatedDate}</time>
                <div className="desktop-table-columns desktop-table-row"><span>{item.title}</span><span>{subtitle === 'No additional details' ? '—' : subtitle}</span><span>{folderPath(vault, item.folderId) || t("Vault gốc")}</span><span><time dateTime={item.updatedAt} title={updatedDescription}>{updatedDate}</time></span></div>
                <div className="desktop-row-actions" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
                  {username?.value && <IconButton icon="person" label={t('Sao chép tên đăng nhập của {name}', { name: item.title })} onClick={() => copy(username.value)} />}
                  {password?.value && <IconButton icon="key" label={t('Sao chép mật khẩu của {name}', { name: item.title })} onClick={() => copy(password.value, true)} />}
                  <IconButton icon="star" label={t(item.favorite ? 'Bỏ yêu thích {name}' : 'Yêu thích {name}', { name: item.title })} active={item.favorite} onClick={() => organize([item.id], { favorite: !item.favorite })} />
                  <IconButton icon="more_horiz" label={t('Thêm thao tác cho {name}', { name: item.title })} onClick={(event) => showItemMenu(item, menuAnchor(event.currentTarget))} />
                </div>
              </div>;
            })}
          </div>
          <div className="desktop-list-footer"><Icon name={state.busy ? 'sync' : 'check_circle'} /><span className="grow">{state.busy ? t("Đang lưu…") : t('{count} mục · Đã lưu trên thiết bị', { count: found.length })}</span>
            <button className="desktop-icon-button" aria-label={t("Sắp xếp danh sách")} title={t("Sắp xếp")} onClick={(event) => setMenu({ kind: 'list', anchor: menuAnchor(event.currentTarget) })}><Icon name="sort" size={16} /></button>
          </div>
        </section>}
        {!fullWidth && preferences.layout !== 'C' && <Resizer label={t("Chiều rộng danh sách")} value={preferences.listWidth} min={260} max={520} onChange={preferences.setListWidth} />}
        <section className={'desktop-detail' + (fullWidth ? ' full-width' : '')} aria-label={children ? t("Nội dung") : t("Chi tiết mục")}>
          {children ?? <Detail key={active?.id ?? 'empty'} item={active} onEdit={() => { if (active) editItem(active.id); }} onHistory={() => { if (active) navigate(() => router.push({ pathname: '/item/[id]/history', params: { id: active.id } })); }}
            onMenu={(event) => { if (active) showItemMenu(active, menuAnchor(event.currentTarget)); }} onBack={backToList} onTag={(tag) => selectFilter(('tag:' + tag) as ItemFilter)} />}
        </section>
      </div>
      <Menu anchor={menu?.anchor ?? null} onClose={closeMenu} label={menu?.kind === 'new' ? t("Tạo mục mới") : t("Thao tác")}>
        {menu?.kind === 'new' && <><div className="desktop-menu-heading">{t("Mục mới")}</div>{ITEM_TYPES.map((type) => <button key={type} role="menuitem" className="desktop-menu-item" onClick={() => navigate(() => {
          setMenu(null); router.push({ pathname: '/item/new', params: { type, ...(currentFolder ? { folder: currentFolder.id } : {}) } });
        })}><ItemTile type={type} size={22} /><span>{itemTypes[type].label}</span></button>)}<div className="desktop-menu-separator" /><MenuItem icon="create_new_folder" onClick={() => { setMenu(null); createFolder(currentFolder?.id); }}>{t("Thư mục mới")}</MenuItem></>}
        {menu?.kind === 'list' && <><div className="desktop-menu-heading">{t("Sắp xếp theo")}</div>
          <MenuItem icon={sort === 'updated' ? 'check' : 'schedule'} onClick={() => { setSort('updated'); closeMenu(); }}>{t("Cập nhật gần nhất")}</MenuItem>
          <MenuItem icon={sort === 'created' ? 'check' : 'calendar_today'} onClick={() => { setSort('created'); closeMenu(); }}>{t("Ngày tạo")}</MenuItem>
          <MenuItem icon={sort === 'title' ? 'check' : 'sort_by_alpha'} onClick={() => { setSort('title'); closeMenu(); }}>{t("Tên")}</MenuItem>
          <div className="desktop-menu-separator" /><MenuItem icon="select_all" shortcut="⌘A" onClick={() => { setSelected(found.map((item) => item.id)); closeMenu(); }}>{t("Chọn tất cả")}</MenuItem>
          {currentFolder && <MenuItem icon="edit" onClick={() => { setFolderDialog({ folder: currentFolder }); closeMenu(); }}>{t("Sửa thư mục")}</MenuItem>}</>}
        {menuItem && <>
          {!menuItem.deletedAt && <MenuItem icon="edit" shortcut="⌘E" onClick={() => { editItem(menuItem.id); closeMenu(); }}>{t("Sửa")}</MenuItem>}
          <MenuItem icon="star" onClick={() => organize([menuItem.id], { favorite: !menuItem.favorite })}>{menuItem.favorite ? t("Bỏ yêu thích") : t("Thêm vào Yêu thích")}</MenuItem>
          <MenuItem icon="content_copy" onClick={() => run(async () => {
            const copyId = session.id(); const now = new Date().toISOString();
            await session.mutate((vault) => saveItem(vault, { ...menuItem, id: copyId, title: t('{name} (bản sao)', { name: menuItem.title }), history: [], deletedAt: null, archivedAt: null, createdAt: now, updatedAt: now }, session.id()));
            closeMenu(); openItem(copyId); session.notify('Đã tạo bản sao.');
          })}>{t("Nhân bản")}</MenuItem>
          <MenuItem icon="drive_file_move" onClick={() => { setDestination(menuItem.folderId ?? ''); setMove([menuItem.id]); closeMenu(); }}>{t("Chuyển đến thư mục…")}</MenuItem>
          <MenuItem icon="history" onClick={() => { navigate(() => router.push({ pathname: '/item/[id]/history', params: { id: menuItem.id } })); closeMenu(); }}>{t("Lịch sử phiên bản")}</MenuItem>
          <div className="desktop-menu-separator" />
          {menuItem.deletedAt ? <><MenuItem icon="restore_from_trash" onClick={() => organize([menuItem.id], { deletedAt: null, archivedAt: null })}>{t("Khôi phục")}</MenuItem><MenuItem icon="delete_forever" danger onClick={() => { setPermanent([menuItem.id]); closeMenu(); }}>{t("Xoá vĩnh viễn…")}</MenuItem></>
            : <><MenuItem icon={menuItem.archivedAt ? 'unarchive' : 'archive'} onClick={() => organize([menuItem.id], { archivedAt: menuItem.archivedAt ? null : new Date().toISOString() })}>{menuItem.archivedAt ? t("Bỏ lưu trữ") : t("Lưu trữ")}</MenuItem><MenuItem icon="delete" danger onClick={() => trash([menuItem.id])}>{t("Chuyển vào Thùng rác")}</MenuItem></>}
        </>}
        {menuFolder && <><div className="desktop-menu-heading">{menuFolder.name}</div><MenuItem icon="create_new_folder" onClick={() => { createFolder(menuFolder.id); closeMenu(); }}>{t("Thư mục con mới")}</MenuItem><MenuItem icon="edit" onClick={() => { setFolderDialog({ folder: menuFolder }); closeMenu(); }}>{t("Đổi tên / Di chuyển")}</MenuItem>
          <MenuItem icon="palette" onClick={() => { setFolderDialog({ folder: menuFolder, editAppearance: true }); closeMenu(); }}>{t('Biểu tượng và màu')}</MenuItem>
          {folderIndex > 0 && <MenuItem icon="arrow_upward" shortcut="⌥↑" onClick={() => moveFolderRelative(menuFolder.id, folderSiblings[folderIndex - 1].id, 'before')}>{text('Di chuyển lên')}</MenuItem>}
          {folderIndex >= 0 && folderIndex < folderSiblings.length - 1 && <MenuItem icon="arrow_downward" shortcut="⌥↓" onClick={() => moveFolderRelative(menuFolder.id, folderSiblings[folderIndex + 1].id, 'after')}>{text('Di chuyển xuống')}</MenuItem>}
          {menuFolder.parentId && <MenuItem icon="drive_file_move" shortcut="⌥←" onClick={() => moveFolderRelative(menuFolder.id, menuFolder.parentId!, 'after')}>{text('Đưa ra thư mục cha')}</MenuItem>}
          <div className="desktop-menu-separator" /><MenuItem icon="delete" danger onClick={() => { setDeleteFolder(menuFolder); closeMenu(); }}>{t("Xoá thư mục…")}</MenuItem></>}
      </Menu>
      {palette && <SearchPalette vault={vault} onClose={() => setPalette(false)} onSelect={(id) => { setPalette(false); navigate(() => openItem(id)); }}
        onNew={() => { setPalette(false); showNewMenu(); }} onGenerator={() => { setPalette(false); setGenerator(true); }} />}
      <Dialog open={generator} title={t("Tạo mật khẩu")} onClose={() => setGenerator(false)}>{generator && <DesktopGenerator onClose={() => setGenerator(false)} />}</Dialog>
      <Dialog open={shortcuts} title={t("Phím tắt")} onClose={() => setShortcuts(false)}>
        <div className="desktop-shortcuts">{[[t("Tìm kiếm"), '⌘K'], [t("Tạo mục mới"), '⌘N'], [t("Sửa mục đang chọn"), '⌘E'], [t("Lưu thay đổi"), '⌘S'], [t("Khoá Vault"), '⌘L'], [t("Cài đặt"), '⌘,'], [t("Chọn tất cả mục"), '⌘A'], [t("Chọn nhiều mục"), t("⌘ + Bấm")], [t("Chọn một dãy mục"), t("Shift + Bấm")], [t("Di chuyển trong danh sách"), '↑ ↓'], [t("Đóng / Bỏ chọn"), 'Esc']].map(([label, keys]) => <div className="desktop-shortcut-entry" key={keys}><span>{label}</span><kbd>{keys}</kbd></div>)}</div>
      </Dialog>
      <FolderDialog open={!!folderDialog} initialParent={folderDialog?.parent} folder={folderDialog?.folder} editAppearance={folderDialog?.editAppearance} onClose={() => setFolderDialog(null)} />
      <DeleteFolderDialog folder={deleteFolder} onClose={() => setDeleteFolder(null)} onDeleted={() => selectFilter('all')} />
      <Dialog open={!!move} title={t('Di chuyển {count} mục', { count: move?.length ?? 0 })} onClose={() => setMove(null)}
        footer={<><Button onClick={() => setMove(null)}>{t("Huỷ")}</Button><Button variant="primary" busy={pending} onClick={() => { if (move) organize(move, { folderId: destination || null }); }}>{t("Di chuyển")}</Button></>}>
        <FolderSelect value={destination} onChange={setDestination} vault={vault} />
      </Dialog>
      <Dialog open={!!permanent} title={t("Xoá vĩnh viễn?")} description={t('Xoá {count} mục cùng toàn bộ lịch sử và tệp đính kèm. Bạn không thể hoàn tác thao tác này.', { count: permanent?.length ?? 0 })} onClose={() => setPermanent(null)}
        footer={<><Button onClick={() => setPermanent(null)}>{t("Huỷ")}</Button><Button variant="danger" busy={pending} onClick={() => run(async () => {
          if (!permanent) return;
          await session.mutate((vault) => ({ ...vault, items: vault.items.filter((item) => !permanent.includes(item.id)) }));
          setPermanent(null); setSelected([]); session.notify('Đã xoá vĩnh viễn.');
        })}>{t("Xoá vĩnh viễn")}</Button></>} />
      <Dialog open={!!leave} title={t("Bỏ các thay đổi chưa lưu?")} description={t("Các thay đổi của bạn chưa được lưu vào Vault.")} onClose={() => setLeave(null)}
        footer={<><Button onClick={() => setLeave(null)}>{t("Tiếp tục sửa")}</Button><Button variant="danger" onClick={() => { const action = leave; setDirty(false); setLeave(null); action?.(); }}>{t("Bỏ thay đổi")}</Button></>} />
      {authDialog}
      {confirmationDialog}
    </DesktopFrame>
  </Context.Provider>;
}
