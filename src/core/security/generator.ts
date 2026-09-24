import type { CryptoProvider } from '../crypto/types';
import { VaultError } from '../errors';
import { PASSPHRASE_WORDS } from './words';

export interface PasswordOptions { length: number; uppercase: boolean; lowercase: boolean; numbers: boolean; symbols: boolean; avoidAmbiguous: boolean }
export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true, avoidAmbiguous: true };
export interface PassphraseOptions { words: number; separator: string; capitalize: boolean; includeNumber: boolean }
export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = { words: 6, separator: '-', capitalize: false, includeNumber: false };

/** Samples a bounded index from OS randomness. This is not a random-number generator. */
function index(crypto: CryptoProvider, size: number): number {
  const limit = Math.floor(0x1_0000_0000 / size) * size;
  for (;;) {
    const bytes = crypto.random(4);
    const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0);
    bytes.fill(0);
    if (value < limit) return value % size;
  }
}

export function generatePassword(crypto: CryptoProvider, options: PasswordOptions): string {
  if (!Number.isInteger(options.length) || options.length < 8 || options.length > 128) throw new VaultError('VALIDATION');
  const groups = [options.uppercase ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '', options.lowercase ? 'abcdefghijklmnopqrstuvwxyz' : '',
    options.numbers ? '0123456789' : '', options.symbols ? '!@#$%^&*()-_=+[]{}:;,.?' : ''].filter(Boolean)
    .map((group) => options.avoidAmbiguous ? group.replace(/[Il1O0]/g, '') : group);
  if (!groups.length) throw new VaultError('VALIDATION');
  const pool = groups.join('');
  const characters = groups.map((group) => group[index(crypto, group.length)]);
  while (characters.length < options.length) characters.push(pool[index(crypto, pool.length)]);
  for (let i = characters.length - 1; i > 0; i--) { const j = index(crypto, i + 1); [characters[i], characters[j]] = [characters[j], characters[i]]; }
  return characters.join('');
}

export function generatePassphrase(crypto: CryptoProvider, options: PassphraseOptions): string {
  if (!Number.isInteger(options.words) || options.words < 4 || options.words > 12 || options.separator.length > 8) throw new VaultError('VALIDATION');
  const words = Array.from({ length: options.words }, () => {
    const word = PASSPHRASE_WORDS[index(crypto, PASSPHRASE_WORDS.length)];
    return options.capitalize ? word[0].toUpperCase() + word.slice(1) : word;
  });
  if (options.includeNumber) words.push(String(index(crypto, 1000)).padStart(3, '0'));
  return words.join(options.separator);
}
