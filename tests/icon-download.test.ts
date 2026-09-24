import { expect, test } from 'bun:test';
import { fromBase64, text, utf8 } from '../src/core/bytes';
import { IconError, MAX_ICON_BYTES, validateCachedIcon, validateIconImage } from '../src/core/icon-image';
import { iconWebsiteOrigin, isPublicIconAddress, normalizeIconUrl } from '../src/core/icon-url';
import { downloadIcon, faviconCandidates, type IconLoader } from '../src/infrastructure/icons/download';
import { BRAND_ICONS } from '../src/shared/brand-icons';
import { POST } from '../src/app/api/icon+api';

const png = fromBase64(BRAND_ICONS[0].dataUri.split(',')[1]);

test('image decoder bounds bitmap dimensions and bytes and accepts the bundled logos', () => {
  for (const brand of BRAND_ICONS) expect(validateCachedIcon(brand.dataUri).width).toBe(64);
  expect(() => validateIconImage(new Uint8Array(MAX_ICON_BYTES + 1))).toThrow(IconError);
  const huge = png.slice(); new DataView(huge.buffer).setUint32(16, 65535);
  expect(() => validateIconImage(huge)).toThrow(IconError);
  expect(() => validateIconImage(utf8('<html>Not an image</html>'))).toThrow();
});

test('SVG cache strips scripts, active elements and external resources but retains local drawing styles', () => {
  const image = validateIconImage(utf8(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" onload="alert(1)"><script>alert(1)</script><image href="https://tracker.example/"/><foreignObject><iframe/></foreignObject><path id="shape" d="M0 0h32v32H0z" style="fill: #f00; stroke: url(https://tracker.example/pixel)"/><use href="https://tracker.example/#shape"/><use href="#shape"/><style>@import 'https://tracker.example';</style></svg>`));
  const svg = text(fromBase64(image.dataUri.split(',')[1]));
  expect(svg).toContain('fill="#f00"');
  expect(svg).toContain('href="#shape"');
  expect(svg).not.toMatch(/script|onload|https:\/\/tracker|foreignObject|iframe|<image|<style|@import/);
  expect(validateCachedIcon(image.dataUri)).toEqual(image);
  expect(() => validateIconImage(utf8('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>'))).toThrow(IconError);
});

test('website origins omit paths, query strings and credentials, and downloads reject private or non-HTTPS URLs', () => {
  expect(iconWebsiteOrigin('https://user:secret@example.com/account?token=secret#anchor')).toBe('https://example.com');
  expect(iconWebsiteOrigin('example.com/login')).toBe('https://example.com');
  expect(iconWebsiteOrigin('http://example.com/login')).toBe('https://example.com');
  for (const url of ['file:///tmp/icon.png', 'http://example.com/icon.png', 'https://localhost/a', 'https://127.1/a', 'https://2130706433/a', 'https://10.0.0.1/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://example.com:444/a', 'https://user:secret@example.com/a']) expect(() => normalizeIconUrl(url)).toThrow(IconError);
  for (const ip of ['0.0.0.0', '169.254.169.254', '100.64.0.1', '172.16.0.1', '192.168.1.1', '198.18.0.1', '224.0.0.1', 'fc00::1', '2001:db8::1', '2002:7f00:1::']) expect(isPublicIconAddress(ip)).toBe(false);
  for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) expect(isPublicIconAddress(ip)).toBe(true);
});

test('favicon discovery uses declared icons, caches image bytes and never sends the saved URL path', async () => {
  const calls: string[] = [];
  const load: IconLoader = async (url, kind) => {
    calls.push(url);
    return { url, contentType: kind === 'html' ? 'text/html' : 'image/png', bytes: kind === 'html'
      ? utf8('<html><head><link href="/assets/logo.png?v=1&amp;size=64" rel="shortcut icon" type="image/png" sizes="64x64"></head></html>') : png };
  };
  const image = await downloadIcon({ kind: 'website', url: 'https://example.com/private?token=secret' }, load, new AbortController().signal);
  expect(calls).toEqual(['https://example.com/', 'https://example.com/assets/logo.png?v=1&size=64']);
  expect(image.dataUri).toBe(BRAND_ICONS[0].dataUri);
  expect(faviconCandidates('<link rel="icon" href="https://127.0.0.1/favicon.ico"><link rel="icon" href="data:image/png;base64,x">', 'https://example.com')).toEqual([]);
});

test('favicon falls back to the conventional file and stops after cancellation', async () => {
  const calls: string[] = [];
  const load: IconLoader = async (url, kind) => {
    calls.push(url);
    if (kind === 'html') throw new Error('Homepage unavailable');
    return { url, bytes: png, contentType: 'image/png' };
  };
  await downloadIcon({ kind: 'website', url: 'https://example.com' }, load, new AbortController().signal);
  expect(calls).toEqual(['https://example.com/', 'https://example.com/favicon.ico']);
  const controller = new AbortController(); controller.abort(); calls.length = 0;
  await expect(downloadIcon({ kind: 'image', url: 'https://example.com/icon.png' }, load, controller.signal)).rejects.toThrow();
  expect(calls).toHaveLength(0);
});

test('web endpoint refuses cross-origin requests, private destinations and oversized input without fetching', async () => {
  const call = (body: string, origin = 'https://vault.example.com') => POST(new Request('https://vault.example.com/api/icon', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body }));
  const crossOrigin = await call(JSON.stringify({ kind: 'image', url: 'https://example.com/icon.png' }), 'https://other.example.com');
  expect(crossOrigin.status).toBe(403);
  const privateUrl = await call(JSON.stringify({ kind: 'image', url: 'https://127.0.0.1/icon.png' }));
  expect(privateUrl.status).toBe(422);
  expect(await privateUrl.json()).toEqual({ error: 'url' });
  expect(privateUrl.headers.get('cache-control')).toBe('no-store');
  expect((await call('x'.repeat(9000))).status).toBe(422);
});
