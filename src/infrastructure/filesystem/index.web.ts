import { IndexedDbVaultStorage } from './indexeddb';
import { JournalVaultStorage } from '@/core/storage/journal';
import { LinkedVaultStorage } from '@/core/storage/linked';
import { DesktopFilePort, DesktopLinkedVaultPort } from './desktop';
import { desktopBridge } from '../desktop/bridge';
import { cryptoProvider } from '../crypto/provider';
const desktop = desktopBridge();
export const storage = desktop ? new LinkedVaultStorage(new JournalVaultStorage(new DesktopFilePort(desktop), cryptoProvider), new DesktopLinkedVaultPort(desktop)) : new IndexedDbVaultStorage();
