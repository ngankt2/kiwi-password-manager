import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileJson, Plus, Upload } from 'lucide-react-native';
import { Button, Divider, Eyebrow, Input, PageHeader, T } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { previewJson, mergeImport } from '@/core/storage/import-export';
import { wipe } from '@/core/bytes';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { session } from '@/infrastructure/session';
import { pickFile } from '@/infrastructure/filesystem/transfer';
import type { Vault } from '@/domain/entities/vault';

export function JsonImportScreen() {
  const { t } = useI18n();
  const { status } = useSession(); const { run, pending } = useAction(); const mounted = useRef(true);
  const [preview, setPreview] = useState<Vault | null>(null); const [name, setName] = useState('');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const choose = () => run(async () => {
    const file = await pickFile(false); if (!file) return;
    try { const result = previewJson(file.bytes); if (mounted.current) { setPreview(result); setName(result.name); } }
    finally { wipe(file.bytes); }
  });
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center', paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <View style={{ width: '100%', maxWidth: 660, gap: 20 }}><PageHeader title={t("Nhập JSON")} detail={t("Đọc file xuất từ Kiro và kiểm tra trước khi nhập.")} onBack={() => router.canGoBack() ? router.back() : router.replace('/')} />
      <T muted>{t("File JSON không được mã hóa. Ứng dụng chỉ đọc trong bộ nhớ và sẽ lưu dữ liệu vào vault mã hóa sau khi bạn xác nhận.")}</T>
      <Button title={t("Chọn file JSON")} icon={FileJson} onPress={choose} loading={pending} />
      {preview && <><Divider /><Eyebrow>{t("XEM TRƯỚC")}</Eyebrow><T weight="semibold">{preview.name}</T><T>{t('{count} mục', { count: preview.items.length })} · {t('{count} thư mục', { count: preview.folders.length })} · {t('{count} phiên bản', { count: preview.items.reduce((count, item) => count + item.history.length, 0) })}</T>
        {status === 'unlocked' && <Button title={t("Nhập vào vault đang mở")} icon={Upload} loading={pending} onPress={() => run(async () => { await session.mutate((vault) => mergeImport(vault, preview, () => session.id())); setPreview(null); router.replace('/vault'); session.notify('Đã nhập dữ liệu với ID mới; các mục hiện có được giữ nguyên.'); })} />}
        <Divider /><Input label={t("Tên vault mới")} value={name} onChangeText={setName} maxLength={200} />
        <Input label={t("Mật khẩu cho vault mới")} value={password} onChangeText={setPassword} secret hint={t("Ít nhất 12 ký tự.")} />
        <Input label={t("Xác nhận mật khẩu")} value={confirm} onChangeText={setConfirm} secret />
        <Button title={t("Tạo vault từ JSON")} icon={Plus} loading={pending} disabled={!name.trim() || password.length < 12 || confirm !== password} onPress={() => run(async () => { const secret = password; setPassword(''); setConfirm(''); await session.create(name, secret, { ...preview, id: session.id() }); if (mounted.current) { setPreview(null); router.replace('/vault'); } })} />
      </>}
    </View>
  </ScrollView></SafeAreaView>;
}
