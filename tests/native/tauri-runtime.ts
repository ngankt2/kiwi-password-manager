import { invoke } from '@tauri-apps/api/core';
import { createI18n } from '../../src/core/i18n';
import type { DesktopBridge } from '../../src/infrastructure/desktop/bridge';

const { t } = createI18n('vi');
const password = 'Desktop-usability-fixture-2026';
const checks: string[] = [];
const errors: string[] = [];
window.addEventListener('error', (event) => errors.push(event.message));
const pause = (ms = 50) => new Promise<void>((done) => setTimeout(done, ms));
async function until<T>(read: () => T | undefined | null | false, name: string): Promise<T> {
  for (let i = 0; i < 500; i++) { const value = read(); if (value) return value; await pause(); }
  throw new Error('Timed out: ' + name);
}
const shown = (element: Element) => element instanceof HTMLElement && element.checkVisibility();
const text = (element: Element) => {
  if (element.hasAttribute('aria-label')) return element.getAttribute('aria-label');
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return copy.textContent?.trim();
};
const click = async (label: string, selector = 'button') => { const button = await until(() => [...document.querySelectorAll<HTMLElement>(selector)].find((e) => shown(e) && text(e) === label), label); button.click(); await pause(100); };
async function fill(label: string, value: string) {
  const input = await until(() => [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')].find((e) => shown(e) && (e.getAttribute('aria-label') === label || [...e.labels ?? []].some((l) => l.textContent?.trim() === label))), label);
  const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); await pause();
}
function assert(value: unknown, name: string) { if (!value) throw new Error(name); checks.push(name); }
const control = <T = unknown>(action: string) => invoke<T>('test_control', { action });
async function rejected(action: () => Promise<unknown>) { try { await action(); return false; } catch { return true; } }

void (async () => {
  const config = await control<{ phase: string; version: string }>('configuration');
  const bridge = await until(() => window.kiroDesktop as DesktopBridge | undefined, 'native bridge');
  await until(() => document.querySelector('.desktop-app-version'), 'welcome');
  assert(document.querySelector('.desktop-app-version')?.textContent === 'v' + config.version, 'native and visible versions agree');
  // Expo supplies harmless process/require shims; native Node APIs must remain absent.
  const global = window as Window & { process?: { versions?: { node?: string }; binding?: unknown }; require?: (name: string) => unknown };
  let filesystem: unknown;
  try { filesystem = global.require?.('node:fs'); } catch { /* Metro cannot load Node modules. */ }
  assert(!filesystem && !global.process?.versions?.node && typeof global.process?.binding !== 'function', 'renderer has no Node access');
  assert(await rejected(() => bridge.files.read('../../outside')), 'filesystem traversal denied');
  assert(await rejected(() => bridge.openExternal('file:///etc/passwd')), 'file URLs denied');
  assert(await rejected(() => invoke('plugin:opener|open_url', { url: 'https://example.invalid' })), 'direct plugin privileges denied');
  assert(await rejected(() => invoke('plugin:updater|check')), 'direct updater privileges denied');
  assert(await rejected(() => bridge.files.writeNew('vaults/test/plain.meta', new TextEncoder().encode('{"password":"synthetic-secret"}'))), 'secret metadata rejected');
  assert(await rejected(() => fetch('https://example.invalid')), 'renderer network isolated');
  window.open('https://example.invalid'); await pause(100);
  assert(await control<number>('window-count') === 1, 'new windows denied');
  const original = await bridge.clipboard.copy('synthetic-runtime-owned-copy', 30);
  await control('clipboard-other');
  assert(await bridge.clipboard.clearIfOwned(original) === false, 'newer clipboard copy preserved');
  const own = await bridge.clipboard.copy('synthetic-runtime-cleanup', 30);
  assert(await bridge.clipboard.clearIfOwned(own) === true, 'owned clipboard clear works');
  if (config.phase === 'first') {
    assert(await invoke<boolean>('test_single_instance'), 'second native instance exits');
    assert(await control<number>('window-count') === 1, 'second launch retains one window');
    await control('minimize'); await pause(500);
    assert((await control<{ minimized: boolean }>('window-state')).minimized, 'native window minimizes');
    await control('restore'); await pause(500);
    assert(!(await control<{ minimized: boolean }>('window-state')).minimized, 'native window restores');
    await control('maximize'); await pause(500);
    assert((await control<{ maximized: boolean }>('window-state')).maximized, 'native window maximizes');
    await control('unmaximize'); await pause(500); await control('standard');
    assert((await bridge.updates!.check()).unavailableReason === 'development', 'debug builds cannot install release updates');
    assert(await rejected(() => bridge.updates!.restart('9.9.9')), 'restart requires a verified installed update');
    const expiring = await bridge.clipboard.copy('synthetic-runtime-expiry', 10);
    await pause(10_200);
    assert(await bridge.clipboard.clearIfOwned(expiring) === false, 'native clipboard expiry works');
    await control('pick-legacy'); await click(t('Mở Vault có sẵn…'));
    await fill(t('Master Password'), password); await click(t('Mở khoá Vault'));
    await click('Email công việc, ' + t('Đăng nhập'), '[role="option"]');
    assert(document.querySelector('.desktop-workspace'), 'legacy encrypted vault opens through native picker');
    await click(t('Sửa')); await fill(t('Tên mục'), 'Tauri runtime saved item');
    const input = await until(() => document.querySelector<HTMLInputElement>('.desktop-editor input[type="password"]') || [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(shown), 'password input');
    const actions = input.closest('.desktop-input-control');
    assert(actions?.querySelectorAll('button').length === 2, 'inline reveal and generator actions preserved');
    await click(t('Lưu')); await until(() => [...document.querySelectorAll('[role="option"]')].find((e) => text(e) === 'Tauri runtime saved item, ' + t('Đăng nhập')), 'saved row');
    checks.push('edit persists through native linked-file adapter');
    await control('minimum'); await until(() => innerWidth === 760, 'minimum window');
    assert([...document.querySelectorAll<HTMLElement>('.desktop-window,.desktop-detail-content,.desktop-credential')].filter(shown).every((e) => e.scrollWidth <= e.clientWidth + 1), 'minimum window has no horizontal overflow');
    const settingsButton = document.querySelector<HTMLButtonElement>('footer button[aria-label="' + t('Cài đặt') + '"]');
    settingsButton?.click(); await until(() => document.querySelector('.desktop-settings'), 'settings');
    const select = [...document.querySelectorAll<HTMLSelectElement>('select')].find((e) => e.getAttribute('aria-label') === t('Chế độ hiển thị'))!;
    select.value = 'dark'; select.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => document.documentElement.dataset.theme === 'dark', 'dark theme');
    assert((await bridge.preferences.read() as { theme: string }).theme === 'dark', 'theme saved by native preferences');
    const lockedCopy = await bridge.clipboard.copy('synthetic-runtime-lock-clear', 30);
    await control('lock'); await pause(200);
    assert(await bridge.clipboard.clearIfOwned(lockedCopy) === false, 'device lock clears the owned native clipboard');
    assert(await rejected(() => bridge.clipboard.copy('synthetic-runtime-blocked', 30)), 'device lock blocks clipboard writes');
    await control('unlock');
    await until(() => [...document.querySelectorAll('button')].find((e) => text(e) === t('Tạo Vault mới')), 'locked view');
    assert(!document.querySelector('.desktop-workspace'), 'device lock unmounts secrets');
    await click(t('Tạo Vault mới')); await fill(t('Tên Vault'), 'Native internal vault');
    await fill(t('Master Password'), password); await fill(t('Xác nhận Master Password'), password);
    await click(t('Tạo Vault')); await click(t('Mới')); await click(t('Đăng nhập'), '[role="menuitem"]');
    await fill(t('Tên mục'), 'Native internal saved item'); await fill(t('Mật khẩu'), 'synthetic-internal-item-secret');
    await click(t('Lưu'));
    await until(() => [...document.querySelectorAll('[role="option"]')].find((e) => text(e) === 'Native internal saved item, ' + t('Đăng nhập')), 'native internal save');
    assert((await bridge.files.list('backups/')).some((path) => path.endsWith('.vault')), 'native journal retains automatic encrypted backups');
    for (const path of [...await bridge.files.list('vaults/'), ...await bridge.files.list('backups/')]) {
      const contents = new TextDecoder().decode(await bridge.files.read(path));
      if (contents.includes(password) || contents.includes('synthetic-internal-item-secret')) throw new Error('Plaintext persisted by native storage');
    }
    checks.push('native journal saves encrypted generations without plaintext secrets');
  } else {
    await click(t('Mở {name}', { name: 'Desktop UI Review' })); await fill(t('Master Password'), password); await click(t('Mở khoá Vault'));
    await click('Tauri runtime saved item, ' + t('Đăng nhập'), '[role="option"]');
    assert(document.documentElement.dataset.theme === 'dark', 'theme survives a real process restart');
    checks.push('updated legacy vault survives a real process restart');
    await control('lock'); await pause(200); await control('unlock');
    await click(t('Mở {name}', { name: 'Native internal vault' })); await fill(t('Master Password'), password); await click(t('Mở khoá Vault'));
    await click('Native internal saved item, ' + t('Đăng nhập'), '[role="option"]');
    checks.push('native internal journal decrypts correctly after a real process restart');
  }
  assert(errors.length === 0, 'no runtime JavaScript errors');
  await invoke('test_report', { report: { ok: true, phase: config.phase, version: config.version, checks, errors } });
})().catch(async (error: unknown) => {
  await invoke('test_report', { report: { ok: false, checks, error: error instanceof Error ? error.message : String(error), errors } }).catch(() => undefined);
});
