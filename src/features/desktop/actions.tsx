import { useI18n } from '@/shared/hooks/use-i18n';
import { useState } from 'react';
import { router } from 'expo-router';
import { clipboard } from '@/infrastructure/clipboard';
import { session } from '@/infrastructure/session';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { VaultError } from '@/core/errors';
import type { ItemFilter } from '@/domain/services/search';
import { AuthDialog } from './ui';

export function lockVault() {
  session.lock();
  void clipboard.clear().catch(() => undefined);
  router.replace('/');
}
export function navigateFilter(filter: ItemFilter) { router.push({ pathname: '/vault', params: { filter } }); }

export function useSecretActions() {
  const { t } = useI18n();
  const { settings } = useSession();
  const { run } = useAction();
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  const authorize = (action: () => Promise<void>, force = settings.requireAuthenticationToReveal) => {
    if (force) setAuth(() => async (password: string) => { await session.reauthenticate(password); await action(); });
    else run(action);
  };
  const copy = (value: string | (() => string), secret = false) => authorize(async () => {
    const result = await clipboard.copy(typeof value === 'function' ? value() : value, settings.clipboardSeconds);
    session.notify(result.autoClears ? t('Đã sao chép. Tự xoá sau {count} giây.', { count: settings.clipboardSeconds }) : 'Đã sao chép vào clipboard.');
  }, secret && settings.requireAuthenticationToReveal);
  const openUrl = (value: string) => run(async () => {
    const url = new URL(value.includes('://') ? value : 'https://' + value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new VaultError('VALIDATION');
    const desktop = desktopBridge();
    if (desktop) await desktop.openExternal(url.toString());
    else window.open(url.toString(), '_blank', 'noopener,noreferrer');
  });
  return { authorize, copy, openUrl, authDialog: <AuthDialog action={auth} onClose={() => setAuth(null)} /> };
}
