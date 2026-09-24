import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/shared/hooks/use-i18n';
import { Icon, IconButton, Input } from './ui';

export type SelectOption = { value: string; label: string; icon?: ReactNode };
type SearchSelectProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyText: string;
  create?: { label: (query: string) => string; onCreate: (query: string) => void };
};

const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/đ/g, 'd');
const visibleLimit = 100;

export function SearchSelect({ label, value, options, onChange, placeholder, emptyText, create }: SearchSelectProps) {
  const { t } = useI18n();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const search = query.trim();
  const matches = useMemo(() => {
    const terms = normalize(search).split(/\s+/).filter(Boolean);
    return options.filter((option) => terms.every((term) => normalize(option.label).includes(term)));
  }, [options, search]);
  const visible = matches.slice(0, visibleLimit);
  const canCreate = !!create && !matches.length && !!search;
  const count = visible.length + (canCreate ? 1 : 0);
  const active = Math.min(index, Math.max(0, count - 1));
  const activeId = open && count ? id + '-option-' + active : undefined;
  const selected = options.find((option) => option.value === value);
  const close = () => { setOpen(false); setQuery(''); };
  const openList = (last = false) => {
    setQuery('');
    setIndex(last ? Math.min(options.length, visibleLimit) - 1 : Math.max(0, Math.min(options.findIndex((option) => option.value === value), visibleLimit - 1)));
    setOpen(true);
  };
  const createOption = () => { close(); create?.onCreate(search); };
  const choose = (position: number) => {
    if (position < visible.length) { onChange(visible[position].value); close(); }
    else if (canCreate) createOption();
  };

  useLayoutEffect(() => {
    const panel = popup.current;
    if (!open || !panel) return;
    const position = () => {
      const bounds = input.current?.parentElement?.getBoundingClientRect();
      if (!bounds) return;
      const below = innerHeight - bounds.bottom - 12;
      const above = bounds.top - 12;
      const down = below >= 200 || below >= above;
      panel.style.width = Math.min(bounds.width, innerWidth - 16) + 'px';
      panel.style.left = Math.max(8, Math.min(bounds.left, innerWidth - bounds.width - 8)) + 'px';
      panel.style.top = down ? bounds.bottom + 4 + 'px' : 'auto';
      panel.style.bottom = down ? 'auto' : innerHeight - bounds.top + 4 + 'px';
      panel.style.maxHeight = Math.max(0, Math.min(320, down ? below : above)) + 'px';
    };
    // The top layer keeps results visible inside scrolling panes and dialogs.
    if (typeof panel.showPopover === 'function') panel.showPopover();
    position();
    const observer = new ResizeObserver(position);
    if (root.current) observer.observe(root.current);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
      if (typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return <div ref={root} className="desktop-search-select ui:min-w-0" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }} onKeyDown={(event) => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); input.current?.focus(); }
  }}>
    <Input ref={input} label={label} value={open ? query : selected?.label ?? ''} placeholder={placeholder}
      role="combobox" aria-expanded={open} aria-controls={id + '-list'} aria-autocomplete="list" aria-activedescendant={activeId}
      autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()}
      onClick={() => { if (!open) openList(); }}
      onChange={(event) => { setQuery(event.target.value); setIndex(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!open) openList(event.key === 'ArrowUp');
          else setIndex((active + (event.key === 'ArrowDown' ? 1 : -1) + count) % Math.max(1, count));
        } else if (event.key === 'Enter' && open) {
          event.preventDefault(); event.stopPropagation();
          if (count) choose(active);
        }
      }}
      rightAddon={<>
        {create && (!search || canCreate) && <IconButton icon="create_new_folder" label={create.label(search)} onMouseDown={(event) => event.preventDefault()} onClick={createOption} />}
        <IconButton icon={open ? 'expand_less' : 'expand_more'} label={t(open ? 'Đóng danh sách {name}' : 'Mở danh sách {name}', { name: label })}
          onMouseDown={(event) => event.preventDefault()} onClick={() => { if (open) close(); else openList(); input.current?.focus(); }} />
      </>} />
    <div ref={popup} popover="manual" hidden={!open} className="desktop-select-popover ui:fixed ui:inset-auto ui:z-50 ui:m-0 ui:box-border ui:overflow-auto ui:overscroll-contain ui:rounded-md ui:border ui:border-solid ui:border-[color:var(--color-control-border)] ui:bg-[var(--color-background)] ui:p-1 ui:text-[color:var(--color-text)] ui:shadow-lg">
      {!matches.length && <p role="status" className="ui:m-0 ui:px-3 ui:py-2 ui:text-[12px] ui:text-[color:var(--color-muted)]">{emptyText}</p>}
      <div id={id + '-list'} role="listbox" aria-label={label}>
        {visible.map((option, position) => <button key={option.value} id={id + '-option-' + position} type="button" role="option" tabIndex={-1}
          aria-selected={active === position} onMouseDown={(event) => event.preventDefault()} onMouseMove={() => setIndex(position)} onClick={() => choose(position)}
          className="ui:box-border ui:flex ui:min-h-9 ui:w-full ui:items-center ui:gap-2 ui:rounded ui:border-0 ui:bg-transparent ui:px-3 ui:py-2 ui:text-left ui:aria-selected:bg-[var(--color-selected)]">
          {option.icon ?? <Icon name={option.value ? 'folder' : 'home'} size={17} />}<span className="ui:min-w-0 ui:flex-1 ui:break-words">{option.label}</span>{option.value === value && <Icon name="check" size={16} />}
        </button>)}
        {canCreate && <button id={id + '-option-0'} type="button" role="option" tabIndex={-1} aria-selected={true} onMouseDown={(event) => event.preventDefault()} onClick={createOption}
          className="ui:box-border ui:flex ui:min-h-9 ui:w-full ui:items-center ui:gap-2 ui:rounded ui:border-0 ui:bg-[var(--color-selected)] ui:px-3 ui:py-2 ui:text-left">
          <Icon name="create_new_folder" size={17} /><span className="ui:min-w-0 ui:break-words">{create?.label(search)}</span>
        </button>}
      </div>
      {matches.length > visibleLimit && <p className="ui:m-0 ui:px-3 ui:py-2 ui:text-[12px] ui:text-[color:var(--color-muted)]">{t('Hiển thị {count} kết quả đầu tiên. Nhập thêm để thu hẹp.', { count: visibleLimit })}</p>}
    </div>
  </div>;
}
