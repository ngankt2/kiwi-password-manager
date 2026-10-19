import { useI18n } from '@/shared/hooks/use-i18n';
import { BrandSymbol } from '@/design-system/components/brand-symbol';
import { stripVaultFileExtension, vaultFileName } from '@/core/vault-format/file-names';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useConfirmation } from '@/shared/hooks/use-confirmation';
import { useQuickUnlock } from '@/shared/hooks/use-quick-unlock';
import { usePasswordInput } from '@/shared/hooks/use-password-input';
import { quickUnlockCopy } from '@/shared/i18n/quick-unlock';
import { session } from '@/infrastructure/session';
import { pickFile, type PickedFile } from '@/infrastructure/filesystem/transfer';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { fileHandoff } from '@/features/vault/file-handoff';
import { DesktopFrame } from './frame';
import { Button, Dialog, Icon, IconButton, Input, PasswordStrength } from './ui';

export function DesktopWelcome({ mode = 'welcome' }: { mode?: 'welcome' | 'create' | 'unlock' }) {
  const { t, text } = useI18n();
  const state = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { run, pending } = useAction();
  const { confirm: confirmRemoval, confirmationDialog } = useConfirmation();
  const [file] = useState<PickedFile | null>(() => mode === 'unlock' ? fileHandoff.take() : null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [help, setHelp] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const previewId = useId();
  const [hiddenRecents, setHiddenRecents] = useState<string[]>([]);
  const recent = state.recents.find((vault) => vault.id === id) ?? state.current;
  const selectedId = id ?? recent?.id;
  const passwordView = usePasswordInput(`${mode}:${file?.name ?? selectedId ?? ''}`);
  const { password, setPassword, hide: hidePassword } = passwordView;
  const quickUnlock = useQuickUnlock(file ? undefined : selectedId);
  const unlockCopy = quickUnlockCopy(t, quickUnlock.support?.method);
  const canCreate = name.trim().length > 0 && password.length >= 12 && password === confirm;
  const location = desktopBridge()?.storageLocation ?? t("Bộ nhớ trên thiết bị của trình duyệt này");
  const recents = state.recents.filter((vault) => !hiddenRecents.includes(vault.id));
  const canFocusPassword = mode === 'unlock' && state.status === 'locked' && !help && !pending && !state.busy;

  useFocusEffect(useCallback(() => {
    if (!canFocusPassword || (!selectedId && !file)) return;
    let frame: number | undefined;
    const cancelFocus = () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; };
    const focusPassword = () => {
      cancelFocus();
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const input = passwordInput.current;
        if (!input?.isConnected || document.visibilityState === 'hidden' || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
        const active = document.activeElement;
        if (active !== input && active instanceof HTMLElement && (active.matches('input, textarea, select') || active.isContentEditable)) return;
        input.focus({ preventScroll: true });
      });
    };
    const visibility = () => document.visibilityState === 'visible' ? focusPassword() : cancelFocus();
    // The native window may appear after the input's initial autofocus has run.
    const unsubscribe = desktopBridge()?.onSecurityEvent((event) => event === 'foreground' ? focusPassword() : cancelFocus());
    focusPassword();
    window.addEventListener('focus', focusPassword);
    window.addEventListener('blur', cancelFocus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      hidePassword();
      cancelFocus(); unsubscribe?.();
      window.removeEventListener('focus', focusPassword);
      window.removeEventListener('blur', cancelFocus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [canFocusPassword, selectedId, file, hidePassword]));

  useEffect(() => () => { file?.bytes.fill(0); }, [file]);
  const unlockWithBiometrics = useCallback(() => {
    if (!selectedId) return;
    void run(async () => { await session.quickUnlock(selectedId, { prompt: unlockCopy.reason }); router.replace('/vault'); });
  }, [run, selectedId, unlockCopy.reason]);
  // Native Touch ID asks once when the unlock screen opens in a focused window; the button stays for retries.
  const autoPrompted = useRef<string | null>(null);
  const canAutoPrompt = mode === 'unlock' && state.status === 'locked' && !file && !!selectedId && !!desktopBridge()?.biometrics
    && quickUnlock.enabled && !!quickUnlock.support?.available && !pending && !state.busy && !state.error;
  useEffect(() => {
    if (!canAutoPrompt || autoPrompted.current === selectedId || !document.hasFocus()) return;
    autoPrompted.current = selectedId ?? null;
    unlockWithBiometrics();
  }, [canAutoPrompt, selectedId, unlockWithBiometrics]);

  const openFile = () => run(async () => {
    const picked = await pickFile();
    if (!picked) return;
    fileHandoff.set(picked);
    router.push(picked.name.toLowerCase().endsWith('.kdbx') ? '/import' : '/unlock');
  });
  const submit = () => {
    if (pending || state.busy || mode === 'create' && !canCreate || mode === 'unlock' && (!password || !file && !selectedId)) return;
    hidePassword();
    run(async () => {
      if (mode === 'create') await session.create(name, password);
      else if (file) await session.importVault(file.bytes, file.name, password, file.sourceToken);
      else if (selectedId) await session.unlock(selectedId, password);
      setPassword(''); setConfirm('');
      router.replace('/vault');
    });
  };

  return <DesktopFrame onboard><div className="desktop-onboard-body">
    {mode === 'welcome' && <div className="desktop-welcome">
      <div className="desktop-welcome-heading">
        <BrandSymbol size={84} />
        <h1>Kiwi Password</h1>
        <p>{t("Mật khẩu của bạn được mã hoá và chỉ lưu trên thiết bị này.")}</p>
      </div>
      <div className="desktop-welcome-actions">
        <Button variant="primary" onClick={() => router.push('/create-vault')}>{t("Tạo Vault mới")}</Button>
        <Button busy={pending} onClick={openFile}>{t("Mở Vault có sẵn…")}</Button>
      </div>
      {recents.length > 0 && <div className="desktop-recents">
        <div className="desktop-section-label">{t("Vault gần đây")}</div>
        <div className="desktop-recent-list">{recents.map((vault) => <div key={vault.id} className="desktop-recent-row" onDoubleClick={() => router.push({ pathname: '/unlock', params: { id: vault.id } })}>
          <Icon name="lock" size={20} />
          <div className="grow"><div className="desktop-recent-name">{vault.name}</div><div className="desktop-recent-location" title={text(vault.location)}>{desktopBridge() ? vault.location : t('{name} · Lưu trong trình duyệt', { name: vaultFileName(vault.name) })}</div></div>
          <div className="desktop-recent-actions">
            <Button small aria-label={t('Mở {name}', { name: vault.name })} onClick={() => router.push({ pathname: '/unlock', params: { id: vault.id } })}>{t("Mở")}</Button>
            <IconButton icon="folder_open" label={t("Tìm file")} onClick={openFile} />
            <IconButton icon="close" label={t('Ẩn {name} khỏi danh sách gần đây', { name: vault.name })} onClick={() => confirmRemoval({
              title: t("Bỏ khỏi danh sách gần đây?"), description: t('Kho “{name}” chỉ bị bỏ khỏi danh sách gần đây. File và dữ liệu trong kho vẫn được giữ nguyên.', { name: vault.name }), confirmLabel: t("Bỏ khỏi danh sách"),
              onConfirm: () => setHiddenRecents((ids) => [...ids, vault.id]),
            })} />
          </div>
        </div>)}</div>
      </div>}
      <button className="desktop-link-button desktop-welcome-import" onClick={() => router.push('/import')}><Icon name="download" size={16} />{t("Nhập mật khẩu từ KeePass")}</button>
    </div>}

    {mode === 'create' && <form className="desktop-create" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <button type="button" className="desktop-back" onClick={() => router.replace({ pathname: '/', params: { chooseVault: '1' } })}><Icon name="arrow_back" />{t("Quay lại")}</button>
      <BrandSymbol size={60} />
      <h1>{t("Tạo Vault")}</h1>
      <Input label={t("Tên Vault")} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("VD: Personal Vault")} autoFocus maxLength={200} />
      <div className="desktop-field"><label>{t("Vị trí lưu")}</label><div className="desktop-location mono" title={location}>{location}</div></div>
      <Input label={t("Master Password")} secret value={password} onChange={(event) => { setPassword(event.target.value); session.clearError(); }} autoComplete="new-password" minLength={12} maxLength={1024} />
      <PasswordStrength value={password} />
      <Input label={t("Xác nhận Master Password")} secret value={confirm} onChange={(event) => setConfirm(event.target.value)} error={confirm && confirm !== password ? t("Hai mật khẩu chưa khớp.") : undefined} autoComplete="new-password" />
      <div className="desktop-info-note"><Icon name="info" /><span>{t("Master Password được dùng để bảo vệ Vault. Ứng dụng không thể tự khôi phục nếu bạn quên mật khẩu.")}</span></div>
      <Button type="submit" variant="primary" disabled={!canCreate} busy={pending || state.busy}>{t("Tạo Vault")}</Button>
    </form>}

    {mode === 'unlock' && <form className="desktop-unlock" onSubmit={(event) => { event.preventDefault(); submit(); }} onKeyDown={(event) => { if (event.key === 'Escape') hidePassword(); }}>
      <div className="desktop-unlock-heading">
        <BrandSymbol size={84} />
        <span className="desktop-brand-caption">Kiwi Password</span>
        <h1>{file ? stripVaultFileExtension(file.name) : recent?.name ?? t("Mở khoá Vault")}</h1>
        <p className="mono">{file?.sourceLocation ?? file?.name ?? (desktopBridge() ? recent?.location : recent ? t('{name} · Lưu trong trình duyệt', { name: vaultFileName(recent.name) }) : location)}</p>
      </div>
      <div className="desktop-unlock-password">
        <div className="desktop-unlock-input">
          <input ref={passwordInput} aria-label={t("Master Password")} type={passwordView.full ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); session.clearError(); }} placeholder={t("Master Password")} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
          <div className="desktop-unlock-actions">
            <IconButton icon="visibility_lock" label={passwordView.partial ? t('Đổi vị trí che mật khẩu') : t('Hiện một phần mật khẩu')} active={passwordView.partial} aria-expanded={passwordView.partial} aria-controls={previewId} disabled={!password || pending || state.busy}
              onMouseDown={(event) => event.preventDefault()} onClick={() => { passwordView.revealPartial(); passwordInput.current?.focus({ preventScroll: true }); }} />
            <IconButton icon={passwordView.full ? 'visibility_off' : 'visibility'} label={passwordView.full ? t('Ẩn mật khẩu') : t('Hiện toàn bộ mật khẩu')} active={passwordView.full} aria-pressed={passwordView.full} disabled={!password || pending || state.busy}
              onMouseDown={(event) => event.preventDefault()} onClick={() => { passwordView.toggleFull(); passwordInput.current?.focus({ preventScroll: true }); }} />
            <button type="submit" className="desktop-unlock-submit" title={t("Mở khoá (Enter)")} aria-label={t("Mở khoá Vault")} disabled={!password || !file && !selectedId || pending || state.busy}>{pending || state.busy ? <span className="desktop-spinner" /> : <Icon name="arrow_forward" />}</button>
          </div>
        </div>
        {passwordView.partial && <div id={previewId} className="desktop-password-preview" role="region" aria-label={t('Mật khẩu hiện một phần')}>
          <div className="desktop-password-preview-heading"><Icon name="visibility_lock" size={15} /><span>{t('Xem một phần')}</span></div>
          <div className="desktop-password-preview-value mono" dir="ltr">{passwordView.preview}</div>
          <div className="desktop-password-preview-hint">{t('{count} ký tự được che · Tự ẩn sau 15 giây', { count: passwordView.maskedCount })}</div>
        </div>}
      </div>
      {state.error && <div className="desktop-error">{text(state.error)}</div>}
      {state.error && !file && selectedId && <Button icon="restore" onClick={() => router.push({ pathname: '/recovery', params: { id: selectedId } })}>{t("Mở bản phục hồi")}</Button>}
      {!file && quickUnlock.enabled && quickUnlock.support?.available && selectedId && <Button icon={quickUnlock.support.method === 'passkey' ? 'key' : 'fingerprint'} busy={pending || state.busy} onClick={unlockWithBiometrics}>{unlockCopy.unlock}</Button>}
      {!file && !selectedId && <Button icon="folder_open" onClick={openFile}>{t("Chọn file Vault…")}</Button>}
      <button type="button" className="desktop-link-button muted" onClick={() => setHelp(true)}>{t("Quên Master Password?")}</button>
      <button type="button" className="desktop-link-button" style={{ marginTop: 12 }} onClick={() => router.replace({ pathname: '/', params: { chooseVault: '1' } })}>{t("Mở Vault khác")}</button>
    </form>}
  </div>
    {confirmationDialog}
    <Dialog open={help} title={t("Master Password là chìa khoá của bạn")} description={t('Hãy dùng mật khẩu chính, cách mở khoá nhanh đã thiết lập hoặc mở bản sao lưu với mật khẩu của bản đó. Ứng dụng không có chức năng đặt lại mật khẩu.')} onClose={() => setHelp(false)} footer={<Button variant="primary" onClick={() => setHelp(false)}>{t("Đã hiểu")}</Button>} />
  </DesktopFrame>;
}
