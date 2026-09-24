import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { MessageKey, Translator } from '@/core/i18n';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { UPDATE_INTERVAL_MS, UPDATE_STARTUP_DELAY_MS, updateInProgress, type UpdateState } from '@/infrastructure/desktop/updates';
import { session } from '@/infrastructure/session';
import { clipboard } from '@/infrastructure/clipboard';
import { useI18n } from '@/shared/hooks/use-i18n';
import { Button, Dialog, IconButton } from './ui';
import './updates.css';

interface UpdatesContext {
  state: UpdateState | null; pending: boolean; message: MessageKey | null;
  open(): void; check(): void; download(): void; restart(): void;
  registerRestartGuard(guard: () => boolean): () => void;
}
const Context = createContext<UpdatesContext | null>(null);
export const useDesktopUpdates = () => useContext(Context);

function statusText(state: UpdateState | null, t: Translator) {
  if (!state) return t('Cập nhật khả dụng trong bản ứng dụng đã cài đặt.');
  switch (state.status) {
    case 'checking': return t('Đang kiểm tra cập nhật…');
    case 'current': return t('Bạn đang dùng phiên bản mới nhất.');
    case 'unavailable': return t(state.unavailableReason === 'development' ? 'Cập nhật khả dụng trong bản ứng dụng đã cài đặt.' : 'Chưa có bản cập nhật cho nền tảng này.');
    case 'available': return t('Có phiên bản {version}.', { version: state.release?.version ?? '' });
    case 'downloading': return state.totalBytes ? t('Đang tải cập nhật… {percent}%', { percent: Math.min(100, Math.round(100 * state.receivedBytes / state.totalBytes)) }) : t('Đang tải cập nhật…');
    case 'verifying': return t('Đang xác minh bản cập nhật…');
    case 'staging': return t('Đang cài đặt bản cập nhật…');
    case 'ready': return t('Đã cài đặt. Khởi động lại để dùng phiên bản mới.');
    case 'restarting': return t('Đang khởi động lại…');
    case 'error':
      if (state.error === 'NETWORK') return t('Không kiểm tra được cập nhật. Hãy kiểm tra kết nối và thử lại.');
      if (state.error === 'STORAGE_FULL') return t('Không đủ dung lượng để cập nhật.');
      if (state.error?.startsWith('INVALID_')) return t('Bản cập nhật không hợp lệ. Ứng dụng hiện tại vẫn được giữ nguyên.');
      return t('Chưa cài đặt được cập nhật. Hãy đặt ứng dụng trong thư mục có quyền ghi và thử lại.');
    default: return t('Tự kiểm tra phiên bản mới. Chỉ tải và cài đặt khi bạn chọn.');
  }
}

export function DesktopUpdatesProvider({ children, hydrated }: { children: ReactNode; hydrated: boolean }) {
  const bridge = desktopBridge()?.updates;
  const { t } = useI18n();
  const [state, setState] = useState<UpdateState | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [preparingRestart, setPreparingRestart] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [dismissed, setDismissed] = useState('');
  const operation = useRef(false);
  const guards = useRef(new Set<() => boolean>());
  const registerRestartGuard = useCallback((guard: () => boolean) => { guards.current.add(guard); return () => { guards.current.delete(guard); }; }, []);
  const run = useCallback(async (action: () => Promise<UpdateState>, failure: MessageKey) => {
    if (operation.current) return;
    operation.current = true; setPending(true); setMessage(null);
    try { setState(await action()); }
    catch { setMessage(failure); }
    finally { operation.current = false; setPending(false); }
  }, []);
  const check = useCallback(() => { if (bridge) void run(() => bridge.check(), 'Không kiểm tra được cập nhật. Hãy kiểm tra kết nối và thử lại.'); }, [bridge, run]);
  useEffect(() => {
    if (!bridge) return;
    let disposed = false; let observed = false;
    const unsubscribe = bridge.onState((next) => { observed = true; if (!disposed) setState(next); });
    void bridge.getState().then((next) => { if (!disposed && !observed) setState(next); }).catch(() => undefined);
    const menu = bridge.onOpen(() => { setOpen(true); check(); });
    const startup = setTimeout(() => { if (!document.hidden) check(); }, UPDATE_STARTUP_DELAY_MS);
    const periodic = setInterval(() => { if (!document.hidden) check(); }, UPDATE_INTERVAL_MS);
    return () => { disposed = true; unsubscribe(); menu(); clearTimeout(startup); clearInterval(periodic); };
  }, [bridge, check]);
  const download = () => {
    if (bridge && state?.release && state.status === 'available') void run(() => bridge.download(state.release!.version), 'Chưa cài đặt được cập nhật. Hãy đặt ứng dụng trong thư mục có quyền ghi và thử lại.');
  };
  const restart = async () => {
    if (!bridge || state?.status !== 'ready' || !state.release || operation.current) return;
    if ([...guards.current].some((guard) => !guard())) { setMessage('Hãy lưu hoặc bỏ các thay đổi đang sửa trước khi khởi động lại.'); return; }
    operation.current = true; setPending(true); setPreparingRestart(true); setMessage(null); setOpen(true);
    let release: (() => void) | undefined;
    try {
      try { release = await session.prepareForRestart(); }
      catch { setMessage('Chưa thể khởi động lại. Hãy hoàn tất thao tác và lưu dữ liệu rồi thử lại.'); return; }
      if ([...guards.current].some((guard) => !guard())) { release(); setMessage('Hãy lưu hoặc bỏ các thay đổi đang sửa trước khi khởi động lại.'); return; }
      session.lock();
      await clipboard.clear().catch(() => undefined);
      const next = await bridge.restart(state.release.version);
      setState(next);
    } catch { release?.(); setMessage('Không khởi động lại được. Hãy đóng rồi mở lại ứng dụng.'); }
    finally { operation.current = false; setPending(false); setPreparingRestart(false); }
  };
  const key = state?.release ? state.release.version + (state.status === 'ready' ? ':ready' : ':available') : '';
  const notice = bridge && key && key !== dismissed && state && ['available', 'downloading', 'verifying', 'staging', 'ready'].includes(state.status);
  return <Context.Provider value={{ state, pending, message, open: () => setOpen(true), check, download, restart: () => { void restart(); }, registerRestartGuard }}>
    {children}
    {notice && !open && <div className="desktop-update-notice" role="status">
      <span>{statusText(state, t)}</span><Button small onClick={() => setOpen(true)}>{t('Xem cập nhật')}</Button>
      <IconButton icon="close" label={t('Để sau')} onClick={() => setDismissed(key)} />
    </div>}
    {hydrated && <Dialog open={!!bridge && open} title={t('Cập nhật ứng dụng')} onClose={() => { if (!preparingRestart && state?.status !== 'restarting') setOpen(false); }}>
      <UpdateDetails />
    </Dialog>}
  </Context.Provider>;
}

function UpdateDetails() {
  const updates = useDesktopUpdates();
  const { t } = useI18n();
  if (!updates) return null;
  const { state, pending, message } = updates;
  const busy = pending || !!state && updateInProgress(state.status);
  const progress = state && ['downloading', 'verifying', 'staging'].includes(state.status);
  return <div className="desktop-update-details">
    <p className={state?.status === 'error' ? 'desktop-error' : 'desktop-hint'} role="status">{statusText(state, t)}</p>
    {progress && <progress aria-label={t('Đang tải cập nhật…')} max={1} value={state.totalBytes ? state.receivedBytes / state.totalBytes : undefined} />}
    {state?.release?.notes && <pre className="desktop-update-notes">{state.release.notes}</pre>}
    {message && <p className="desktop-error" role="alert">{t(message)}</p>}
    <div className="desktop-setting-actions">
      <Button small busy={state?.status === 'checking'} disabled={busy || state?.status === 'ready' || state?.unavailableReason === 'development'} onClick={updates.check}>{t('Kiểm tra cập nhật…')}</Button>
      {state?.status === 'available' && <Button small variant="primary" disabled={busy} onClick={updates.download}>{t('Tải và cài đặt')}</Button>}
      {(state?.status === 'ready' || state?.status === 'restarting') && <Button small variant="primary" busy={pending || state.status === 'restarting'} onClick={updates.restart}>{t('Khởi động lại')}</Button>}
    </div>
  </div>;
}

export function DesktopUpdateSettings() {
  const { t } = useI18n();
  if (!desktopBridge()?.updates) return null;
  return <section className="desktop-settings-section" id="app-updates"><h2>{t('Cập nhật ứng dụng')}</h2><UpdateDetails /></section>;
}
