import { cryptoProvider } from '@/infrastructure/crypto/provider';
import { PasskeyUnlock, browserPasskeyClient } from './passkey';
import { IndexedDbPasskeyStore } from './passkey-store';

export const biometrics = new PasskeyUnlock(browserPasskeyClient, new IndexedDbPasskeyStore(), cryptoProvider);
