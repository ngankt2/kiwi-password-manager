import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { IconError, MAX_ICON_BYTES } from '@/core/icon-image';
import { isPublicIconAddress, normalizeIconUrl } from '@/core/icon-url';
import { MAX_ICON_HTML_BYTES, type IconLoader, type IconResource } from './download';

type ResourceReply = IconResource | { redirect: string };

async function requestResource(url: URL, kind: 'html' | 'image', signal: AbortSignal): Promise<ResourceReply> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true });
  if (signal.aborted) throw new IconError('network');
  if (!addresses.length || addresses.some(({ address }) => !isPublicIconAddress(address))) throw new IconError('url');
  return new Promise((resolve, reject) => {
    const limit = kind === 'html' ? MAX_ICON_HTML_BYTES : MAX_ICON_BYTES;
    // Pin the validated DNS answer for this connection, including every redirect.
    const request = httpsRequest(url, {
      method: 'GET', agent: false, signal,
      lookup: (_hostname, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family),
      headers: { Accept: kind === 'html' ? 'text/html,application/xhtml+xml' : 'image/*', 'Accept-Encoding': 'identity', 'User-Agent': 'Kiro-Icon/1.0' },
    }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.destroy(); resolve({ redirect: response.headers.location }); return;
      }
      const contentType = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (response.statusCode !== 200 || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity'
        || kind === 'html' && !['text/html', 'application/xhtml+xml'].includes(contentType)
        || kind === 'image' && contentType && !contentType.startsWith('image/') && !['application/octet-stream', 'binary/octet-stream'].includes(contentType)) {
        response.destroy(); reject(new IconError('format')); return;
      }
      if (kind === 'image' && Number(response.headers['content-length']) > limit) { response.destroy(); reject(new IconError('size')); return; }
      const chunks: Buffer[] = []; let length = 0; let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve({ bytes: new Uint8Array(Buffer.concat(chunks, length)), url: url.href, contentType }); } };
      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        if (length + chunk.length > limit) {
          if (kind === 'html') { chunks.push(chunk.subarray(0, limit - length)); length = limit; finish(); }
          else { settled = true; reject(new IconError('size')); }
          response.destroy();
        } else { chunks.push(chunk); length += chunk.length; }
      });
      response.on('end', finish);
      response.on('error', () => { if (!settled) { settled = true; reject(new IconError('network')); } });
    });
    request.on('error', () => reject(new IconError('network')));
    request.end();
  });
}

export const loadServerIconResource: IconLoader = async (input, kind, signal) => {
  let url = normalizeIconUrl(input);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const timeout = AbortSignal.timeout(6000);
    const controller = AbortSignal.any([signal, timeout]);
    // DNS lookup may outlive cancellation, but no connection starts after the deadline.
    const result = await new Promise<ResourceReply>((resolve, reject) => {
      const abort = () => reject(new IconError('network'));
      controller.addEventListener('abort', abort, { once: true });
      if (controller.aborted) { abort(); return; }
      void requestResource(url, kind, controller).then(resolve, reject).finally(() => controller.removeEventListener('abort', abort));
    });
    if (!('redirect' in result)) return result;
    url = normalizeIconUrl(new URL(result.redirect, url).href);
  }
  throw new IconError('network');
};
