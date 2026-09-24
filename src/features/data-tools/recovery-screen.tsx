import { useI18n } from '@/shared/hooks/use-i18n';
import { vaultFileName } from '@/core/vault-format/file-names';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArchiveRestore } from 'lucide-react-native';
import { Button, EmptyState, PageHeader, T } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { session } from '@/infrastructure/session';
import { useAction } from '@/shared/hooks/use-action';
import { useSession } from '@/shared/hooks/use-session';
import { fileHandoff } from '@/features/vault/file-handoff';
import type { BackupSummary } from '@/core/storage/types';

export function RecoveryScreen() {
  const { t, dateTime } = useI18n();
  const { id } = useLocalSearchParams<{ id?: string }>(); const { current } = useSession(); const selectedId = id ?? current?.id;
  const [backups, setBackups] = useState<BackupSummary[]>([]); const { run, pending } = useAction();
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void Promise.all([session.storage.backups(selectedId), session.storage.recoveries(selectedId)])
      .then(([backups, recoveries]) => { if (active) setBackups([...recoveries, ...backups]); }).catch((error: unknown) => session.report(error));
    return () => { active = false; };
  }, [selectedId]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView contentContainerStyle={{ alignItems: 'center', padding: 24, paddingBottom: 50 }}><View style={{ width: '100%', maxWidth: 660, gap: 18 }}>
    <PageHeader title={t("Phục hồi vault")} detail={t("Mở bản lưu trước bằng mật khẩu tại thời điểm tạo.")} onBack={() => router.replace('/')} />
    <T muted>{t("Bản phục hồi được mở thành một vault độc lập sau khi giải mã và xác minh. File đang gặp lỗi được giữ nguyên.")}</T>
    {backups.length === 0 ? <EmptyState icon={ArchiveRestore} title={t("Không tìm thấy bản sao nội bộ")} detail={t("Bạn có thể mở file .akpr đã xuất từ màn hình chào mừng.")} /> : backups.map((backup) => <View key={backup.id} style={{ padding: 18, gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}>
      <T weight="semibold">{backup.name}</T><T muted>{backup.createdAt ? dateTime(backup.createdAt) : t("Bản đã lưu trước đó")}</T><Button title={t("Mở bản phục hồi")} icon={ArchiveRestore} loading={pending} variant="secondary" onPress={() => run(async () => { fileHandoff.set({ name: vaultFileName(backup.name), bytes: await session.storage.readBackup(backup.id) }); router.push('/unlock'); })} />
    </View>)}
  </View></ScrollView></SafeAreaView>;
}
