import { VaultError } from '../errors';
import { validateVault, VaultV1Schema, type Vault, type VaultV1 } from '@/domain/entities/vault';

export function migrateV1ToV2(input: VaultV1): Vault {
  const source = VaultV1Schema.parse(input);
  return validateVault({ ...source, schemaVersion: 2, revision: 0,
    items: source.items.map((item) => ({ ...item, archivedAt: null, deletedAt: null })),
  });
}

export function migrateVault(input: unknown, schemaVersion: number): { vault: Vault; migrated: boolean } {
  if (schemaVersion === 2) return { vault: validateVault(input), migrated: false };
  if (schemaVersion !== 1) throw new VaultError('UNSUPPORTED_VERSION');
  try { return { vault: migrateV1ToV2(VaultV1Schema.parse(input)), migrated: true }; }
  catch { throw new VaultError('MIGRATION'); }
}
