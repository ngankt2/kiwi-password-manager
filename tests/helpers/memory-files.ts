import type { FilePort } from '../../src/core/storage/types';
import { VaultError } from '../../src/core/errors';

export class MemoryFiles implements FilePort {
  data = new Map<string, Uint8Array>();
  fail: 'write' | 'promote' | 'corrupt' | null = null;
  async read(path: string) { const bytes = this.data.get(path); if (!bytes) throw new VaultError('NOT_FOUND'); return bytes.slice(); }
  async writeNew(path: string, bytes: Uint8Array) {
    if (this.fail === 'write') throw new VaultError('STORAGE_FULL');
    if (this.data.has(path)) throw new Error('existing file');
    const copy = bytes.slice();
    if (this.fail === 'corrupt' && path.endsWith('.tmp')) copy[copy.length - 1] ^= 1;
    this.data.set(path, copy);
  }
  async promote(from: string, to: string) {
    if (this.fail === 'promote') { this.data.set(to, new Uint8Array([1, 2])); throw new Error('interrupted copy'); }
    if (this.data.has(to)) throw new Error('existing destination');
    this.data.set(to, await this.read(from)); this.data.delete(from);
  }
  async remove(path: string) { this.data.delete(path); }
  async list(prefix: string) { return [...this.data.keys()].filter((path) => path.startsWith(prefix)); }
}
