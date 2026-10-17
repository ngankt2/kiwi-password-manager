import { expect, test } from 'bun:test';
import { canFetchAutomaticIcon, getItemColor, getItemIcon, getItemIconImage, iconForeground, ITEM_COLORS, withItemColor, withItemIcon, withItemIconImage } from '../src/domain/entities/item-icon';
import { BRAND_ICONS } from '../src/shared/brand-icons';
import { validateCachedIcon } from '../src/core/icon-image';
import { validateVault } from '../src/domain/entities/vault';
import { createItem, createVault, restoreVersion, saveItem } from '../src/domain/services/items';

test('changing an icon preserves imported metadata and does not mutate the saved item', () => {
  const original = { ...createItem('i', 'login'), title: 'Email', metadata: { keepass: { icon: 12, customIcon: 'imported' }, custom: ['kept'] } };
  const metadata = withItemIcon(original.metadata, 'mail');
  expect(getItemIcon(metadata)).toBe('mail');
  expect(getItemIcon(original.metadata)).toBeNull();
  expect(metadata.keepass).toEqual(original.metadata.keepass);
  expect(withItemIcon(metadata, null)).toEqual({ ...original.metadata, 'appkiro.iconChoice': 'manual' });
  expect(canFetchAutomaticIcon(withItemIcon(metadata, null))).toBe(false);
});

test('cached images persist through serialization, history restore and color changes until explicitly replaced', () => {
  const brand = BRAND_ICONS.find((entry) => entry.id === 'brand-github')!;
  const image = { ...validateCachedIcon(brand.dataUri), version: 1 as const, source: 'url' as const, sourceUrl: brand.source };
  let vault = createVault('v', 'Images');
  const item = { ...createItem('i', 'login'), title: 'Email', metadata: { imported: 'kept' } };
  vault = saveItem(vault, { ...item, metadata: withItemIconImage(item.metadata, image) }, 'new');
  vault = saveItem(vault, { ...vault.items[0], metadata: withItemColor(vault.items[0].metadata, '#123456') }, 'image-before-color');
  vault = validateVault(JSON.parse(JSON.stringify(vault)));
  expect(getItemIconImage(vault.items[0].metadata)).toEqual(image);
  expect(vault.items[0].metadata.imported).toBe('kept');
  expect(canFetchAutomaticIcon(vault.items[0].metadata)).toBe(false);
  vault = saveItem(vault, { ...vault.items[0], metadata: withItemIcon(vault.items[0].metadata, null) }, 'before-default');
  expect(getItemIconImage(vault.items[0].metadata)).toBeNull();
  expect(canFetchAutomaticIcon(vault.items[0].metadata)).toBe(false);
  vault = restoreVersion(vault, 'i', 'before-default', 'restored-image');
  expect(getItemIconImage(vault.items[0].metadata)?.dataUri).toBe(image.dataUri);
});

test('untrusted cached image metadata falls back safely without enabling an automatic fetch', () => {
  for (const dataUri of ['https://example.com/icon.png', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,@@@@']) {
    const metadata = { 'appkiro.iconImage': { version: 1, source: 'url', sourceUrl: 'https://example.com', dataUri } };
    expect(getItemIconImage(metadata)).toBeNull();
    expect(canFetchAutomaticIcon(metadata)).toBe(false);
  }
});

test('item icons survive serialization, updates and history restoration', () => {
  let vault = createVault('v', 'Icons');
  const item = { ...createItem('i', 'login'), title: 'Email' };
  vault = saveItem(vault, item, 'new');
  vault = saveItem(vault, { ...vault.items[0], metadata: withItemIcon(item.metadata, 'mail') }, 'default-icon');
  vault = saveItem(vault, { ...vault.items[0], metadata: withItemIcon(vault.items[0].metadata, 'heart') }, 'mail-icon');
  vault = validateVault(JSON.parse(JSON.stringify(vault)));
  expect(getItemIcon(vault.items[0].metadata)).toBe('heart');
  expect(getItemIcon(vault.items[0].history[1].snapshot.metadata)).toBe('mail');
  vault = restoreVersion(vault, 'i', 'mail-icon', 'restored');
  expect(getItemIcon(vault.items[0].metadata)).toBe('mail');
  expect(getItemIcon(vault.items[0].history.at(-1)!.snapshot.metadata)).toBe('heart');
  vault = saveItem(vault, { ...vault.items[0], metadata: withItemIcon(vault.items[0].metadata, null) }, 'reset');
  expect(getItemIcon(vault.items[0].metadata)).toBeNull();
  expect(vault.items[0].metadata).not.toHaveProperty('appkiro.icon');
});

test('missing, malformed and unknown icon metadata safely uses the type default', () => {
  const cases: Parameters<typeof getItemIcon>[0][] = [undefined, {}, { 'appkiro.icon': 'future-icon' }, { 'appkiro.icon': { url: 'https://example.test/icon' } }, { 'appkiro.icon': null }];
  for (const metadata of cases) {
    expect(getItemIcon(metadata)).toBeNull();
  }
});

test('palette colors keep a readable white glyph and legacy pastels display as their deep tone', () => {
  const contrast = (color: string) => {
    const [r, g, b] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
  };
  for (const color of ITEM_COLORS) {
    expect(iconForeground(color)).toBe('#FFFFFF');
    expect(contrast(color)).toBeGreaterThanOrEqual(3.5);
  }
  expect(getItemColor(withItemColor({}, '#fda4af'))).toBe('#D92D6B');
  expect(getItemColor(withItemColor({}, '#93C5FD'))).toBe('#2F7CF6');
  expect(getItemColor(withItemColor({}, '#123456'))).toBe('#123456');
  expect(iconForeground('#FDE047')).toBe('#000000');
});
