import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { gzipSync } from 'fflate';
import { parseKeePassXml } from '../src/core/kdbx/xml';
import { base64ByteLength, fromBase64, toBase64 } from '../src/core/bytes';

test('KeePass XML rejects external entities and malformed trees before parsing values', () => {
  expect(() => parseKeePassXml('<!DOCTYPE x [<!ENTITY file SYSTEM "file:///private/test">]><x>&file;</x>')).toThrow();
  expect(() => parseKeePassXml('<KeePassFile><Root></KeePassFile>')).toThrow();
  expect(parseKeePassXml('<KeyFile><Meta><Version>2.0</Version></Meta></KeyFile>').documentElement.tagName).toBe('KeyFile');
});

test('the actual kdbxweb compression adapter rejects output larger than 64 MiB', () => {
  const require = createRequire(import.meta.url);
  const adapter = require(join(dirname(require.resolve('kdbxweb')), 'kiro-compression.cjs')) as { gunzipSync(data: Uint8Array): Uint8Array };
  const compressed = gzipSync(new Uint8Array(67_108_865));
  expect(() => adapter.gunzipSync(compressed)).toThrow('exceeds');
});

test('large base64 attachments validate linearly without regexp stack overflow', () => {
  const bytes = new Uint8Array(4_194_304); bytes[bytes.length - 1] = 37;
  const value = toBase64(bytes);
  expect(base64ByteLength(value)).toBe(bytes.length);
  expect(fromBase64(value)[bytes.length - 1]).toBe(37);
  for (const value of ['a=', '====', 'aa=a', 'éAAA', 'AAAA\n']) expect(() => base64ByteLength(value)).toThrow();
});
