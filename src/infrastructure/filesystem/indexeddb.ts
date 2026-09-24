import { buffer, equalBytes } from '@/core/bytes';
import { VaultError, safeError } from '@/core/errors';
import type { BackupSummary, SaveOptions, StoredVault, VaultStorageAdapter, VaultSummary, VerifyBytes } from '@/core/storage/types';

type VaultRow = VaultSummary & { revision: string; data: ArrayBuffer };
type BackupRow = BackupSummary & { data: ArrayBuffer };
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(new VaultError('SAVE_FAILED')); });
const completed = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(new VaultError(tx.error?.name === 'QuotaExceededError' ? 'STORAGE_FULL' : 'SAVE_FAILED'));
  tx.onabort = () => reject(new VaultError('SAVE_FAILED'));
});

export class IndexedDbVaultStorage implements VaultStorageAdapter {
  private database: Promise<IDBDatabase> | undefined;
  constructor(private readonly name = 'kiro-encrypted-vaults') {}
  private db(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const opening = indexedDB.open(this.name, 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore('vaults', { keyPath: 'id' });
        opening.result.createObjectStore('backups', { keyPath: 'id' });
        opening.result.createObjectStore('temporary', { keyPath: 'id' });
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(new VaultError('PERMISSION'));
      opening.onblocked = () => reject(new VaultError('PERMISSION'));
    });
    return this.database;
  }
  async list(): Promise<VaultSummary[]> {
    const tx = (await this.db()).transaction('vaults');
    const rows = await request<VaultRow[]>(tx.objectStore('vaults').getAll());
    return rows.map(({ data: _data, revision: _revision, ...summary }) => summary);
  }
  open(id: string) { return this.read(id); }
  async read(id: string): Promise<StoredVault> {
    const row = await request<VaultRow | undefined>((await this.db()).transaction('vaults').objectStore('vaults').get(id));
    if (!row) throw new VaultError('NOT_FOUND');
    const { data, ...record } = row;
    return { ...record, bytes: new Uint8Array(data) };
  }
  create(id: string, name: string, bytes: Uint8Array, verify: VerifyBytes) { return this.commit(id, name, bytes, null, verify, { automaticBackup: false, retention: 10 }); }
  writeAtomic(id: string, name: string, bytes: Uint8Array, revision: string, verify: VerifyBytes, options: SaveOptions) { return this.commit(id, name, bytes, revision, verify, options); }
  private async commit(id: string, name: string, bytes: Uint8Array, expected: string | null, verify: VerifyBytes, options: SaveOptions): Promise<StoredVault> {
    const db = await this.db();
    const stagedId = crypto.randomUUID();
    try {
      const stage = db.transaction('temporary', 'readwrite');
      const stageDone = completed(stage);
      stage.objectStore('temporary').add({ id: stagedId, data: buffer(bytes) });
      await stageDone;
      const staged = await request<{ id: string; data: ArrayBuffer }>(db.transaction('temporary').objectStore('temporary').get(stagedId));
      if (!equalBytes(new Uint8Array(staged.data), bytes)) throw new VaultError('SAVE_FAILED');
      await verify(new Uint8Array(staged.data));
      const revision = crypto.randomUUID();
      const updatedAt = new Date().toISOString();
      const row: VaultRow = { id, name, revision, updatedAt, location: 'Browser · encrypted local storage', data: staged.data };
      // Comparison and replacement occur in the same readwrite transaction, including across tabs.
      let conflict = false;
      const tx = db.transaction(['vaults', 'backups', 'temporary'], 'readwrite', { durability: 'strict' });
      const done = completed(tx);
      const currentRequest = tx.objectStore('vaults').get(id) as IDBRequest<VaultRow | undefined>;
      currentRequest.onsuccess = () => {
        const current = currentRequest.result;
        if ((current?.revision ?? null) !== expected) { conflict = true; tx.abort(); return; }
        if (current) {
          tx.objectStore('backups').put({ id: `${id}:recovery`, vaultId: id, name: current.name, createdAt: updatedAt, reason: 'last-known-good', data: current.data });
          if (options.automaticBackup || ['migration', 'password-change', 'restore'].includes(options.reason ?? '')) {
            tx.objectStore('backups').add({ id: `${id}:${updatedAt}:${revision}`, vaultId: id, name: current.name, createdAt: updatedAt, reason: options.reason ?? 'automatic', data: current.data });
          }
        }
        tx.objectStore('vaults').put(row);
        tx.objectStore('temporary').delete(stagedId);
      };
      try { await done; } catch (error) { if (conflict) throw new VaultError('CONFLICT'); throw error; }
      // Retention cannot invalidate a committed save. Manual and migration backups are retained.
      try {
        const obsolete = (await this.backups(id)).filter((backup) => backup.reason === 'automatic').slice(Math.max(1, Math.min(100, options.retention)));
        const retention = db.transaction('backups', 'readwrite');
        const retentionDone = completed(retention);
        for (const backup of obsolete) retention.objectStore('backups').delete(backup.id);
        await retentionDone;
      } catch { /* retry retention on a future save */ }
      const { data: _data, ...record } = row;
      return { ...record, bytes: new Uint8Array(staged.data) };
    } catch (error) { throw safeError(error); }
    finally {
      try { const tx = db.transaction('temporary', 'readwrite'); const done = completed(tx); tx.objectStore('temporary').delete(stagedId); await done; } catch { /* encrypted orphan only */ }
    }
  }
  async backup(id: string, reason = 'manual'): Promise<BackupSummary> {
    const current = await this.read(id);
    const backup: BackupSummary = { id: `${id}:${crypto.randomUUID()}`, vaultId: id, name: current.name, createdAt: new Date().toISOString(), reason };
    const tx = (await this.db()).transaction('backups', 'readwrite'); const done = completed(tx);
    tx.objectStore('backups').add({ ...backup, data: buffer(current.bytes) }); await done;
    return backup;
  }
  async backups(id: string) {
    const rows = await request<BackupRow[]>((await this.db()).transaction('backups').objectStore('backups').getAll());
    return rows.filter((row) => row.vaultId === id).map(({ data: _data, ...row }) => row).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async readBackup(id: string) {
    const row = await request<BackupRow | undefined>((await this.db()).transaction('backups').objectStore('backups').get(id));
    if (!row) throw new VaultError('NOT_FOUND');
    return new Uint8Array(row.data);
  }
  async move(id: string, name: string) {
    const tx = (await this.db()).transaction('vaults', 'readwrite'); const done = completed(tx);
    const read = tx.objectStore('vaults').get(id) as IDBRequest<VaultRow | undefined>;
    read.onsuccess = () => { if (read.result) tx.objectStore('vaults').put({ ...read.result, name }); };
    await done;
  }
  async delete(id: string) {
    const backups = await this.backups(id);
    const tx = (await this.db()).transaction(['vaults', 'backups'], 'readwrite'); const done = completed(tx);
    tx.objectStore('vaults').delete(id);
    for (const backup of backups) tx.objectStore('backups').delete(backup.id);
    await done;
  }
  async stat(id: string) { const { bytes: _bytes, revision: _revision, ...summary } = await this.read(id); return summary; }
  async recoveries(id: string) { return (await this.backups(id)).filter((backup) => backup.reason === 'last-known-good'); }
}
