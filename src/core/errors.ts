export type VaultErrorCode =
  | 'INVALID_FILE' | 'UNSUPPORTED_VERSION' | 'AUTHENTICATION' | 'CORRUPT'
  | 'MIGRATION' | 'SAVE_FAILED' | 'CONFLICT' | 'NOT_FOUND' | 'PERMISSION'
  | 'STORAGE_FULL' | 'LIMIT_EXCEEDED' | 'LOCKED' | 'CANCELLED'
  | 'UNSUPPORTED_KDBX' | 'CRYPTO_UNAVAILABLE' | 'VALIDATION'
  | 'QUICK_UNLOCK_UNSUPPORTED' | 'QUICK_UNLOCK_UNAVAILABLE' | 'FILE_EXISTS';

export const ERROR_MESSAGES: Record<VaultErrorCode, string> = {
  INVALID_FILE: 'This is not a valid Kiro vault file.',
  UNSUPPORTED_VERSION: 'This vault needs a newer version of Kiro. The file has not been changed.',
  AUTHENTICATION: 'The password is incorrect, or the encrypted file was damaged.',
  CORRUPT: 'This vault could not be verified. You can open an encrypted backup instead.',
  MIGRATION: 'This vault could not be upgraded. Your original file is unchanged.',
  SAVE_FAILED: 'Your changes could not be saved. The previous vault is preserved. Please try again.',
  CONFLICT: 'The vault changed on disk. Reload it or save your changes as a new vault.',
  FILE_EXISTS: 'A file with this name already exists in that folder. Choose another folder to keep both files.',
  NOT_FOUND: 'The file was moved or deleted. Open it again or choose a backup.',
  PERMISSION: 'Access to this file is unavailable. Choose the file again.',
  STORAGE_FULL: 'There is not enough storage. Free some space, then try again.',
  LIMIT_EXCEEDED: 'This file exceeds the supported size or processing limits.',
  LOCKED: 'Unlock your vault to continue.',
  CANCELLED: 'The operation was cancelled.',
  UNSUPPORTED_KDBX: 'This KeePass file uses a version or feature this build cannot safely import.',
  CRYPTO_UNAVAILABLE: 'Secure cryptography is unavailable. Use a development build on mobile, or HTTPS on the web.',
  VALIDATION: 'Please check the highlighted values and try again.',
  QUICK_UNLOCK_UNSUPPORTED: 'This device or browser does not support secure quick unlock. Use your master password.',
  QUICK_UNLOCK_UNAVAILABLE: 'Quick unlock is unavailable. Open your vault with the master password and set it up again in Settings.',
};

/** Only a safe, fixed code crosses the UI/logging boundary. Never retain raw causes. */
export class VaultError extends Error {
  constructor(public readonly code: VaultErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'VaultError';
  }
}

export function safeError(error: unknown, fallback: VaultErrorCode = 'SAVE_FAILED'): VaultError {
  return error instanceof VaultError ? error : new VaultError(fallback);
}
