import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { THEMES, UI_STORAGE_KEY } from '../src/lib/preferences';
import { loginAs } from './helpers';

const analyse = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze()
  ).violations.map(v => `${v.id}: ${v.help} — ${v.nodes[0]?.target.join(' ')}`);

const withTheme = (page: Page, theme: string) =>
  page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [UI_STORAGE_KEY, JSON.stringify({ state: { theme, locale: 'en' }, version: 0 })] as const
  );

const pressCommandShortcut = async (page: Page) => {
  const apple = await page.evaluate(() =>
    /mac|iphone|ipad|ipod/i.test(
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform
    )
  );
  await page.keyboard.press(apple ? 'Meta+k' : 'Control+k');
};

const DESCRIPTION = 'a fireman whose job is burning books begins hiding them instead';

test('⌘K finds a book and opens it; the menu passes axe', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { level: 1, name: 'Catalog' })).toBeVisible();
  await pressCommandShortcut(page);
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await expect(menu.getByRole('combobox')).toBeFocused();
  await page.keyboard.type('dune');
  await expect(menu.getByRole('group', { name: 'Books' })).toBeVisible();
  expect(await analyse(page)).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('group', { name: 'This book' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/books\/\d+$/);
  await expect(page.getByRole('heading', { level: 1, name: /Dune/ })).toBeVisible();
  await expect(menu).toHaveCount(0);
});

for (const theme of [THEMES.dark, THEMES.light]) {
  test(`table + "Why it matched" during a search by meaning (${theme} theme)`, async ({ page }) => {
    await withTheme(page, theme);
    await loginAs(page, 'reader');
    await page.goto('/catalog');
    await page
      .getByRole('group', { name: 'Layout' })
      .getByRole('button', { name: 'Table' })
      .click();
    await expect(page.getByRole('table', { name: 'Books' })).toBeVisible();
    expect(await analyse(page)).toEqual([]);

    await page.goto(`/catalog?q=${encodeURIComponent(DESCRIPTION)}&mode=semantic`);
    await page.getByRole('button', { name: 'Why “Fahrenheit 451” matched' }).click();
    const panel = page.getByRole('complementary', { name: 'Why it matched' });
    await expect(panel.getByText('Close in meaning to your search')).toBeVisible();
    await expect(panel.getByText('Fused rank', { exact: true })).toBeVisible();
    expect(await analyse(page)).toEqual([]);
  });
}
