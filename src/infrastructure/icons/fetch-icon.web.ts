import { fromBase64 } from '@/core/bytes';
import { IconError, MAX_ICON_BYTES, validateCachedIcon, type IconData } from '@/core/icon-image';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { downloadIcon, type IconRequest } from './download';

export async function fetchItemIcon(request: IconRequest, signal: AbortSignal): Promise<IconData> {
  const data = await fetchIconData(request, signal);
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new IconError('network')); return; }
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.src = ''; reject(new IconError('network')); };
    signal.addEventListener('abort', abort, { once: true });
    image.onload = () => { cleanup(); resolve(data); };
    image.onerror = () => { cleanup(); reject(new IconError('format')); };
    image.src = data.dataUri;
  });
}

async function fetchIconData(request: IconRequest, signal: AbortSignal): Promise<IconData> {
  const desktop = desktopBridge();
  if (desktop?.fetchIconResource) return downloadIcon(request, async (url, kind, signal) => {
    if (signal.aborted) throw new IconError('network');
    const result = await desktop.fetchIconResource!(url, kind);
    if (signal.aborted) throw new IconError('network');
    return { ...result, bytes: fromBase64(result.bytes) };
  }, signal);
  const response = await fetch('/api/icon', { method: 'POST', signal, credentials: 'omit', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  if (Number(response.headers.get('content-length')) > MAX_ICON_BYTES * 2) throw new IconError('size');
  const result = await response.json();
  if (!response.ok) throw new IconError(['url', 'format', 'size'].includes(result.error) ? result.error : 'network');
  return validateCachedIcon(result.dataUri);
}
