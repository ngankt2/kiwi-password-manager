import { describe, expect, test } from 'bun:test';
import { utf8 } from '../src/core/bytes';
import { AttachmentSchema } from '../src/domain/entities/vault';
import { attachmentMimeType, attachmentText, canPreviewAttachment, createAttachment, MAX_ATTACHMENT_BYTES, readAttachmentText } from '../src/domain/entities/attachment';

const p8 = '-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg\n-----END PRIVATE KEY-----\n';

describe('attachments', () => {
  test('key, env and JSON files keep their text and get a useful media type', () => {
    for (const [name, content, mime] of [
      ['AuthKey_ABC123.p8', p8, 'application/pkcs8'],
      ['.env', 'API_URL=https://example.test\nTOKEN=abc\n', 'text/plain'],
      ['.env.production', 'SECRET=1\n', 'text/plain'],
      ['service-account.json', '{"type":"service_account"}', 'application/json'],
      ['id_ed25519', '-----BEGIN OPENSSH PRIVATE KEY-----\n', 'text/plain'],
    ] as const) {
      const attachment = createAttachment('a', name, utf8(content));
      expect(AttachmentSchema.safeParse(attachment).success).toBe(true);
      expect(attachment.mimeType).toBe(mime);
      expect(canPreviewAttachment(attachment)).toBe(true);
      expect(readAttachmentText(attachment)).toBe(content);
    }
  });

  test('binary content is not rendered as text', () => {
    const attachment = createAttachment('a', 'keystore.jks', new Uint8Array([0xfe, 0xed, 0xfe, 0xed, 0, 0, 0, 2]));
    expect(attachment.mimeType).toBe('application/octet-stream');
    expect(canPreviewAttachment(attachment)).toBe(false);
    expect(readAttachmentText(attachment)).toBeNull();
    expect(attachmentText(new Uint8Array([0xc3, 0x28]))).toBeNull();
  });

  test('a UTF-8 byte order mark is dropped from previews', () => {
    expect(attachmentText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('{"a":1}')]))).toBe('{"a":1}');
  });

  test('legacy attachments without a detected type still preview when they are text', () => {
    const attachment = { ...createAttachment('a', 'notes', utf8('hello')), mimeType: 'application/octet-stream' };
    expect(canPreviewAttachment(attachment)).toBe(true);
    expect(readAttachmentText(attachment)).toBe('hello');
  });

  test('large text stays downloadable but is not previewed, and oversize files are rejected', () => {
    const large = createAttachment('a', 'big.txt', new Uint8Array(600_000).fill(65));
    expect(canPreviewAttachment(large)).toBe(false);
    expect(readAttachmentText(large)).toBeNull();
    expect(attachmentMimeType('photo.png', new Uint8Array([137, 80]))).toBe('image/png');
    expect(() => createAttachment('a', 'huge.bin', new Uint8Array(MAX_ATTACHMENT_BYTES + 1))).toThrow();
  });
});
