import { VaultSession } from '@/domain/services/session';
import { cryptoProvider } from './crypto/provider';
import { storage } from './filesystem';
import { preferences } from './preferences';
import { biometrics } from './biometric';
export const session = new VaultSession(cryptoProvider, storage, preferences, biometrics);
