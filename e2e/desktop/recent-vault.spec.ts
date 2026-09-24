import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type DesktopApplication } from './webkit-host';
import { createDesktopVault, desktopPassword, expectDesktopUnlock, launchDesktop, t, unlockDesktopVault } from './helpers';

test('startup selects the last opened vault and the picker remains available', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-recent-vault-e2e-'));
  let app: DesktopApplication | undefined;
  try {
    let opened = await launchDesktop(profile); app = opened.app; let page = opened.page;
    const picker = () => page.getByRole('button', { name: t('Tạo Vault mới'), exact: true });
    const lock = () => page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await expect(picker()).toBeVisible();
    await createDesktopVault(page, 'Earlier vault');
    await lock();
    await expectDesktopUnlock(page, 'Earlier vault');
    await page.getByRole('button', { name: t('Mở Vault khác'), exact: true }).click();
    await expect(picker()).toBeVisible();
    await page.reload();
    await expect(picker()).toBeVisible();
    await picker().click();
    await page.getByRole('button', { name: t('Quay lại'), exact: true }).click();
    await expect(picker()).toBeVisible();
    await page.getByRole('button', { name: t('Nhập mật khẩu từ KeePass'), exact: true }).click();
    await page.getByRole('button', { name: t('Quay lại'), exact: true }).click();
    await expect(picker()).toBeVisible();
    await createDesktopVault(page, 'Newer vault');
    await lock();
    await expectDesktopUnlock(page, 'Newer vault');
    await unlockDesktopVault(page, 'Earlier vault');
    await app.close(); app = undefined;

    opened = await launchDesktop(profile); app = opened.app; page = opened.page;
    await expectDesktopUnlock(page, 'Earlier vault');
    await expect(page.getByLabel(t('Master Password'), { exact: true })).toHaveValue('');
    await expect(picker()).toHaveCount(0);
    await page.reload();
    await expectDesktopUnlock(page, 'Earlier vault');
    await page.getByRole('button', { name: t('Mở Vault khác'), exact: true }).click();
    await expect(page.getByRole('button', { name: t('Mở {name}', { name: 'Earlier vault' }), exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: t('Mở {name}', { name: 'Newer vault' }), exact: true })).toBeVisible();
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('unlock restores the typing caret when the app appears without interrupting other controls', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-unlock-focus-e2e-'));
  let app: DesktopApplication | undefined;
  try {
    let opened = await launchDesktop(profile); app = opened.app; let page = opened.page;
    await createDesktopVault(page, 'Autofocus QA');
    await app.close(); app = undefined;
    opened = await launchDesktop(profile, { focus: false }); app = opened.app; page = opened.page;
    const password = page.getByLabel(t('Master Password'), { exact: true });
    await expectDesktopUnlock(page, 'Autofocus QA');
    // The native window can become active after the input's mount-time autofocus.
    await password.evaluate((input: HTMLInputElement) => input.blur());
    await expect(password).not.toBeFocused();
    await app.focus();
    await expect(password).toBeFocused({ timeout: 2500 });
    await page.keyboard.type(desktopPassword.slice(0, 8));
    await expect(password).toHaveValue(desktopPassword.slice(0, 8));
    await app.blur();
    await password.evaluate((input: HTMLInputElement) => input.blur());
    await app.focus();
    await expect(password).toBeFocused();
    await page.keyboard.type(desktopPassword.slice(8));
    await expect(password).toHaveValue(desktopPassword);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: t('Mới'), exact: true })).toBeVisible();

    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await expectDesktopUnlock(page, 'Autofocus QA');
    await page.getByRole('button', { name: t('Quên Master Password?'), exact: true }).click();
    const dialog = page.getByRole('dialog');
    const done = dialog.getByRole('button', { name: t('Đã hiểu'), exact: true });
    await done.focus();
    await app.blur(); await app.focus();
    await expect(done).toBeFocused();
    await expect(password).not.toBeFocused();
    await done.click();
    await expectDesktopUnlock(page, 'Autofocus QA');

    const language = page.getByRole('combobox', { name: t('Ngôn ngữ hiển thị'), exact: true });
    await language.focus();
    await app.focus();
    await expect(language).toBeFocused();
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
