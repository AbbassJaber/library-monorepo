import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { THEMES, UI_STORAGE_KEY } from '../src/lib/preferences';
import { firstBookId, loginAs } from './helpers';

const analyse = async (page: Parameters<typeof loginAs>[0]) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze();
  return results.violations.map(
    v => `${v.id}: ${v.help} (${v.nodes.length} nodes) — ${v.nodes[0]?.target.join(' ')}`
  );
};

const withTheme = (page: Parameters<typeof loginAs>[0], theme: string) =>
  page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    UI_STORAGE_KEY,
    JSON.stringify({ state: { theme, locale: 'en' }, version: 0 }),
  ] as const);

test.describe('axe: zero violations', () => {
  for (const theme of [THEMES.dark, THEMES.light]) {
    test(`home, log in and register (anonymous, ${theme} theme)`, async ({ page }) => {
      await withTheme(page, theme);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('list', { name: 'New in the catalog' })).toBeVisible();
      expect(await analyse(page)).toEqual([]);

      await page.goto('/login');
      await expect(page.getByRole('heading', { level: 1, name: /Log in/ })).toBeVisible();
      expect(await analyse(page)).toEqual([]);

      await page.goto('/register');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await analyse(page)).toEqual([]);
    });
  }

  for (const theme of [THEMES.dark, THEMES.light]) {
    test(`home (reader, ${theme} theme)`, async ({ page }) => {
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
        UI_STORAGE_KEY,
        JSON.stringify({ state: { theme, locale: 'en' }, version: 0 }),
      ] as const);
      await loginAs(page, 'reader');
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByRole('list', { name: 'New in the catalog' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'For your shelves' })).toBeVisible();
      expect(await analyse(page)).toEqual([]);
    });
  }

  for (const theme of [THEMES.dark, THEMES.light]) {
    test(`catalog, detail, shelf, favourites (reader, ${theme} theme)`, async ({ page }) => {
      await withTheme(page, theme);
      await loginAs(page, 'reader');
      await page.goto('/catalog?q=tolkein');
      await expect(page.getByRole('feed', { name: 'Books' })).toBeVisible();
      await expect(page.getByRole('article').first()).toBeVisible();
      expect(await analyse(page)).toEqual([]);

      await page.goto(`/books/${await firstBookId(page)}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Library card' })).toBeVisible();
      expect(await analyse(page)).toEqual([]);

      await page.goto('/shelf');
      await expect(page.getByRole('heading', { name: 'Reading list' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'For your shelves' })).toBeVisible();
      expect(await analyse(page)).toEqual([]);

      await page.goto('/favorites');
      await expect(page.getByRole('heading', { name: 'Favorite genres' })).toBeVisible();
      await expect(page.getByRole('checkbox').first()).toBeVisible();
      expect(await analyse(page)).toEqual([]);
    });
  }

  for (const theme of [THEMES.dark, THEMES.light]) {
    test(`chat drawer with a pending action (${theme} theme)`, async ({ page }) => {
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
        UI_STORAGE_KEY,
        JSON.stringify({ state: { theme, locale: 'en' }, version: 0 }),
      ] as const);
      await loginAs(page, 'reader');
      await page.goto('/catalog');
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'Chat with the librarian' })
        .click();
      const drawer = page.getByRole('dialog', { name: 'Librarian', exact: true });
      await expect(drawer.getByLabel('Your message')).toBeVisible();
      expect(await analyse(page)).toEqual([]);
      await drawer.getByLabel('Your message').fill('add the hobbit to my reading list');
      await drawer.getByLabel('Your message').press('Enter');
      const card = drawer.getByRole('region', { name: 'Reading list slip' });
      await expect(card.getByRole('button', { name: 'Confirm' })).toBeVisible();
      expect(await analyse(page)).toEqual([]);
      await card.getByRole('button', { name: 'Cancel' }).click();
      await expect(card.getByText('Cancelled')).toBeVisible();
    });
  }

  for (const theme of [THEMES.dark, THEMES.light]) {
    test(`librarian form, genres and activity (${theme} theme)`, async ({ page }) => {
      await withTheme(page, theme);
      await loginAs(page, 'librarian');
      await page.goto('/librarian/books/new');
      await expect(page.getByRole('heading', { name: 'Add a book' })).toBeVisible();
      await expect(page.getByRole('checkbox').first()).toBeVisible();
      expect(await analyse(page)).toEqual([]);

      await page.goto('/librarian/genres');
      await expect(page.getByRole('table')).toBeVisible();
      expect(await analyse(page)).toEqual([]);

      await page.goto('/librarian/activity?type=all');
      await expect(page.getByRole('list', { name: 'Activity' })).toBeVisible();
      expect(await analyse(page)).toEqual([]);
    });
  }
});

test.describe('keyboard', () => {
  test('skip link is the first tab stop and moves focus to main', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('list', { name: 'New in the catalog' })).toBeVisible();
    await page.bringToFront();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('dialogs open with a focused close control, close on Escape and return focus', async ({
    page,
  }) => {
    await loginAs(page, 'librarian');
    await page.goto('/librarian/genres');
    const archive = page.getByRole('button', { name: 'Archive Fantasy' });
    await archive.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /cannot be archived yet/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(archive).toBeFocused();
  });

  test('every interactive control is at least 44px tall on the catalog page', async ({ page }) => {
    await loginAs(page, 'reader');
    await page.goto('/catalog');
    await expect(page.getByRole('feed', { name: 'Books' })).toBeVisible();
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, input, select, summary, a.target')]
        .filter(el => el.offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30),
          h: el.getBoundingClientRect().height,
        }))
        .filter(x => x.h < 44)
    );
    expect(small).toEqual([]);
  });

  test('the page is never hidden once it has painted (no late translation load)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const hidden: string[] = [];
      Object.assign(window, { __hidden: hidden });
      new MutationObserver(mutations => {
        for (const mutation of mutations) {
          const el = mutation.target as HTMLElement;
          if (el.style.display === 'none') hidden.push(`${el.tagName}.${el.className}`);
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    for (const path of ['/', '/login']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(
        await page.evaluate(() => (window as unknown as { __hidden: string[] }).__hidden),
        path
      ).toEqual([]);
    }
  });
});
