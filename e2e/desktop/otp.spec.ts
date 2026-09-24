import { DesktopApplication } from './webkit-host';
import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { desktopPassword, launchDesktop, t, unlockDesktopVault } from './helpers';

const base32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const name = 'TOTP regression fixture';
async function authenticate(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
  await dialog.getByRole('button', { name: t('Xác nhận'), exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('TOTP displays, rolls over, copies after authentication and survives an encrypted reopen', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-totp-'));
  let app: DesktopApplication | undefined;
  const errors: string[] = [];
  try {
    const source = join(profile, 'TOTP.vault');
    await promisify(execFile)('bun', [resolve('scripts/create-totp-fixture.ts'), source]);
    let opened = await launchDesktop(profile, { focus: false }); app = opened.app; let page = opened.page;
    page.on('pageerror', (error) => errors.push(error.message));
    await app!.pickFile(source);
    const copies = () => app!.clipboardCopies();
    await page.getByRole('button', { name: t('Mở Vault có sẵn…'), exact: true }).click();
    await page.getByLabel(t('Master Password'), { exact: true }).fill(desktopPassword);
    await page.getByRole('button', { name: t('Mở khoá Vault'), exact: true }).click();
    await page.getByRole('button', { name: t('Mới'), exact: true }).waitFor();
    await page.clock.setFixedTime(new Date(59000));

    const select = (title: string) => page.getByRole('option', { name: title + ', ' + t('Đăng nhập'), exact: true }).click();
    const credential = (label: string) => page.locator('.desktop-credential').filter({ has: page.locator('.desktop-credential-label').getByText(label, { exact: true }) });
    const edit = () => page.getByRole('button', { name: t('Sửa'), exact: true }).click();
    const save = async () => { await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click(); await page.getByRole('button', { name: t('Sửa'), exact: true }).waitFor(); };
    const capture = async (state: string) => {
      await app!.resize(760, 580);
      await page.waitForFunction(() => innerWidth === 760);
      expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.desktop-window, .desktop-detail-content, .desktop-credential, .desktop-custom-row')]
        .filter((element) => element.checkVisibility() && element.scrollWidth > element.clientWidth + 1).map((element) => element.className))).toEqual([]);
      await page.screenshot({ path: `tests/reports/desktop-totp-${state}.png` });
      await app!.resize(1320, 860);
      await page.waitForFunction(() => innerWidth === 1320);
    };

    await select('Legacy KeePass TOTP');
    const native = credential('TimeOtp-Secret-Base32');
    await expect(native.locator('.desktop-credential-value')).toHaveText('••••••••••••');
    await native.getByRole('button', { name: t('Hiện'), exact: true }).click();
    await expect(native.locator('.desktop-credential-value')).toHaveText('94287082');
    await capture('keepass');
    await edit();
    await expect(page.getByLabel(t('Giá trị {name}', { name: 'TimeOtp-Secret-Base32' }), { exact: true })).toHaveAttribute('type', 'password');
    await page.getByLabel(t('Giá trị {name}', { name: 'TimeOtp-Period' }), { exact: true }).fill('60');
    await save(); await page.clock.setFixedTime(new Date(119000));
    await native.getByRole('button', { name: t('Hiện'), exact: true }).click();
    await expect(native.locator('.desktop-credential-value')).toHaveText('94287082');

    await select('Unsupported TOTP');
    let otp = credential(t('Mã xác thực OTP'));
    await expect(otp.getByText(t('Chưa tạo được mã TOTP'), { exact: true })).toBeVisible();
    await expect(otp.getByRole('button', { name: t('Sao chép'), exact: true })).toBeDisabled();
    await capture('unsupported');
    await edit(); await page.getByLabel(t('Tên mục'), { exact: true }).fill('Preserved unsupported TOTP'); await save();
    await expect(otp.getByText(t('Chưa tạo được mã TOTP'), { exact: true })).toBeVisible();
    await edit();
    await page.getByLabel(t('Mã xác thực OTP'), { exact: true }).fill(` \notpauth://totp/Fixture?secret=${base32} `);
    await save();
    await expect(otp.getByRole('button', { name: t('Sao chép'), exact: true })).toBeEnabled();

    await page.getByRole('button', { name: t('Mới'), exact: true }).click();
    await page.getByRole('menuitem', { name: t('Đăng nhập'), exact: true }).click();
    await page.getByLabel(t('Tên mục'), { exact: true }).fill('Base32 TOTP');
    const input = page.getByLabel(t('Mã xác thực OTP'), { exact: true });
    await input.fill('invalid-fixture!');
    await page.getByRole('button', { name: t('Lưu'), exact: true }).first().click();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-describedby', /-feedback$/);
    await expect(page.getByText(t('Đã lưu mục.'), { exact: true })).toHaveCount(0);
    await expect(page.getByText(t('Thiết lập TOTP không hợp lệ hoặc chưa được hỗ trợ.'), { exact: true })).toBeInViewport();
    await capture('validation');
    await input.fill('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'); await save();
    await page.clock.setFixedTime(new Date(59000));
    await otp.getByRole('button', { name: t('Hiện'), exact: true }).click();
    await expect(otp.locator('.desktop-credential-value')).toHaveText('287082');
    await page.clock.setFixedTime(new Date(60000));
    await expect(otp.locator('.desktop-credential-value')).toHaveText('359152');
    await expect(otp.getByText(t('Làm mới sau {count} giây', { count: 30 }), { exact: true })).toBeVisible();
    await capture('active');
    await select('Preserved unsupported TOTP');
    await expect(otp.locator('.desktop-credential-value')).toHaveText('••••••••••••');

    await page.locator('.desktop-app-footer').getByRole('button', { name: t('Cài đặt'), exact: true }).click();
    await page.getByLabel(t('Xác thực trước khi hiện bí mật'), { exact: true }).check();
    await expect(page.getByLabel(t('Xác thực trước khi hiện bí mật'), { exact: true })).toBeChecked();
    await page.locator('aside').getByRole('button', { name: t('Tất cả mục'), exact: true }).click();
    await select('Base32 TOTP');
    await page.clock.setFixedTime(new Date(59000));
    await otp.getByRole('button', { name: t('Sao chép'), exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await copies()).toEqual([]);
    await page.getByRole('dialog').getByRole('button', { name: t('Huỷ'), exact: true }).click();
    expect(await copies()).toEqual([]);
    await otp.getByRole('button', { name: t('Sao chép'), exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.clock.setFixedTime(new Date(60000));
    await authenticate(page);
    await expect.poll(copies).toEqual(['359152']);

    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await app.close(); app = undefined;
    opened = await launchDesktop(profile, { focus: false }); app = opened.app; page = opened.page;
    otp = credential(t('Mã xác thực OTP'));
    page.on('pageerror', (error) => errors.push(error.message));
    await unlockDesktopVault(page, name); await page.clock.setFixedTime(new Date(59000));
    await select('Base32 TOTP');
    await expect(otp.locator('.desktop-credential-value')).toHaveText('••••••••••••');
    await otp.getByRole('button', { name: t('Hiện'), exact: true }).click(); await authenticate(page);
    await expect(otp.locator('.desktop-credential-value')).toHaveText('287082');
    expect(errors).toEqual([]);
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
