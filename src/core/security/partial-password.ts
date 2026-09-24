import type { CryptoProvider } from '../crypto/types';

export const PARTIAL_PASSWORD_MASK_COUNT = 3;
export const PASSWORD_MASK_CHARACTER = '•';

export function passwordCharacters(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  // Older native runtimes still keep surrogate pairs and combining marks together.
  return value.match(/\P{M}\p{M}*|\p{M}+/gu) ?? [];
}

export function createPasswordMask(crypto: Pick<CryptoProvider, 'random'>, value: string, previous: readonly number[] = []): number[] {
  const characters = passwordCharacters(value);
  if (characters.length <= PARTIAL_PASSWORD_MASK_COUNT) return characters.map((_, index) => index);
  const bytes = crypto.random(characters.length * 4);
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const shuffled = characters.map((_, index) => ({ index, priority: view.getUint32(index * 4) }))
      .sort((a, b) => a.priority - b.priority);
    const positions = shuffled.slice(0, PARTIAL_PASSWORD_MASK_COUNT).map(({ index }) => index);
    if (previous.length === PARTIAL_PASSWORD_MASK_COUNT && positions.every((index) => previous.includes(index))) {
      // A repeated draw uses the next shuffled position, without an unbounded retry.
      positions[PARTIAL_PASSWORD_MASK_COUNT - 1] = shuffled[PARTIAL_PASSWORD_MASK_COUNT].index;
    }
    return positions.sort((a, b) => a - b);
  } finally { bytes.fill(0); }
}

/** Track concealed characters through edits until a fresh preview is requested. */
export function movePasswordMask(previous: string, next: string, positions: readonly number[]): number[] {
  const before = passwordCharacters(previous);
  const after = passwordCharacters(next);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  const changedEnd = after.length - suffix;
  const moved = new Set(positions.flatMap((index) => {
    if (before.length === after.length || index < prefix) return index < after.length ? [index] : [];
    if (index >= before.length - suffix) return [index + after.length - before.length];
    return index < changedEnd ? [index] : [];
  }));
  const count = Math.min(PARTIAL_PASSWORD_MASK_COUNT, after.length);
  for (let index = prefix; index < changedEnd && moved.size < count; index++) moved.add(index);
  for (let index = 0; index < after.length && moved.size < count; index++) moved.add(index);
  return [...moved].sort((a, b) => a - b);
}

export function partialPassword(value: string, positions: readonly number[]): string {
  const characters = passwordCharacters(value);
  const hidden = new Set(positions.filter((index) => Number.isInteger(index) && index >= 0 && index < characters.length));
  // An incomplete mask must never reveal a short or newly changed password in full.
  if (hidden.size < Math.min(PARTIAL_PASSWORD_MASK_COUNT, characters.length)) return PASSWORD_MASK_CHARACTER.repeat(characters.length);
  return characters.map((character, index) => hidden.has(index) ? PASSWORD_MASK_CHARACTER : character).join('');
}
