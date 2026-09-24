import { useI18n } from '@/shared/hooks/use-i18n';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Vault } from '@/domain/entities/vault';
import { itemSubtitle, searchItems } from '@/domain/services/search';
import { Icon, ItemTile } from './ui';
import { useLabels } from './labels';

export function SearchPalette({ vault, onClose, onSelect, onNew, onGenerator }: {
  vault: Vault; onClose: () => void; onSelect: (id: string) => void; onNew: () => void; onGenerator: () => void;
}) {
  const { t } = useI18n();
  const { itemTypes } = useLabels();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const deferred = useDeferredValue(query);
  const resultId = useId();
  const items = useMemo(() => searchItems(vault, deferred, 'all', deferred ? 'title' : 'updated').slice(0, deferred ? 40 : 5), [vault, deferred]);
  const actions = query.trim() ? [] : [
    { title: t("Tạo mục mới"), icon: 'add', shortcut: '⌘N', run: onNew },
    { title: t("Tạo mật khẩu"), icon: 'password', shortcut: '', run: onGenerator },
  ];
  const count = items.length + actions.length;
  const active = Math.min(index, Math.max(0, count - 1));
  const choose = (next: number) => {
    if (next < items.length) onSelect(items[next].id);
    else actions[next - items.length]?.run();
  };
  useEffect(() => { dialog.current?.showModal(); input.current?.focus(); }, []);
  return <dialog ref={dialog} className="desktop-dialog desktop-palette" aria-label={t("Tìm trong Vault")} onCancel={onClose}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}
    onKeyDown={(event) => {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + count) % Math.max(1, count);
        setIndex(next);
        dialog.current?.querySelector('[data-result-index="' + next + '"]')?.scrollIntoView({ block: 'nearest' });
      }
      if (event.key === 'Enter' && count) { event.preventDefault(); choose(active); }
    }}>
    <div className="desktop-palette-search"><Icon name="search" size={20} />
      <input ref={input} value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} placeholder={t("Tìm tên, tài khoản, website, thẻ…")}
        aria-label={t("Tìm trong Vault")} role="combobox" aria-expanded="true" aria-controls={resultId} aria-activedescendant={count ? resultId + '-' + active : undefined} autoComplete="off" spellCheck={false} />
      <button className="desktop-kbd" onClick={onClose} aria-label={t("Đóng tìm kiếm")}>esc</button>
    </div>
    <div className="desktop-palette-results" id={resultId} role="listbox" aria-label={t("Kết quả tìm kiếm")}>
      <div className="desktop-section-label">{query ? t('Kết quả · {count}', { count: items.length }) : t("Gần đây")}</div>
      {items.map((item, position) => <button key={item.id} id={resultId + '-' + position} data-result-index={position} type="button" role="option" tabIndex={-1}
        aria-selected={active === position} className={'desktop-palette-result' + (active === position ? ' selected' : '')}
        onMouseMove={() => setIndex(position)} onClick={() => onSelect(item.id)}>
        <ItemTile type={item.type} metadata={item.metadata} /><span className="desktop-row-text"><span className="desktop-row-title">{item.title}</span><span className="desktop-row-subtitle">{itemSubtitle(item) === 'No additional details' ? itemTypes[item.type].label : itemSubtitle(item)}</span></span>
        {active === position && <Icon name="keyboard_return" size={17} />}
      </button>)}
      {!items.length && <div className="desktop-search-empty"><Icon name="search_off" size={26} /><p>{t("Không tìm thấy mục phù hợp.")}</p><span>{t("Thử tên, tài khoản, website hoặc thẻ khác.")}</span></div>}
      {!!actions.length && <div className="desktop-section-label">{t("Thao tác nhanh")}</div>}
      {actions.map((action, position) => <button key={action.title} id={resultId + '-' + (items.length + position)} data-result-index={items.length + position} role="option" tabIndex={-1}
        aria-selected={active === items.length + position} className={'desktop-palette-result' + (active === items.length + position ? ' selected' : '')}
        onMouseMove={() => setIndex(items.length + position)} onClick={action.run}>
        <Icon name={action.icon} /><span className="grow">{action.title}</span><span className="tiny muted">{action.shortcut}</span>
      </button>)}
    </div>
    <div className="desktop-palette-footer"><span>{t("↑ ↓ Di chuyển")}</span><span>{t("↵ Mở mục")}</span><span>{t("esc Đóng")}</span><span className="grow" /><span>{t("Tìm trong Vault hiện tại")}</span></div>
  </dialog>;
}
