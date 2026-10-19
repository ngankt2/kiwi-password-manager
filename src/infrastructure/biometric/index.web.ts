import { cryptoProvider } from '@/infrastructure/crypto/provider';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { PasskeyUnlock, browserPasskeyClient } from './passkey';
import { IndexedDbPasskeyStore } from './passkey-store';
import { touchIdUnlock } from './touch-id';

// The macOS desktop WebView cannot use WebAuthn, so it unlocks with native Touch ID; browsers keep passkeys.
const native = desktopBridge()?.biometrics;
export const biometrics = native ? touchIdUnlock(native) : new PasskeyUnlock(browserPasskeyClient, new IndexedDbPasskeyStore(), cryptoProvider);
