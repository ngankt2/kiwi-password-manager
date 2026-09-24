import { useI18n } from '@/shared/hooks/use-i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, Dialog, Input, T } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { session } from '@/infrastructure/session';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { saveItem } from '@/domain/services/items';
import type { VaultItem } from '@/domain/entities/vault';

export function ConflictDialog({ open, draft, onClose }: { open: boolean; draft: VaultItem; onClose: () => void }) {
  const { t } = useI18n();
  const { vault } = useSession(); const { run, pending } = useAction();
  const [name, setName] = useState(`${vault?.name ?? t("Vault")} - recovered`);
  const [review, setReview] = useState<{ added: number; removed: number; changed: number } | null>(null);
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  const [description, setDescription] = useState('');
  const inspect = () => run(async () => {
    const disk = await session.readDiskVersion(); const local = session.getSnapshot().vault; if (!local) return;
    const previous = new Map(local.items.map((item) => [item.id, item])); const next = new Map(disk.items.map((item) => [item.id, item]));
    setReview({ added: disk.items.filter((item) => !previous.has(item.id)).length,
      removed: local.items.filter((item) => !next.has(item.id)).length,
      changed: disk.items.filter((item) => previous.has(item.id) && JSON.stringify(previous.get(item.id)) !== JSON.stringify(item)).length });
  });
  return <><Dialog open={open} title={t("Vault đã thay đổi trên đĩa")} description={t("Bản nháp của bạn vẫn được giữ. Chọn cách tiếp tục; ứng dụng không tự gộp hoặc ghi đè file đã thay đổi.")} onClose={onClose}
    footer={<><Button title={t("Hủy")} variant="ghost" onPress={onClose} /><Button title={t("Xem thay đổi")} variant="secondary" loading={pending} onPress={inspect} />
      <Button title={t("Tải lại file")} variant="secondary" onPress={() => { setDescription('Tải lại sẽ bỏ bản nháp này. Nhập mật khẩu của file trên đĩa để tiếp tục.'); setAuth(() => async (password: string) => { await session.reload(password); onClose(); router.replace('/vault'); }); }} />
      <Button title={t("Lưu thành bản mới")} disabled={!name.trim()} onPress={() => { setDescription('Nhập mật khẩu của vault bạn đã mở. Bản nháp sẽ được lưu trong một file độc lập; file trên đĩa được giữ nguyên.'); setAuth(() => async (password: string) => { await session.saveAs(name, password, (vault) => saveItem(vault, draft, session.id())); onClose(); router.replace({ pathname: '/item/[id]', params: { id: draft.id } }); }); }} />
    </>}>
    <Input label={t("Tên vault cho bản nháp")} value={name} onChangeText={setName} maxLength={200} />
    {review && <View style={{ gap: 8 }}><T weight="semibold">{t("Thay đổi trong file trên đĩa")}</T><T>{t('{count} mục mới', { count: review.added })} · {t('{count} mục thay đổi', { count: review.changed })} · {t('{count} mục bị xóa', { count: review.removed })}</T><T muted>{t("Phần xem trước không hiển thị giá trị bí mật và không thực hiện gộp dữ liệu.")}</T></View>}
  </Dialog><ReauthDialog description={description} action={auth} onClose={() => setAuth(null)} /></>;
}
