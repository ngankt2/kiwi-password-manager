import { IconError } from '@/core/icon-image';
import { downloadIcon, type IconRequest } from '@/infrastructure/icons/download';
import { loadServerIconResource } from '@/infrastructure/icons/resource.server';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
let active = 0;
let windowStart = Date.now();
let attempts = 0;

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin
    || request.headers.get('sec-fetch-site') && !['same-origin', 'none'].includes(request.headers.get('sec-fetch-site')!)) return Response.json({ error: 'url' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'url' }, { status: 415, headers });
  if (Date.now() - windowStart > 60_000) { windowStart = Date.now(); attempts = 0; }
  if (active >= 4 || ++attempts > 60) return Response.json({ error: 'network' }, { status: 429, headers });
  active++;
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
    const reader = request.body?.getReader();
    if (!reader) throw new IconError('url');
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener('abort', cancel, { once: true });
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 8192 || signal.aborted) throw new IconError('url');
        chunks.push(part.value);
      }
    } finally { signal.removeEventListener('abort', cancel); await reader.cancel(); }
    if (signal.aborted) throw new IconError('network');
    const buffer = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    const input: unknown = JSON.parse(new TextDecoder().decode(buffer));
    if (!input || typeof input !== 'object' || !('url' in input) || typeof input.url !== 'string'
      || !('kind' in input) || !['image', 'website'].includes(String(input.kind))) throw new IconError('url');
    const image = await downloadIcon(input as IconRequest, loadServerIconResource, signal);
    return Response.json(image, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof IconError ? error.code : 'network' }, { status: 422, headers });
  } finally { active--; }
}
