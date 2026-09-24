import { useI18n } from '@/shared/hooks/use-i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { Copy, KeyRound, Save, Trash2 } from 'lucide-react-native';
import { Button, Divider, Eyebrow, Input, T } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { ToolLayout } from './tool-layout';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { session } from '@/infrastructure/session';

export function VaultSettingsScreen() {
  const { t, text } = useI18n();
  const { vault, current } = useSession(); const { run, pending } = useAction();
  const [name, setName] = useState(vault?.name ?? ''); const [copyName, setCopyName] = useState(`${vault?.name ?? t("Vault")} - copy`);
  const [password, setPassword] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState('');
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null); const [authTitle, setAuthTitle] = useState('Xác nhận mật khẩu');
  const deleteDescription = current?.external ? t('Gỡ kho và bản sao nội bộ khỏi ứng dụng. File tại vị trí đã chọn vẫn được giữ nguyên.') : t('Thao tác này xóa vault và các bản sao nội bộ do ứng dụng quản lý. Những file đã xuất ra ngoài vẫn được giữ.');
  const changePassword = () => run(async () => { const old = password; const fresh = next; setPassword(''); setNext(''); setConfirm(''); await session.changePassword(old, fresh); });
  return <ToolLayout title={t("Cài đặt vault")} detail={t("Quản lý file, mật khẩu chính và bản sao độc lập.")}>
    <Input label={t("Tên vault")} value={name} onChangeText={setName} maxLength={200} /><Button title={t("Đổi tên vault")} icon={Save} disabled={!name.trim()} loading={pending} onPress={() => run(() => session.mutate((vault) => ({ ...vault, name: name.trim() })))} />
    <T muted style={{ fontSize: 12 }}>{t('File hiện tại: {path}', { path: text(current?.location ?? '') })}</T>
    {session.storage.relocate && <Button title={t('Đổi vị trí lưu…')} variant="secondary" loading={pending} onPress={() => run(() => session.relocate())} />}
    <Divider /><Eyebrow>{t("ĐỔI MẬT KHẨU CHÍNH")}</Eyebrow>
    <Input label={t("Mật khẩu hiện tại")} value={password} onChangeText={setPassword} secret />
    <Input label={t("Mật khẩu chính mới")} value={next} onChangeText={setNext} secret hint={t("Ít nhất 12 ký tự. Không có chức năng đặt lại mật khẩu.")} />
    <Input label={t("Xác nhận mật khẩu mới")} value={confirm} onChangeText={setConfirm} secret error={confirm && next !== confirm ? t("Mật khẩu xác nhận chưa khớp.") : undefined} />
    <T muted>{t("Một bản sao mã hóa được tạo trước khi đổi. Các bản sao cũ vẫn dùng mật khẩu cũ; mở khoá nhanh sẽ cần thiết lập lại.")}</T>
    <Button title={t("Đổi mật khẩu chính")} icon={KeyRound} disabled={!password || next.length < 12 || confirm !== next} loading={pending} onPress={changePassword} />
    <Divider /><Eyebrow>{t("LƯU THÀNH VAULT MỚI")}</Eyebrow>
    <Input label={t("Tên bản sao độc lập")} value={copyName} onChangeText={setCopyName} maxLength={200} />
    <T muted>{t("Tạo file độc lập với salt và khóa dẫn xuất mới. Mật khẩu chính được giữ nguyên.")}</T>
    <Button title={t("Lưu thành vault mới")} icon={Copy} variant="secondary" disabled={!copyName.trim()} onPress={() => { setAuthTitle('Xác nhận tạo bản sao độc lập'); setAuth(() => async (password: string) => { await session.saveAs(copyName, password); session.notify('Đã mở bản sao độc lập. Vault cũ vẫn được giữ.'); }); }} />
    <Divider /><Eyebrow>{t("XÓA VAULT KHỎI THIẾT BỊ")}</Eyebrow>
    <View style={{ gap: 14 }}><T>{deleteDescription}</T>
      <Button title={t("Xóa vault này")} icon={Trash2} variant="danger" onPress={() => { setAuthTitle('Xác nhận xóa vault và bản sao nội bộ'); setAuth(() => async (password: string) => { await session.deleteCurrent(password); }); }} />
    </View><ReauthDialog title={text(authTitle)}
      destructive={authTitle === 'Xác nhận xóa vault và bản sao nội bộ'}
      confirmLabel={authTitle === 'Xác nhận xóa vault và bản sao nội bộ' ? t('Xóa vault này') : undefined}
      description={authTitle === 'Xác nhận xóa vault và bản sao nội bộ' ? deleteDescription : undefined} action={auth} onClose={() => setAuth(null)} />
  </ToolLayout>;
}
