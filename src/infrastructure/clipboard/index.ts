import { setStringAsync } from 'expo-clipboard';
import { SecureClipboard } from '@/core/security/clipboard';
import { nativeSecurity } from '../security/native-module';

export const clipboard = new SecureClipboard({
  supportsOwnership: nativeSecurity !== null,
  async write(value, seconds) {
    if (nativeSecurity) return nativeSecurity.copy(value, seconds);
    await setStringAsync(value);
    return null;
  },
  async clearIfOwned(token) { return nativeSecurity ? nativeSecurity.clearIfOwned(token) : false; },
});
