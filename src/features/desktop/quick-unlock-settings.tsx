import { useState } from 'react';
import { session } from '@/infrastructure/session';
import { useSession } from '@/shared/hooks/use-session';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useQuickUnlock } from '@/shared/hooks/use-quick-unlock';
import { quickUnlockCopy } from '@/shared/i18n/quick-unlock';
import { AuthDialog, Button, Icon } from './ui';

export function QuickUnlockSettings() {
  const { t, text } = useI18n();
  const { current } = useSession();
  const unlock = useQuickUnlock(current?.id);
  const copy = quickUnlockCopy(t, unlock.support?.method);
  const [action, setAction] = useState<'enable' | 'disable' | null>(null);
  const configure = async (password: string) => {
    if (action === 'enable') await session.enableBiometrics(password, { prompt: copy.unlock });
    else await session.disableQuickUnlock(password);
    await unlock.refresh();
  };
  return <section className="desktop-settings-section">
    <h2>{t('Đăng nhập & mở khoá')}</h2>
    <div className="desktop-setting-row"><Icon name="key" size={22} /><div className="grow desktop-setting-copy"><span>{t('Mật khẩu chính')}</span><p>{t('Luôn có thể dùng để mở kho và các bản sao lưu.')}</p></div><span className="desktop-hint">{t('Luôn bật')}</span></div>
    <div className="desktop-setting-row">
      <Icon name={unlock.support?.method === 'passkey' ? 'key' : 'fingerprint'} size={22} />
      <div className="grow desktop-setting-copy"><span>{copy.name}</span><p>{copy.description}</p>
        {unlock.checking ? <p role="status">{t('Đang kiểm tra thiết bị…')}</p>
          : unlock.error ? <p role="status">{text(unlock.error)}</p>
          : !unlock.support?.available && <p>{unlock.support?.reason === 'not-enrolled' ? t('Hãy bật Face ID hoặc vân tay trong cài đặt của thiết bị trước.')
            : unlock.support?.method === 'passkey' ? t('Passkey chưa dùng được trong trình duyệt này. Hãy mở bằng trình duyệt hỗ trợ Passkey.')
              : t('Thiết bị này chưa hỗ trợ mở kho bằng sinh trắc học.')}</p>}
        {unlock.enabled && <p role="status">{t('Đã bật cho kho này trên thiết bị hiện tại.')}</p>}
      </div>
      <div className="desktop-setting-control desktop-quick-unlock-control">
        {unlock.error ? <Button small onClick={() => void unlock.refresh()}>{t('Thử lại')}</Button>
          : unlock.enabled ? <Button small disabled={unlock.checking} aria-label={t('Tắt {method}', { method: copy.name })} onClick={() => setAction('disable')}>{t('Tắt')}</Button>
            : <Button small disabled={!current || unlock.checking || !unlock.support?.available} aria-label={t('Thiết lập {method}', { method: copy.name })} onClick={() => setAction('enable')}>{t('Thiết lập')}</Button>}
      </div>
    </div>
    <p className="desktop-hint desktop-security-note">{t('Mật khẩu chính vẫn cần để mở bản sao lưu hoặc thiết lập trên thiết bị mới.')}</p>
    <AuthDialog action={action ? configure : null} onClose={() => setAction(null)} destructive={action === 'disable'}
      title={action === 'disable' ? t('Tắt {method} cho kho này?', { method: copy.name }) : t('Thiết lập {method}', { method: copy.name })}
      description={action === 'disable' ? t('Nhập mật khẩu chính để tắt cách mở khoá này trên thiết bị hiện tại.') : t('Nhập mật khẩu chính, sau đó xác nhận trên thiết bị để bật {method}.', { method: copy.name })}
      confirmLabel={action === 'disable' ? t('Tắt mở khoá nhanh') : t('Tiếp tục')} />
  </section>;
}
