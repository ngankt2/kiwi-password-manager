import { SecureClipboard } from '@/core/security/clipboard';
import { VaultError } from '@/core/errors';
import { desktopBridge, desktopCall } from '@/infrastructure/desktop/bridge';

const desktop = desktopBridge();
export const clipboard = new SecureClipboard({
  supportsOwnership: Boolean(desktop),
  async write(value, seconds) {
    if (desktop) return desktopCall(() => desktop.clipboard.copy(value, seconds));
    if (!navigator.clipboard) throw new VaultError('PERMISSION');
    await navigator.clipboard.writeText(value);
    return null;
  },
  async clearIfOwned(token) { return desktop ? desktopCall(() => desktop.clipboard.clearIfOwned(token)) : false; },
});
