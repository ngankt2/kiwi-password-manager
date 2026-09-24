import { Directory, File, Paths } from 'expo-file-system';
import type { FilePort } from '@/core/storage/types';
import { VaultError } from '@/core/errors';

export class NativeFilePort implements FilePort {
  private root = new Directory(Paths.document, 'kiro-vaults');
  constructor() { this.root.create({ idempotent: true, intermediates: true }); }
  private file(path: string) {
    if (path.includes('..') || path.startsWith('/') || path.includes('\\')) throw new VaultError('VALIDATION');
    return new File(this.root, path);
  }
  async read(path: string) {
    const file = this.file(path);
    if (!file.exists) throw new VaultError('NOT_FOUND');
    return file.bytes();
  }
  async writeNew(path: string, bytes: Uint8Array) {
    const file = this.file(path);
    file.parentDirectory.create({ idempotent: true, intermediates: true });
    file.create({ overwrite: false });
    await file.write(bytes);
  }
  async promote(source: string, destination: string) {
    await this.file(source).move(this.file(destination), { overwrite: false });
  }
  async remove(path: string) { const file = this.file(path); if (file.exists) await file.delete(); }
  async list(prefix: string) {
    const output: string[] = [];
    const visit = async (directory: Directory) => {
      if (!directory.exists) return;
      for (const entry of await directory.list()) {
        if (entry instanceof Directory) await visit(entry);
        else {
          const path = entry.uri.slice(this.root.uri.replace(/\/$/, '').length + 1);
          if (path.startsWith(prefix)) output.push(path);
        }
      }
    };
    await visit(this.root);
    return output;
  }
}
