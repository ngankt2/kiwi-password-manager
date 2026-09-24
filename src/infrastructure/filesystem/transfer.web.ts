import { buffer } from '@/core/bytes';
import { VaultError } from '@/core/errors';
import { MAX_VAULT_BYTES } from '@/core/vault-format/codec';
import { VAULT_FILE_EXTENSIONS, vaultFileName } from '@/core/vault-format/file-names';
import { desktopBridge, desktopCall } from '@/infrastructure/desktop/bridge';

export interface PickedFile { name: string; bytes: Uint8Array; sourceToken?: string; sourceLocation?: string }
export async function pickFile(_encrypted = true): Promise<PickedFile | null> {
  const desktop = desktopBridge();
  if (desktop) return desktopCall(() => desktop.pickFile());
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = [...VAULT_FILE_EXTENSIONS.map((extension) => `.${extension}`), '.kdbx', '.key', '.keyx', '.json', '.csv', '*/*'].join(',');
    input.addEventListener('cancel', () => { input.remove(); resolve(null); }, { once: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0]; input.remove();
      if (!file) { resolve(null); return; }
      if (file.size > MAX_VAULT_BYTES) { reject(new VaultError('LIMIT_EXCEEDED')); return; }
      file.arrayBuffer().then((bytes) => resolve({ name: file.name, bytes: new Uint8Array(bytes) }), reject);
    }, { once: true });
    input.click();
  });
}

export async function exportFile(name: string, bytes: Uint8Array, plaintext = false): Promise<void> {
  if (!plaintext) name = vaultFileName(name);
  const desktop = desktopBridge();
  if (desktop) {
    if (!await desktopCall(() => desktop.exportFile(name, bytes, plaintext))) throw new VaultError('CANCELLED');
    return;
  }
  const url = URL.createObjectURL(new Blob([buffer(bytes)], { type: plaintext ? name.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/json' : 'application/octet-stream' }));
  const link = document.createElement('a'); link.href = url; link.download = name.replace(/[/\\]/g, '-'); link.rel = 'noopener'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export const exportToFolder = exportFile;
