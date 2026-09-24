import { DOMParser } from '@xmldom/xmldom';
import { XmlUtils } from 'kdbxweb';
import { VaultError } from '../errors';

/** Bridge kdbxweb's XML hook to the maintained xmldom API; never implement XML parsing ourselves. */
export function parseKeePassXml(source: string): Document {
  if (source.length > 67_108_864) throw new VaultError('LIMIT_EXCEEDED');
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(source)) throw new VaultError('CORRUPT');
  const parser = new DOMParser({ onError: (level) => { if (level !== 'warning') throw new VaultError('CORRUPT'); } });
  const document = parser.parseFromString(source, 'application/xml');
  if (!document.documentElement || document.getElementsByTagName('parsererror').length) throw new VaultError('CORRUPT');
  // xmldom implements the XML subset consumed by kdbxweb, not the browser's HTML DOM.
  return document as unknown as Document;
}

Object.assign(XmlUtils, { parse: parseKeePassXml });
