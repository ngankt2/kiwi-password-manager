import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopVault, launchDesktop, t } from './helpers';
import type { DesktopApplication } from './webkit-host';

test('update checks run after startup and every six visible hours without downloading', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'appkiro-update-timing-')); let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await page.clock.install({ time: new Date('2026-09-24T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-24T00:00:01Z')); await page.reload();
    await expect(page.locator('.desktop-app-version')).toBeVisible();
    await page.clock.runFor(2999); expect(app.updateRequests().checks).toBe(0);
    await page.clock.runFor(2); await expect.poll(() => app!.updateRequests().checks).toBe(1);
    await page.locator('.desktop-app-version').click();
    const dialog = page.getByRole('dialog', { name: t('Cập nhật ứng dụng'), exact: true });
    await expect(dialog.getByText(t('Bạn đang dùng phiên bản mới nhất.'), { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: t('Kiểm tra cập nhật…'), exact: true })).toBeEnabled();
    await page.clock.fastForward(6 * 60 * 60 * 1000); await expect.poll(() => app!.updateRequests().checks).toBe(2);
    await page.evaluate(() => Object.defineProperty(document, 'hidden', { value: true, configurable: true }));
    await page.clock.fastForward(6 * 60 * 60 * 1000); expect(app.updateRequests().checks).toBe(2);
    expect(app.updateRequests().downloads).toBe(0); expect(app.updateRequests().restarts).toBe(0);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('updates show plain-text notes and progress, preserve drafts and require an explicit restart', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'appkiro-update-ui-')); let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await createDesktopVault(page, 'Update draft QA');
    await page.getByRole('button', { name: t('Mới'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Đăng nhập'), exact: true }).click();
    await page.getByLabel(t('Tên mục'), { exact: true }).fill('Keep this draft');
    const notes = '<img src="https://example.invalid" onerror="alert(1)">\nRelease notes as text.';
    await app.planUpdate({ status: 'available', release: { version: '9.9.9', notes, publishedAt: null } });
    await page.locator('.desktop-app-version').click();
    const dialog = page.getByRole('dialog', { name: t('Cập nhật ứng dụng'), exact: true });
    await dialog.getByRole('button', { name: t('Kiểm tra cập nhật…'), exact: true }).click();
    await expect(dialog.locator('.desktop-update-notes')).toHaveText(notes);
    await expect(dialog.locator('.desktop-update-notes img')).toHaveCount(0);
    expect(app.updateRequests().downloads).toBe(0);
    await app.holdUpdateDownload();
    await dialog.getByRole('button', { name: t('Tải và cài đặt'), exact: true }).click();
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '0.5');
    await expect(dialog.getByRole('button', { name: t('Kiểm tra cập nhật…'), exact: true })).toBeDisabled();
    await app.finishUpdateDownload();
    await expect(dialog.getByRole('button', { name: t('Khởi động lại'), exact: true })).toBeEnabled();
    expect(app.updateRequests().restarts).toBe(0);
    await dialog.getByRole('button', { name: t('Khởi động lại'), exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText(t('Hãy lưu hoặc bỏ các thay đổi đang sửa trước khi khởi động lại.'));
    expect(app.updateRequests().restarts).toBe(0);
    await dialog.getByRole('button', { name: t('Đóng'), exact: true }).click();
    await expect(page.getByLabel(t('Tên mục'), { exact: true })).toHaveValue('Keep this draft');
    await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
    await expect(page.getByRole('button', { name: t('Sửa'), exact: true })).toBeVisible();
    await page.locator('.desktop-app-version').click();
    await dialog.getByRole('button', { name: t('Khởi động lại'), exact: true }).click();
    await expect.poll(() => app!.updateRequests().restarts).toBe(1);
    await expect(page.locator('.desktop-workspace')).toHaveCount(0);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('a failed update recheck removes install controls for the previously offered release', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'appkiro-update-failure-')); let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await app.planUpdate({ status: 'available', release: { version: '9.9.9', notes: 'Test', publishedAt: null } });
    await page.locator('.desktop-app-version').click();
    const dialog = page.getByRole('dialog', { name: t('Cập nhật ứng dụng'), exact: true });
    await dialog.getByRole('button', { name: t('Kiểm tra cập nhật…'), exact: true }).click();
    await expect(dialog.getByRole('button', { name: t('Tải và cài đặt'), exact: true })).toBeVisible();
    await app.planUpdate({ status: 'error', error: 'NETWORK', release: null });
    await dialog.getByRole('button', { name: t('Kiểm tra cập nhật…'), exact: true }).click();
    await expect(dialog.getByRole('button', { name: t('Tải và cài đặt'), exact: true })).toHaveCount(0);
    await expect(dialog.getByText(t('Không kiểm tra được cập nhật. Hãy kiểm tra kết nối và thử lại.'), { exact: true })).toBeVisible();
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
