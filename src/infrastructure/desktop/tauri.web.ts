import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { fromBase64, toBase64 } from '@/core/bytes';
import type { StoredVault } from '@/core/storage/types';
import type { DesktopBridge, DesktopSecurityEvent } from './bridge';
import type { UpdateState } from './updates';

interface Reply<T> { ok: boolean; value?: T; code?: string }
type EncodedVault = Omit<StoredVault, 'bytes'> & { bytes: string };
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await invoke<Reply<T>>('desktop_call', { channel, args });
  if (!result.ok) throw new Error(result.code ?? 'SAVE_FAILED');
  return result.value as T;
}
const decode = (value: EncodedVault): StoredVault => ({ ...value, bytes: fromBase64(value.bytes) });
function subscribe<T>(event: string, listener: (payload: T) => void) {
  let cancelled = false;
  const promise = listen<T>(event, ({ payload }) => { if (!cancelled) listener(payload); });
  void promise.catch(() => undefined);
  return () => { cancelled = true; void promise.then((unlisten) => unlisten()).catch(() => undefined); };
}

export function createTauriBridge(): DesktopBridge {
  // WebKit does not implement Chromium's -webkit-app-region CSS property.
  // Reuse precisely the existing drag regions and interactive exclusions.
  document.addEventListener('mousedown', (event) => {
    const target = event.target;
    if (event.button !== 0 || !(target instanceof Element) || !target.closest('.native-desktop')) return;
    if (!target.closest('.desktop-traffic-lights,.desktop-onboard-chrome,.desktop-list-header,.desktop-detail-toolbar')
        || target.closest('button,input,textarea,select,a,.desktop-resizer,[role="button"]')) return;
    event.preventDefault();
    const window = getCurrentWindow();
    void (event.detail === 2 ? window.toggleMaximize() : window.startDragging()).catch(() => undefined);
  });
  return {
    platform: 'darwin',
    storageLocation: '~/Library/Application Support/Kiro Vault/encrypted-files',
    files: {
      read: async (path) => fromBase64(await call<string>('files:read', path)),
      writeNew: (path, bytes) => call('files:write', path, toBase64(bytes)),
      promote: (from, to) => call('files:promote', from, to),
      remove: (path) => call('files:remove', path),
      list: (prefix) => call('files:list', prefix),
    },
    vaultFiles: {
      list: () => call('vault-files:list'),
      read: async (id) => { const value = await call<EncodedVault | null>('vault-files:read', id); return value ? decode(value) : null; },
      attach: async (id, name, bytes, token) => decode(await call('vault-files:attach', id, name, toBase64(bytes), token)),
      write: async (id, name, bytes, revision) => decode(await call('vault-files:write', id, name, toBase64(bytes), revision)),
      chooseLocation: (id, name) => call('vault-files:choose-location', id, name),
      relocate: async (id, name, bytes, revision, token) => {
        const value = await call<{ record: EncodedVault; previousFileRetained: boolean }>('vault-files:relocate', id, name, toBase64(bytes), revision, token);
        return { ...value, record: decode(value.record) };
      },
      forget: (id) => call('vault-files:forget', id),
    },
    pickFile: async () => {
      const value = await call<{ name: string; bytes: string; sourceToken?: string; sourceLocation?: string } | null>('dialog:open');
      return value ? { ...value, bytes: fromBase64(value.bytes) } : null;
    },
    pickAttachment: async () => {
      const value = await call<{ name: string; bytes: string } | null>('dialog:attach');
      return value ? { name: value.name, bytes: fromBase64(value.bytes) } : null;
    },
    exportFile: (name, bytes, plaintext) => call('dialog:save', name, toBase64(bytes), plaintext),
    preferences: { read: () => call('preferences:read'), write: (settings) => call('preferences:write', settings) },
    clipboard: { copy: (value, seconds) => call('clipboard:copy', value, seconds), clearIfOwned: (token) => call('clipboard:clear', token) },
    isDeviceLocked: () => call('security:locked'),
    onSecurityEvent(listener) {
      let cancelled = false;
      const subscription = listen<DesktopSecurityEvent>('security:event', ({ payload }) => { if (!cancelled) listener(payload); });
      void subscription.catch(() => { if (!cancelled) listener('deviceLocked'); });
      return () => { cancelled = true; void subscription.then((unlisten) => unlisten()).catch(() => undefined); };
    },
    openExternal: (url) => call('external:open', url),
    backupStatus: () => call('backup:status'),
    chooseBackupFolder: () => call('backup:folder'),
    fetchIconResource: (url, kind) => call('icons:fetch', url, kind),
    biometrics: {
      support: () => call('biometric:support'),
      enrolled: (id) => call('biometric:enrolled', id),
      enroll: (id, binding, key) => call('biometric:enroll', id, binding, key),
      recover: (id, binding, prompt) => call('biometric:recover', id, binding, prompt),
      revoke: (id) => call('biometric:revoke', id),
    },
    updates: {
      getState: () => invoke<UpdateState>('desktop_update_state'),
      check: () => invoke<UpdateState>('desktop_update_check'),
      download: (version) => invoke<UpdateState>('desktop_update_download', { version }),
      restart: (version) => invoke<UpdateState>('desktop_update_restart', { version }),
      onState: (listener) => subscribe('updates:state', listener),
      onOpen: (listener) => subscribe('updates:open', listener),
    },
  };
}
