import { DesktopApplication } from './webkit-host';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopVault, desktopPassword, expectDesktopUnlock, launchDesktop, t, unlockDesktopVault } from './helpers';

const settings = (page: Page) => page.locator('footer').getByRole('button', { name: t('Cài đặt'), exact: true }).click();
const row = (page: Page, name: string) => page.locator('[data-folder-id]').filter({ has: page.locator('.desktop-folder-name').getByText(name, { exact: true }) });
const roots = (page: Page) => page.locator('[data-folder-parent=""] .desktop-folder-name>span:nth-child(2)').allTextContents();

async function folder(page: Page, name: string, parent?: string) {
  await page.locator('aside').getByRole('button', { name: t('Thư mục mới'), exact: true }).click();
  const dialog = page.getByRole('dialog', { name: t('Thư mục mới'), exact: true });
  await dialog.getByLabel(t('Tên thư mục'), { exact: true }).fill(name);
  if (parent) await dialog.getByLabel(t('Thư mục cha'), { exact: true }).selectOption({ label: parent });
  await dialog.getByRole('button', { name: t('Tạo thư mục'), exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row(page, name)).toBeVisible();
}

async function drag(page: Page, from: Locator, to: Locator, position: 'before' | 'inside' | 'after' = 'inside', reveal?: Locator) {
  const source = await from.boundingBox();
  if (!source) throw new Error('Drag source is not visible');
  await page.mouse.move(source.x + Math.min(65, source.width / 2), source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 85, source.y + source.height / 2 + 5, { steps: 8 });
  await to.waitFor({ state: 'visible' });
  const target = await to.boundingBox();
  if (!target) throw new Error('Drag target is not visible');
  const y = position === 'before' ? 2 : position === 'after' ? target.height - 2 : target.height / 2;
  await page.mouse.move(target.x + Math.min(80, target.width / 2), target.y + y, { steps: 12 });
  // Chromium requires a second move to deliver dragover before mouseup.
  await page.mouse.move(target.x + Math.min(80, target.width / 2) + 1, target.y + y);
  if (reveal) await expect(reveal).toBeVisible();
  await page.mouse.up();
}

test('WebKit UI folders drag before/after, nest, return to root, reject cycles and survive restart', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-folders-e2e-'));
  let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; let page = opened.page;
    await createDesktopVault(page, 'Folder QA');
    await folder(page, 'Alpha'); await folder(page, 'Beta'); await folder(page, 'Gamma'); await folder(page, 'Nested', 'Alpha');
    const alpha = await row(page, 'Alpha').getAttribute('data-folder-id');
    const beta = await row(page, 'Beta').getAttribute('data-folder-id');
    await row(page, 'Alpha').getByRole('button', { name: t('Thu gọn {name}', { name: 'Alpha' }), exact: true }).click();
    await expect(row(page, 'Nested')).not.toBeVisible();
    await drag(page, row(page, 'Gamma'), row(page, 'Alpha'), 'inside', row(page, 'Nested'));
    await expect(row(page, 'Gamma')).toHaveAttribute('data-folder-parent', alpha!);
    await drag(page, row(page, 'Gamma'), row(page, 'Beta'), 'after');
    await expect.poll(() => roots(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
    await drag(page, row(page, 'Gamma'), row(page, 'Alpha'), 'before');
    await expect.poll(() => roots(page)).toEqual(['Gamma', 'Alpha', 'Beta']);
    await drag(page, row(page, 'Gamma'), row(page, 'Beta'), 'after');
    await expect.poll(() => roots(page)).toEqual(['Alpha', 'Beta', 'Gamma']);
    await drag(page, row(page, 'Alpha'), row(page, 'Beta'));
    await expect(row(page, 'Alpha')).toHaveAttribute('data-folder-parent', beta!);
    await expect(row(page, 'Nested')).toHaveAttribute('data-folder-parent', alpha!);
    await drag(page, row(page, 'Beta'), row(page, 'Nested'));
    await expect(row(page, 'Beta')).toHaveAttribute('data-folder-parent', '');
    await drag(page, row(page, 'Alpha'), page.locator('[data-folder-root-drop]'));
    await expect.poll(() => roots(page)).toEqual(['Beta', 'Gamma', 'Alpha']);
    await row(page, 'Alpha').locator('.desktop-folder-name').press('Alt+ArrowUp');
    await expect.poll(() => roots(page)).toEqual(['Beta', 'Alpha', 'Gamma']);
    await row(page, 'Nested').locator('.desktop-folder-name').press('Alt+ArrowLeft');
    await expect.poll(() => roots(page)).toEqual(['Beta', 'Alpha', 'Nested', 'Gamma']);
    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await expect(page.locator('[data-folder-id]')).toHaveCount(0);
    await app.close(); app = undefined;
    const reopened = await launchDesktop(profile); app = reopened.app; page = reopened.page;
    await expectDesktopUnlock(page, 'Folder QA');
    await unlockDesktopVault(page, 'Folder QA');
    await expect.poll(() => roots(page)).toEqual(['Beta', 'Alpha', 'Nested', 'Gamma']);
    await expect(row(page, 'Nested')).toHaveAttribute('data-folder-parent', '');
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('WebKit UI blur preserves a draft for three minutes, cancels on focus, persists settings and locks on device lock', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-grace-e2e-'));
  let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; let page = opened.page;
    await page.clock.install({ time: new Date() });
    await page.reload();
    await createDesktopVault(page, 'Grace QA');
    await settings(page);
    await expect(page.getByLabel(t('Khoá sau khi rời ứng dụng'), { exact: true })).toHaveValue('180');
    await page.locator('aside').getByRole('button', { name: t('Tất cả mục'), exact: true }).click();
    await page.getByRole('button', { name: t('Mới'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Đăng nhập'), exact: true }).click();
    await page.getByLabel(t('Tên mục'), { exact: true }).fill('Unfinished draft');
    await page.getByLabel(t('Mật khẩu'), { exact: true }).fill('draft-fixture-secret');
    await app.blur();
    await page.clock.runFor(179_000);
    await expect(page.getByLabel(t('Tên mục'), { exact: true })).toHaveValue('Unfinished draft');
    await app.focus();
    await page.evaluate(() => window.kiroDesktop!.isDeviceLocked());
    await page.clock.runFor(5_000);
    await expect(page.getByLabel(t('Mật khẩu'), { exact: true })).toHaveValue('draft-fixture-secret');
    await app.blur();
    await page.clock.runFor(181_000);
    await expect(page.getByLabel(t('Tên mục'), { exact: true })).toHaveCount(0);
    await expectDesktopUnlock(page, 'Grace QA');

    await app.focus();
    await unlockDesktopVault(page, 'Grace QA');
    await settings(page);
    await page.getByLabel(t('Khoá sau khi rời ứng dụng'), { exact: true }).selectOption('60');
    await expect(page.getByLabel(t('Khoá sau khi rời ứng dụng'), { exact: true })).toHaveValue('60');
    await page.getByLabel(t('Bố cục'), { exact: true }).selectOption('B');
    await expect(page.getByLabel(t('Bố cục'), { exact: true })).toHaveValue('B');
    await page.getByLabel(t('Mật độ danh sách'), { exact: true }).selectOption('compact');
    await expect(page.getByLabel(t('Mật độ danh sách'), { exact: true })).toHaveValue('compact');
    await page.getByLabel(t('Giảm chuyển động'), { exact: true }).check();
    await expect(page.locator('.desktop-canvas')).toHaveClass(/reduce-motion/);
    await app.close(); app = undefined;
    const reopened = await launchDesktop(profile); app = reopened.app; page = reopened.page;
    await unlockDesktopVault(page, 'Grace QA'); await settings(page);
    await expect(page.getByLabel(t('Khoá sau khi rời ứng dụng'), { exact: true })).toHaveValue('60');
    await expect(page.getByLabel(t('Bố cục'), { exact: true })).toHaveValue('B');
    await expect(page.getByLabel(t('Mật độ danh sách'), { exact: true })).toHaveValue('compact');
    await expect(page.getByLabel(t('Giảm chuyển động'), { exact: true })).toBeChecked();
    await page.getByLabel(t('Khoá sau khi rời ứng dụng'), { exact: true }).selectOption('180');
    const auth = page.getByRole('dialog');
    await auth.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
    await auth.getByRole('button', { name: t('Xác nhận'), exact: true }).click();
    await expect(page.getByLabel(t('Khoá sau khi rời ứng dụng'), { exact: true })).toHaveValue('180');
    await app.emit('deviceLocked');
    await expect(page.getByLabel(t('Khoá sau khi rời ứng dụng'), { exact: true })).toHaveCount(0);
    await app.emit('foreground');
    await expectDesktopUnlock(page, 'Grace QA');
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('WebKit UI app departure starts the grace period even while a native file dialog owns focus', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-dialog-grace-e2e-'));
  let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await page.clock.install({ time: new Date() }); await page.reload();
    await createDesktopVault(page, 'Dialog Grace QA');
    await app.holdDialog();
    await page.evaluate(() => { void window.kiroDesktop!.pickFile(); });
    await app.windowBlur();
    await page.clock.runFor(181_000);
    await expect(page.getByRole('button', { name: t('Mới'), exact: true })).toBeVisible();
    await app.blur();
    await page.clock.runFor(179_000);
    await expect(page.getByRole('button', { name: t('Mới'), exact: true })).toBeVisible();
    await app.blur();
    await page.clock.runFor(2_000);
    await expectDesktopUnlock(page, 'Dialog Grace QA');
    await app.finishDialog();
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
