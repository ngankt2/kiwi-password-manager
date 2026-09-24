import { useI18n } from '@/shared/hooks/use-i18n';
import { vaultFileName } from '@/core/vault-format/file-names';
import { useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { weakensSecurity, type Settings } from '@/core/security/settings';
import { session } from '@/infrastructure/session';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useDesktopPreferences, type DesktopLayout } from './preferences';
import { useWorkspace } from './workspace';
import { lockVault } from './actions';
import { AuthDialog, Button, Icon } from './ui';
import { LanguagePicker } from './language-picker';
import { QuickUnlockSettings } from './quick-unlock-settings';
import { DesktopUpdateSettings } from './updates';

function Setting({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="desktop-setting-row"><div className="grow desktop-setting-copy"><span>{title}</span>{description && <p>{description}</p>}</div><div className="desktop-setting-control">{children}</div></div>;
}

export function DesktopSettings() {
  const { t, text } = useI18n();
  const { settings, vault, current, busy } = useSession();
  const preferences = useDesktopPreferences();
  const workspace = useWorkspace();
  const { run, pending } = useAction();
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  const native = !!desktopBridge();
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    if (weakensSecurity(settings, next)) setAuth(() => async (password: string) => { await session.updateSettings(next, password); });
    else run(() => session.updateSettings(next));
  };
  return <>
    <div className="desktop-detail-toolbar"><button className="desktop-back" onClick={workspace.backToList}><Icon name="chevron_left" />{t("Vault")}</button></div>
    <div className="desktop-detail-scroll"><div className="desktop-detail-content desktop-settings">
      <div><h1 className="desktop-history-title">{t("Cài đặt")}</h1><p className="desktop-history-subtitle" style={{ marginTop: 4 }}>{t("Tuỳ chỉnh bảo mật và cách sử dụng Vault.")}</p></div>
      <QuickUnlockSettings />
      <section className="desktop-settings-section"><h2>{t("Bảo mật")}</h2>
        <Setting title={t("Tự động khoá")} description={t("Khoá Vault khi không có thao tác.")}><select className="desktop-select" aria-label={t("Tự động khoá")} disabled={pending} value={settings.autoLockSeconds} onChange={(event) => update({ autoLockSeconds: Number(event.target.value) as Settings['autoLockSeconds'] })}>
          <option value={60}>{t("Sau 1 phút")}</option><option value={180}>{text('Sau 3 phút')}</option><option value={300}>{t("Sau 5 phút")}</option><option value={900}>{t("Sau 15 phút")}</option><option value={1800}>{t("Sau 30 phút")}</option><option value={-1}>{t("Không tự động")}</option>
        </select></Setting>
        <Setting title={text('Khoá sau khi rời ứng dụng')} description={text('Bắt đầu tính khi chuyển sang ứng dụng khác hoặc thu nhỏ cửa sổ. Quay lại trước thời hạn để tiếp tục làm việc.')}>
          <select className="desktop-select" aria-label={text('Khoá sau khi rời ứng dụng')} disabled={pending} value={settings.backgroundLockSeconds} onChange={(event) => update({ backgroundLockSeconds: Number(event.target.value) as Settings['backgroundLockSeconds'] })}>
            <option value={0}>{text('Ngay lập tức')}</option><option value={60}>{t('Sau 1 phút')}</option><option value={180}>{text('Sau 3 phút')}</option><option value={300}>{t('Sau 5 phút')}</option><option value={900}>{t('Sau 15 phút')}</option><option value={1800}>{t('Sau 30 phút')}</option><option value={-1}>{t('Không tự động')}</option>
          </select>
        </Setting>
        {native && <p className="desktop-hint desktop-security-note"><Icon name="lock" size={14} />{text('Mac vẫn khoá Vault ngay khi khoá màn hình hoặc chuyển sang chế độ ngủ.')}</p>}
        <Setting title={t("Xác thực trước khi hiện bí mật")} description={t("Yêu cầu Master Password khi hiện hoặc sao chép thông tin bí mật.")}><input aria-label={t("Xác thực trước khi hiện bí mật")} type="checkbox" checked={settings.requireAuthenticationToReveal} disabled={pending} onChange={(event) => update({ requireAuthenticationToReveal: event.target.checked })} /></Setting>
        <Setting title={t("Tự xoá clipboard")} description={native ? t("Tự xoá thông tin đã sao chép sau thời gian đã chọn.") : t("Khả năng tự xoá phụ thuộc quyền clipboard của trình duyệt.")}><select className="desktop-select" aria-label={t("Tự xoá clipboard")} disabled={pending} value={settings.clipboardSeconds} onChange={(event) => update({ clipboardSeconds: Number(event.target.value) as Settings['clipboardSeconds'] })}>
          <option value={10}>{t("Sau 10 giây")}</option><option value={30}>{t("Sau 30 giây")}</option><option value={60}>{t("Sau 1 phút")}</option><option value={0}>{t("Không tự xoá")}</option>
        </select></Setting>
        <div className="desktop-setting-actions" style={{ paddingTop: 12 }}><Button small icon="key" onClick={() => router.push('/vault-settings')}>{t("Đổi Master Password")}</Button><Button small icon="lock" onClick={lockVault}>{t("Khoá Vault")}</Button></div>
      </section>
      <section className="desktop-settings-section"><h2>{t("Dữ liệu Vault")}</h2>
        <div className="desktop-setting-row"><Icon name="lock" size={22} /><div className="grow"><span style={{ fontWeight: 500 }}>{vaultFileName(vault?.name ?? 'Vault')}</span><p className="mono" style={{ overflowWrap: 'anywhere' }}>{native ? current?.location : t("Lưu trong bộ nhớ của trình duyệt này")}</p></div></div>
        {native && <Setting title={text('Vị trí lưu Vault')} description={current?.external
          ? text('Mọi thay đổi được ghi vào file ở trên. Bạn có thể đặt file trong thư mục đồng bộ của mình.')
          : text('Chọn thư mục riêng hoặc thư mục đồng bộ để lưu file Vault và các thay đổi tiếp theo.')}>
          <Button small icon="drive_file_move" busy={pending || busy} onClick={() => run(() => session.relocate())}>{text('Đổi vị trí lưu…')}</Button>
        </Setting>}
        <Setting title={t("Sao lưu tự động")} description={t("Giữ bản mã hoá trước đó mỗi khi lưu thay đổi.")}><input aria-label={t("Sao lưu tự động")} type="checkbox" checked={settings.automaticBackups} disabled={pending} onChange={(event) => update({ automaticBackups: event.target.checked })} /></Setting>
        <div className="desktop-setting-actions" style={{ paddingTop: 12 }}>
          <Button small icon="backup" onClick={() => router.push('/backup')}>{t("Bản sao lưu")}</Button>
          <Button small icon="ios_share" onClick={() => router.push('/export')}>{t("Xuất dữ liệu")}</Button>
          <Button small icon="folder_managed" onClick={() => router.push('/vault-settings')}>{t("Quản lý Vault")}</Button>
        </div>
        <div className="desktop-setting-actions" style={{ paddingTop: 6 }}>
          <Button small icon="download" variant="ghost" onClick={() => router.push('/import')}>{t("Nhập từ KeePass")}</Button>
          <Button small icon="data_object" variant="ghost" onClick={() => router.push('/import-json')}>{t("Nhập JSON")}</Button>
        </div>
      </section>
      <section className="desktop-settings-section"><h2>{t("Giao diện")}</h2>
        <Setting title={t("Chế độ hiển thị")} description={t("Chế độ Hệ thống tự đổi theo giao diện của thiết bị.")}>
          <select className="desktop-select" aria-label={t("Chế độ hiển thị")} value={settings.theme} disabled={pending} onChange={(event) => update({ theme: event.target.value as Settings['theme'] })}>
            <option value="system">{t("Hệ thống")}</option><option value="light">{t("Sáng")}</option><option value="dark">{t("Tối")}</option>
          </select>
        </Setting>
        <Setting title={t("Ngôn ngữ")} description={t("Lựa chọn được lưu trên thiết bị này.")}><LanguagePicker /></Setting>
        <Setting title={t("Bố cục")}><select aria-label={t("Bố cục")} className="desktop-select" value={preferences.layout} disabled={pending} onChange={(event) => update({ desktopLayout: event.target.value as DesktopLayout })}><option value="A">{t("A · 3 cột")}</option><option value="B">{t("B · Rail")}</option><option value="C">{t("C · Bảng")}</option></select></Setting>
        <Setting title={t("Mật độ danh sách")}><select aria-label={t("Mật độ danh sách")} className="desktop-select" value={preferences.comfortable ? 'comfortable' : 'compact'} disabled={pending} onChange={(event) => update({ compactRows: event.target.value === 'compact' })}><option value="compact">{t("Gọn")}</option><option value="comfortable">{t("Thoáng")}</option></select></Setting>
        <Setting title={t("Giảm chuyển động")}><input aria-label={t("Giảm chuyển động")} type="checkbox" checked={settings.reduceMotion} disabled={pending} onChange={(event) => update({ reduceMotion: event.target.checked })} /></Setting>
      </section>
      <DesktopUpdateSettings />
    </div></div>
    <AuthDialog action={auth} onClose={() => setAuth(null)} />
  </>;
}
