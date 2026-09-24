import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type DesktopApplication } from './webkit-host';
import { createDesktopVault, desktopPassword, expectDesktopUnlock, launchDesktop, t } from './helpers';
import { passwordCharacters } from '../../src/core/security/partial-password';

test('partial reveal reshuffles every activation, resets its timeout, and preserves the real unlock password', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-partial-password-'));
  let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await page.clock.install({ time: new Date() });
    await page.reload();
    await createDesktopVault(page, 'Partial password QA');
    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    await expectDesktopUnlock(page, 'Partial password QA');
    const password = page.getByLabel(t('Master Password'), { exact: true });
    const showPartial = () => page.getByRole('button', { name: t('Hiện một phần mật khẩu'), exact: true });
    const shuffle = () => page.getByRole('button', { name: t('Đổi vị trí che mật khẩu'), exact: true });
    const preview = page.getByRole('region', { name: t('Mật khẩu hiện một phần'), exact: true });
    const value = preview.locator('.desktop-password-preview-value');
    const readPreview = async (expectedPassword = desktopPassword) => {
      await expect(preview).toBeVisible();
      const shown = await value.innerText();
      expect([...shown].filter((character) => character === '•').length).toBe(3);
      expect(shown.length).toBe(expectedPassword.length);
      for (let index = 0; index < shown.length; index++) expect(shown[index] === '•' || shown[index] === expectedPassword[index]).toBe(true);
      await expect(password).toHaveValue(expectedPassword);
      await expect(password).toHaveAttribute('type', 'password');
      await expect(password).toBeFocused();
      return shown;
    };
    await expect(showPartial()).toBeDisabled();
    await page.keyboard.type(desktopPassword);
    await showPartial().click();
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveAttribute('spellcheck', 'false');
    await expect(password).toHaveValue(desktopPassword);
    const first = await readPreview();
    await expect(page.locator('body')).not.toContainText(desktopPassword);

    await shuffle().click();
    await expect(value).not.toHaveText(first);
    const second = await readPreview();
    await shuffle().press('Enter');
    await expect(value).not.toHaveText(second);
    const third = await readPreview();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await showPartial().press('Enter');
    await expect(value).not.toHaveText(third);
    await readPreview();
    await page.keyboard.type('X');
    await expect(preview).toHaveCount(0);
    await expect(password).toHaveValue(desktopPassword + 'X');
    await showPartial().click();
    await readPreview(desktopPassword + 'X');
    await page.keyboard.press('Backspace');
    await expect(preview).toHaveCount(0);
    await showPartial().click();
    const beforeReset = await readPreview();

    await page.clock.runFor(14_000);
    await expect(value).toHaveText(beforeReset);
    await shuffle().click();
    await expect(value).not.toHaveText(beforeReset);
    const afterReset = await readPreview();
    await page.clock.runFor(1_100);
    await expect(value).toHaveText(afterReset);
    await page.clock.runFor(12_900);
    await expect(value).toHaveText(afterReset);
    await page.clock.runFor(1_100);
    await expect(preview).toHaveCount(0);
    await showPartial().click();
    const beforeBlur = await readPreview();
    await app.blur();
    await expect(preview).toHaveCount(0);
    await app.focus();
    await expect(preview).toHaveCount(0);
    await showPartial().click();
    await expect(value).not.toHaveText(beforeBlur);
    await readPreview();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);

    await page.getByRole('button', { name: t('Hiện toàn bộ mật khẩu'), exact: true }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toBeFocused();
    await showPartial().click();
    await expect(password).toHaveAttribute('type', 'password');
    await readPreview();
    await page.getByRole('button', { name: t('Hiện toàn bộ mật khẩu'), exact: true }).click();
    await expect(preview).toHaveCount(0);
    await app.blur();
    await expect(password).toHaveAttribute('type', 'password');
    await app.focus();
    await showPartial().click();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: t('Mới'), exact: true })).toBeVisible();
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('partial reveal safely handles short and Unicode passwords and fits a narrow screen', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'kiro-partial-password-layout-'));
  let app: DesktopApplication | undefined;
  try {
    const opened = await launchDesktop(profile); app = opened.app; const page = opened.page;
    await createDesktopVault(page, 'Partial preview layout QA');
    await page.locator('aside').getByRole('button', { name: new RegExp('^' + t('Khoá Vault')) }).click();
    const password = page.getByLabel(t('Master Password'), { exact: true });
    const showPartial = () => page.getByRole('button', { name: t('Hiện một phần mật khẩu'), exact: true });
    const preview = page.getByRole('region', { name: t('Mật khẩu hiện một phần'), exact: true });
    const value = preview.locator('.desktop-password-preview-value');
    for (const short of ['a', 'ab', 'abc']) {
      await password.fill(short);
      await showPartial().click();
      await expect(value).toHaveText('•'.repeat(short.length));
    }
    await password.fill('abcd');
    await showPartial().click();
    let shortPreview = await value.innerText();
    for (let attempt = 0; attempt < 8; attempt++) {
      await page.getByRole('button', { name: t('Đổi vị trí che mật khẩu'), exact: true }).click();
      await expect(value).not.toHaveText(shortPreview);
      shortPreview = await value.innerText();
      expect([...shortPreview].filter((character) => character === '•').length).toBe(3);
      await expect(password).toHaveValue('abcd');
    }
    const unicode = 'a\u0301x👩‍💻yz🔐';
    await password.fill(unicode);
    await showPartial().click();
    const characters = passwordCharacters(unicode);
    const shown = passwordCharacters(await value.innerText());
    expect(shown.length).toBe(characters.length);
    expect(shown.filter((character) => character === '•').length).toBe(3);
    shown.forEach((character, index) => expect(character === '•' || character === characters[index]).toBe(true));
    await page.getByRole('button', { name: t('Đổi vị trí che mật khẩu'), exact: true }).click();
    await expect(value).not.toHaveText(shown.join(''));
    const shuffledUnicode = passwordCharacters(await value.innerText());
    expect(shuffledUnicode.length).toBe(characters.length);
    expect(shuffledUnicode.filter((character) => character === '•').length).toBe(3);
    shuffledUnicode.forEach((character, index) => expect(character === '•' || character === characters[index]).toBe(true));

    await app.resize(390, 844);
    const longPassword = 'Long-fixture-password-'.repeat(60);
    await password.fill(longPassword);
    await expect(password).toHaveValue(longPassword);
    await showPartial().click();
    expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.locator('.desktop-unlock').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(password).toHaveAttribute('type', 'password');
    await page.screenshot({ path: 'tests/reports/desktop-partial-password-narrow.png' });
    await password.fill(desktopPassword);
    await showPartial().click();
    await app.resize(1320, 860);
    await page.screenshot({ path: 'tests/reports/desktop-partial-password.png' });

    await page.getByRole('button', { name: t('Mở Vault khác'), exact: true }).click();
    await expect(preview).toHaveCount(0);
    await page.getByRole('button', { name: t('Mở {name}', { name: 'Partial preview layout QA' }), exact: true }).click();
    await expectDesktopUnlock(page, 'Partial preview layout QA');
    await expect(password).toHaveValue('');
    await expect(showPartial()).toBeDisabled();
  } finally { await app?.close(); await rm(profile, { recursive: true, force: true }); }
});
