import { expect, test, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { BRAND_ICONS } from '../../src/shared/brand-icons';
import { desktopPassword, expectDesktopUnlock, launchDesktop, t } from './helpers';
import type { DesktopApplication } from './webkit-host';

const logo = BRAND_ICONS.find((brand) => brand.id === 'brand-google')!.dataUri;
const otherLogo = BRAND_ICONS.find((brand) => brand.id === 'brand-github')!.dataUri;
const imageReply = (dataUri = logo) => JSON.stringify({ dataUri, width: 64, height: 64 });
const savedImage = (page: Page) => page.locator('.desktop-detail-identity .desktop-cached-icon');
const draftImage = (page: Page) => page.locator('.desktop-item-icon-trigger .desktop-cached-icon');
const save = (page: Page) => page.locator('.desktop-detail-toolbar').getByRole('button', { name: t('Lưu'), exact: true });
const picker = (page: Page) => page.getByRole('dialog', { name: t('Đổi biểu tượng'), exact: true });

async function openFixture(profile: string) {
  const source = join(profile, 'Cached icons.vault');
  await promisify(execFile)('bun', [resolve('scripts/create-desktop-ui-fixture.ts'), source]);
  const opened = await launchDesktop(profile, { focus: false });
  await opened.app.pickFile(source);
  await opened.page.getByRole('button', { name: t('Mở Vault có sẵn…'), exact: true }).click();
  await opened.page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
  await opened.page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
  return opened;
}

test('URL icons and bundled brands survive save and reopening offline, and website edits keep the cached image', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-cached-icons-'));
  let app: DesktopApplication | undefined;
  try {
    let opened = await openFixture(profile); app = opened.app;
    let page = opened.page;
    const requests: { kind: string; url: string }[] = [];
    await page.route('**/api/icon', async (route) => {
      const request = route.request().postDataJSON(); requests.push(request);
      await route.fulfill({ contentType: 'application/json', body: imageReply() });
    });
    const rowName = 'Email công việc, ' + t('Đăng nhập');
    await page.getByRole('option', { name: rowName, exact: true }).click();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByRole('button', { name: t('Đổi biểu tượng'), exact: true }).click();
    await picker(page).getByRole('button', { name: t('Ảnh từ URL'), exact: true }).click();
    await picker(page).getByLabel(t('URL ảnh icon'), { exact: true }).fill('https://images.example.com/logo.png');
    await picker(page).getByRole('button', { name: t('Tải và dùng ảnh'), exact: true }).click();
    await expect(picker(page).getByText(t('Ảnh đã lưu'), { exact: true })).toBeVisible();
    await expect(draftImage(page)).toHaveAttribute('src', logo);
    await picker(page).getByRole('button', { name: t('Màu {color}', { color: '#2F7CF6' }), exact: true }).click();
    await picker(page).locator('.desktop-dialog-footer').getByRole('button', { name: t('Đóng'), exact: true }).click();
    await save(page).click();
    await expect(savedImage(page)).toHaveAttribute('src', logo);
    await expect(page.getByRole('option', { name: rowName, exact: true }).locator('.desktop-cached-icon')).toHaveAttribute('src', logo);
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByLabel(t('Trang web'), { exact: true }).fill('https://example.com/private?token=do-not-send');
    await page.waitForTimeout(1000); // Let the favicon debounce pass: a saved image must not be re-fetched.
    expect(requests).toEqual([{ kind: 'image', url: 'https://images.example.com/logo.png' }]);
    await save(page).click();
    const vaultName = 'Desktop UI Review';
    await app.close(); app = undefined;

    opened = await launchDesktop(profile, { focus: false }); app = opened.app; page = opened.page;
    let offlineRequests = 0;
    await page.route('**/api/icon', async (route) => { offlineRequests++; await route.abort(); });
    await expectDesktopUnlock(page, vaultName);
    await page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await page.getByRole('option', { name: rowName, exact: true }).click();
    await expect(savedImage(page)).toHaveAttribute('src', logo);
    await expect.poll(() => savedImage(page).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByRole('button', { name: t('Đổi biểu tượng'), exact: true }).click();
    await picker(page).getByRole('button', { name: t('Logo thương hiệu'), exact: true }).click();
    await mkdir('tests/reports/cached-icons', { recursive: true });
    await page.screenshot({ path: 'tests/reports/cached-icons/brand-picker.png' });
    await picker(page).getByLabel(t('Tìm logo'), { exact: true }).fill('GitHub');
    await picker(page).getByRole('button', { name: 'GitHub', exact: true }).click();
    await expect(draftImage(page)).toHaveAttribute('src', otherLogo);
    await save(page).click();
    await expect(savedImage(page)).toHaveAttribute('src', otherLogo);
    expect(offlineRequests).toBe(0);

    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByRole('button', { name: t('Đổi biểu tượng'), exact: true }).click();
    await picker(page).getByRole('button', { name: t('Dùng biểu tượng mặc định'), exact: true }).click();
    await page.getByLabel(t('Trang web'), { exact: true }).fill('https://other.example.com/account');
    await page.waitForTimeout(1000);
    await expect(draftImage(page)).toHaveCount(0);
    await expect(save(page)).toBeEnabled();
    await save(page).click();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.waitForTimeout(1000);
    expect(offlineRequests).toBe(0);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('automatic favicons use only the origin and late downloads never replace a manual icon or block a cleared website', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-auto-icons-'));
  let app: DesktopApplication | undefined;
  const releases: (() => void)[] = [];
  try {
    const opened = await openFixture(profile); app = opened.app;
    const page = opened.page;
    const requests: { kind: string; url: string }[] = [];
    await page.route('**/api/icon', async (route) => {
      requests.push(route.request().postDataJSON());
      await new Promise<void>((resolve) => releases.push(resolve));
      await route.fulfill({ contentType: 'application/json', body: imageReply() }).catch(() => undefined);
    });
    const create = async (name: string) => {
      await page.getByRole('button', { name: t('Mới'), exact: true }).click();
      await page.getByRole('menuitem', { name: t('Đăng nhập'), exact: true }).click();
      await page.getByLabel(t('Tên mục'), { exact: true }).fill(name);
    };
    await create('Automatic favicon');
    await page.getByLabel(t('Trang web'), { exact: true }).fill('https://user:private@example.com/path?token=private#secret');
    await expect(save(page)).toBeDisabled();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toEqual({ kind: 'website', url: 'https://example.com' });
    releases.shift()!();
    await expect(draftImage(page)).toHaveAttribute('src', logo);
    await save(page).click();
    await expect(savedImage(page)).toHaveAttribute('src', logo);

    await create('Manual choice wins');
    await page.getByLabel(t('Trang web'), { exact: true }).fill('https://other.example.com/private');
    await expect.poll(() => requests.length).toBe(2);
    await page.getByRole('button', { name: t('Đổi biểu tượng'), exact: true }).click();
    await picker(page).getByRole('button', { name: t('Bảo mật'), exact: true }).click();
    releases.shift()!();
    await expect(save(page)).toBeEnabled();
    await expect(draftImage(page)).toHaveCount(0);
    await expect(page.locator('.desktop-item-icon-trigger .desktop-item-tile')).toHaveText('shield');
    await save(page).click();
    await expect(page.locator('.desktop-detail-identity .desktop-item-tile')).toHaveText('shield');

    await create('Cleared website');
    await page.getByLabel(t('Trang web'), { exact: true }).fill('https://third.example.com/private');
    await expect.poll(() => requests.length).toBe(3);
    await page.getByLabel(t('Trang web'), { exact: true }).fill('');
    releases.shift()!();
    await expect(save(page)).toBeEnabled();
    await expect(draftImage(page)).toHaveCount(0);
    await save(page).click();
    await expect(page.locator('.desktop-detail-identity .desktop-item-tile')).toHaveText('key');
  } finally { for (const release of releases) release(); await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
