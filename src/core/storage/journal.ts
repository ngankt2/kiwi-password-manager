import { equalBytes, text, toBase64, utf8 } from '../bytes';
import type { CryptoProvider } from '../crypto/types';
import { safeError, VaultError } from '../errors';
import type { BackupSummary, FilePort, SaveOptions, StoredVault, VaultStorageAdapter, VaultSummary, VerifyBytes } from './types';

const safeId = (id: string) => {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id)) throw new VaultError('VALIDATION');
  return id;
};

/** Immutable generations: no write ever truncates a previously committed .vault. */
export class JournalVaultStorage implements VaultStorageAdapter {
  private queues = new Map<string, Promise<unknown>>();
  constructor(private readonly files: FilePort, private readonly crypto: CryptoProvider) {}
  private token() { return toBase64(this.crypto.random(12)).replace(/[^a-zA-Z0-9]/g, ''); }
  private prefix(id: string) { return `vaults/${safeId(id)}/`; }
  private async generations(id: string) {
    return (await this.files.list(this.prefix(id))).filter((path) => /\/\d{12}-[a-zA-Z0-9]+\.vault$/.test(path)).sort().reverse();
  }
  private async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.queues.set(id, next);
    try { return await next; } finally { if (this.queues.get(id) === next) this.queues.delete(id); }
  }
  private async metadata(id: string): Promise<{ name: string; updatedAt: string }> {
    const candidates = (await this.files.list(this.prefix(id))).filter((path) => path.endsWith('.meta')).sort().reverse();
    let newest: { name: string; updatedAt: string } | undefined;
    for (const path of candidates) {
      try {
        const result: unknown = JSON.parse(text(await this.files.read(path)));
        if (result && typeof result === 'object' && 'name' in result && typeof result.name === 'string' && 'updatedAt' in result && typeof result.updatedAt === 'string'
          && Number.isFinite(Date.parse(result.updatedAt)) && (!newest || result.updatedAt > newest.updatedAt)) newest = { name: result.name, updatedAt: result.updatedAt };
      } catch { /* Metadata is rebuildable; an encrypted generation remains usable. */ }
    }
    return newest ?? { name: 'Recovered vault', updatedAt: new Date(0).toISOString() };
  }
  async list(): Promise<VaultSummary[]> {
    const paths = await this.files.list('vaults/');
    const ids = [...new Set(paths.filter((path) => path.endsWith('.vault')).map((path) => path.split('/')[1]))];
    return Promise.all(ids.map(async (id) => ({ id, ...await this.metadata(id), location: this.prefix(id) })));
  }
  open(id: string) { return this.read(id); }
  async read(id: string): Promise<StoredVault> {
    const path = (await this.generations(id))[0];
    if (!path) throw new VaultError('NOT_FOUND');
    const bytes = await this.files.read(path);
    const hash = toBase64(await this.crypto.sha256(bytes));
    return { id, ...await this.metadata(id), location: path, revision: `${path}:${hash}`, bytes };
  }
  create(id: string, name: string, bytes: Uint8Array, verify: VerifyBytes) {
    return this.exclusive(id, () => this.commit(id, name, bytes, null, verify, { automaticBackup: false, retention: 10 }));
  }
  writeAtomic(id: string, name: string, bytes: Uint8Array, expectedRevision: string, verify: VerifyBytes, options: SaveOptions) {
    return this.exclusive(id, () => this.commit(id, name, bytes, expectedRevision, verify, options));
  }
  private async commit(id: string, name: string, bytes: Uint8Array, expected: string | null, verify: VerifyBytes, options: SaveOptions): Promise<StoredVault> {
    const generations = await this.generations(id);
    const old = generations.length ? await this.read(id) : null;
    if ((old?.revision ?? null) !== expected) throw new VaultError('CONFLICT');
    const sequence = Number(generations[0]?.split('/').pop()?.split('-')[0] ?? 0) + 1;
    const final = `${this.prefix(id)}${String(sequence).padStart(12, '0')}-${this.token()}.vault`;
    const temporary = `${final}.tmp`;
    let promoted = false;
    try {
      await this.files.writeNew(temporary, bytes);
      const persisted = await this.files.read(temporary);
      if (!equalBytes(persisted, bytes)) throw new VaultError('SAVE_FAILED');
      await verify(persisted);
      const currentPaths = await this.generations(id);
      const current = currentPaths.length ? await this.read(id) : null;
      if ((current?.revision ?? null) !== expected) throw new VaultError('CONFLICT');
      if (old && (options.automaticBackup || options.reason === 'migration' || options.reason === 'password-change' || options.reason === 'restore')) await this.copyBackup(old, options.reason ?? 'automatic');
      await this.files.promote(temporary, final);
      // Promotion itself may be interrupted by a provider: verify the destination too.
      const destination = await this.files.read(final);
      if (!equalBytes(destination, bytes)) throw new VaultError('SAVE_FAILED');
      await verify(destination);
      const revision = `${final}:${toBase64(await this.crypto.sha256(destination))}`;
      promoted = true;
      const updatedAt = new Date().toISOString();
      // Failure of rebuildable metadata must not invalidate a committed vault.
      try { await this.files.writeNew(final.replace('.vault', '.meta'), utf8(JSON.stringify({ name, updatedAt }))); } catch { /* recoverable */ }
      // Always retain two last-known-good generations, independent of backup settings.
      for (const obsolete of generations.slice(1)) {
        try { await this.files.remove(obsolete); await this.files.remove(obsolete.replace('.vault', '.meta')); } catch { /* retention can retry later */ }
      }
      const retention = Math.max(1, Math.min(100, options.retention));
      try {
        const backups = await this.backups(id);
        for (const obsolete of backups.filter((backup) => backup.reason === 'automatic').slice(retention)) {
          try { await this.files.remove(obsolete.id); await this.files.remove(`${obsolete.id}.meta`); } catch { /* retained safely */ }
        }
      } catch { /* Housekeeping cannot turn a committed save into a reported failure. */ }
      return { id, name, updatedAt, location: final, bytes: destination, revision };
    } catch (error) {
      if (!promoted) { try { await this.files.remove(final); } catch { /* previous generation is untouched */ } }
      throw safeError(error);
    } finally {
      try { await this.files.remove(temporary); } catch { /* abandoned ciphertext can be reclaimed */ }
    }
  }
  private async copyBackup(stored: StoredVault, reason: string): Promise<BackupSummary> {
    const createdAt = new Date().toISOString();
    const id = `backups/${safeId(stored.id)}/${createdAt.replace(/[:.]/g, '-')}-${this.token()}.vault`;
    const backup: BackupSummary = { id, vaultId: stored.id, name: stored.name, createdAt, reason };
    await this.files.writeNew(id, stored.bytes);
    if (!equalBytes(await this.files.read(id), stored.bytes)) throw new VaultError('SAVE_FAILED');
    await this.files.writeNew(`${id}.meta`, utf8(JSON.stringify(backup)));
    return backup;
  }
  async backup(id: string, reason = 'manual') { return this.copyBackup(await this.read(id), reason); }
  async backups(id: string): Promise<BackupSummary[]> {
    const paths = (await this.files.list(`backups/${safeId(id)}/`)).filter((path) => path.endsWith('.vault')).sort().reverse();
    return Promise.all(paths.map(async (path) => {
      try { return JSON.parse(text(await this.files.read(`${path}.meta`))) as BackupSummary; }
      catch { return { id: path, vaultId: id, name: 'Encrypted backup', createdAt: '', reason: 'recovery' }; }
    }));
  }
  async readBackup(id: string) {
    if (!/^(backups|vaults)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.:-]+\.vault$/.test(id)) throw new VaultError('VALIDATION');
    return this.files.read(id);
  }
  async move(id: string, name: string) {
    await this.files.writeNew(`${this.prefix(id)}metadata-${Date.now()}-${this.token()}.meta`, utf8(JSON.stringify({ name, updatedAt: new Date().toISOString() })));
  }
  async delete(id: string) {
    for (const path of [...await this.files.list(this.prefix(id)), ...await this.files.list(`backups/${safeId(id)}/`)]) await this.files.remove(path);
  }
  async stat(id: string) { const { bytes: _bytes, revision: _revision, ...summary } = await this.read(id); return summary; }
  async recoveries(id: string): Promise<BackupSummary[]> {
    const paths = await this.generations(id);
    const metadata = await this.metadata(id);
    return paths.slice(1).map((path) => ({ id: path, vaultId: id, name: metadata.name, createdAt: '', reason: 'last-known-good' }));
  }
}
