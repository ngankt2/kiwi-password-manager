import { DesktopApplication } from './webkit-host';
import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expectDesktopUnlock, launchDesktop as launch, t } from './helpers';

const password = 'Desktop-fixture-password-2026';
async function createVault(page: Page, name: string) {
  await page.getByRole('button', { name: t('Tạo Vault mới'), exact: true }).click();
  await page.getByLabel(t('Tên Vault'), { exact: true }).fill(name);
  await page.getByLabel(t('Master Password'), { exact: true }).fill(password);
  await page.getByLabel(t('Xác nhận Master Password'), { exact: true }).fill(password);
  await page.getByRole('button', { name: t('Tạo Vault'), exact: true }).click();
  await page.getByRole('button', { name: t('Mới'), exact: true }).waitFor();
}
async function newLogin(page: Page) {
  await page.getByRole('button', { name: t('Mới'), exact: true }).click();
  await page.getByRole('menuitem', { name: t('Đăng nhập'), exact: true }).click();
  await page.getByLabel(t('Tên mục'), { exact: true }).fill('Example Mail');
  await page.getByLabel(t('Tên đăng nhập'), { exact: true }).fill('fixture@example.invalid');
  await page.getByLabel(t('Mật khẩu'), { exact: true }).fill('fixture-secret-e2e');
  await page.getByLabel(t('Trang web'), { exact: true }).fill('https://example.invalid');
  await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
  await page.getByRole('button', { name: t('{name}, đang ẩn', { name: t('Mật khẩu') }), exact: true }).waitFor();
}
test('WebKit UI create, edit, copy, lock, reopen and encrypted storage', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-e2e-'));
  let app: DesktopApplication | undefined;
  try {
    let opened = await launch(profile); app = opened.app; let page = opened.page;
    const pageErrors: string[] = []; page.on('pageerror', (error) => pageErrors.push(error.message));
    await createVault(page, 'Desktop QA'); await newLogin(page);
    await page.getByRole('button', { name: t('{name}, đang ẩn', { name: t('Mật khẩu') }), exact: true }).click();
    await expect.poll(() => app!.clipboardText().then((value) => value === 'fixture-secret-e2e')).toBe(true);
    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await expect(page.getByRole('button', { name: t('{name}, đang ẩn', { name: t('Mật khẩu') }), exact: true })).toHaveCount(0);
    await expect.poll(() => app!.clipboardText().then((value) => value === '')).toBe(true);
    await app.close(); app = undefined;
    opened = await launch(profile); app = opened.app; page = opened.page;
    await expectDesktopUnlock(page, 'Desktop QA');
    await page.getByLabel(t('Master Password'), { exact: true }).fill(password);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await page.getByRole('button', { name: new RegExp(t('Tìm trong vault…')) }).click();
    await page.getByRole('combobox', { name: t('Tìm trong Vault'), exact: true }).fill('Example');
    await page.getByRole('dialog', { name: t('Tìm trong Vault'), exact: true }).getByRole('option', { name: /Example Mail/ }).click();
    await expect(page.getByRole('option', { name: 'Example Mail, ' + t('Đăng nhập'), exact: true })).toBeVisible();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByLabel(t('Tên mục'), { exact: true }).fill('Example Mail updated');
    await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
    await expect(page.getByText('Example Mail updated', { exact: true }).first()).toBeVisible();
    const vaultRoot = join(profile, 'encrypted-files', 'vaults');
    for (const id of await readdir(vaultRoot)) {
      for (const file of await readdir(join(vaultRoot, id))) {
        const bytes = await readFile(join(vaultRoot, id, file));
        expect(bytes.includes(Buffer.from('fixture-secret-e2e'))).toBe(false);
        expect(bytes.includes(Buffer.from(password))).toBe(false);
      }
    }
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: 'tests/reports/desktop-vault.png' });
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('user-supplied KeePass database opens through the file-picker bridge and creates an encrypted vault', async () => {
  test.skip(!process.env.KIRO_TEST_KDBX || process.env.KIRO_TEST_PASSWORD === undefined, 'Explicit local fixture and password are required.');
  const profile = await mkdtemp(join(tmpdir(), 'kiro-kdbx-e2e-'));
  let app: DesktopApplication | undefined;
  try {
    const opened = await launch(profile); app = opened.app; const page = opened.page;
    const source = resolve(process.env.KIRO_TEST_KDBX!); const before = await readFile(source);
    await app!.pickFile(source);
    await page.getByRole('button', { name: t('Mở Vault có sẵn…'), exact: true }).click();
    await page.getByLabel(t('Mật khẩu KeePass'), { exact: true }).fill(process.env.KIRO_TEST_PASSWORD!);
    await page.getByRole('button', { name: t('Xem trước dữ liệu'), exact: true }).click();
    // Assert counts only. Do not put source titles, fields or secrets in reports.
    await expect(page.getByText('1 mục · 1 thư mục', { exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByLabel(t('Tên Vault mới'), { exact: true }).fill('Compatibility QA');
    await page.getByLabel(t('Master Password mới'), { exact: true }).fill(password);
    await page.getByLabel(t('Xác nhận Master Password'), { exact: true }).fill(password);
    await page.getByRole('button', { name: t('Tạo Vault từ dữ liệu này'), exact: true }).click();
    await expect.poll(() => page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).count()).toBe(1);
    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await app.close(); app = undefined;
    const reopened = await launch(profile); app = reopened.app;
    await expectDesktopUnlock(reopened.page, 'Compatibility QA');
    await reopened.page.getByLabel(t('Master Password'), { exact: true }).fill(password);
    await reopened.page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await expect.poll(() => reopened.page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).count()).toBe(1);
    expect(Buffer.compare(before, await readFile(source))).toBe(0);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
