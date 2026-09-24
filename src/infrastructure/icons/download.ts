import { IconError, MAX_ICON_BYTES, validateIconImage, type IconData } from '@/core/icon-image';
import { iconWebsiteOrigin, normalizeIconUrl } from '@/core/icon-url';

export type IconRequest = { url: string; kind: 'image' | 'website' };
export type IconResource = { bytes: Uint8Array; url: string; contentType: string };
export type IconLoader = (url: string, kind: 'image' | 'html', signal: AbortSignal) => Promise<IconResource>;
export const MAX_ICON_HTML_BYTES = 512 * 1024;

export function faviconCandidates(html: string, pageUrl: string): string[] {
  const candidates: { url: string; score: number }[] = [];
  const head = html.split(/<body\b/i, 1)[0];
  for (const tag of head.match(/<link\b(?:[^>"']|"[^"]*"|'[^']*'){0,8192}>/gi) ?? []) {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4]).replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n: string) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '');
    const rel = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.some((value) => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'].includes(value)) || !attributes.href) continue;
    try {
      const url = normalizeIconUrl(new URL(attributes.href, pageUrl).href).href;
      const size = Math.max(0, ...(attributes.sizes?.match(/\d+(?=x)/g)?.map(Number) ?? []));
      candidates.push({ url, score: (size >= 32 && size <= 256 ? size : 16) + (/png|svg/i.test(attributes.type ?? '') ? 300 : 0) });
    } catch { /* Ignore non-public, embedded or unsupported icon links. */ }
  }
  return [...new Set(candidates.sort((a, b) => b.score - a.score).map(({ url }) => url))].slice(0, 6);
}

export async function downloadIcon(request: IconRequest, load: IconLoader, signal: AbortSignal): Promise<IconData> {
  if (!['image', 'website'].includes(request.kind)) throw new IconError('url');
  const url = request.kind === 'website' ? iconWebsiteOrigin(request.url) : normalizeIconUrl(request.url).href;
  if (!url) throw new IconError('url');
  const image = async (target: string) => {
    if (signal.aborted) throw new IconError('network');
    const resource = await load(target, 'image', signal);
    if (resource.bytes.length > MAX_ICON_BYTES) throw new IconError('size');
    return validateIconImage(resource.bytes);
  };
  if (request.kind === 'image') return image(url);
  let candidates: string[] = [];
  try {
    const page = await load(url + '/', 'html', signal);
    candidates = faviconCandidates(new TextDecoder().decode(page.bytes.subarray(0, MAX_ICON_HTML_BYTES)), page.url);
  } catch { /* Some websites block their home page while still serving a favicon. */ }
  candidates = [...new Set([...candidates, url + '/favicon.ico', url + '/apple-touch-icon.png'])].slice(0, 8);
  let error: unknown;
  for (const candidate of candidates) {
    if (signal.aborted) break;
    try { return await image(candidate); } catch (caught) { error = caught; }
  }
  throw error instanceof IconError ? error : new IconError('network');
}
