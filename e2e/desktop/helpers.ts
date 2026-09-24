import { expect, type Page } from '@playwright/test';
import { createI18n } from '../../src/core/i18n';
import { DesktopApplication } from './webkit-host';

export const { t } = createI18n('vi');
export const desktopPassword = 'Desktop-usability-fixture-2026';

export async function launchDesktop(profile: string, { focus = true }: { focus?: boolean } = {}) {
  const app = await DesktopApplication.launch(profile);
  const page = app.page;
  await page.getByRole('button', { name: t('Tạo Vault mới'), exact: true })
    .or(page.getByLabel(t('Master Password'), { exact: true })).waitFor();
  if (focus) await app.focus();
  return { app, page };
}

export async function createDesktopVault(page: Page, name: string) {
  await page.getByRole('button', { name: t('Tạo Vault mới'), exact: true }).click();
  await page.getByLabel(t('Tên Vault'), { exact: true }).fill(name);
  await page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
  await page.getByLabel(t('Xác nhận Master Password'), { exact: true }).fill(desktopPassword);
  await page.getByRole('button', { name: t('Tạo Vault'), exact: true }).click();
  await page.getByRole('button', { name: t('Mới'), exact: true }).waitFor();
}

export async function unlockDesktopVault(page: Page, name: string) {
  const otherVault = page.getByRole('button', { name: t('Mở Vault khác'), exact: true });
  const openRecent = page.getByRole('button', { name: t('Mở {name}', { name }), exact: true });
  await otherVault.or(openRecent).waitFor();
  if (await otherVault.isVisible()) {
    if (!await page.getByRole('heading', { name, exact: true }).isVisible()) {
      await otherVault.click();
      await openRecent.click();
    }
  } else await openRecent.click();
  await page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
  await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
  await page.getByRole('button', { name: t('Mới'), exact: true }).waitFor();
}

export async function expectDesktopUnlock(page: Page, name: string) {
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByLabel(t('Master Password'), { exact: true })).toBeFocused();
}
