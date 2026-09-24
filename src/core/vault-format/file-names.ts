export const VAULT_FILE_EXTENSION = 'akpr';
// Older exports remain readable; new exports always use .akpr.
export const VAULT_FILE_EXTENSIONS = [VAULT_FILE_EXTENSION, 'vault'] as const;

export function stripVaultFileExtension(name: string): string {
  const extension = VAULT_FILE_EXTENSIONS.find((value) => name.toLowerCase().endsWith(`.${value}`));
  return extension ? name.slice(0, -extension.length - 1) : name;
}

export function vaultFileName(name: string): string {
  return `${stripVaultFileExtension(name) || 'Vault'}.${VAULT_FILE_EXTENSION}`;
}
