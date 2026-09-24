import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { desktopPassword, launchDesktop, t } from './helpers';
import type { DesktopApplication } from './webkit-host';

test('sidebar tag cloud counts items, filters exact tags and respects unsaved edits in both layouts', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-tags-'));
  let app: DesktopApplication | undefined;
  try {
    const source = join(profile, 'Tags.vault');
    await promisify(execFile)('bun', [resolve('scripts/create-desktop-ui-fixture.ts'), source]);
    const opened = await launchDesktop(profile, { focus: false }); app = opened.app;
    const page = opened.page;
    await app.pickFile(source);
    await page.getByRole('button', { name: t('Mở Vault có sẵn…'), exact: true }).click();
    await page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    const cloud = page.getByRole('region', { name: t('Lọc theo thẻ'), exact: true });
    const badge = (tag: string) => cloud.getByRole('button', { name: t('Lọc theo thẻ {tag}', { tag }), exact: true });
    await expect(badge('Desktop').locator('.desktop-tag-count')).toHaveText('10');
    await badge('Kiểm thử').click();
    await expect(badge('Kiểm thử')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.desktop-list-title h1')).toHaveText('#Kiểm thử');
    await expect(page.getByRole('option')).toHaveCount(10);
    await badge('Kiểm thử').click();
    await expect(page.locator('.desktop-list-title h1')).toHaveText(t('Tất cả mục'));

    const itemName = 'Email công việc, ' + t('Đăng nhập');
    await page.getByRole('option', { name: itemName, exact: true }).click();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    const unique = 'Khách hàng / VIP:#';
    await page.getByLabel(t('Thẻ'), { exact: true }).fill('Desktop, Kiểm thử, ' + unique);
    await badge('Desktop').click();
    const confirmation = page.getByRole('dialog', { name: t('Bỏ các thay đổi chưa lưu?'), exact: true });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: t('Tiếp tục sửa'), exact: true }).click();
    await expect(page.getByLabel(t('Thẻ'), { exact: true })).toHaveValue('Desktop, Kiểm thử, ' + unique);
    await page.locator('.desktop-detail-toolbar').getByRole('button', { name: t('Lưu'), exact: true }).click();
    await expect(badge(unique).locator('.desktop-tag-count')).toHaveText('1');
    await badge(unique).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option', { name: itemName, exact: true })).toBeVisible();
    await expect(page.locator('.desktop-list-title h1')).toHaveText('#' + unique);
    expect(new URL(page.url()).searchParams.get('filter')).toBe('tag:' + unique);
    await mkdir('tests/reports/tags', { recursive: true });
    await page.screenshot({ path: 'tests/reports/tags/sidebar.png' });
    await cloud.getByRole('button', { name: t('Bỏ lọc thẻ'), exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(10);

    await page.getByRole('button', { name: t('Cài đặt'), exact: true }).click();
    await page.getByLabel(t('Bố cục'), { exact: true }).selectOption('B');
    await page.locator('.desktop-sidebar [data-nav="all"]').click();
    await page.locator('.desktop-sidebar [data-nav="tags"]').click();
    await expect(cloud).toBeVisible();
    await badge(unique).click();
    await expect(cloud).not.toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.locator('.desktop-sidebar [data-nav="tags"]').click();
    await expect(badge(unique)).toHaveAttribute('aria-pressed', 'true');
    await cloud.getByRole('button', { name: t('Bỏ lọc thẻ'), exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(10);
  } finally {
    await app?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
