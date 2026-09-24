import { equalBytes } from '../bytes';
import { VaultError } from '../errors';
import type { JournalVaultStorage } from './journal';
import type { LinkedVaultPort, SaveOptions, StoredVault, VaultStorageAdapter, VerifyBytes } from './types';

/** Selected files are authoritative. The journal retains encrypted recovery copies. */
export class LinkedVaultStorage implements VaultStorageAdapter {
  private queues = new Map<string, Promise<unknown>>();
  constructor(private readonly journal: JournalVaultStorage, private readonly links: LinkedVaultPort) {}

  private async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(work);
    this.queues.set(id, next);
    try { return await next; }
    finally { if (this.queues.get(id) === next) this.queues.delete(id); }
  }

  async list() {
    const [local, linked] = await Promise.all([this.journal.list(), this.links.list()]);
    return [...new Map([...local, ...linked].map((vault) => [vault.id, vault])).values()];
  }
  open(id: string) { return this.read(id); }
  async read(id: string) { return await this.links.read(id) ?? this.journal.read(id); }
  create(id: string, name: string, bytes: Uint8Array, verify: VerifyBytes) { return this.journal.create(id, name, bytes, verify); }

  /** Checkpoint the exact last verified ciphertext, including changes made elsewhere. */
  private async checkpoint(record: StoredVault) {
    let cached: StoredVault | undefined;
    try { cached = await this.journal.read(record.id); }
    catch (error) { if (!(error instanceof VaultError && error.code === 'NOT_FOUND')) throw error; }
    if (cached && equalBytes(cached.bytes, record.bytes)) return cached;
    const verify = async (bytes: Uint8Array) => { if (!equalBytes(bytes, record.bytes)) throw new VaultError('SAVE_FAILED'); };
    return cached
      ? this.journal.writeAtomic(record.id, record.name, record.bytes, cached.revision, verify, { automaticBackup: false, retention: 10 })
      : this.journal.create(record.id, record.name, record.bytes, verify);
  }

  async openFile(id: string, name: string, bytes: Uint8Array, token: string, verify: VerifyBytes) {
    await verify(bytes);
    const record = await this.links.attach(id, name, bytes, token);
    // Opening remains possible when local recovery storage is full. Saving requires a checkpoint.
    try { await this.checkpoint(record); } catch { /* The selected file is still authoritative. */ }
    return record;
  }

  writeAtomic(id: string, name: string, bytes: Uint8Array, expectedRevision: string, verify: VerifyBytes, options: SaveOptions) {
    return this.exclusive(id, async () => {
      const current = await this.links.read(id);
      if (!current) return this.journal.writeAtomic(id, name, bytes, expectedRevision, verify, options);
      if (current.revision !== expectedRevision) throw new VaultError('CONFLICT');
      await verify(bytes);
      const cached = await this.checkpoint(current);
      // Preserve both the previous file and the proposed change before replacing the source.
      // If the source changes or becomes unavailable, the UI reports failure and these remain recoverable.
      await this.journal.writeAtomic(id, name, bytes, cached.revision, verify, options);
      await verify(bytes);
      return this.links.write(id, name, bytes, expectedRevision);
    });
  }

  relocate(id: string, expectedRevision: string, verify: VerifyBytes) {
    return this.exclusive(id, async () => {
      const before = await this.read(id);
      if (before.revision !== expectedRevision) throw new VaultError('CONFLICT');
      const token = await this.links.chooseLocation(id, before.name);
      if (!token) return null;
      const current = await this.read(id);
      if (current.revision !== expectedRevision) throw new VaultError('CONFLICT');
      await verify(current.bytes);
      await this.checkpoint(current);
      await verify(current.bytes);
      return this.links.relocate(id, current.name, current.bytes, current.external ? current.revision : null, token);
    });
  }

  backup(id: string, reason = 'manual') {
    return this.exclusive(id, async () => {
      const current = await this.links.read(id);
      if (current) await this.checkpoint(current);
      return this.journal.backup(id, reason);
    });
  }
  backups(id: string) { return this.journal.backups(id); }
  readBackup(id: string) { return this.journal.readBackup(id); }
  move(id: string, name: string) { return this.journal.move(id, name); }
  delete(id: string) {
    return this.exclusive(id, async () => {
      // Removing a vault from this device never deletes a shared source on other devices.
      await this.links.forget(id);
      await this.journal.delete(id);
    });
  }
  async stat(id: string) { const { bytes: _bytes, revision: _revision, ...summary } = await this.read(id); return summary; }
  async recoveries(id: string) {
    const previous = await this.journal.recoveries(id);
    if (!(await this.links.list()).some((vault) => vault.id === id)) return previous;
    try {
      const latest = await this.journal.read(id);
      return [{ id: latest.location, vaultId: id, name: latest.name, createdAt: latest.updatedAt, reason: 'last-known-good' }, ...previous];
    } catch { return previous; }
  }
}
