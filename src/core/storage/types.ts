export interface VaultSummary { id: string; name: string; updatedAt: string; location: string; external?: boolean }
export interface StoredVault extends VaultSummary { revision: string; bytes: Uint8Array }
export interface RelocatedVault { record: StoredVault; previousFileRetained: boolean }
export interface BackupSummary { id: string; vaultId: string; name: string; createdAt: string; reason: string }
export interface SaveOptions { automaticBackup: boolean; retention: number; reason?: string }
export type VerifyBytes = (bytes: Uint8Array) => Promise<void>;

export interface VaultStorageAdapter {
  list(): Promise<VaultSummary[]>;
  open(id: string): Promise<StoredVault>;
  create(id: string, name: string, bytes: Uint8Array, verify: VerifyBytes): Promise<StoredVault>;
  read(id: string): Promise<StoredVault>;
  writeAtomic(id: string, name: string, bytes: Uint8Array, expectedRevision: string, verify: VerifyBytes, options: SaveOptions): Promise<StoredVault>;
  backup(id: string, reason?: string): Promise<BackupSummary>;
  backups(id: string): Promise<BackupSummary[]>;
  readBackup(backupId: string): Promise<Uint8Array>;
  move(id: string, name: string): Promise<void>;
  delete(id: string): Promise<void>;
  stat(id: string): Promise<VaultSummary>;
  recoveries(id: string): Promise<BackupSummary[]>;
  /** Optional access to a file explicitly selected by the user. */
  openFile?(id: string, name: string, bytes: Uint8Array, token: string, verify: VerifyBytes): Promise<StoredVault>;
  relocate?(id: string, expectedRevision: string, verify: VerifyBytes): Promise<RelocatedVault | null>;
}

/** The native host owns file paths; only opaque picker grants can add locations. */
export interface LinkedVaultPort {
  list(): Promise<VaultSummary[]>;
  read(id: string): Promise<StoredVault | null>;
  attach(id: string, name: string, bytes: Uint8Array, token: string): Promise<StoredVault>;
  write(id: string, name: string, bytes: Uint8Array, expectedRevision: string): Promise<StoredVault>;
  chooseLocation(id: string, name: string): Promise<string | null>;
  relocate(id: string, name: string, bytes: Uint8Array, expectedRevision: string | null, token: string): Promise<RelocatedVault>;
  forget(id: string): Promise<void>;
}

/** Paths are relative to an application-owned directory. No secrets in metadata. */
export interface FilePort {
  read(path: string): Promise<Uint8Array>;
  writeNew(path: string, bytes: Uint8Array): Promise<void>;
  promote(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
