import { DesktopApplication } from './webkit-host';
import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { desktopPassword, launchDesktop, t } from './helpers';

test('editor input actions and searchable folder creation preserve the draft and saved values', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-editor-inputs-'));
  let app: DesktopApplication | undefined;
  try {
    const source = join(profile, 'Editor inputs.vault');
    await promisify(execFile)('bun', [resolve('scripts/create-desktop-ui-fixture.ts'), source]);
    const opened = await launchDesktop(profile, { focus: false }); app = opened.app;
    const page = opened.page;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await app!.pickFile(source);
    await page.getByRole('button', { name: t('Mở Vault có sẵn…'), exact: true }).click();
    await page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await page.getByRole('option', { name: 'Email công việc, ' + t('Đăng nhập'), exact: true }).click();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    const title = page.getByLabel(t('Tên mục'), { exact: true });
    await title.fill('Draft with inline input actions');

    const password = page.getByLabel(t('Mật khẩu'), { exact: true });
    const passwordControl = page.locator('.desktop-input-control').filter({ has: password });
    await passwordControl.getByRole('button', { name: t('Hiện {name}', { name: t('Mật khẩu') }), exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await passwordControl.getByRole('button', { name: t('Ẩn {name}', { name: t('Mật khẩu') }), exact: true }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await passwordControl.getByRole('button', { name: t('Tạo mật khẩu cho {name}', { name: t('Mật khẩu') }), exact: true }).click();
    const generator = page.getByRole('dialog', { name: t('Tạo mật khẩu'), exact: true });
    const generated = await generator.getByLabel(t('Mật khẩu được tạo'), { exact: true }).innerText();
    await generator.getByRole('button', { name: t('Dùng mật khẩu'), exact: true }).click();
    await expect(password).toHaveValue(generated);
    await expect(title).toHaveValue('Draft with inline input actions');

    await page.getByRole('button', { name: t('Thêm trường'), exact: true }).click();
    await page.getByLabel(t('Tên trường tuỳ chỉnh'), { exact: true }).last().fill('Extra secret');
    await page.getByLabel(t('Loại trường {name}', { name: 'Extra secret' }), { exact: true }).selectOption('secret');
    const custom = page.getByLabel(t('Giá trị {name}', { name: 'Extra secret' }), { exact: true });
    await custom.fill('custom-fixture-secret');
    const customControl = page.locator('.desktop-input-control').filter({ has: custom });
    await expect(customControl.getByRole('button', { name: t('Tạo mật khẩu cho {name}', { name: 'Extra secret' }), exact: true })).toBeVisible();
    await customControl.getByRole('button', { name: t('Hiện {name}', { name: t('Giá trị {name}', { name: 'Extra secret' }) }), exact: true }).click();
    await expect(custom).toHaveAttribute('type', 'text');
    // Changing the kind must not carry the revealed state into a new secret field.
    await page.getByLabel(t('Loại trường {name}', { name: 'Extra secret' }), { exact: true }).selectOption('text');
    await page.getByLabel(t('Loại trường {name}', { name: 'Extra secret' }), { exact: true }).selectOption('secret');
    await expect(custom).toHaveAttribute('type', 'password');
    await expect(custom).toHaveValue('custom-fixture-secret');
    const otp = page.getByLabel(t('Mã xác thực OTP'), { exact: true });
    await expect(page.locator('.desktop-input-control').filter({ has: otp }).getByRole('button', { name: /Tạo mật khẩu/ })).toHaveCount(0);

    const folder = page.getByRole('combobox', { name: t('Thư mục'), exact: true });
    await folder.fill('cong viec');
    await folder.press('Enter');
    await expect(folder).toHaveValue('Công việc');
    await folder.fill('Cancelled folder search');
    await folder.press('Escape');
    await expect(folder).toHaveValue('Công việc');
    await expect(folder).toHaveAttribute('aria-expanded', 'false');

    const folderName = 'Folder from missing search';
    await folder.fill(folderName);
    await expect(page.getByText(t('Không tìm thấy thư mục.'), { exact: true })).toBeVisible();
    const folderControl = page.locator('.desktop-input-control').filter({ has: folder });
    await folderControl.getByRole('button', { name: t('Tạo thư mục “{name}”', { name: folderName }), exact: true }).click();
    const dialog = page.getByRole('dialog', { name: t('Thư mục mới'), exact: true });
    await expect(dialog.getByLabel(t('Tên thư mục'), { exact: true })).toHaveValue(folderName);
    await dialog.getByRole('button', { name: t('Huỷ'), exact: true }).click();
    await expect(folder).toHaveValue('Công việc');
    await expect(password).toHaveValue(generated);

    await folder.fill(folderName);
    await folder.press('Enter');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(t('Thư mục cha'), { exact: true }).selectOption('');
    await dialog.getByRole('button', { name: t('Tạo thư mục'), exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(folder).toHaveValue(folderName);
    await expect(title).toHaveValue('Draft with inline input actions');
    await expect(custom).toHaveValue('custom-fixture-secret');
    await folder.fill(folderName);
    await expect(folderControl.getByRole('button', { name: t('Tạo thư mục “{name}”', { name: folderName }), exact: true })).toHaveCount(0);
    await folder.press('ArrowDown');
    await folder.press('Enter');
    await expect(folder).toHaveValue(folderName);

    await mkdir('tests/reports/editor-inputs', { recursive: true });
    for (const [width, height, theme] of [[1320, 860, 'dark'], [760, 580, 'light']] as const) {
      await app.resize(width, height);
      await page.waitForFunction((width) => innerWidth === width, width);
      await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
      await password.scrollIntoViewIfNeeded();
      const clipped = await page.locator('.desktop-editor .desktop-input-control').evaluateAll((controls) => controls.filter((control) => {
        const input = control.querySelector('input')!;
        const addon = control.querySelector('.desktop-input-addon');
        const box = control.getBoundingClientRect();
        return input.getBoundingClientRect().width < 40 || (addon && (addon.getBoundingClientRect().right > box.right || input.getBoundingClientRect().right > addon.getBoundingClientRect().left + 1));
      }).map((control) => control.querySelector('input')?.id));
      expect(clipped).toEqual([]);
      await page.screenshot({ path: `tests/reports/editor-inputs/${theme}.png` });
    }
    await folder.fill('Another missing folder');
    await expect(page.getByRole('option', { name: t('Tạo thư mục “{name}”', { name: 'Another missing folder' }), exact: true })).toBeInViewport();
    await page.screenshot({ path: 'tests/reports/editor-inputs/create-folder.png' });
    await folder.press('Escape');
    await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await expect(password).toHaveValue(generated);
    await expect(custom).toHaveValue('custom-fixture-secret');
    await expect(folder).toHaveValue(folderName);
    expect(errors).toEqual([]);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
