import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import type { ItemSnapshot, ItemType } from '@/domain/entities/vault';
import { getItemColor, getItemIcon, getItemIconImage, iconForeground, type ItemIconId } from '@/domain/entities/item-icon';
import { ITEM_ICON_OPTIONS } from '@/shared/item-icons';
import { useSession } from '@/shared/hooks/use-session';
import { session } from '@/infrastructure/session';
import { safeError } from '@/core/errors';
import { itemTypes } from './labels';
import { InputField, type InputFieldProps } from './input-field';

export function Icon({ name, size = 18, filled = false }: { name: string; size?: number; filled?: boolean }) {
  return <span aria-hidden="true" className={'desktop-icon' + (filled ? ' is-filled' : '')} style={{ fontSize: size }}>{name}</span>;
}

export function Button({ children, icon, variant = 'secondary', small, busy, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode; icon?: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; small?: boolean; busy?: boolean;
}) {
  return <button type="button" {...props} data-dialog-autofocus={props.autoFocus || undefined} disabled={props.disabled || busy} aria-busy={busy || undefined} className={'desktop-button ' + variant + (small ? ' small' : '') + ' ' + className}>
    {busy ? <span className="desktop-spinner" /> : icon && <Icon name={icon} />}{children}
  </button>;
}

export function IconButton({ icon, label, active, danger, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean; danger?: boolean }) {
  return <button type="button" {...props} title={label} aria-label={label} className={'desktop-icon-button' + (active ? ' active' : '') + (danger ? ' danger' : '') + ' ' + className}>
    <Icon name={icon} filled={active && icon === 'star'} />
  </button>;
}

export function Input({ label, secret, rightAddon, ...props }: InputFieldProps & { secret?: boolean }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 15_000);
    return () => clearTimeout(timer);
  }, [revealed]);
  return <InputField {...props} label={label} type={secret && !revealed ? 'password' : props.type ?? 'text'} className={(secret ? 'mono ' : '') + (props.className ?? '')}
    rightAddon={secret || rightAddon ? <>
      {secret && <IconButton icon={revealed ? 'visibility_off' : 'visibility'} label={t(revealed ? 'Ẩn {name}' : 'Hiện {name}', { name: label })} disabled={props.disabled} onClick={() => setRevealed(!revealed)} />}
      {rightAddon}
    </> : undefined} />;
}

export function Dialog({ open, title, description, children, footer, onClose, wide = false, className = '' }: {
  open: boolean; title: string; description?: string; children?: ReactNode; footer?: ReactNode; onClose: () => void; wide?: boolean; className?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus();
    }
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={'desktop-dialog' + (wide ? ' wide' : '') + (className ? ' ' + className : '')} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    {open && <>
      <div className="desktop-dialog-header"><h2 id={id}>{title}</h2><IconButton icon="close" label={t("Đóng")} onClick={onClose} /></div>
      {description && <p className="desktop-dialog-description">{description}</p>}
      <div className="desktop-dialog-content">{children}</div>
      {footer && <div className="desktop-dialog-footer">{footer}</div>}
    </>}
  </dialog>;
}

export function AuthDialog({ action, onClose, title = 'Xác nhận Master Password', description = 'Nhập mật khẩu của Vault để tiếp tục.', confirmLabel, destructive = false }: { action: ((password: string) => Promise<void>) | null; onClose: () => void; title?: string; description?: string; confirmLabel?: string; destructive?: boolean }) {
  const { t, text } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => { setPassword(''); setError(''); onClose(); };
  const submit = () => {
    if (!action || busy || !password) return;
    setBusy(true);
    void action(password).then(close).catch((error: unknown) => setError(safeError(error, 'AUTHENTICATION').message)).finally(() => { setBusy(false); setPassword(''); });
  };
  return <Dialog open={!!action} title={text(title)} description={text(description)} onClose={() => { if (!busy) close(); }}
    footer={<><Button disabled={busy} onClick={close}>{t("Huỷ")}</Button><Button variant={destructive ? 'danger' : 'primary'} busy={busy} disabled={!password} onClick={submit}>{confirmLabel ?? t("Xác nhận")}</Button></>}>
    <Input label={t("Master Password")} secret autoFocus value={password} onChange={(event) => { setPassword(event.target.value); setError(''); session.clearError(); }} error={text(error)} onKeyDown={(event) => { if (event.key === 'Enter' && !destructive) submit(); }} />
  </Dialog>;
}

export function ItemTile({ type, size = 28, metadata, icon, folder = false }: { type: ItemType; size?: number; metadata?: ItemSnapshot['metadata']; icon?: ItemIconId; folder?: boolean }) {
  const item = itemTypes[type];
  const selected = icon ?? getItemIcon(metadata);
  const image = icon === undefined ? getItemIconImage(metadata) : null;
  const color = getItemColor(metadata) ?? image?.background;
  const [failed, setFailed] = useState<string | null>(null);
  // Apple-style squircle: the corner radius scales with the tile, as on app icons.
  const background = color ?? (folder ? '#0A84FF' : item.tint);
  return <span className="desktop-item-tile" style={{ width: size, height: size, borderRadius: Math.round(size * 0.24),
    '--tile-chroma': folder ? 0.12 : item.chroma, '--tile-hue': folder ? 75 : item.hue,
    background, color: color ? iconForeground(color) : '#FFFFFF' } as CSSProperties}>
    {image && failed !== image.dataUri ? <img className="desktop-cached-icon" src={image.dataUri} alt="" draggable={false} onError={() => setFailed(image.dataUri)} />
      : <Icon name={selected ? ITEM_ICON_OPTIONS[selected].symbol : folder ? 'folder' : item.icon} filled size={size >= 56 ? 30 : size >= 44 ? 24 : size < 28 ? 14 : size >= 32 ? 18 : 16} />}
  </span>;
}

export function FolderIcon({ metadata, group = false, size = 18 }: { metadata?: ItemSnapshot['metadata']; group?: boolean; size?: number }) {
  const selected = getItemIcon(metadata);
  const image = getItemIconImage(metadata);
  const color = getItemColor(metadata) ?? image?.background;
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={'desktop-folder-icon' + (group ? ' is-group' : '') + (color ? ' has-color' : '')}
    style={color ? { '--folder-custom-color': color } as CSSProperties : undefined} aria-hidden="true">
    {image && failed !== image.dataUri ? <img src={image.dataUri} alt="" width={size} height={size} style={{ objectFit: 'contain' }} onError={() => setFailed(image.dataUri)} />
      : <Icon name={selected ? ITEM_ICON_OPTIONS[selected].symbol : group ? 'folder' : 'format_list_bulleted'} size={size} />}
  </span>;
}

export type MenuAnchor = { x: number; y: number };
export const menuAnchor = (element: HTMLElement): MenuAnchor => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom + 5 };
};

export function Menu({ anchor, children, onClose, label }: { anchor: MenuAnchor | null; children: ReactNode; onClose: () => void; label: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!anchor || !menu) return;
    const position = () => {
      const rect = menu.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)) + 'px';
    };
    position();
    const observer = new ResizeObserver(position); observer.observe(menu);
    window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); };
  }, [anchor]);
  useEffect(() => {
    if (!anchor) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close.current(); } };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [anchor]);
  if (!anchor) return null;
  return <>
    <button className="desktop-menu-backdrop" aria-label={t("Đóng menu")} onClick={onClose} tabIndex={-1} />
    <div ref={ref} role="menu" aria-label={label} className="desktop-menu" style={{ left: Math.max(8, anchor.x), top: Math.max(8, anchor.y) }} onKeyDown={(event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[index]?.focus();
    }}>{children}</div>
  </>;
}

export function MenuItem({ icon, children, shortcut, danger, onClick }: { icon?: string; children: ReactNode; shortcut?: string; danger?: boolean; onClick: () => void }) {
  return <button type="button" role="menuitem" className={'desktop-menu-item' + (danger ? ' danger' : '')} onClick={onClick}>
    {icon && <Icon name={icon} size={17} />}<span className="grow">{children}</span>{shortcut && <span className="muted tiny">{shortcut}</span>}
  </button>;
}

export function EmptyState({ title, description, icon = 'lock_open', children }: { title?: string; description?: string; icon?: string; children?: ReactNode }) {
  const { t } = useI18n();
  return <div className="desktop-empty"><Icon name={icon} size={32} /><h3>{title ?? t('Chọn một mục để xem chi tiết')}</h3>{description && <p>{description}</p>}{children}</div>;
}

export function PasswordStrength({ value, entropyBits }: { value: string; entropyBits?: number }) {
  const { t } = useI18n();
  const groups = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((pattern) => pattern.test(value)).length;
  const score = !value ? 0 : entropyBits !== undefined ? entropyBits >= 80 ? 4 : entropyBits >= 60 ? 3 : entropyBits >= 40 ? 2 : 1
    : value.length >= 20 && groups >= 3 ? 4 : value.length >= 12 && groups >= 3 ? 3 : value.length >= 10 ? 2 : 1;
  const labels = ['', t("Yếu"), t("Trung bình"), t("Mạnh"), t("Rất mạnh")];
  const color = ['var(--color-dim)', 'var(--color-danger)', 'var(--color-warning)', 'var(--color-success-soft)', 'var(--color-success)'][score];
  return <div className="desktop-strength"><div>{[1, 2, 3, 4].map((bar) => <span key={bar} style={{ background: bar <= score ? color : 'var(--color-border)' }} />)}</div><span style={{ color }}>{labels[score]}</span></div>;
}

export function DesktopToast() {
  const { t, text } = useI18n();
  const { notice, error } = useSession();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => session.notify(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice && !error) return null;
  return <div className={'desktop-toast' + (error ? ' error' : '')} role="status" aria-live="polite">
    <Icon name={error ? 'error' : 'check_circle'} size={20} /><span className="grow">{text(error ?? notice ?? '')}</span>
    <IconButton icon="close" label={t("Đóng thông báo")} onClick={() => { session.notify(null); session.clearError(); }} />
  </div>;
}
