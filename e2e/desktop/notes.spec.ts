import { expect, test, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type DesktopApplication } from './webkit-host';
import { createDesktopVault, desktopPassword, launchDesktop, t } from './helpers';

const noteName = t('Ghi chú');
const showNotes = t('Hiện {name}', { name: noteName });
const hideNotes = t('Ẩn {name}', { name: noteName });
const copyNotes = t('Sao chép {name}', { name: noteName });
const noteSection = (page: Page) => page.getByRole('region', { name: noteName, exact: true });

async function save(page: Page) {
  await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
  await page.getByRole('button', { name: t('Sửa'), exact: true }).waitFor();
}

async function createItem(page: Page, title: string, notes: string, kind: 'Đăng nhập' | 'Ghi chú bảo mật' = 'Đăng nhập') {
  await page.getByRole('button', { name: t('Mới'), exact: true }).click();
  await page.getByRole('menuitem', { name: t(kind), exact: true }).click();
  await page.getByLabel(t('Tên mục'), { exact: true }).fill(title);
  await page.getByLabel(noteName, { exact: true }).fill(notes);
  await save(page);
}

async function authenticate(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
  await dialog.getByRole('button', { name: t('Xác nhận'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('notes stay concealed until revealed and reset on timeout, item changes and background', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-concealed-notes-'));
  let app: DesktopApplication | undefined;
  const secret = 'PRIVATE-NOTES-FIXTURE\nSecond line with a recovery hint.\n' + 'long-note-content-'.repeat(20);
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await page.clock.install({ time: new Date() });
    await page.reload();
    await createDesktopVault(page, 'Notes privacy QA');
    await createItem(page, 'Login with notes', secret);
    await createItem(page, 'Secure note', secret, 'Ghi chú bảo mật');
    const notes = noteSection(page);
    await expect(notes.getByRole('button', { name: showNotes, exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('body')).not.toContainText(secret);
    await notes.getByRole('button', { name: copyNotes, exact: true }).click();
    await expect.poll(() => app!.clipboardText()).toBe(secret);
    await expect(page.locator('body')).not.toContainText(secret);

    await notes.getByRole('button', { name: showNotes, exact: true }).press('Enter');
    await expect(notes.locator('.desktop-note')).toHaveText(secret);
    await page.clock.runFor(14_000);
    await expect(notes.locator('.desktop-note')).toHaveText(secret);
    await page.clock.runFor(1_100);
    await expect(page.locator('body')).not.toContainText(secret);
    await notes.getByRole('button', { name: showNotes, exact: true }).click();
    await notes.getByRole('button', { name: hideNotes, exact: true }).click();
    await expect(page.locator('body')).not.toContainText(secret);

    await notes.getByRole('button', { name: showNotes, exact: true }).click();
    await page.getByRole('option', { name: 'Login with notes, ' + t('Đăng nhập'), exact: true }).click();
    await expect(page.locator('body')).not.toContainText(secret);
    await notes.getByRole('button', { name: showNotes, exact: true }).click();
    await expect(notes.locator('.desktop-note')).toHaveText(secret);
    await app.blur();
    await expect(page.locator('body')).not.toContainText(secret);
    await expect(page.getByRole('button', { name: t('Mới'), exact: true })).toBeVisible();
    await app.focus();
    await expect(page.locator('body')).not.toContainText(secret);

    await app.resize(760, 580);
    await notes.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'tests/reports/desktop-notes-hidden.png' });
    await notes.getByRole('button', { name: showNotes, exact: true }).click();
    await expect(notes.locator('.desktop-note')).toHaveText(secret);
    expect(await notes.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: 'tests/reports/desktop-notes-revealed.png' });
    await app.resize(1320, 860);
    await createItem(page, 'Empty note', '', 'Ghi chú bảo mật');
    await expect(notes).toContainText(t('Chưa có ghi chú.'));
    await expect(notes.getByRole('button')).toHaveCount(0);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('notes and their history require authentication when secret protection is enabled', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-authenticated-notes-'));
  let app: DesktopApplication | undefined;
  const earlier = 'PRIVATE-NOTE-BEFORE-EDIT';
  const current = 'PRIVATE-NOTE-AFTER-EDIT';
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await createDesktopVault(page, 'Protected notes QA');
    await createItem(page, 'Protected notes', earlier);
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByLabel(noteName, { exact: true }).fill(current);
    await save(page);
    await page.locator('footer').getByRole('button', { name: t('Cài đặt'), exact: true }).click();
    await page.getByLabel(t('Xác thực trước khi hiện bí mật'), { exact: true }).check();
    await expect(page.getByLabel(t('Xác thực trước khi hiện bí mật'), { exact: true })).toBeChecked();
    await page.locator('aside').getByRole('button', { name: t('Tất cả mục'), exact: true }).click();
    await page.getByRole('option', { name: 'Protected notes, ' + t('Đăng nhập'), exact: true }).click();
    const notes = noteSection(page);
    await notes.getByRole('button', { name: showNotes, exact: true }).click();
    await expect(page.locator('body')).not.toContainText(current);
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(t('Master Password'), { exact: true }).fill('Wrong-notes-fixture-password');
    await dialog.getByRole('button', { name: t('Xác nhận'), exact: true }).click();
    await expect(dialog.getByLabel(t('Master Password'), { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('body')).not.toContainText(current);
    await authenticate(page);
    await expect(notes.locator('.desktop-note')).toHaveText(current);
    await notes.getByRole('button', { name: hideNotes, exact: true }).click();
    await notes.getByRole('button', { name: copyNotes, exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(await app.clipboardText()).toBe('');
    await authenticate(page);
    await expect.poll(() => app!.clipboardText()).toBe(current);
    await expect(page.locator('body')).not.toContainText(current);

    await page.locator('.desktop-history-link').click();
    await page.locator('.desktop-history-row').last().click();
    await expect(page.locator('body')).not.toContainText(earlier);
    await expect(page.locator('body')).not.toContainText(current);
    await page.getByRole('button', { name: t('Hiện giá trị bí mật'), exact: true }).click();
    await expect(dialog).toBeVisible();
    await authenticate(page);
    await expect(page.locator('.desktop-change-values')).toContainText(earlier);
    await expect(page.locator('.desktop-change-values')).toContainText(current);
    await app.blur();
    await expect(page.locator('body')).not.toContainText(earlier);
    await expect(page.locator('body')).not.toContainText(current);
    await app.focus();
    await expect(page.locator('body')).not.toContainText(current);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
