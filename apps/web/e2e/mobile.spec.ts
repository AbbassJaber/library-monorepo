import AxeBuilder from '@axe-core/playwright';
import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { THEMES, UI_STORAGE_KEY } from '../src/lib/preferences';
import { apiCall, firstBookId, loginAs, runId } from './helpers';

const analyse = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze()
  ).violations.map(v => `${v.id}: ${v.help} — ${v.nodes[0]?.target.join(' ')}`);

const fitsTheWidth = async (page: Page) =>
  expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(0);

const withTheme = (page: Page, theme: string, extra: Record<string, unknown> = {}) =>
  page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    UI_STORAGE_KEY,
    JSON.stringify({ state: { theme, locale: 'en', ...extra }, version: 0 }),
  ] as const);

for (const theme of [THEMES.dark, THEMES.light]) {
  test(`pages fit a phone and pass axe (${theme} theme)`, async ({ page }) => {
    test.setTimeout(60_000);
    await withTheme(page, theme);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await fitsTheWidth(page);
    expect(await analyse(page)).toEqual([]);

    await loginAs(page, 'reader');
    for (const [path, ready] of [
      ['/', page.getByRole('list', { name: 'For your shelves' })],
      ['/catalog', page.getByRole('feed', { name: 'Books' })],
      [`/books/${await firstBookId(page)}`, page.getByRole('heading', { name: 'Library card' })],
      ['/shelf', page.getByRole('heading', { level: 1, name: 'Reading list' })],
      ['/favorites', page.getByRole('heading', { level: 1, name: 'Favorite genres' })],
    ] as const) {
      await page.goto(path);
      await expect(ready).toBeVisible();
      await fitsTheWidth(page);
      expect(await analyse(page), path).toEqual([]);
    }
  });
}

test('the menu sheet holds the navigation', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await page.getByRole('button', { name: 'Open the menu' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Menu' });
  await sheet.getByRole('link', { name: 'Catalog' }).tap();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(sheet).toBeHidden();
});

test('the catalog is covers only, and a book is one page with its library card', async ({
  page,
}) => {
  await withTheme(page, THEMES.dark, { catalogLayout: 'table' });
  await loginAs(page, 'reader');
  await page.goto('/catalog');
  const feed = page.getByRole('feed', { name: 'Books' });
  await expect(feed).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Layout' })).toHaveCount(0);

  await feed.getByRole('link').first().tap();
  await expect(page).toHaveURL(/\/books\/\d+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Library card' })).toHaveCount(1);
  const card = page.getByRole('region', { name: 'Library card' });
  const pageBox = await page.locator('.book-page').boundingBox();
  const cardBox = await card.boundingBox();
  expect(cardBox!.x).toBeGreaterThanOrEqual(pageBox!.x);
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(pageBox!.x + pageBox!.width + 1);
  await fitsTheWidth(page);
});

test('My shelf: a book changes state by tap', async ({ page }) => {
  await page.goto('/');
  const registered = await apiCall(page, 'post', apiPaths.auth.register, {
    email: `e2e-mobile-${runId()}@library.local`,
    password: 'Password123!',
    displayName: 'E2E Mobile Reader',
  });
  expect(registered.status).toBe(201);
  await apiCall(page, 'post', apiPaths.readingList.list, {
    bookId: await firstBookId(page),
    state: 'READING',
  });
  await page.goto('/shelf');
  await expect(page.getByRole('heading', { name: 'Reading', exact: true })).toBeVisible();
  await page.getByLabel('Reading state').first().selectOption('FINISHED');
  await expect(page.getByRole('heading', { name: 'Finished', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reading', exact: true })).toHaveCount(0);
  expect((await apiCall(page, 'delete', apiPaths.me)).status).toBe(200);
});

test('the chat drawer takes the whole screen and answers', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog');
  await page.getByRole('banner').getByRole('button', { name: 'Chat with the librarian' }).tap();
  const drawer = page.getByRole('dialog', { name: 'Librarian', exact: true });
  await expect(drawer).toBeVisible();
  const box = await drawer.boundingBox();
  expect(Math.round(box!.width)).toBe(390);
  const input = drawer.getByLabel('Your message');
  await input.fill('books by tolkien');
  await drawer.getByRole('button', { name: 'Send' }).tap();
  await expect(drawer.getByRole('list', { name: 'Books mentioned' })).toBeVisible();
  expect(await analyse(page)).toEqual([]);
});

test('librarian pages work on a phone, Activity included', async ({ page }) => {
  await loginAs(page, 'librarian');
  for (const [path, ready] of [
    ['/librarian/books', page.getByRole('heading', { level: 1 })],
    ['/librarian/genres', page.getByRole('table')],
    ['/librarian/activity?type=all', page.getByRole('list', { name: 'Activity' })],
  ] as const) {
    await page.goto(path);
    await expect(ready).toBeVisible();
    expect(await analyse(page), path).toEqual([]);
  }
  await fitsTheWidth(page);
});
