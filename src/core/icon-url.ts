import { IconError } from './icon-image';

/** Conservative public-address check shared by the client and web downloader. */
export function isPublicIconAddress(address: string): boolean {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (value.includes(':')) {
    // Only globally routed unicast IPv6; reject mapped IPv4, tunnels and special ranges.
    const groups = value.split(':');
    if (!groups.every((part) => /^[\da-f]{0,4}$/.test(part))) return false;
    const first = parseInt(groups[0], 16), second = parseInt(groups[1] || '0', 16);
    return (first & 0xe000) === 0x2000 && first !== 0x2002
      && !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
  }
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return a !== 0 && a !== 10 && a !== 127 && a < 224
    && !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254)
    && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || b === 88 && c === 99))
    && !(a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) && !(a === 203 && b === 0 && c === 113);
}

export function normalizeIconUrl(input: string): URL {
  try {
    if (!input || input.length > 4096) throw new Error();
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password
      || !host.includes('.') && !host.includes(':') || /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/.test(host)
      || (/^[\d.]+$/.test(host) || host.includes(':')) && !isPublicIconAddress(host)) throw new Error();
    url.hash = '';
    return url;
  } catch { throw new IconError('url'); }
}

/** Favicon requests disclose only the public site origin, never a saved URL's path or credentials. */
export function iconWebsiteOrigin(input: string): string | null {
  try {
    const value = input.trim();
    if (!value) return null;
    const url = new URL(/^[\w+.-]+:\/\//.test(value) ? value : 'https://' + value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.protocol = 'https:'; url.username = ''; url.password = ''; url.hash = ''; url.search = ''; url.pathname = '/';
    return normalizeIconUrl(url.href).origin;
  } catch { return null; }
}
