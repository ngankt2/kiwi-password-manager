import { useI18n } from '@/shared/hooks/use-i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { Download, FileJson, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { Button, Divider, Eyebrow, T, ToggleRow } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { ToolLayout } from './tool-layout';
import { colors } from '@/design-system/tokens';
import { session } from '@/infrastructure/session';
import { exportFile } from '@/infrastructure/filesystem/transfer';
import { exportJson } from '@/core/storage/import-export';
import { wipe } from '@/core/bytes';
import { useAction } from '@/shared/hooks/use-action';
import { useSession } from '@/shared/hooks/use-session';
import { VaultError } from '@/core/errors';

export function ExportScreen() {
  const { t } = useI18n();
  const { vault } = useSession(); const { run, pending } = useAction();
  const [confirmed, setConfirmed] = useState(false);
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  return <ToolLayout title={t("Xuất dữ liệu")} detail={t("Bạn kiểm soát nơi lưu trữ dữ liệu của mình.")}>
    <View style={{ padding: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 14, gap: 16 }}>
      <ShieldCheck color={colors.primary} size={24} /><Eyebrow>{t("KHUYÊN DÙNG · VAULT MÃ HÓA")}</Eyebrow><T>{t("Toàn bộ mục, lịch sử, thư mục và tệp đính kèm trong một file .akpr. Cần mật khẩu chính để mở.")}</T>
      <Button title={t("Xuất vault mã hóa")} icon={Download} loading={pending} onPress={() => run(async () => { const exported = await session.encryptedExport(); await exportFile(exported.name, exported.bytes); session.notify('Đã xuất vault mã hóa.'); })} />
    </View>
    <Divider /><Eyebrow>{t("XUẤT KHÔNG MÃ HÓA")}</Eyebrow>
    <View style={{ flexDirection: 'row', gap: 12 }}><TriangleAlert size={22} color={colors.warning} /><T style={{ flex: 1 }}>{t("File JSON chứa mật khẩu ở dạng đọc được. Bất kỳ ai có quyền truy cập file đều có thể đọc toàn bộ dữ liệu.")}</T></View>
    <T muted>{t("JSON giữ đầy đủ cấu trúc, lịch sử và tệp đính kèm. Chỉ xuất khi bạn thật sự cần di chuyển dữ liệu sang một công cụ khác.")}</T>
    <ToggleRow title={t("Tôi hiểu file xuất sẽ không được mã hóa")} value={confirmed} onChange={setConfirmed} />
    <Button title={t("Xuất JSON không mã hóa")} icon={FileJson} variant="danger" disabled={!confirmed || !vault} onPress={() => setAuth(() => async (password: string) => {
      await session.reauthenticate(password);
      const current = session.getSnapshot().vault; if (!current) throw new VaultError('LOCKED');
      const bytes = exportJson(current);
      try { await exportFile(`${current.name}.json`, bytes, true); session.notify('Đã xuất JSON không mã hóa tại vị trí bạn chọn.'); }
      finally { wipe(bytes); }
    })} />
    <ReauthDialog title={t("Xác nhận xuất dữ liệu nhạy cảm")} description={t("Nhập mật khẩu chính để tạo file không mã hóa.")} action={auth} onClose={() => setAuth(null)} />
  </ToolLayout>;
}
