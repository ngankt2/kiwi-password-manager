import type { ItemSnapshot } from './vault';
import { validateCachedIcon, type IconData } from '@/core/icon-image';

export const ITEM_ICON_IDS = ['key', 'globe', 'mail', 'shield', 'lock', 'briefcase', 'user', 'credit-card', 'bank', 'shopping-bag', 'cloud', 'code', 'terminal', 'database', 'server', 'wifi', 'smartphone', 'gamepad', 'note', 'heart', 'graduation-cap', 'plane', 'star', 'settings', 'folder'] as const;
export type ItemIconId = typeof ITEM_ICON_IDS[number];
const metadataKey = 'appkiro.icon';
const colorKey = 'appkiro.color';
const imageKey = 'appkiro.iconImage';
const choiceKey = 'appkiro.iconChoice';
export type ItemIconImage = IconData & { version: 1; source: 'url' | 'website' | 'brand'; sourceUrl: string; brand?: string; background?: string };
const images = new WeakMap<object, ItemIconImage | null>();
// Deep system tones that keep a white glyph at 3.5:1 or better, as in the KeyNest design.
export const ITEM_COLORS = ['#8E5BE0', '#2F7CF6', '#0A8BC2', '#11878F', '#24914A', '#5E8C12', '#A87A00', '#D9670B', '#E0362C', '#D92D6B', '#B444C4', '#68707C'] as const;
// Earlier releases stored pastel tones with a black glyph; show each as its deep equivalent.
const LEGACY_ITEM_COLORS: Record<string, string> = Object.fromEntries(['#C4B5FD', '#93C5FD', '#67E8F9', '#5EEAD4', '#86EFAC', '#BEF264', '#FDE047', '#FDBA74', '#FCA5A5', '#FDA4AF', '#F0ABFC', '#CBD5E1']
  .map((legacy, index) => [legacy, ITEM_COLORS[index]]));
type Metadata = ItemSnapshot['metadata'];

export function isItemIcon(value: unknown): value is ItemIconId {
  return typeof value === 'string' && ITEM_ICON_IDS.some((id) => id === value);
}

export function getItemIcon(metadata?: Metadata): ItemIconId | null {
  const value = metadata?.[metadataKey];
  return isItemIcon(value) ? value : null;
}

export function withItemIcon(metadata: Metadata, icon: ItemIconId | null): Metadata {
  if (icon !== null && !isItemIcon(icon)) throw new Error('Unknown item icon.');
  const next = { ...metadata };
  if (icon === null) delete next[metadataKey];
  else next[metadataKey] = icon;
  delete next[imageKey];
  next[choiceKey] = 'manual';
  return next;
}

/** Cached bytes live inside the encrypted item, including its backup and history. */
export function getItemIconImage(metadata?: Metadata): ItemIconImage | null {
  const value = metadata?.[imageKey];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (images.has(value)) return images.get(value)!;
  let image: ItemIconImage | null = null;
  try {
    if (value.version === 1 && ['url', 'website', 'brand'].includes(String(value.source)) && typeof value.sourceUrl === 'string' && value.sourceUrl.length <= 4096) {
      image = { ...validateCachedIcon(value.dataUri), version: 1, source: value.source as ItemIconImage['source'], sourceUrl: value.sourceUrl,
        ...(typeof value.brand === 'string' && value.brand.length <= 100 ? { brand: value.brand } : {}),
        ...(isItemColor(value.background) ? { background: value.background } : {}) };
    }
  } catch { /* Malformed imported image metadata falls back to the built-in icon. */ }
  images.set(value, image);
  return image;
}

export function withItemIconImage(metadata: Metadata, image: ItemIconImage): Metadata {
  const next: Metadata = { ...metadata, [imageKey]: { ...image, ...validateCachedIcon(image.dataUri) }, [choiceKey]: 'image' };
  delete next[metadataKey];
  return next;
}

export const canFetchAutomaticIcon = (metadata: Metadata) => !getItemIcon(metadata)
  && !Object.hasOwn(metadata, imageKey) && !Object.hasOwn(metadata, choiceKey);

export const sameItemIconChoice = (left: Metadata, right: Metadata) => left[imageKey] === right[imageKey]
  && left[metadataKey] === right[metadataKey] && left[choiceKey] === right[choiceKey];

export const isItemColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function getItemColor(metadata?: Metadata): string | null {
  const value = metadata?.[colorKey];
  if (!isItemColor(value)) return null;
  const color = value.toUpperCase();
  return LEGACY_ITEM_COLORS[color] ?? color;
}
export function withItemColor(metadata: Metadata, color: string | null): Metadata {
  if (color !== null && !isItemColor(color)) throw new Error('Invalid icon color.');
  const next = { ...metadata };
  if (color === null) delete next[colorKey];
  else next[colorKey] = color.toUpperCase();
  return next;
}
export const randomItemColor = () => ITEM_COLORS[Math.floor(Math.random() * ITEM_COLORS.length)];

/** Choose the higher-contrast foreground for any user-selected background. */
export function iconForeground(color: string): '#000000' | '#FFFFFF' {
  if (!isItemColor(color)) return '#000000';
  // The built-in palette is tuned for a white glyph.
  if ((ITEM_COLORS as readonly string[]).includes(color.toUpperCase())) return '#FFFFFF';
  const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF';
}
