import { fetch } from 'expo/fetch';
import { Image } from 'expo-image';
import { concat } from '@/core/bytes';
import { IconError, MAX_ICON_BYTES, type IconData } from '@/core/icon-image';
import { normalizeIconUrl } from '@/core/icon-url';
import { downloadIcon, MAX_ICON_HTML_BYTES, type IconLoader, type IconRequest } from './download';

const load: IconLoader = async (input, kind, signal) => {
  let url = normalizeIconUrl(input);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetch(url.href, { signal, redirect: 'manual', credentials: 'omit', headers: { Accept: kind === 'html' ? 'text/html,application/xhtml+xml' : 'image/*' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new IconError('network');
      url = normalizeIconUrl(new URL(location, url).href); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new IconError('network'); }
    const finalUrl = normalizeIconUrl(response.url || url.href).href;
    const limit = kind === 'html' ? MAX_ICON_HTML_BYTES : MAX_ICON_BYTES;
    const reader = response.body?.getReader();
    if (!reader) throw new IconError('network');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      if (kind === 'image' && Number(response.headers.get('content-length')) > limit) throw new IconError('size');
      while (true) {
        if (signal.aborted) throw new IconError('network');
        const part = await reader.read();
        if (part.done) break;
        if (size + part.value.length > limit) {
          if (kind === 'image') throw new IconError('size');
          chunks.push(part.value.subarray(0, limit - size)); break;
        }
        chunks.push(part.value); size += part.value.length;
      }
      return { bytes: concat(...chunks), url: finalUrl, contentType: response.headers.get('content-type') ?? '' };
    } finally { await reader.cancel(); }
  }
  throw new IconError('network');
};

export async function fetchItemIcon(request: IconRequest, signal: AbortSignal): Promise<IconData> {
  const data = await downloadIcon(request, load, signal);
  if (signal.aborted) throw new IconError('network');
  try {
    const decoded = await Image.loadAsync({ uri: data.dataUri }, { maxWidth: 1024, maxHeight: 1024 });
    try { if (!decoded.width || !decoded.height) throw new IconError('format'); }
    finally { decoded.release(); }
  } catch { throw new IconError('format'); }
  if (signal.aborted) throw new IconError('network');
  return data;
}
