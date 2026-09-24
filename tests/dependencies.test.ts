import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('router query parsing uses the fixed URI decoder for Unicode and malformed input', () => {
  const query = require('query-string') as { parse(value: string): Record<string, string> };
  const malformed = '%EA'.repeat(1024);
  const result = query.parse(`name=%C4%91%C4%83ng+nh%E1%BA%ADp&broken=${malformed}`);
  expect(result.name).toBe('đăng nhập');
  expect(result.broken).toBe(malformed);
}, 1000);

test('Expo project tooling retains its UUID generation API with the fixed dependency', () => {
  const xcode = require('xcode') as { project(name: string): { hash: unknown; generateUuid(): string } };
  const project = xcode.project('fixture.pbxproj');
  project.hash = { project: { objects: {} } };
  expect(project.generateUuid()).toMatch(/^[A-F0-9]{24}$/);
});
