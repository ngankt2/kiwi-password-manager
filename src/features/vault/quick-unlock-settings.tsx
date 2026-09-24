import { useState } from 'react';
import { View } from 'react-native';
import { Fingerprint } from 'lucide-react-native';
import { session } from '@/infrastructure/session';
import { Button, Divider, Eyebrow, T } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useSession } from '@/shared/hooks/use-session';
import { useQuickUnlock } from '@/shared/hooks/use-quick-unlock';
import { quickUnlockCopy } from '@/shared/i18n/quick-unlock';

export function QuickUnlockSettings() {
  const { t, text } = useI18n();
  const { current } = useSession();
  const unlock = useQuickUnlock(current?.id);
  const copy = quickUnlockCopy(t, unlock.support?.method ?? 'biometric');
  const [action, setAction] = useState<'enable' | 'disable' | null>(null);
  const configure = async (password: string) => {
    if (action === 'enable') await session.enableBiometrics(password, { prompt: copy.unlock });
    else await session.disableQuickUnlock(password);
    await unlock.refresh();
  };
  return <>
    <Eyebrow>{t('Đăng nhập & mở khoá')}</Eyebrow>
    <View style={{ gap: 12, marginTop: 16 }}>
      <T weight="semibold">{copy.name}</T><T muted>{copy.description}</T>
      {unlock.checking ? <T muted>{t('Đang kiểm tra thiết bị…')}</T>
        : unlock.error ? <><T muted>{text(unlock.error)}</T><Button title={t('Thử lại')} variant="secondary" onPress={() => void unlock.refresh()} /></>
          : <>
            {!unlock.support?.available && <T muted>{unlock.support?.reason === 'not-enrolled' ? t('Hãy bật Face ID hoặc vân tay trong cài đặt của thiết bị trước.') : t('Thiết bị này chưa hỗ trợ mở kho bằng sinh trắc học.')}</T>}
            {unlock.enabled && <T muted>{t('Đã bật cho kho này trên thiết bị hiện tại.')}</T>}
            <Button title={unlock.enabled ? t('Tắt {method}', { method: copy.name }) : t('Thiết lập {method}', { method: copy.name })}
              icon={Fingerprint} variant="secondary" disabled={!current || !unlock.enabled && !unlock.support?.available}
              onPress={() => setAction(unlock.enabled ? 'disable' : 'enable')} />
          </>}
      <T muted>{t('Mật khẩu chính vẫn cần để mở bản sao lưu hoặc thiết lập trên thiết bị mới.')}</T>
    </View>
    <Divider />
    <ReauthDialog action={action ? configure : null} onClose={() => setAction(null)} destructive={action === 'disable'}
      title={action === 'disable' ? t('Tắt {method} cho kho này?', { method: copy.name }) : t('Thiết lập {method}', { method: copy.name })}
      description={action === 'disable' ? t('Nhập mật khẩu chính để tắt cách mở khoá này trên thiết bị hiện tại.') : t('Nhập mật khẩu chính, sau đó xác nhận trên thiết bị để bật {method}.', { method: copy.name })}
      confirmLabel={action === 'disable' ? t('Tắt mở khoá nhanh') : t('Tiếp tục')} />
  </>;
}
