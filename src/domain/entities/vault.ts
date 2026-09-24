import { z } from 'zod';
import { VaultError } from '@/core/errors';
import { base64ByteLength } from '@/core/bytes';
import { isOtpField } from './otp';

export const ITEM_TYPES = ['login', 'secure-note', 'env', 'api-key', 'ssh-key', 'database', 'server', 'wifi', 'card', 'custom'] as const;
export const FIELD_KINDS = ['text', 'secret', 'number', 'url', 'email', 'date', 'otp'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export type FieldKind = (typeof FIELD_KINDS)[number];
const id = z.string().min(1).max(160);
const date = z.iso.datetime({ offset: true });
const metadata = z.record(z.string(), z.json());

export const FieldSchema = z.object({
  id, label: z.string().max(500), kind: z.enum(FIELD_KINDS), value: z.string().max(4_194_304), protected: z.boolean(),
}).strict().refine((field) => !['secret', 'otp'].includes(field.kind) || field.protected, 'Secret fields must be protected');

export const AttachmentSchema = z.object({
  id, name: z.string().max(1024), mimeType: z.string().max(256), data: z.string().max(44_739_244),
  size: z.number().int().min(0).max(33_554_432),
}).strict().refine((attachment) => {
  try { return base64ByteLength(attachment.data) === attachment.size; }
  catch { return false; }
}, 'Attachment size must match its encoded data');

export const SnapshotSchema = z.object({
  type: z.enum(ITEM_TYPES), title: z.string().max(4096), folderId: id.nullable(), favorite: z.boolean(),
  tags: z.array(z.string().max(256)).max(1000), fields: z.array(FieldSchema).max(2000), notes: z.string().max(4_194_304),
  attachments: z.array(AttachmentSchema).max(1000), createdAt: date, updatedAt: date, metadata,
}).strict();

export const VersionSchema = z.object({ id, savedAt: date, summary: z.string().max(1024), snapshot: SnapshotSchema }).strict();
export const ItemV1Schema = SnapshotSchema.extend({ id, history: z.array(VersionSchema).max(10_000) }).strict();
export const ItemSchema = ItemV1Schema.extend({ archivedAt: date.nullable(), deletedAt: date.nullable() }).strict();
export const FolderSchema = z.object({
  id, name: z.string().min(1).max(4096), parentId: id.nullable(), createdAt: date, updatedAt: date,
  notes: z.string().max(4_194_304), tags: z.array(z.string().max(256)).max(1000), metadata,
}).strict();

const base = { id, name: z.string().min(1).max(200), createdAt: date, updatedAt: date,
  folders: z.array(FolderSchema).max(20_000), metadata };
export const VaultV1Schema = z.object({ ...base, schemaVersion: z.literal(1), items: z.array(ItemV1Schema).max(100_000) }).strict();
export const VaultSchema = z.object({ ...base, schemaVersion: z.literal(2), revision: z.number().int().min(0), items: z.array(ItemSchema).max(100_000) }).strict();

export type Vault = z.infer<typeof VaultSchema>;
export type VaultV1 = z.infer<typeof VaultV1Schema>;
export type VaultItem = z.infer<typeof ItemSchema>;
export type ItemSnapshot = z.infer<typeof SnapshotSchema>;
export type ItemVersion = z.infer<typeof VersionSchema>;
export type Folder = z.infer<typeof FolderSchema>;
export type CustomField = z.infer<typeof FieldSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;

export const isSecret = (field: CustomField): boolean => field.protected || field.kind === 'secret' || isOtpField(field);

export function validateVault(input: unknown): Vault {
  const result = VaultSchema.safeParse(input);
  if (!result.success) throw new VaultError('CORRUPT');
  const vault = result.data;
  const folders = new Map(vault.folders.map((folder) => [folder.id, folder]));
  if (folders.size !== vault.folders.length || new Set(vault.items.map((item) => item.id)).size !== vault.items.length) throw new VaultError('CORRUPT');
  for (const folder of vault.folders) {
    const ancestors = new Set<string>();
    let current: Folder | undefined = folder;
    while (current) {
      if (ancestors.has(current.id) || ancestors.size > 100) throw new VaultError('CORRUPT');
      ancestors.add(current.id);
      if (current.parentId && !folders.has(current.parentId)) throw new VaultError('CORRUPT');
      current = current.parentId ? folders.get(current.parentId) : undefined;
    }
  }
  for (const item of vault.items) {
    if (item.folderId && !folders.has(item.folderId)) throw new VaultError('CORRUPT');
    if (new Set(item.fields.map((field) => field.id)).size !== item.fields.length) throw new VaultError('CORRUPT');
    if (new Set(item.history.map((version) => version.id)).size !== item.history.length) throw new VaultError('CORRUPT');
    for (const snapshot of [item, ...item.history.map((version) => version.snapshot)]) {
      if (snapshot.type === 'env' && snapshot.fields.some((field) => field.id === 'env' && (field.kind !== 'secret' || !field.protected))) throw new VaultError('CORRUPT');
    }
  }
  return vault;
}
