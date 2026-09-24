import { DesktopApplication } from './webkit-host';
import { test, expect, type Page } from '@playwright/test';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expectDesktopUnlock, t } from './helpers';

const originalPassword = 'Data-tools-fixture-master-2026';
const newPassword = 'Changed-data-tools-master-2026';
const settings = (page: Page) => page.locator('footer').getByRole('button', { name: t('Cài đặt'), exact: true }).click();
const exists = (path: string) => access(path).then(() => true, () => false);

test('WebKit UI backup, restore, master-password change and explicitly authenticated JSON export', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-data-tools-e2e-'));
  const backup = join(profile, 'selected-backup.akpr');
  const plaintext = join(profile, 'explicit-export.json');
  let app: DesktopApplication | undefined;
  const launch = async () => {
    app = await DesktopApplication.launch(profile);
    const page = app.page;
    await app.focus();
    return page;
  };
  try {
    let page = await launch();
    await page.getByRole('button', { name: t('Tạo Vault mới'), exact: true }).click();
    await page.getByLabel(t('Tên Vault'), { exact: true }).fill('Data Tools QA');
    await page.getByLabel(t('Master Password'), { exact: true }).fill(originalPassword);
    await page.getByLabel(t('Xác nhận Master Password'), { exact: true }).fill(originalPassword);
    await page.getByRole('button', { name: t('Tạo Vault'), exact: true }).click();
    await page.getByRole('button', { name: t('Mới'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Đăng nhập'), exact: true }).click();
    await page.getByLabel(t('Tên mục'), { exact: true }).fill('Before restore');
    await page.getByLabel(t('Mật khẩu'), { exact: true }).fill('data-tools-fixture-secret');
    await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
    await page.getByRole('button', { name: t('{name}, đang ẩn', { name: t('Mật khẩu') }), exact: true }).waitFor();

    await settings(page);
    await page.getByRole('button', { name: t('Bản sao lưu'), exact: true }).click();
    await page.getByRole('button', { name: t('Tạo bản sao lưu'), exact: true }).click();
    await expect(page.getByText(t('Đã tạo bản sao lưu mã hóa.'), { exact: true })).toBeVisible();
    await app!.saveFile(backup);
    await page.getByRole('button', { name: t('Lưu bản sao ra file'), exact: true }).click();
    await expect.poll(() => exists(backup)).toBe(true);
    const backupBytes = await readFile(backup);
    expect(backupBytes.subarray(0, 8).toString()).toBe('KIROVLT\0');
    expect(backupBytes.includes(Buffer.from('data-tools-fixture-secret'))).toBe(false);

    await page.locator('aside').getByRole('button', { name: t('Tất cả mục'), exact: true }).click();
    await page.getByRole('option', { name: 'Before restore, ' + t('Đăng nhập'), exact: true }).click();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByLabel(t('Tên mục'), { exact: true }).fill('Changed after backup');
    await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
    await page.getByRole('button', { name: t('{name}, đang ẩn', { name: t('Mật khẩu') }), exact: true }).waitFor();
    await settings(page);
    await page.getByRole('button', { name: t('Bản sao lưu'), exact: true }).click();
    await app!.pickFile(backup);
    await page.getByRole('button', { name: t('Khôi phục từ file'), exact: true }).click();
    await page.getByLabel(t('Mật khẩu của bản sao'), { exact: true }).fill(originalPassword);
    await page.getByRole('button', { name: t('Kiểm tra & xem trước'), exact: true }).click();
    await expect(page.getByText('1 mục · 0 thư mục', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: t('Khôi phục bản này'), exact: true }).click();
    await expect(page.getByText(t('Đã khôi phục. Vault trước đó được giữ trong một bản sao mã hóa.'), { exact: true })).toBeVisible();
    await page.locator('aside').getByRole('button', { name: t('Tất cả mục'), exact: true }).click();
    await expect(page.getByRole('option', { name: 'Before restore, ' + t('Đăng nhập'), exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Changed after backup, ' + t('Đăng nhập'), exact: true })).toHaveCount(0);

    await settings(page);
    await page.getByRole('button', { name: t('Đổi Master Password'), exact: true }).click();
    await page.getByLabel(t('Mật khẩu hiện tại'), { exact: true }).fill(originalPassword);
    await page.getByLabel(t('Mật khẩu chính mới'), { exact: true }).fill(newPassword);
    await page.getByLabel(t('Xác nhận mật khẩu mới'), { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: t('Đổi mật khẩu chính'), exact: true }).click();
    await expect(page.getByText(t('Đã đổi mật khẩu chính. Các bản sao lưu cũ vẫn dùng mật khẩu lúc tạo.'))).toBeVisible();
    await app!.close(); app = undefined;

    page = await launch();
    await expectDesktopUnlock(page, 'Data Tools QA');
    await page.getByLabel(t('Master Password'), { exact: true }).fill(originalPassword);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await expect(page.locator('.desktop-error')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Before restore, ' + t('Đăng nhập'), exact: true })).toHaveCount(0);
    await page.getByLabel(t('Master Password'), { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await expect(page.getByRole('option', { name: 'Before restore, ' + t('Đăng nhập'), exact: true })).toBeVisible();
    expect(Buffer.compare(backupBytes, await readFile(backup))).toBe(0);

    await settings(page);
    await page.getByRole('button', { name: t('Xuất dữ liệu'), exact: true }).click();
    await expect(page.getByRole('button', { name: t('Xuất JSON không mã hóa'), exact: true })).toBeDisabled();
    await page.getByRole('switch', { name: t('Tôi hiểu file xuất sẽ không được mã hóa'), exact: true }).click();
    await app!.saveFile(plaintext);
    await page.getByRole('button', { name: t('Xuất JSON không mã hóa'), exact: true }).click();
    expect(await exists(plaintext)).toBe(false);
    await page.getByLabel(t('Master Password'), { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: t('Xác nhận'), exact: true }).click();
    await expect.poll(() => exists(plaintext)).toBe(true);
    const exported = JSON.parse(await readFile(plaintext, 'utf8')) as { items: { title: string }[] };
    expect(exported.items.map((item) => item.title)).toEqual(['Before restore']);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
