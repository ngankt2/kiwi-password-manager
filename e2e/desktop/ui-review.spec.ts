import { DesktopApplication } from './webkit-host';
import { test, expect, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { desktopPassword, launchDesktop, t } from './helpers';


test('WebKit UI screen review: core flows, dialogs and layouts fit standard and minimum windows', async () => {
  test.setTimeout(180_000);
  const profile = await mkdtemp(join(tmpdir(), 'kiro-ui-review-'));
  const source = join(profile, 'UI Review.vault');
  const report = 'tests/reports/desktop-ui';
  let app: DesktopApplication | undefined;
  let page: Page | undefined;
  const observations: { screen: string; width: number; height: number; overflow: string[]; alignment: string[] }[] = [];
  const errors: string[] = [];
  try {
    await promisify(execFile)('bun', [resolve('scripts/create-desktop-ui-fixture.ts'), source]); await mkdir(report, { recursive: true });
    // DOM interactions and screenshots do not require macOS foreground focus.
    const opened = await launchDesktop(profile, { focus: false }); app = opened.app; page = opened.page;
    page.on('pageerror', (error) => errors.push(error.message));
    const capture = async (name: string) => {
      await page!.evaluate(() => document.fonts.ready);
      const geometry = await page!.evaluate(() => {
        const overflow: string[] = [];
        for (const element of document.querySelectorAll<HTMLElement>('.desktop-window, input, select, textarea, .desktop-custom-row, [role=menu], dialog[open]')) {
          if (!element.checkVisibility()) continue;
          const box = element.getBoundingClientRect();
          if (box.width && (box.left < -1 || box.right > innerWidth + 1)) overflow.push(element.getAttribute('aria-label') ?? element.className ?? element.tagName);
          if (element.matches('.desktop-window') && (box.top < -1 || box.bottom > innerHeight + 1)) overflow.push('window height');
        }
        for (const element of document.querySelectorAll<HTMLElement>('.desktop-detail-scroll, .desktop-detail-content, .desktop-credential, .desktop-tags')) {
          if (element.checkVisibility() && element.scrollWidth > element.clientWidth + 1) overflow.push(element.className);
        }
        const alignment: string[] = [];
        for (const button of document.querySelectorAll<HTMLElement>('.desktop-detail-toolbar > button')) {
          if (!button.checkVisibility()) continue;
          const toolbar = button.parentElement!.getBoundingClientRect();
          const box = button.getBoundingClientRect();
          if (Math.abs(box.top + box.height / 2 - toolbar.top - toolbar.height / 2) > 1) alignment.push(button.getAttribute('aria-label') ?? button.textContent ?? 'toolbar button');
        }
        return { width: innerWidth, height: innerHeight, overflow, alignment };
      });
      observations.push({ screen: name, ...geometry });
      await page!.screenshot({ path: join(report, name + '.png') });
    };
    const resize = async (width: number, height: number) => {
      await app!.resize(width, height);
      await page!.waitForFunction((width) => innerWidth === width, width);
    };
    const settings = () => page!.locator('.desktop-app-footer').getByRole('button', { name: t('Cài đặt'), exact: true }).click();
    const list = () => page!.locator('aside').getByRole('button', { name: t('Tất cả mục'), exact: true }).click();
    const detail = async () => { await list(); await page!.getByRole('option', { name: 'Email công việc, ' + t('Đăng nhập'), exact: true }).click(); };

    await capture('01-welcome');
    await page.getByRole('button', { name: t('Tạo Vault mới'), exact: true }).click(); await capture('02-create');
    await page.getByRole('button', { name: t('Quay lại'), exact: true }).click();
    await app!.pickFile(source);
    await page.getByRole('button', { name: t('Mở Vault có sẵn…'), exact: true }).click(); await capture('03-unlock');
    await page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await page.getByRole('button', { name: t('Mới'), exact: true }).waitFor();
    await capture('04-vault'); await detail(); await capture('05-detail');
    await page.locator('.desktop-history-link').click(); await capture('06-history');
    await page.locator('.desktop-history-row').last().click(); await capture('07-history-changes');
    await detail(); await page.getByRole('button', { name: t('Sửa'), exact: true }).click(); await capture('08-editor');
    await page.getByRole('button', { name: t('Huỷ'), exact: true }).first().click();
    await page.locator('.desktop-app-footer').getByRole('button', { name: t('Tạo mật khẩu'), exact: true }).click(); await capture('09-generator');
    await page.getByRole('dialog').getByRole('button', { name: t('Đóng'), exact: true }).click();
    await page.getByRole('button', { name: /Tìm trong/ }).click(); await capture('10-search');
    await page.getByRole('button', { name: t('Đóng tìm kiếm'), exact: true }).click();
    await page.locator('aside').getByRole('button', { name: t('Thư mục mới'), exact: true }).click(); await capture('11-folder-dialog');
    await page.getByRole('dialog').getByRole('button', { name: t('Huỷ'), exact: true }).click();
    await settings(); await capture('12-settings');
    for (const [button, name] of [['Bản sao lưu', '13-backup'], ['Xuất dữ liệu', '14-export'], ['Quản lý Vault', '15-manage']] as const) {
      await settings(); await page.getByRole('button', { name: t(button), exact: true }).click(); await capture(name);
      if (button === 'Bản sao lưu') {
        await page.getByRole('button', { name: t('Tạo bản sao lưu'), exact: true }).click();
        await expect(page.getByText(t('Đã tạo bản sao lưu mã hóa.'), { exact: true })).toBeVisible();
      }
    }
    for (const layout of ['A', 'B', 'C']) {
      await settings(); await page.getByLabel(t('Bố cục'), { exact: true }).selectOption(layout);
      await expect(page.getByLabel(t('Bố cục'), { exact: true })).toHaveValue(layout);
      await detail(); await capture('16-layout-' + layout);
      if (layout === 'C') {
        await page.getByRole('button', { name: /Tìm trong/ }).click();
        await expect(page.locator('.desktop-palette-result>.desktop-row-text').first()).toBeVisible();
        await capture('16-layout-C-search');
        await page.getByRole('button', { name: t('Đóng tìm kiếm'), exact: true }).click();
      }
      await resize(760, 580); await capture('17-minimum-' + layout);
      await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
      await page.getByLabel(t('Tên trường tuỳ chỉnh'), { exact: true }).scrollIntoViewIfNeeded(); await capture('18-minimum-editor-' + layout);
      await page.getByRole('button', { name: t('Huỷ'), exact: true }).first().click();
      await settings(); await page.locator('.desktop-detail-scroll').evaluate((element) => { element.scrollTop = 0; }); await capture('19-minimum-settings-' + layout);
      await resize(1320, 860);
    }
    await settings(); await page.getByLabel(t('Bố cục'), { exact: true }).selectOption('A');
    await expect(page.getByLabel(t('Bố cục'), { exact: true })).toHaveValue('A');
    await detail(); await page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    await page.getByLabel(t('Tên mục'), { exact: true }).fill('MụcKiểmTraVớiTênRấtDài'.repeat(8));
    await page.getByLabel(t('Tên trường tuỳ chỉnh'), { exact: true }).fill('NhãnTrườngRấtDài'.repeat(12));
    await page.getByLabel(t('Thẻ'), { exact: true }).fill('ThẻRấtDàiĐểKiểmTraXuốngDòng'.repeat(8));
    await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
    await page.getByRole('button', { name: t('Sửa'), exact: true }).waitFor();
    await page.locator('.desktop-tags').scrollIntoViewIfNeeded(); await capture('24-long-detail');
    await resize(760, 580); await capture('25-minimum-long-detail');
    await page.locator('.desktop-history-link').click(); await capture('26-minimum-long-history');
    await resize(1320, 860); await settings();
    await page.getByRole('button', { name: t('Nhập JSON'), exact: true }).click(); await capture('20-json-import');
    await page.getByRole('button', { name: t('Quay lại'), exact: true }).click();
    await settings(); await page.getByRole('button', { name: t('Nhập từ KeePass'), exact: true }).click(); await capture('21-keepass-import');
    await page.getByRole('button', { name: t('Quay lại'), exact: true }).click();
    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await expect(page.getByRole('heading', { name: 'Desktop UI Review', exact: true })).toBeVisible();
    await expect(page.getByLabel(t('Master Password'), { exact: true })).toBeFocused();
    await page.getByLabel(t('Master Password'), { exact: true }).fill('Intentionally-wrong-fixture-password');
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await page.getByRole('button', { name: t('Mở bản phục hồi'), exact: true }).click();
    await expect(page.getByRole('button', { name: t('Mở bản phục hồi'), exact: true }).first()).toBeVisible();
    await capture('22-recovery'); await resize(760, 580); await capture('23-minimum-recovery');
    expect(errors).toEqual([]);
    expect(observations.filter((entry) => entry.overflow.length)).toEqual([]);
    expect(observations.filter((entry) => entry.alignment.length)).toEqual([]);
  } finally {
    await mkdir(report, { recursive: true });
    await writeFile(join(report, 'review.json'), JSON.stringify({ observations, errors }, null, 2));
    await app?.close(); await rm(profile, { recursive: true, force: true });
  }
});
