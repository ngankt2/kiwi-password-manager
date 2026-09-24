/** UI-only WebKit fixture. Native permissions, dialogs and storage are tested by
 * tests/native/tauri-runtime.ts and the Rust tests, never by this substitute. */
import { webkit, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import nativeCatalog from '../../desktop/tauri/native-catalog.json' with { type: 'json' };
import type { DesktopSecurityEvent } from '../../src/infrastructure/desktop/bridge';
import type { UpdateState } from '../../src/infrastructure/desktop/updates';
import packageInfo from '../../package.json' with { type: 'json' };

type Link = { id: string; name: string; location: string; updatedAt: string; external: true };
const revision = (bytes: Buffer) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };

export class DesktopApplication {
  page!: Page;
  private errors: string[] = [];
  private context!: BrowserContext;
  private server!: Server;
  private source: string | null = null;
  private destination: string | null = null;
  private grants = new Map<string, string>();
  private links: Link[] = [];
  private locked = false;
  private active = true;
  private finishPicker: (() => void) | null = null;
  private pickerPending: Promise<null> | null = null;
  private copied = '';
  private owner = '';
  private copies: string[] = [];
  private updateState: UpdateState = { status: 'idle', currentVersion: packageInfo.version, release: null, checkedAt: null, receivedBytes: 0, totalBytes: null, error: null, unavailableReason: null };
  private updateResult: UpdateState = { ...this.updateState, status: 'current' };
  private updateCounts = { checks: 0, downloads: 0, restarts: 0 };
  private downloadGate: Promise<void> = Promise.resolve();
  private finishDownload: (() => void) | undefined;
  private constructor(private profile: string) {}

  static async launch(profile: string) {
    const app = new DesktopApplication(profile);
    await mkdir(profile, { recursive: true });
    app.links = await readFile(join(profile, 'fixture-links.json'), 'utf8').then((s) => JSON.parse(s) as Link[], () => []);
    const root = resolve('.desktop-web');
    app.server = createServer((request, response) => { void (async () => {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      let file = resolve(root, '.' + path);
      if (!file.startsWith(root + '/') && file !== root) { response.writeHead(403).end(); return; }
      if (path.endsWith('/')) file = join(file, 'index.html');
      else if (!extname(file)) file += '.html';
      const bytes = await readFile(file).catch(() => readFile(join(root, 'index.html')));
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(bytes);
    })().catch(() => response.writeHead(500).end()); });
    await new Promise<void>((done) => app.server.listen(0, '127.0.0.1', done));
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Test server unavailable');
    app.context = await webkit.launchPersistentContext(join(profile, 'webkit'), { headless: true, viewport: { width: 1320, height: 860 }, colorScheme: 'light' });
    await app.context.exposeFunction('__desktopFixtureCall', async (channel: string, args: unknown[]) => {
      try { return { ok: true, value: await app.call(channel, args) }; }
      catch (error) { return { ok: false, code: error instanceof Error ? error.message : 'SAVE_FAILED' }; }
    });
    await app.context.addInitScript(() => {
      const host = window as unknown as Window & { __desktopFixtureCall: (channel: string, args: unknown[]) => Promise<{ ok: boolean; value: unknown; code?: string }> };
      const call = async <T,>(channel: string, ...args: unknown[]): Promise<T> => {
        const reply = await host.__desktopFixtureCall(channel, args);
        if (!reply.ok) throw new Error(reply.code); return reply.value as T;
      };
      const encode = (bytes: Uint8Array) => { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); };
      const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
      const vault = async (channel: string, ...args: unknown[]) => {
        const result = await call<import('../../src/core/storage/types').StoredVault & { bytes: string } | null>(channel, ...args);
        return result ? { ...result, bytes: decode(result.bytes) } : null;
      };
      window.kiroDesktop = {
        platform: 'darwin', storageLocation: 'UI test profile',
        files: { read: async (p) => decode(await call('files:read', p)), writeNew: (p, b) => call('files:write', p, encode(b)), promote: (a, b) => call('files:promote', a, b), remove: (p) => call('files:remove', p), list: (p) => call('files:list', p) },
        vaultFiles: { list: () => call('vault-files:list'), read: (id) => vault('vault-files:read', id), attach: async (id, n, b, token) => (await vault('vault-files:attach', id, n, encode(b), token))!, write: async (id, n, b, rev) => (await vault('vault-files:write', id, n, encode(b), rev))!, forget: (id) => call('vault-files:forget', id), chooseLocation: async () => null, relocate: async () => { throw new Error('CANCELLED'); } },
        pickFile: async () => { const result = await call<{ name: string; bytes: string; sourceToken?: string; sourceLocation?: string } | null>('dialog:open'); return result ? { ...result, bytes: decode(result.bytes) } : null; },
        exportFile: (n, b, plain) => call('dialog:save', n, encode(b), plain),
        preferences: { read: () => call('preferences:read'), write: (settings) => call('preferences:write', settings) },
        clipboard: { copy: (v, s) => call('clipboard:copy', v, s), clearIfOwned: (token) => call('clipboard:clear', token) },
        isDeviceLocked: () => call('security:locked'),
        onSecurityEvent: (listener) => { const receive = (event: Event) => listener((event as CustomEvent).detail); window.addEventListener('fixture-security', receive); return () => window.removeEventListener('fixture-security', receive); },
        openExternal: async () => {}, backupStatus: async () => ({ path: null, failed: false }), chooseBackupFolder: async () => ({ path: null, failed: false }),
        updates: {
          getState: () => call('updates:state'), check: () => call('updates:check'), download: (version) => call('updates:download', version), restart: (version) => call('updates:restart', version),
          onState: (listener) => { const receive = (event: Event) => listener((event as CustomEvent).detail); window.addEventListener('fixture-update', receive); return () => window.removeEventListener('fixture-update', receive); },
          onOpen: (listener) => { window.addEventListener('fixture-update-open', listener); return () => window.removeEventListener('fixture-update-open', listener); },
        },
      };
    });
    app.page = app.context.pages()[0] ?? await app.context.newPage();
    app.page.on('pageerror', (error) => app.errors.push(error.message));
    // A development URL lets UI checks exercise current edits without a renderer export.
    await app.page.goto(process.env.KIRO_DESKTOP_TEST_URL ?? `http://127.0.0.1:${address.port}/`);
    return app;
  }
  private path(value: unknown) {
    if (typeof value !== 'string') throw new Error('VALIDATION');
    const root = join(this.profile, 'encrypted-files'); const path = resolve(root, value);
    if (!path.startsWith(root + '/')) throw new Error('VALIDATION'); return path;
  }
  private async saveLinks() { await writeFile(join(this.profile, 'fixture-links.json'), JSON.stringify(this.links)); }
  private async record(link: Link) { const bytes = await readFile(link.location); return { ...link, bytes: bytes.toString('base64'), revision: revision(bytes) }; }
  private async call(channel: string, args: unknown[]): Promise<unknown> {
    switch (channel) {
      case 'files:read': return (await readFile(this.path(args[0]))).toString('base64');
      case 'files:write': { const path = this.path(args[0]); await mkdir(dirname(path), { recursive: true }); await writeFile(path, Buffer.from(String(args[1]), 'base64'), { flag: 'wx' }); return; }
      case 'files:promote': return rename(this.path(args[0]), this.path(args[1]));
      case 'files:remove': return rm(this.path(args[0]), { force: true });
      case 'files:list': { const root = join(this.profile, 'encrypted-files'); const names = await readdir(root, { recursive: true }).catch(() => [] as string[]); const files = await Promise.all(names.map(async (p) => (await stat(join(root, p))).isFile() ? p : '')); return files.filter((p) => p && p.startsWith(String(args[0]))); }
      case 'vault-files:list': return this.links;
      case 'vault-files:read': { const link = this.links.find((l) => l.id === args[0]); return link ? this.record(link) : null; }
      case 'vault-files:attach': { const location = this.grants.get(String(args[3])); if (!location) throw new Error('PERMISSION'); this.grants.delete(String(args[3])); const link: Link = { id: String(args[0]), name: String(args[1]), location, updatedAt: new Date().toISOString(), external: true }; this.links.push(link); await this.saveLinks(); return this.record(link); }
      case 'vault-files:write': { const link = this.links.find((l) => l.id === args[0]); if (!link) throw new Error('NOT_FOUND'); if (revision(await readFile(link.location)) !== args[3]) throw new Error('CONFLICT'); await writeFile(link.location, Buffer.from(String(args[2]), 'base64')); link.name = String(args[1]); link.updatedAt = new Date().toISOString(); await this.saveLinks(); return this.record(link); }
      case 'vault-files:forget': this.links = this.links.filter((l) => l.id !== args[0]); return this.saveLinks();
      case 'dialog:open': { if (this.pickerPending) return this.pickerPending; if (!this.source) return null; const source = this.source; const bytes = await readFile(source); const token = randomUUID(); this.grants.set(token, source); return { name: basename(source), bytes: bytes.toString('base64'), ...(/\.(akpr|vault)$/i.test(source) ? { sourceToken: token, sourceLocation: source } : {}) }; }
      case 'dialog:save': { if (!this.destination) return false; await writeFile(this.destination, Buffer.from(String(args[1]), 'base64')); return true; }
      case 'preferences:read': return readFile(join(this.profile, 'preferences.json'), 'utf8').then((s) => JSON.parse(s), () => nativeCatalog.defaults);
      case 'preferences:write': return writeFile(join(this.profile, 'preferences.json'), JSON.stringify(args[0]));
      case 'clipboard:copy': { if (this.locked) throw new Error('CANCELLED'); this.copied = String(args[0]); this.copies.push(this.copied); const token = this.owner = randomUUID(); if (Number(args[1]) > 0) setTimeout(() => { if (this.owner === token) this.copied = ''; }, Number(args[1]) * 1000).unref(); return token; }
      case 'clipboard:clear': { if (this.owner !== args[0]) return false; this.copied = ''; this.owner = ''; return true; }
      case 'security:locked': return this.locked;
      case 'updates:state': return this.updateState;
      case 'updates:check': {
        if (['ready', 'restarting'].includes(this.updateState.status)) return this.updateState;
        this.updateCounts.checks++;
        await this.announceUpdate({ ...this.updateState, status: 'checking', release: null });
        await this.announceUpdate(this.updateResult); return this.updateState;
      }
      case 'updates:download': {
        if (this.updateState.status !== 'available' || this.updateState.release?.version !== args[0]) throw new Error('INVALID_MANIFEST');
        this.updateCounts.downloads++;
        await this.announceUpdate({ ...this.updateState, status: 'downloading', receivedBytes: 5, totalBytes: 10 });
        await this.downloadGate;
        await this.announceUpdate({ ...this.updateState, status: 'ready' }); return this.updateState;
      }
      case 'updates:restart': {
        if (this.updateState.status !== 'ready' || this.updateState.release?.version !== args[0]) throw new Error('INVALID_MANIFEST');
        this.updateCounts.restarts++; await this.announceUpdate({ ...this.updateState, status: 'restarting' }); return this.updateState;
      }
      default: throw new Error('VALIDATION');
    }
  }
  async pickFile(path: string) { this.source = path; }
  async saveFile(path: string) { this.destination = path; }
  async resize(width: number, height: number) { await this.page.setViewportSize({ width, height }); }
  async clipboardText() { return this.copied; }
  async clipboardCopies() { return [...this.copies]; }
  async emit(event: DesktopSecurityEvent) {
    if (event === 'deviceLocked') { this.locked = true; this.copied = ''; }
    if (event === 'foreground') this.locked = false;
    await this.page.evaluate((kind) => window.dispatchEvent(new CustomEvent('fixture-security', { detail: kind })), event);
  }
  async focus() { this.active = true; await this.emit('foreground'); }
  async blur() { this.active = false; await this.emit('background'); }
  async windowBlur() { if (!this.pickerPending || !this.active) await this.emit('background'); }
  async holdDialog() { this.pickerPending = new Promise((done) => { this.finishPicker = () => { this.pickerPending = null; done(null); }; }); }
  async finishDialog() { this.finishPicker?.(); await this.emit(this.active ? 'foreground' : 'background'); }
  async announceUpdate(state: UpdateState) { this.updateState = { ...state }; await this.page.evaluate((value) => window.dispatchEvent(new CustomEvent('fixture-update', { detail: value })), state); }
  async planUpdate(state: Partial<UpdateState>) { this.updateResult = { ...this.updateState, ...state }; }
  updateRequests() { return { ...this.updateCounts }; }
  async holdUpdateDownload() { this.downloadGate = new Promise((done) => { this.finishDownload = done; }); }
  async finishUpdateDownload() { this.finishDownload?.(); }
  async close() { this.finishPicker?.(); await this.context.close(); await new Promise<void>((done) => this.server.close(() => done())); if (this.errors.length) throw new Error('WebKit runtime errors: ' + this.errors.join('; ')); }
}
