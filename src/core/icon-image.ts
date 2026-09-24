import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { fromBase64, text, toBase64, utf8 } from './bytes';

export const MAX_ICON_BYTES = 512 * 1024;
export const MAX_ICON_DIMENSION = 1024;
export type IconData = { dataUri: string; width: number; height: number };
export class IconError extends Error {
  constructor(public readonly code: 'url' | 'format' | 'size' | 'network' = 'network') { super(code); }
}

function dimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || width > MAX_ICON_DIMENSION || height > MAX_ICON_DIMENSION) throw new IconError('size');
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

// SVG images are reduced to inert, self-contained drawing primitives before storage.
const svgElements = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc', 'use', 'symbol']);
const svgAttributes = new Set(['id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-path', 'clip-rule', 'mask', 'maskUnits', 'maskContentUnits', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity', 'fx', 'fy', 'fr', 'preserveAspectRatio', 'color', 'href']);
const svgStyle = new Set(['fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'stop-color', 'stop-opacity', 'color', 'clip-path', 'clip-rule', 'mask']);
const safeSvgValue = (value: string) => !/[\\<>@]|(?:https?:|data:|javascript:|expression|var\s*\()/i.test(value)
  && !/url\s*\(/i.test(value.replace(/url\(\s*(['"]?)#[\w.-]+\1\s*\)/g, ''));

function sanitizeSvg(bytes: Uint8Array): { bytes: Uint8Array; width: number; height: number } {
  const source = text(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new IconError('format');
  const document = new DOMParser({ onError: () => { throw new IconError('format'); } }).parseFromString(source, 'image/svg+xml');
  const root = document.documentElement;
  if (!root || root.tagName !== 'svg' || root.namespaceURI && root.namespaceURI !== 'http://www.w3.org/2000/svg') throw new IconError('format');
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const length = (value: string | null) => value && /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? parseFloat(value) : 0;
  const width = length(root.getAttribute('width')) || (viewBox?.length === 4 ? viewBox[2] : 256);
  const height = length(root.getAttribute('height')) || (viewBox?.length === 4 ? viewBox[3] : 256);
  // Vector view boxes can be large; only the rendered viewport is bounded.
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height)) throw new IconError('format');
  const scale = Math.min(1, 256 / Math.max(width, height));
  let count = 0;
  const clean = (element: Element, depth: number) => {
    if (++count > 2000 || depth > 32) throw new IconError('size');
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name;
      if (name === 'style') {
        for (const declaration of attribute.value.split(';')) {
          const colon = declaration.indexOf(':');
          const property = declaration.slice(0, colon).trim();
          const value = declaration.slice(colon + 1).trim();
          if (colon > 0 && svgStyle.has(property) && safeSvgValue(value)) element.setAttribute(property, value);
        }
        element.removeAttribute(name);
      } else if (name === 'xlink:href' && /^#[\w.-]+$/.test(attribute.value)) {
        element.setAttribute('href', attribute.value); element.removeAttribute(name);
      } else if (!svgAttributes.has(name) || !safeSvgValue(attribute.value) || name === 'href' && !/^#[\w.-]+$/.test(attribute.value)) element.removeAttribute(name);
    }
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 1) {
        const nested = child as Element;
        if (!svgElements.has(nested.tagName)) element.removeChild(child);
        else clean(nested, depth + 1);
      } else if (child.nodeType !== 3 || !['title', 'desc'].includes(element.tagName)) element.removeChild(child);
    }
  };
  clean(root as unknown as Element, 0);
  if (!root.hasAttribute('viewBox')) root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(Math.max(1, Math.round(width * scale))));
  root.setAttribute('height', String(Math.max(1, Math.round(height * scale))));
  return { bytes: utf8(new XMLSerializer().serializeToString(root)), ...dimensions(width * scale, height * scale) };
}

export function validateIconImage(input: Uint8Array): IconData {
  if (!input.length || input.length > MAX_ICON_BYTES) throw new IconError('size');
  let bytes = input;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, count: number) => String.fromCharCode(...bytes.subarray(offset, offset + count));
  let mime: string; let size: { width: number; height: number };
  if (bytes.length >= 24 && ascii(1, 3) === 'PNG' && bytes[0] === 137 && ascii(12, 4) === 'IHDR') {
    mime = 'image/png'; size = dimensions(view.getUint32(16), view.getUint32(20));
  } else if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
    mime = 'image/gif'; size = dimensions(view.getUint16(6, true), view.getUint16(8, true));
  } else if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    mime = 'image/webp';
    const uint24 = (offset: number) => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
    if (ascii(12, 4) === 'VP8X') size = dimensions(1 + uint24(24), 1 + uint24(27));
    else if (ascii(12, 4) === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) size = dimensions(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    else if (ascii(12, 4) === 'VP8L' && bytes[20] === 0x2f) size = dimensions(1 + (view.getUint32(21, true) & 0x3fff), 1 + ((view.getUint32(21, true) >> 14) & 0x3fff));
    else throw new IconError('format');
  } else if (bytes.length >= 22 && view.getUint32(0) === 0x00000100) {
    mime = 'image/x-icon';
    const count = view.getUint16(4, true);
    if (!count || count > 64 || 6 + count * 16 > bytes.length) throw new IconError('format');
    size = { width: 1, height: 1 };
    for (let index = 0; index < count; index++) {
      const offset = 6 + index * 16;
      const start = view.getUint32(offset + 12, true), length = view.getUint32(offset + 8, true);
      if (start < 6 + count * 16 || !length || start + length > bytes.length) throw new IconError('format');
      const current = dimensions(bytes[offset] || 256, bytes[offset + 1] || 256);
      if (current.width > size.width) size = current;
      // Validate embedded PNG/DIB dimensions too, rather than trusting the ICO directory.
      if (length >= 24 && ascii(start + 1, 3) === 'PNG') dimensions(view.getUint32(start + 16), view.getUint32(start + 20));
      else if (length >= 40 && view.getUint32(start, true) >= 40) dimensions(view.getInt32(start + 4, true), Math.abs(view.getInt32(start + 8, true)) / 2);
      else throw new IconError('format');
    }
  } else if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = 'image/jpeg'; let found: typeof size | undefined;
    for (let offset = 2; offset + 4 < bytes.length;) {
      if (bytes[offset++] !== 0xff) throw new IconError('format');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) { found = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3)); break; }
      offset += length;
    }
    if (!found) throw new IconError('format');
    size = found;
  } else {
    mime = 'image/svg+xml'; const sanitized = sanitizeSvg(bytes); bytes = sanitized.bytes; size = sanitized;
  }
  if (bytes.length > MAX_ICON_BYTES) throw new IconError('size');
  return { dataUri: `data:${mime};base64,${toBase64(bytes)}`, width: size.width, height: size.height };
}

export function validateCachedIcon(dataUri: unknown): IconData {
  if (typeof dataUri !== 'string' || dataUri.length > Math.ceil(MAX_ICON_BYTES / 3) * 4 + 64) throw new IconError('size');
  const comma = dataUri.indexOf(',');
  if (!/^data:image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon);base64$/.test(dataUri.slice(0, comma))) throw new IconError('format');
  return validateIconImage(fromBase64(dataUri.slice(comma + 1)));
}
