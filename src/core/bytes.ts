import { VaultError } from './errors';

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
export const text = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
export const buffer = (bytes: Uint8Array): ArrayBuffer => new Uint8Array(bytes).buffer;

export function concat(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function toBase64(bytes: Uint8Array): string {
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(value);
}

/** Linear validation without a recursive regexp or an eager attachment decode. */
export function base64ByteLength(value: string): number {
  if (value.length % 4) throw new VaultError('CORRUPT');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  for (let i = 0; i < value.length - padding; i++) {
    const c = value.charCodeAt(i);
    if (!(c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 48 && c <= 57 || c === 43 || c === 47)) throw new VaultError('CORRUPT');
  }
  return value.length / 4 * 3 - padding;
}

export function fromBase64(value: string): Uint8Array {
  base64ByteLength(value);
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export function wipe(...values: (Uint8Array | undefined)[]): void {
  for (const value of values) value?.fill(0);
}
