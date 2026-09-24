import { File, Paths } from 'expo-file-system';
import type { PreferencesPort } from '@/domain/services/session';

export const preferences: PreferencesPort = {
  async read() { const file = new File(Paths.document, 'kiro-preferences.json'); return file.exists ? JSON.parse(await file.text()) : {}; },
  async write(settings) { new File(Paths.document, 'kiro-preferences.json').write(JSON.stringify(settings)); },
};
