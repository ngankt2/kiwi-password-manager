import { VaultError } from '@/core/errors';
import { fromBase64, text, toBase64, wipe } from '@/core/bytes';
import type { Attachment } from './vault';

/** Largest file a user may attach in one step; imports may still carry larger KeePass binaries. */
export const MAX_ATTACHMENT_BYTES = 8_388_608;
/** Larger text stays downloadable but is not rendered inline. */
export const ATTACHMENT_PREVIEW_BYTES = 524_288;

const MIME_TYPES: Record<string, string> = {
  json: 'application/json', jsonc: 'application/json', json5: 'application/json', xml: 'application/xml', plist: 'application/xml',
  yaml: 'application/yaml', yml: 'application/yaml', toml: 'application/toml', csv: 'text/csv', tsv: 'text/tab-separated-values',
  md: 'text/markdown', html: 'text/html', p8: 'application/pkcs8', pem: 'application/x-pem-file', crt: 'application/x-x509-ca-cert',
  cer: 'application/x-x509-ca-cert', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip',
};

const extension = (name: string) => {
  const base = name.toLowerCase().split(/[/\\]/).pop() ?? '';
  // `.env`, `.env.production` and `.npmrc` style dotfiles have no meaningful extension.
  if (base.startsWith('.') && base.indexOf('.', 1) === -1) return '';
  if (/^\.env(\.|$)/.test(base)) return '';
  const index = base.lastIndexOf('.');
  return index > 0 ? base.slice(index + 1) : '';
};

// NUL and most C0 controls only appear in binary formats; tab, newlines, form feed and ESC occur in text.
const looksBinary = (bytes: Uint8Array) => bytes.some((byte) => byte < 32 && byte !== 9 && byte !== 10 && byte !== 12 && byte !== 13 && byte !== 27);

/** Decodes printable UTF-8 text; binary content returns null. */
export function attachmentText(bytes: Uint8Array): string | null {
  if (looksBinary(bytes)) return null;
  try { return text(bytes).replace(/^﻿/, ''); }
  catch { return null; }
}

export function attachmentMimeType(name: string, bytes: Uint8Array): string {
  const known = MIME_TYPES[extension(name)];
  if (known) return known;
  return attachmentText(bytes) === null ? 'application/octet-stream' : 'text/plain';
}

export function createAttachment(id: string, name: string, bytes: Uint8Array): Attachment {
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new VaultError('LIMIT_EXCEEDED');
  return { id, name, mimeType: attachmentMimeType(name, bytes), size: bytes.length, data: toBase64(bytes) };
}

export function canPreviewAttachment(attachment: Attachment): boolean {
  if (attachment.size > ATTACHMENT_PREVIEW_BYTES || /^(image|audio|video)\/|^application\/(pdf|zip)$/.test(attachment.mimeType)) return false;
  if (attachment.mimeType !== 'application/octet-stream') return true;
  // Older, imported and binary attachments carry no text type: sniff the first 4 KiB without decoding the whole file.
  const prefix = fromBase64(attachment.data.slice(0, 5464));
  try { return !looksBinary(prefix); }
  finally { wipe(prefix); }
}

/** Plaintext of a previewable attachment, or null when it is binary or too large to render. */
export function readAttachmentText(attachment: Attachment): string | null {
  if (!canPreviewAttachment(attachment)) return null;
  const bytes = fromBase64(attachment.data);
  try { return attachmentText(bytes); }
  finally { wipe(bytes); }
}

export const attachmentSizeLabel = (size: number) => size < 1024 ? `${size} B` : size < 1_048_576 ? `${Math.round(size / 1024)} KB` : `${(size / 1_048_576).toFixed(1)} MB`;
