import { VaultError } from '@/core/errors';

/** Contains only credential identifiers, public metadata and wrapped keys. */
export interface PasskeyStore {
  read(id: string): Promise<unknown>;
  add(id: string, record: unknown): Promise<void>;
  remove(id: string): Promise<void>;
}

export class IndexedDbPasskeyStore implements PasskeyStore {
  private database: Promise<IDBDatabase> | undefined;
  constructor(private readonly name = 'appkiro-passkey-unlock') {}
  private db(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const opening = indexedDB.open(this.name, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('keys');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => { this.database = undefined; reject(new VaultError('QUICK_UNLOCK_UNAVAILABLE')); };
      opening.onblocked = () => reject(new VaultError('QUICK_UNLOCK_UNAVAILABLE'));
    });
    return this.database;
  }
  async read(id: string): Promise<unknown> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const request = db.transaction('keys').objectStore('keys').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new VaultError('QUICK_UNLOCK_UNAVAILABLE'));
    });
  }
  private async write(id: string, record?: unknown) {
    const db = await this.db();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new VaultError(tx.error?.name === 'ConstraintError' ? 'CONFLICT' : 'SAVE_FAILED'));
      if (record === undefined) tx.objectStore('keys').delete(id);
      else tx.objectStore('keys').add(record, id);
    });
  }
  add(id: string, record: unknown) { return this.write(id, record); }
  remove(id: string) { return this.write(id); }
}
