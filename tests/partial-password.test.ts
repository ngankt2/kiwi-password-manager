import { describe, expect, test } from 'bun:test';
import { createPasswordMask, movePasswordMask, partialPassword, passwordCharacters } from '../src/core/security/partial-password';

const random = { random: (length: number) => crypto.getRandomValues(new Uint8Array(length)) };

describe('partial password display', () => {
  test('conceals three different characters without changing the remaining password', () => {
    const password = 'Test-password-for-partial-preview';
    const positions = createPasswordMask(random, password);
    const preview = partialPassword(password, positions);
    expect(positions.length).toBe(3);
    expect(new Set(positions).size).toBe(3);
    expect(preview.length).toBe(password.length);
    expect([...preview].filter((character) => character === '•').length).toBe(3);
    for (let index = 0; index < password.length; index++) expect(preview[index]).toBe(positions.includes(index) ? '•' : password[index]);
    expect(partialPassword(password, positions)).toBe(preview);
  });

  test('never exposes passwords with at most three characters or an incomplete mask', () => {
    for (const password of ['', 'a', 'ab', 'abc', '🔐á💻']) {
      const positions = createPasswordMask(random, password);
      expect(partialPassword(password, positions)).toBe('•'.repeat(passwordCharacters(password).length));
      expect(createPasswordMask(random, password, positions)).toEqual(positions);
    }
    for (const invalid of [[], [0], [0, 0, 1], [-1, 1, 2], [0, 1, 99]]) {
      expect(partialPassword('abcd', invalid)).toBe('••••');
    }
  });

  test('each new mask differs from the previous one even when random draws repeat', () => {
    const buffers: Uint8Array[] = [];
    const repeatedRandom = { random: (length: number) => {
      const bytes = new Uint8Array(length).fill(7);
      buffers.push(bytes);
      return bytes;
    } };
    for (const password of ['abcd', 'abcdefghijk', 'a\u0301x👩‍💻yz🔐']) {
      let previous: number[] = [];
      for (let attempt = 0; attempt < 8; attempt++) {
        const positions = createPasswordMask(repeatedRandom, password, previous);
        expect(positions).not.toEqual(previous);
        expect(new Set(positions).size).toBe(3);
        expect(positions.every((index) => index >= 0 && index < passwordCharacters(password).length)).toBe(true);
        previous = positions;
      }
    }
    expect(buffers.length).toBe(24);
    expect(buffers.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
  });

  test('masks whole Unicode characters, including accents and joined emoji', () => {
    const password = 'a\u0301x👩‍💻yz🔐';
    expect(passwordCharacters(password)).toEqual(['a\u0301', 'x', '👩‍💻', 'y', 'z', '🔐']);
    expect(partialPassword(password, [0, 2, 5])).toBe('•x•yz•');
  });

  test('keeps concealed positions through corrections and follows them through insertions', () => {
    const password = 'abcdefghijk';
    const positions = [2, 5, 8];
    expect(movePasswordMask(password, 'abCdefghijk', positions)).toEqual(positions);
    expect(movePasswordMask(password, password + 'XYZ', positions)).toEqual(positions);
    expect(movePasswordMask(password, 'XYZ' + password, positions)).toEqual([5, 8, 11]);
    expect(movePasswordMask(password, 'abcXYZdefghijk', positions)).toEqual([2, 8, 11]);
    expect(movePasswordMask('XYZ' + password, password, [5, 8, 11])).toEqual(positions);
  });

  test('deletion keeps a complete mask and short edits stay fully concealed', () => {
    const password = 'abcdefghijk';
    const shorter = 'abdefghijk';
    const positions = movePasswordMask(password, shorter, [2, 5, 8]);
    expect(new Set(positions).size).toBe(3);
    expect(positions).toContain(4);
    expect(positions).toContain(7);
    expect(partialPassword('ab', movePasswordMask(shorter, 'ab', positions))).toBe('••');
  });

  test('wipes random bytes and handles tied random priorities without dropping mask positions', () => {
    const bytes = new Uint8Array(24).fill(7);
    const positions = createPasswordMask({ random: () => bytes }, 'abcdef');
    expect(new Set(positions).size).toBe(3);
    expect(bytes.every((byte) => byte === 0)).toBe(true);
    expect(() => createPasswordMask({ random: () => { throw new Error('unavailable'); } }, 'abcdef')).toThrow('unavailable');
  });
});
