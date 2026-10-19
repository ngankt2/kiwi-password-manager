import type { Translator } from '@/core/i18n';
import type { QuickUnlockMethod } from '@/core/security/quick-unlock';

export function quickUnlockCopy(t: Translator, method: QuickUnlockMethod = 'passkey') {
  const name = method === 'faceId' ? 'Face ID' : method === 'touchId' ? 'Touch ID' : method === 'passkey' ? t('Passkey') : t('Sinh trắc học');
  return {
    name,
    unlock: t('Mở khoá bằng {method}', { method: name }),
    /** Reason shown inside the system Touch ID prompt. */
    reason: t('mở khoá kho mật khẩu'),
    description: method === 'passkey' ? t('Dùng Face ID, Touch ID, Windows Hello hoặc khoá bảo mật theo thiết bị của bạn.')
      : t('Xác thực bằng {method} để mở kho trên thiết bị này.', { method: name }),
  };
}
