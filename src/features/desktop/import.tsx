import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { previewKeePass, type KeePassPreview } from '@/core/kdbx/importer';
import { cryptoProvider } from '@/infrastructure/crypto/provider';
import { pickFile, type PickedFile } from '@/infrastructure/filesystem/transfer';
import { session } from '@/infrastructure/session';
import { useAction } from '@/shared/hooks/use-action';
import { useConfirmation } from '@/shared/hooks/use-confirmation';
import { fileHandoff } from '@/features/vault/file-handoff';
import { DesktopFrame } from './frame';
import { Button, Icon, Input, PasswordStrength } from './ui';

export function DesktopImport() {
  const { t, text } = useI18n();
  const [file, setFile] = useState<PickedFile | null>(() => fileHandoff.take());
  const [keyFile, setKeyFile] = useState<PickedFile | null>(null);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<KeePassPreview | null>(null);
  const { run, pending } = useAction();
  const { confirm: confirmRemoval, confirmationDialog } = useConfirmation();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { file?.bytes.fill(0); }, [file]);
  useEffect(() => () => { keyFile?.bytes.fill(0); }, [keyFile]);
  const inspect = () => run(async () => {
    if (!file) return;
    const secret = password; setPassword('');
    const result = await previewKeePass(cryptoProvider, file.bytes, secret, session.id(), file.name, keyFile?.bytes);
    if (mounted.current) { setPreview(result); setName(result.vault.name || t('Kho đã nhập')); }
  });
  const convert = () => run(async () => {
    if (!preview || newPassword !== confirm || newPassword.length < 12 || !name.trim()) return;
    const secret = newPassword; setNewPassword(''); setConfirm('');
    await session.create(name, secret, preview.vault);
    if (mounted.current) { setPreview(null); router.replace('/vault'); }
  });
  return <DesktopFrame onboard><div className="desktop-onboard-body"><form className="desktop-create" onSubmit={(event) => { event.preventDefault(); if (preview) convert(); else inspect(); }}>
    <button type="button" className="desktop-back" onClick={() => router.replace({ pathname: '/', params: { chooseVault: '1' } })}><Icon name="arrow_back" />{t("Quay lại")}</button>
    <div><h1>{t("Nhập từ KeePass")}</h1><p className="desktop-history-subtitle" style={{ marginTop: 8 }}>{t("Tạo Vault được mã hoá từ cơ sở dữ liệu KeePass của bạn.")}</p></div>
    {!preview ? <>
      <div className="desktop-field"><label>{t("File KeePass")}</label><Button icon={file ? 'description' : 'folder_open'} disabled={pending} onClick={() => run(async () => { const picked = await pickFile(); if (picked) setFile(picked); })}>{file?.name ?? t("Chọn file .kdbx…")}</Button></div>
      <Input label={t("Mật khẩu KeePass")} value={password} onChange={(event) => setPassword(event.target.value)} secret autoFocus={!!file} autoComplete="off" />
      <Button icon="key" disabled={pending} onClick={() => run(async () => { const picked = await pickFile(); if (picked) setKeyFile(picked); })}>{keyFile?.name ?? t("Chọn key file (nếu có)…")}</Button>
      {keyFile && <button type="button" className="desktop-link-button" onClick={() => confirmRemoval({ title: t("Bỏ key file đã chọn?"), description: t("Key file sẽ không được dùng cho lần nhập này. File gốc trên thiết bị vẫn được giữ nguyên."), confirmLabel: t("Bỏ key file"), onConfirm: () => setKeyFile(null) })}>{t("Bỏ key file")}</button>}
      <Button type="submit" variant="primary" busy={pending} disabled={!file}>{t("Xem trước dữ liệu")}</Button>
      <button type="button" className="desktop-link-button" onClick={() => router.push('/import-json')}>{t("Nhập từ file JSON")}</button>
    </> : <>
      <div className="desktop-import-summary"><Icon name="check_circle" size={24} /><div><strong>{t("Sẵn sàng nhập")}</strong><p>{t('{count} mục', { count: preview.counts.entries })} · {t('{count} thư mục', { count: preview.counts.folders })}</p><p>{t('{count} tệp đính kèm', { count: preview.counts.attachments })} · {t('{count} phiên bản', { count: preview.counts.history })}</p></div></div>
      {preview.warnings.map((warning, index) => <div className="desktop-info-note" key={index}><Icon name="info" /><span>{text(warning)}</span></div>)}
      <Input label={t("Tên Vault mới")} value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
      <Input label={t("Master Password mới")} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} secret autoComplete="new-password" hint={t("Ít nhất 12 ký tự.")} />
      <PasswordStrength value={newPassword} />
      <Input label={t("Xác nhận Master Password")} value={confirm} onChange={(event) => setConfirm(event.target.value)} secret autoComplete="new-password" error={confirm && confirm !== newPassword ? t("Hai mật khẩu chưa khớp.") : undefined} />
      <Button type="submit" variant="primary" busy={pending} disabled={!name.trim() || newPassword.length < 12 || newPassword !== confirm}>{t("Tạo Vault từ dữ liệu này")}</Button>
    </>}
    <p className="desktop-hint">{t("File KeePass gốc được giữ nguyên. Dữ liệu được xử lý trên thiết bị này.")}</p>
  </form></div>{confirmationDialog}</DesktopFrame>;
}
