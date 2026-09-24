import { JournalVaultStorage } from '@/core/storage/journal';
import { NativeFilePort } from './native';
import { cryptoProvider } from '../crypto/provider';

export const storage = new JournalVaultStorage(new NativeFilePort(), cryptoProvider);
