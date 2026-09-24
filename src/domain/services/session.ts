import { calibrateKdf } from '@/core/crypto/calibrate';
import type { CryptoProvider } from '@/core/crypto/types';
import { equalBytes, toBase64, wipe } from '@/core/bytes';
import { safeError, VaultError } from '@/core/errors';
import { DEFAULT_SETTINGS, SettingsSchema, weakensSecurity, type Settings } from '@/core/security/settings';
import type { QuickUnlockOptions, QuickUnlockPort } from '@/core/security/quick-unlock';
import type { StoredVault, VaultStorageAdapter, VaultSummary } from '@/core/storage/types';
import { deriveContext, openVault, openWithKey, readEnvelope, sealVault, type KeyContext } from '@/core/vault-format/codec';
import { vaultFileName } from '@/core/vault-format/file-names';
import { validateVault, type Vault } from '../entities/vault';
import { createVault } from './items';

export interface PreferencesPort { read(): Promise<unknown>; write(settings: Settings): Promise<void> }
export type BiometricPort = QuickUnlockPort;
export interface SessionView {
  status: 'loading' | 'locked' | 'unlocked'; vault: Vault | null; current: VaultSummary | null;
  recents: VaultSummary[]; settings: Settings; busy: boolean; migrated: boolean;
  error: string | null; notice: string | null; epoch: number; privacyEpoch: number;
}

export function selectRecentVault({ current, recents, settings }: Pick<SessionView, 'current' | 'recents' | 'settings'>): VaultSummary | undefined {
  if (current && recents.some((vault) => vault.id === current.id)) return current;
  const lastOpened = recents.find((vault) => vault.id === settings.lastOpenedVaultId);
  return lastOpened ?? recents.reduce<VaultSummary | undefined>((latest, vault) =>
    !latest || vault.updatedAt > latest.updatedAt ? vault : latest, undefined);
}

export class VaultSession {
  private view: SessionView = { status: 'loading', vault: null, current: null, recents: [], settings: DEFAULT_SETTINGS,
    busy: false, migrated: false, error: null, notice: null, epoch: 0, privacyEpoch: 0 };
  private listeners = new Set<() => void>();
  private context: KeyContext | null = null;
  private record: StoredVault | null = null;
  private generation = 0;
  private operations = new Set<Uint8Array>();
  private unlockRequests = new Set<AbortController>();
  private queue: Promise<unknown> = Promise.resolve();
  private restarting = false;
  private preferenceWrites = 0;
  constructor(readonly crypto: CryptoProvider, readonly storage: VaultStorageAdapter, private readonly preferences: PreferencesPort, readonly biometrics: BiometricPort) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(patch: Partial<SessionView>) { this.view = { ...this.view, ...patch }; for (const listener of this.listeners) listener(); }
  private assert(epoch: number) { if (epoch !== this.generation) throw new VaultError('LOCKED'); }
  private assertWritable() { if (this.restarting) throw new VaultError('CANCELLED'); }
  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    if (this.restarting) return Promise.reject(new VaultError('CANCELLED'));
    const next = this.queue.catch(() => undefined).then(action);
    this.queue = next; return next;
  }
  id() { return toBase64(this.crypto.random(18)).replace(/[^a-zA-Z0-9]/g, ''); }
  report(error: unknown) { this.publish({ error: safeError(error).message }); }
  notify(message: string | null) { this.publish({ notice: message, error: null }); }
  clearError() { this.publish({ error: null }); }

  /** Fence new operations, including saves queued before busy becomes visible.
   * Release the fence if the native restart fails or is cancelled. */
  async prepareForRestart(): Promise<() => void> {
    if (this.restarting || this.view.busy || this.preferenceWrites > 0 || this.unlockRequests.size > 0) throw new VaultError('CONFLICT');
    this.restarting = true;
    try {
      await this.queue;
      if (this.view.busy || this.operations.size > 0 || this.preferenceWrites > 0) throw new VaultError('CONFLICT');
      return () => { this.restarting = false; };
    } catch (error) { this.restarting = false; throw error; }
  }

  async initialize() {
    try {
      const result = SettingsSchema.safeParse(await this.preferences.read());
      this.publish({ settings: result.success ? result.data : DEFAULT_SETTINGS, recents: await this.storage.list(), status: 'locked' });
    } catch (error) { this.publish({ status: 'locked', error: safeError(error, 'PERMISSION').message }); }
  }
  async refreshRecents() { this.publish({ recents: await this.storage.list() }); }
  lock() {
    this.generation++;
    for (const request of this.unlockRequests) request.abort();
    this.unlockRequests.clear();
    wipe(this.context?.key);
    for (const key of this.operations) wipe(key);
    this.operations.clear(); this.context = null; this.record = null;
    this.publish({ status: 'locked', vault: null, busy: false, migrated: false, error: null, notice: null, epoch: this.generation, privacyEpoch: this.view.privacyEpoch + 1 });
  }
  private passwordPolicy(password: string) {
    if (password.length < 12 || password.length > 1024) throw new VaultError('VALIDATION');
  }
  private async establish(record: StoredVault, vault: Vault, context: KeyContext, migrated: boolean, epoch: number) {
    this.assert(epoch);
    wipe(this.context?.key);
    this.context = context; this.record = record;
    const { bytes: _bytes, revision: _revision, ...current } = record;
    this.publish({ status: 'unlocked', vault, current, recents: [current, ...this.view.recents.filter((entry) => entry.id !== current.id)], migrated, busy: false, error: null, epoch,
      notice: migrated ? 'An older vault was opened safely. Your original will be backed up on the next save.' : null });
    if (this.view.settings.lastOpenedVaultId !== current.id) {
      try { await this.updateSettings({ ...this.view.settings, lastOpenedVaultId: current.id }); }
      catch { /* Remembering a recent vault must not prevent a verified vault from opening. */ }
    }
    try { await this.refreshRecents(); } catch { /* The verified open vault remains usable if recent-file metadata fails. */ }
  }
  async unlock(id: string, password: string) {
    this.assertWritable();
    const epoch = ++this.generation; this.publish({ busy: true, error: null });
    let context: KeyContext | undefined;
    try {
      const record = await this.storage.open(id);
      const result = await openVault(this.crypto, record.bytes, password); context = result.context;
      this.assert(epoch);
      await this.establish(record, result.vault, result.context, result.migrated, epoch);
      context = undefined;
    } finally { wipe(context?.key); if (epoch === this.generation) this.publish({ busy: false }); }
  }
  async create(name: string, password: string, initial?: Vault) {
    this.assertWritable();
    this.passwordPolicy(password);
    const epoch = ++this.generation; this.publish({ busy: true, error: null });
    let context: KeyContext | undefined;
    try {
      const { parameters } = await calibrateKdf(this.crypto); this.assert(epoch);
      context = await deriveContext(this.crypto, password, parameters); this.assert(epoch);
      this.operations.add(context.key);
      const vault = initial ? validateVault({ ...initial, name: name.trim() }) : createVault(this.id(), name);
      const encrypted = await sealVault(this.crypto, vault, context); this.assert(epoch);
      const key = context.key;
      const record = await this.storage.create(this.id(), name, encrypted, async (bytes) => { this.assert(epoch); await openWithKey(this.crypto, bytes, key); this.assert(epoch); });
      this.assert(epoch); this.operations.delete(key);
      await this.establish(record, vault, context, false, epoch); context = undefined;
    } finally { if (context) { this.operations.delete(context.key); wipe(context.key); } if (epoch === this.generation) this.publish({ busy: false }); }
  }
  async importVault(bytes: Uint8Array, name: string, password: string, sourceToken?: string) {
    this.assertWritable();
    const epoch = ++this.generation; this.publish({ busy: true, error: null });
    let context: KeyContext | undefined;
    try {
      const result = await openVault(this.crypto, bytes, password); context = result.context; this.assert(epoch);
      this.operations.add(context.key);
      const verify = async (saved: Uint8Array) => { this.assert(epoch); await openWithKey(this.crypto, saved, result.context.key); this.assert(epoch); };
      if (sourceToken && !this.storage.openFile) throw new VaultError('PERMISSION');
      const record = sourceToken
        ? await this.storage.openFile!(this.id(), result.vault.name || name, bytes, sourceToken, verify)
        : await this.storage.create(this.id(), result.vault.name || name, bytes, verify);
      this.assert(epoch); this.operations.delete(context.key);
      await this.establish(record, result.vault, context, result.migrated, epoch); context = undefined;
    } finally { if (context) { this.operations.delete(context.key); wipe(context.key); } if (epoch === this.generation) this.publish({ busy: false }); }
  }
  mutate(transform: (vault: Vault) => Vault, reason?: string): Promise<void> {
    const epoch = this.generation;
    return this.enqueue(async () => {
      this.assert(epoch);
      if (!this.context || !this.record || !this.view.vault) throw new VaultError('LOCKED');
      this.publish({ busy: true, error: null });
      const key = this.context.key.slice(); this.operations.add(key);
      try {
        const next = validateVault({ ...transform(this.view.vault), revision: this.view.vault.revision + 1, updatedAt: new Date().toISOString() });
        const bytes = await sealVault(this.crypto, next, { key, kdf: this.context.kdf }); this.assert(epoch);
        const saved = await this.storage.writeAtomic(this.record.id, next.name, bytes, this.record.revision,
          async (persisted) => { this.assert(epoch); const checked = await openWithKey(this.crypto, persisted, key); if (checked.vault.revision !== next.revision) throw new VaultError('CORRUPT'); this.assert(epoch); },
          { automaticBackup: this.view.settings.automaticBackups, retention: this.view.settings.backupRetention, reason: this.view.migrated ? 'migration' : reason });
        this.assert(epoch); this.record = saved;
        this.publish({ vault: next, current: { id: saved.id, name: next.name, updatedAt: saved.updatedAt, location: saved.location, external: saved.external }, migrated: false, notice: 'Changes saved' });
      } finally { this.operations.delete(key); wipe(key); if (epoch === this.generation) this.publish({ busy: false }); }
    });
  }
  async reauthenticate(password: string) {
    if (!this.record || !this.context) throw new VaultError('LOCKED');
    const epoch = this.generation;
    const record = this.record;
    const current = await this.storage.read(record.id); this.assert(epoch);
    if (current.revision !== record.revision) throw new VaultError('CONFLICT');
    const authenticated = await openVault(this.crypto, current.bytes, password);
    try { this.assert(epoch); if (!this.context || !equalBytes(authenticated.context.key, this.context.key)) throw new VaultError('AUTHENTICATION'); }
    finally { wipe(authenticated.context.key); }
  }
  relocate() {
    const epoch = this.generation;
    return this.enqueue(async () => {
      this.assert(epoch);
      if (!this.record || !this.context) throw new VaultError('LOCKED');
      if (!this.storage.relocate) throw new VaultError('PERMISSION');
      this.publish({ busy: true, error: null });
      const key = this.context.key.slice(); this.operations.add(key);
      try {
        const moved = await this.storage.relocate(this.record.id, this.record.revision, async (bytes) => {
          this.assert(epoch); await openWithKey(this.crypto, bytes, key); this.assert(epoch);
        });
        this.assert(epoch);
        if (!moved) return;
        this.record = moved.record;
        const { bytes: _bytes, revision: _revision, ...current } = moved.record;
        this.publish({ current, notice: moved.previousFileRetained
          ? 'Vault location changed. The old file was kept because it changed or could not be removed.'
          : 'Vault location changed. Future changes will be saved to this file.' });
        try { await this.refreshRecents(); } catch { /* The file and its new binding have already committed. */ }
      } finally { this.operations.delete(key); wipe(key); if (epoch === this.generation) this.publish({ busy: false }); }
    });
  }
  changePassword(currentPassword: string, newPassword: string) {
    const epoch = this.generation;
    return this.enqueue(async () => {
    this.assert(epoch); this.passwordPolicy(newPassword); await this.reauthenticate(currentPassword); this.assert(epoch);
    this.publish({ busy: true });
    let next: KeyContext | undefined;
    try {
      if (!this.record || !this.view.vault) throw new VaultError('LOCKED');
      const record = this.record; const vault = this.view.vault;
      const { parameters } = await calibrateKdf(this.crypto); this.assert(epoch);
      next = await deriveContext(this.crypto, newPassword, parameters); this.operations.add(next.key); this.assert(epoch);
      await this.biometrics.revoke(record.id); this.assert(epoch);
      const bytes = await sealVault(this.crypto, vault, next); this.assert(epoch);
      const key = next.key;
      const saved = await this.storage.writeAtomic(record.id, vault.name, bytes, record.revision,
        async (persisted) => { this.assert(epoch); await openWithKey(this.crypto, persisted, key); this.assert(epoch); },
        { automaticBackup: true, retention: this.view.settings.backupRetention, reason: 'password-change' });
      this.assert(epoch); wipe(this.context?.key); this.context = next; this.record = saved; this.operations.delete(next.key); next = undefined;
      this.notify('Master password changed. Existing backups still use their original password.');
    } finally { if (next) { this.operations.delete(next.key); wipe(next.key); } if (epoch === this.generation) this.publish({ busy: false }); }
  }); }
  async updateSettings(next: Settings, password?: string) {
    this.assertWritable();
    this.preferenceWrites++;
    try {
      const settings = SettingsSchema.parse(next);
      if (weakensSecurity(this.view.settings, settings)) await this.reauthenticate(password ?? '');
      await this.preferences.write(settings); this.publish({ settings });
    } finally { this.preferenceWrites--; }
  }
  private binding(bytes: Uint8Array) {
    const { header } = readEnvelope(bytes);
    return `${header.vaultId}:${JSON.stringify(header.kdf)}`;
  }
  enableBiometrics(password: string, options: QuickUnlockOptions = {}) {
    const epoch = this.generation;
    return this.enqueue(async () => {
    this.assert(epoch);
    await this.reauthenticate(password); this.assert(epoch);
    const available = await this.biometrics.available(); this.assert(epoch);
    if (!available) throw new VaultError('QUICK_UNLOCK_UNSUPPORTED');
    if (!this.record || !this.context) throw new VaultError('LOCKED');
    const record = this.record; const key = this.context.key.slice(); this.operations.add(key);
    const request = new AbortController(); this.unlockRequests.add(request);
    try {
      if (await this.biometrics.enrolled(record.id)) throw new VaultError('CONFLICT');
      this.assert(epoch);
      await this.biometrics.enroll(record.id, this.binding(record.bytes), key, { ...options, name: this.view.vault?.name, signal: request.signal });
      if (epoch !== this.generation) { await this.biometrics.revoke(record.id); this.assert(epoch); }
      this.notify('Quick unlock enabled on this device.');
    } finally { this.unlockRequests.delete(request); this.operations.delete(key); wipe(key); }
  }); }
  disableQuickUnlock(password: string) {
    const epoch = this.generation;
    return this.enqueue(async () => {
      this.assert(epoch); await this.reauthenticate(password); this.assert(epoch);
      if (!this.record) throw new VaultError('LOCKED');
      await this.biometrics.revoke(this.record.id); this.assert(epoch);
      this.notify('Quick unlock disabled on this device.');
    });
  }
  async quickUnlock(id: string, options: QuickUnlockOptions = {}) {
    this.assertWritable();
    const epoch = ++this.generation; this.publish({ busy: true, error: null }); let key: Uint8Array | null = null;
    const request = new AbortController(); this.unlockRequests.add(request);
    try {
      const record = await this.storage.open(id);
      this.assert(epoch);
      key = await this.biometrics.recover(id, this.binding(record.bytes), { ...options, signal: request.signal }); this.assert(epoch);
      if (!key || key.length !== 32) throw new VaultError('QUICK_UNLOCK_UNAVAILABLE');
      const result = await openWithKey(this.crypto, record.bytes, key); this.assert(epoch);
      await this.establish(record, result.vault, { key, kdf: result.header.kdf }, result.migrated, epoch); key = null;
    } finally { this.unlockRequests.delete(request); wipe(key ?? undefined); if (epoch === this.generation) this.publish({ busy: false }); }
  }
  async encryptedExport() {
    if (!this.record || !this.context) throw new VaultError('LOCKED');
    const epoch = this.generation; const record = this.record;
    const current = await this.storage.read(record.id); this.assert(epoch);
    if (current.revision !== record.revision) throw new VaultError('CONFLICT');
    await openWithKey(this.crypto, current.bytes, this.context.key); this.assert(epoch);
    return { bytes: current.bytes, name: vaultFileName(this.view.vault?.name ?? 'Vault') };
  }
  saveAs(name: string, password: string, transform?: (vault: Vault) => Vault) {
    const epoch = this.generation;
    return this.enqueue(async () => {
    this.assert(epoch);
    if (!this.view.vault || !this.context || !this.record) throw new VaultError('LOCKED');
    // Authenticate the last verified revision so Save As also works after an external conflict.
    const proof = await openVault(this.crypto, this.record.bytes, password);
    try { this.assert(epoch); if (!this.context || !equalBytes(proof.context.key, this.context.key)) throw new VaultError('AUTHENTICATION'); }
    finally { wipe(proof.context.key); }
    let context: KeyContext | undefined;
    try {
      const { parameters } = await calibrateKdf(this.crypto); this.assert(epoch);
      context = await deriveContext(this.crypto, password, parameters); this.operations.add(context.key); this.assert(epoch);
      const vault = validateVault({ ...(transform ? transform(this.view.vault!) : this.view.vault!), id: this.id(), name: name.trim() });
      const bytes = await sealVault(this.crypto, vault, context); this.assert(epoch);
      const key = context.key;
      const saved = await this.storage.create(this.id(), name, bytes, async (data) => { this.assert(epoch); await openWithKey(this.crypto, data, key); this.assert(epoch); });
      this.assert(epoch); this.operations.delete(key);
      await this.establish(saved, vault, context, false, epoch); context = undefined;
    } finally { if (context) { this.operations.delete(context.key); wipe(context.key); } }
  }); }
  async readDiskVersion(): Promise<Vault> {
    if (!this.record || !this.context) throw new VaultError('LOCKED');
    const epoch = this.generation;
    const current = await this.storage.read(this.record.id);
    this.assert(epoch);
    const result = await openWithKey(this.crypto, current.bytes, this.context.key); this.assert(epoch);
    return result.vault;
  }
  async reload(password: string) {
    if (!this.record) throw new VaultError('LOCKED');
    await this.unlock(this.record.id, password);
  }
  restore(vault: Vault) {
    const verified = validateVault(vault);
    return this.mutate((current) => ({ ...verified, id: current.id, name: current.name }), 'restore');
  }
  createBackup() {
    const epoch = this.generation;
    return this.enqueue(async () => {
    this.assert(epoch);
    await this.encryptedExport();
    this.assert(epoch);
    if (!this.record) throw new VaultError('LOCKED');
    return this.storage.backup(this.record.id, 'manual');
  }); }
  deleteCurrent(password: string) {
    const epoch = this.generation;
    return this.enqueue(async () => {
    this.assert(epoch); await this.reauthenticate(password); this.assert(epoch);
    if (!this.record) throw new VaultError('LOCKED');
    const id = this.record.id;
    await this.biometrics.revoke(id); this.assert(epoch);
    await this.storage.delete(id); this.assert(epoch);
    this.publish({ current: null, recents: this.view.recents.filter((vault) => vault.id !== id) });
    this.lock(); await this.refreshRecents();
  }); }
}
