import { z } from 'zod';
import { LOCALES } from '@/core/i18n/locales';

const CurrentSettingsSchema = z.object({
  language: z.enum(LOCALES).default('vi'),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  lastOpenedVaultId: z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/).nullable().default(null),
  autoLockSeconds: z.union([z.literal(60), z.literal(180), z.literal(300), z.literal(900), z.literal(1800), z.literal(-1)]).default(300),
  backgroundLockSeconds: z.union([z.literal(0), z.literal(60), z.literal(180), z.literal(300), z.literal(900), z.literal(1800), z.literal(-1)]).default(180),
  clipboardSeconds: z.union([z.literal(10), z.literal(30), z.literal(60), z.literal(0)]).default(30),
  requireAuthenticationToReveal: z.boolean().default(false),
  automaticBackups: z.boolean().default(true),
  backupRetention: z.number().int().min(1).max(100).default(10),
  desktopLayout: z.enum(['A', 'B', 'C']).default('A'),
  compactRows: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
}).strict();

// Older releases locked immediately on blur by default. Adopt the new grace
// period without resetting the user's language, clipboard or backup settings.
export const SettingsSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const values = { ...input } as Record<string, unknown>;
  delete values.lockOnBackground;
  if (values.autoLockSeconds === 0) values.autoLockSeconds = -1;
  return values;
}, CurrentSettingsSchema);
export type Settings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS = SettingsSchema.parse({});

export function weakensSecurity(previous: Settings, next: Settings): boolean {
  return (previous.backgroundLockSeconds !== -1 && (next.backgroundLockSeconds === -1 || next.backgroundLockSeconds > previous.backgroundLockSeconds))
    || (previous.automaticBackups && !next.automaticBackups)
    || (previous.requireAuthenticationToReveal && !next.requireAuthenticationToReveal)
    || (previous.autoLockSeconds !== -1 && (next.autoLockSeconds === -1 || next.autoLockSeconds > previous.autoLockSeconds))
    || (previous.clipboardSeconds !== 0 && (next.clipboardSeconds === 0 || next.clipboardSeconds > previous.clipboardSeconds));
}
