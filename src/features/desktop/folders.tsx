import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import type { Folder, Vault } from '@/domain/entities/vault';
import { addFolder, deleteFolder, moveFolder } from '@/domain/services/items';
import { folderPath, type ItemFilter } from '@/domain/services/search';
import { session } from '@/infrastructure/session';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { Button, Dialog, FolderIcon, Icon, IconButton, Input, menuAnchor, type MenuAnchor } from './ui';
import { randomItemColor, withItemColor } from '@/domain/entities/item-icon';
import { ItemIconPicker } from './item-icon-picker';
import { FOLDER_DRAG_TYPE, ITEM_DRAG_TYPE, folderDropDestination, type FolderDestination, type FolderPlacement } from './folder-drag';
import { SearchSelect } from './search-select';

export function FolderSelect({ value, onChange, label = 'Thư mục', excludedId, vault, onCreate }: {
  value: string; onChange: (value: string) => void; label?: string; excludedId?: string; vault: Vault; onCreate?: (name: string) => void;
}) {
  const { t, text } = useI18n();
  const id = useId();
  const groups = new Set(vault.folders.map((folder) => folder.parentId));
  const excluded = new Set(excludedId ? [excludedId] : []);
  if (excludedId) {
    let added = true;
    while (added) {
      added = false;
      for (const folder of vault.folders) if (folder.parentId && excluded.has(folder.parentId) && !excluded.has(folder.id)) {
        excluded.add(folder.id); added = true;
      }
    }
  }
  if (onCreate) return <SearchSelect label={text(label)} value={value} onChange={onChange}
    options={[{ value: '', label: t('Vault gốc') }, ...vault.folders.filter((folder) => !excluded.has(folder.id)).map((folder) => ({ value: folder.id, label: folderPath(vault, folder.id), icon: <FolderIcon metadata={folder.metadata} group={groups.has(folder.id)} /> }))]}
    placeholder={t('Tìm thư mục…')} emptyText={t('Không tìm thấy thư mục.')}
    create={{ label: (name) => name ? t('Tạo thư mục “{name}”', { name }) : t('Tạo thư mục mới'), onCreate }} />;
  return <div className="desktop-field">
    <label htmlFor={id}>{text(label)}</label>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t("Vault gốc")}</option>
      {vault.folders.filter((folder) => !excluded.has(folder.id)).map((folder) => <option key={folder.id} value={folder.id}>{folderPath(vault, folder.id)}</option>)}
    </select>
  </div>;
}

export function FolderDialog({ open, onClose, initialParent, initialName, onCreated, folder, editAppearance = false }: {
  open: boolean; onClose: () => void; initialParent?: string; initialName?: string; onCreated?: (id: string) => void; folder?: Folder; editAppearance?: boolean;
}) {
  const { t } = useI18n();
  return <Dialog open={open} title={folder ? t("Sửa thư mục") : t("Thư mục mới")} onClose={onClose}>
    {open && <FolderForm key={folder?.id ?? initialParent ?? 'root'} folder={folder} initialParent={initialParent} initialName={initialName} onCreated={onCreated} onClose={onClose} editAppearance={editAppearance} />}
  </Dialog>;
}

function FolderForm({ folder, initialParent, initialName, onCreated, onClose, editAppearance }: { folder?: Folder; initialParent?: string; initialName?: string; onCreated?: (id: string) => void; onClose: () => void; editAppearance: boolean }) {
  const { t } = useI18n();
  const { vault } = useSession();
  const { pending, run } = useAction();
  const [name, setName] = useState(folder?.name ?? initialName ?? '');
  const [parent, setParent] = useState(folder?.parentId ?? initialParent ?? '');
  const [metadata, setMetadata] = useState(() => folder?.metadata ?? withItemColor({}, randomItemColor()));
  if (!vault) return null;
  const submit = () => run(async () => {
    if (!name.trim()) return;
    const id = folder?.id ?? session.id();
    await session.mutate((vault) => folder
      ? moveFolder({ ...vault, folders: vault.folders.map((entry) => entry.id === folder.id ? { ...entry, name: name.trim(), metadata } : entry) }, folder.id, parent || null)
      : addFolder(vault, id, name, parent || null, undefined, metadata));
    if (!folder) onCreated?.(id);
    session.notify(folder ? 'Đã cập nhật thư mục.' : 'Đã tạo thư mục.');
    onClose();
  });
  return <form className="desktop-form-stack" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <div className="desktop-folder-appearance"><ItemIconPicker item={{ type: 'custom', metadata }} folder onChange={setMetadata} openOnMount={editAppearance} /></div>
    <Input label={t("Tên thư mục")} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Ví dụ: Công việc")} autoFocus maxLength={4096} />
    <FolderSelect value={parent} onChange={setParent} vault={vault} excludedId={folder?.id} label={t("Thư mục cha")} />
    <div className="desktop-form-actions"><Button onClick={onClose}>{t("Huỷ")}</Button><Button type="submit" variant="primary" busy={pending} disabled={!name.trim()}>{folder ? t("Lưu") : t("Tạo thư mục")}</Button></div>
  </form>;
}

export function DeleteFolderDialog({ folder, onClose, onDeleted }: { folder: Folder | null; onClose: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  return <Dialog open={!!folder} title={t("Xoá thư mục?")} description={t('Các mục trong “{name}” sẽ được chuyển lên thư mục cha.', { name: folder?.name ?? '' })} onClose={onClose}
    footer={<><Button onClick={onClose}>{t("Huỷ")}</Button><Button variant="danger" busy={pending} onClick={() => run(async () => {
      if (!folder) return;
      await session.mutate((vault) => deleteFolder(vault, folder.id));
      onClose(); onDeleted(); session.notify('Đã xoá thư mục. Các mục vẫn được giữ lại.');
    })}>{t("Xoá thư mục")}</Button></>} />;
}

export function FolderTree({ vault, filter, onSelect, onMenu, onMoveItems, onMoveFolder, busy = false }: {
  vault: Vault; filter: ItemFilter; onSelect: (filter: ItemFilter) => void;
  onMenu: (folder: Folder, anchor: MenuAnchor) => void; onMoveItems: (ids: string[], folderId: string) => void;
  onMoveFolder: (id: string, destination: FolderDestination) => void; busy?: boolean;
}) {
  const { t, text } = useI18n();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string | null; placement: FolderPlacement } | null>(null);
  const source = useRef<string | null>(null);
  const expansion = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const helpId = useId();
  const cancelExpansion = () => { if (expansion.current) clearTimeout(expansion.current.timer); expansion.current = null; };
  const clearDrag = () => { source.current = null; setDraggedId(null); setDropTarget(null); cancelExpansion(); };
  useEffect(() => () => { if (expansion.current) clearTimeout(expansion.current.timer); }, []);
  const foldersByParent = new Map<string | null, Folder[]>();
  const counts = new Map<string, number>();
  for (const folder of vault.folders) {
    const siblings = foldersByParent.get(folder.parentId) ?? [];
    siblings.push(folder); foldersByParent.set(folder.parentId, siblings);
  }
  for (const item of vault.items) if (item.folderId && !item.deletedAt && !item.archivedAt) counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1);
  const placementAt = (event: DragEvent<HTMLElement>, targetId: string | null): FolderPlacement => {
    if (targetId === null || !event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return 'inside';
    const rect = event.currentTarget.getBoundingClientRect();
    const position = (event.clientY - rect.top) / rect.height;
    return position < 0.25 ? 'before' : position > 0.75 ? 'after' : 'inside';
  };
  const dragOver = (event: DragEvent<HTMLElement>, targetId: string | null) => {
    const placement = placementAt(event, targetId);
    const folderDrop = event.dataTransfer.types.includes(FOLDER_DRAG_TYPE);
    const valid = !busy && (folderDrop
      ? source.current && folderDropDestination(vault, source.current, targetId, placement)
      : targetId !== null && event.dataTransfer.types.includes(ITEM_DRAG_TYPE));
    if (!valid) { event.dataTransfer.dropEffect = 'none'; setDropTarget(null); cancelExpansion(); return; }
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
    setDropTarget((previous) => previous?.id === targetId && previous.placement === placement ? previous : { id: targetId, placement });
    if (placement === 'inside' && targetId && collapsed.has(targetId)) {
      if (expansion.current?.id !== targetId) {
        cancelExpansion();
        expansion.current = { id: targetId, timer: setTimeout(() => {
          setCollapsed((value) => { const next = new Set(value); next.delete(targetId); return next; }); expansion.current = null;
        }, 650) };
      }
    } else cancelExpansion();
  };
  const dragLeave = (event: DragEvent<HTMLElement>) => {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) { setDropTarget(null); cancelExpansion(); }
  };
  const drop = (event: DragEvent<HTMLElement>, targetId: string | null) => {
    event.preventDefault(); event.stopPropagation();
    try {
      if (busy) return;
      if (event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) {
        const payload: unknown = JSON.parse(event.dataTransfer.getData(FOLDER_DRAG_TYPE));
        if (!payload || typeof payload !== 'object' || !('vaultId' in payload) || payload.vaultId !== vault.id || !('id' in payload) || payload.id !== source.current || typeof payload.id !== 'string') return;
        const destination = folderDropDestination(vault, payload.id, targetId, placementAt(event, targetId));
        if (!destination) return;
        if (destination.parentId) setCollapsed((value) => { const next = new Set(value); next.delete(destination.parentId!); return next; });
        onMoveFolder(payload.id, destination);
      } else if (targetId !== null) {
        const ids: unknown = JSON.parse(event.dataTransfer.getData(ITEM_DRAG_TYPE));
        if (Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string' && vault.items.some((item) => item.id === id))) onMoveItems(ids, targetId);
      }
    } catch { /* Ignore malformed or unrelated drag payloads. */ }
    finally { clearDrag(); }
  };
  const renderBranch = (folder: Folder, depth: number) => {
    const children = foldersByParent.get(folder.id) ?? [];
    const expanded = !collapsed.has(folder.id);
    const placement = dropTarget?.id === folder.id ? dropTarget.placement : null;
    return <div key={folder.id}>
      <div data-folder-id={folder.id} data-folder-parent={folder.parentId ?? ''} data-folder-depth={depth}
        className={'desktop-folder-row' + (children.length ? ' has-children' : '') + (filter === 'folder:' + folder.id ? ' selected' : '') + (placement ? ' drop-' + placement : '') + (draggedId === folder.id ? ' dragging' : '')}
        style={{ paddingLeft: 8 + Math.min(depth, 7) * 14 }} draggable={!busy}
        onContextMenu={(event) => { event.preventDefault(); onMenu(folder, { x: event.clientX, y: event.clientY }); }}
        onDragStart={(event) => {
          source.current = folder.id; setDraggedId(folder.id);
          event.dataTransfer.setData(FOLDER_DRAG_TYPE, JSON.stringify({ vaultId: vault.id, id: folder.id }));
          event.dataTransfer.effectAllowed = 'move';
        }} onDragEnd={clearDrag} onDragOver={(event) => dragOver(event, folder.id)} onDragLeave={dragLeave} onDrop={(event) => drop(event, folder.id)}
        onKeyDown={(event) => {
          if (!event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft'].includes(event.key) || busy) return;
          event.preventDefault(); event.stopPropagation();
          const siblings = foldersByParent.get(folder.parentId) ?? [];
          const index = siblings.findIndex((entry) => entry.id === folder.id);
          const target = event.key === 'ArrowLeft' ? folder.parentId : siblings[index + (event.key === 'ArrowUp' ? -1 : 1)]?.id;
          if (!target) return;
          const destination = folderDropDestination(vault, folder.id, target, event.key === 'ArrowUp' ? 'before' : 'after');
          if (destination) onMoveFolder(folder.id, destination);
        }}>
        <button className="desktop-folder-name" onClick={() => onSelect(('folder:' + folder.id) as ItemFilter)} title={folderPath(vault, folder.id)} aria-current={filter === 'folder:' + folder.id ? 'page' : undefined} aria-describedby={helpId}>
          <FolderIcon metadata={folder.metadata} group={children.length > 0} /><span className="desktop-folder-label">{folder.name}</span><span className="desktop-nav-count">{counts.get(folder.id) || ''}</span>
        </button>
        {children.length > 0 && <button className="desktop-folder-toggle" aria-label={t(expanded ? 'Thu gọn {name}' : 'Mở rộng {name}', { name: folder.name })} aria-expanded={expanded}
          onClick={() => setCollapsed((value) => { const next = new Set(value); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; })}>
          <Icon name={expanded ? 'expand_more' : 'chevron_right'} size={16} />
        </button>}
        <IconButton className="desktop-folder-menu" icon="more_horiz" label={t('Thao tác với thư mục {name}', { name: folder.name })} onClick={(event) => onMenu(folder, menuAnchor(event.currentTarget))} />
      </div>
      {expanded && children.map((child) => renderBranch(child, depth + 1))}
    </div>;
  };
  return <div className={'desktop-folder-tree' + (draggedId ? ' is-dragging' : '')} aria-busy={busy}>
    <span id={helpId} className="desktop-sr-only">{text('Kéo để sắp xếp; thả vào giữa thư mục để lồng bên trong.')}</span>
    {(foldersByParent.get(null) ?? []).map((folder) => renderBranch(folder, 0))}
    {draggedId && <div data-folder-root-drop className={'desktop-folder-root-drop' + (dropTarget?.id === null ? ' active' : '')}
      onDragOver={(event) => dragOver(event, null)} onDragLeave={dragLeave} onDrop={(event) => drop(event, null)}>
      <Icon name="drive_file_move" size={18} /><span>{text('Thả vào đây để đưa ra Vault gốc')}</span>
    </div>}
  </div>;
}
