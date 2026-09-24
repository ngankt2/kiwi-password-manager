import type { PreferencesPort } from '@/domain/services/session';
import { desktopBridge, desktopCall } from '@/infrastructure/desktop/bridge';
export const preferences: PreferencesPort = {
  async read() { const desktop = desktopBridge(); return desktop ? desktopCall(() => desktop.preferences.read()) : JSON.parse(localStorage.getItem('kiro-preferences') ?? '{}'); },
  async write(settings) { const desktop = desktopBridge(); if (desktop) await desktopCall(() => desktop.preferences.write(settings)); else localStorage.setItem('kiro-preferences', JSON.stringify(settings)); },
};
