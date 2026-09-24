import { useI18n } from '@/shared/hooks/use-i18n';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ArchiveRestore, Download, Plus, ShieldCheck } from 'lucide-react-native';
import { Button, Dialog, Divider, EmptyState, Eyebrow, Input, Select, T, ToggleRow } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { colors } from '@/design-system/tokens';
import { ToolLayout } from './tool-layout';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { session } from '@/infrastructure/session';
import { pickFile, exportFile, type PickedFile } from '@/infrastructure/filesystem/transfer';
import { openVault } from '@/core/vault-format/codec';
import { vaultFileName } from '@/core/vault-format/file-names';
import { wipe } from '@/core/bytes';
import { weakensSecurity, type Settings } from '@/core/security/settings';
import type { BackupSummary } from '@/core/storage/types';
import type { Vault } from '@/domain/entities/vault';
import { desktopBridge, desktopCall } from '@/infrastructure/desktop/bridge';

const reasonName: Record<string, string> = { automatic: 'Tự động', manual: 'Thủ công', restore: 'Trước khi khôi phục', migration: 'Trước khi nâng cấp', 'password-change': 'Trước khi đổi mật khẩu', 'last-known-good': 'Bản lưu trước', recovery: 'Bản phục hồi' };
export function BackupScreen() {
  const { t, dateTime, text } = useI18n();
  const { current, settings, vault } = useSession(); const { run, pending } = useAction();
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [selected, setSelected] = useState<PickedFile | null>(null); const [password, setPassword] = useState('');
  const [preview, setPreview] = useState<Vault | null>(null);
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  const [folder, setFolder] = useState<{ path: string | null; failed: boolean }>({ path: null, failed: false });
  const loadBackups = useCallback(async () => {
    if (!current) return null;
    const desktop = desktopBridge();
    const [backups, recoveries, folder] = await Promise.all([
      session.storage.backups(current.id), session.storage.recoveries(current.id),
      desktop ? desktopCall(() => desktop.backupStatus()) : Promise.resolve({ path: null, failed: false }),
    ]);
    return { backups: [...backups, ...recoveries], folder };
  }, [current]);
  const refresh = async () => {
    const result = await loadBackups();
    if (result) { setBackups(result.backups); setFolder(result.folder); }
  };
  useEffect(() => {
    let active = true;
    void loadBackups().then((result) => {
      if (active && result) { setBackups(result.backups); setFolder(result.folder); }
    }).catch((error: unknown) => { if (active) session.report(error); });
    return () => { active = false; };
  }, [loadBackups]);
  useEffect(() => () => wipe(selected?.bytes), [selected]);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    if (weakensSecurity(settings, next)) setAuth(() => async (password: string) => { await session.updateSettings(next, password); });
    else run(() => session.updateSettings(next));
  };
  const timestampName = () => vaultFileName(`${vault?.name ?? t("Vault")}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`);
  const choose = () => run(async () => { const file = await pickFile(); if (file) { setSelected(file); setPreview(null); } });
  const inspect = () => run(async () => {
    if (!selected) return;
    const secret = password; setPassword('');
    const opened = await openVault(session.crypto, selected.bytes, secret);
    wipe(opened.context.key); setPreview(opened.vault);
  });
  const close = () => { setSelected(null); setPreview(null); setPassword(''); };
  return <ToolLayout title={t("Sao lưu & khôi phục")} detail={t("Giữ những bản sao mã hóa mà bạn có thể mở độc lập.")}>
    <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
      <Button title={t("Tạo bản sao lưu")} icon={Plus} loading={pending} onPress={() => run(async () => { await session.createBackup(); await refresh(); session.notify('Đã tạo bản sao lưu mã hóa.'); })} />
      <Button title={t("Lưu bản sao ra file")} icon={Download} variant="secondary" onPress={() => run(async () => { const exported = await session.encryptedExport(); await exportFile(timestampName(), exported.bytes); session.notify('Đã lưu bản sao mã hóa.'); })} />
      <Button title={t("Khôi phục từ file")} icon={ArchiveRestore} variant="secondary" onPress={choose} />
    </View>
    <ToggleRow title={t("Sao lưu tự động")} detail={t("Tạo bản sao mã hóa trước mỗi lần lưu thay đổi.")} value={settings.automaticBackups} onChange={(automaticBackups) => update({ automaticBackups })} />
    <Select label={t("Số bản sao tự động cần giữ")} value={String(settings.backupRetention)} onChange={(value) => update({ backupRetention: Number(value) })} options={[...new Set([settings.backupRetention, 5, 10, 25, 50, 100])].sort((a, b) => a - b).map((value) => ({ value: String(value), label: t('{count} bản', { count: value }) }))} />
    <T muted>{t("Bản sao thủ công và bản trước khi đổi mật khẩu hoặc khôi phục được giữ riêng. Mỗi bản vẫn dùng mật khẩu tại thời điểm tạo.")}</T>
    {desktopBridge() && <><Divider /><Eyebrow>{t("THƯ MỤC SAO LƯU NGOÀI")}</Eyebrow><T muted>{folder.path ?? t("Chưa chọn. Bản sao tự động hiện được giữ trong thư mục ứng dụng.")}</T>
      <Button title={t("Chọn thư mục sao lưu")} variant="secondary" onPress={() => run(async () => { const desktop = desktopBridge(); if (desktop) setFolder(await desktopCall(() => desktop.chooseBackupFolder())); })} />
      <T muted>{t("Các bản sao mới được lưu thêm trong thư mục Kiro Vault Backups tại vị trí bạn chọn. Chỉ các file trong danh sách sao lưu của ứng dụng được áp dụng giới hạn lưu giữ.")}</T>
      {folder.failed && <T style={{ color: colors.warning }}>{t("Chưa cập nhật được bản sao bên ngoài. Bản lưu và bản sao nội bộ vẫn còn nguyên. Kiểm tra quyền truy cập hoặc chọn lại thư mục.")}</T>}
    </>}
    <Divider /><Eyebrow>{t("CÁC BẢN SAO TRÊN THIẾT BỊ")}</Eyebrow>
    {backups.length === 0 ? <EmptyState icon={ShieldCheck} title={t("Chưa có bản sao lưu")} detail={t("Tạo bản sao đầu tiên hoặc tiếp tục lưu thay đổi để bật sao lưu tự động.")} /> : backups.map((backup) => <View key={backup.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><ShieldCheck size={19} color={colors.primary} /><View style={{ flex: 1 }}><T weight="semibold">{backup.name}</T><T muted style={{ fontSize: 12 }}>{text(reasonName[backup.reason] ?? 'Bản sao mã hóa')} · {backup.createdAt ? dateTime(backup.createdAt) : t("Phiên bản đã lưu trước đó")}</T></View></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button title={t("Xem & khôi phục")} variant="secondary" small onPress={() => run(async () => { setSelected({ name: vaultFileName(backup.name), bytes: await session.storage.readBackup(backup.id) }); setPreview(null); })} /><Button title={t("Xuất bản sao")} variant="ghost" small icon={Download} onPress={() => run(async () => { await exportFile(vaultFileName(`${backup.name}-${backup.createdAt.replace(/[:.]/g, '-') || 'recovery'}`), await session.storage.readBackup(backup.id)); })} /></View>
    </View>)}
    <Dialog open={selected !== null} title={preview ? t("Xác nhận khôi phục") : t("Kiểm tra bản sao")} description={selected?.name} onClose={close} footer={preview ? <><Button title={t("Hủy")} variant="ghost" onPress={close} /><Button title={t("Khôi phục bản này")} icon={ArchiveRestore} loading={pending} onPress={() => run(async () => { await session.restore(preview); close(); await refresh(); session.notify('Đã khôi phục. Vault trước đó được giữ trong một bản sao mã hóa.'); })} /></> : <Button title={t("Kiểm tra & xem trước")} loading={pending} onPress={inspect} />}>
      {preview ? <><T weight="semibold">{preview.name}</T><T>{t('{count} mục', { count: preview.items.length })} · {t('{count} thư mục', { count: preview.folders.length })}</T><T muted>{t("Vault hiện tại sẽ được sao lưu trước khi thay thế. Những thay đổi hiện tại không được tự động gộp vào bản khôi phục.")}</T></> : <Input label={t("Mật khẩu của bản sao")} value={password} onChangeText={setPassword} secret onSubmitEditing={inspect} />}
    </Dialog><ReauthDialog action={auth} onClose={() => setAuth(null)} />
  </ToolLayout>;
}
