import { VaultError, type VaultErrorCode } from '@/core/errors';
import type { QuickUnlockSupport } from '@/core/security/quick-unlock';
import type { Settings } from '@/core/security/settings';
import type { FilePort, LinkedVaultPort } from '@/core/storage/types';
import { createTauriBridge } from './tauri';
import type { DesktopUpdatesBridge } from './updates';

export type DesktopSecurityEvent = 'deviceLocked' | 'background' | 'foreground' | 'lock';
export interface DesktopBridge {
  platform: 'darwin';
  files: FilePort;
  vaultFiles: LinkedVaultPort;
  pickFile(): Promise<{ name: string; bytes: Uint8Array; sourceToken?: string; sourceLocation?: string } | null>;
  /** Unfiltered picker for item attachments; never links a vault source. */
  pickAttachment?(): Promise<{ name: string; bytes: Uint8Array } | null>;
  exportFile(name: string, bytes: Uint8Array, plaintext: boolean): Promise<boolean>;
  preferences: { read(): Promise<unknown>; write(settings: Settings): Promise<void> };
  clipboard: { copy(value: string, seconds: number): Promise<string>; clearIfOwned(token: string): Promise<boolean> };
  isDeviceLocked(): Promise<boolean>;
  onSecurityEvent(listener: (event: DesktopSecurityEvent) => void): () => void;
  openExternal(url: string): Promise<void>;
  storageLocation: string;
  backupStatus(): Promise<{ path: string | null; failed: boolean }>;
  chooseBackupFolder(): Promise<{ path: string | null; failed: boolean }>;
  updates?: DesktopUpdatesBridge;
  fetchIconResource?(url: string, kind: 'image' | 'html'): Promise<{ bytes: string; url: string; contentType: string }>;
  /** Native Touch ID quick unlock; keys cross the bridge as base64. */
  biometrics?: DesktopBiometrics;
}
export interface DesktopBiometrics {
  support(): Promise<QuickUnlockSupport>;
  enrolled(id: string): Promise<boolean>;
  enroll(id: string, binding: string, key: string): Promise<void>;
  recover(id: string, binding: string, prompt: string): Promise<string | null>;
  revoke(id: string): Promise<void>;
}

declare global { interface Window { kiroDesktop?: DesktopBridge } }
export const desktopBridge = (): DesktopBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  if (!window.kiroDesktop && '__TAURI_INTERNALS__' in window) window.kiroDesktop = createTauriBridge();
  return window.kiroDesktop;
};

export async function desktopCall<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    const allowed: VaultErrorCode[] = ['VALIDATION', 'INVALID_FILE', 'SAVE_FAILED', 'NOT_FOUND', 'PERMISSION', 'STORAGE_FULL', 'CONFLICT', 'FILE_EXISTS', 'LIMIT_EXCEEDED', 'CANCELLED'];
    throw new VaultError(allowed.find((code) => code === message) ?? 'SAVE_FAILED');
  }
}
