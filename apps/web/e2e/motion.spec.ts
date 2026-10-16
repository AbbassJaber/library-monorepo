import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { apiCall, runId } from './helpers';

const isExpectedNoise = (text: string) =>
  /Failed to load resource: the server responded with a status of 401/.test(text);

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !isExpectedNoise(message.text())) errors.push(message.text());
  });
  return errors;
};

const pressCommandShortcut = async (page: Page) => {
  const apple = await page.evaluate(() =>
    /mac|iphone|ipad|ipod/i.test(
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform
    )
  );
  await page.keyboard.press(apple ? 'Meta+k' : 'Control+k');
};

const leftovers = (page: Page, selector: string) =>
  page.evaluate(
    css =>
      [...document.querySelectorAll<HTMLElement>(css)].filter(element =>
        /transform|opacity|visibility/.test(element.getAttribute('style') ?? '')
      ).length,
    selector
  );

test('every motion moment plays and settles with no console error', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);

  await page.goto('/');
  const headline = page.getByRole('heading', { level: 1 });
  await expect(headline).toBeVisible();
  await expect
    .poll(() => headline.evaluate(element => element.children.length), { timeout: 5000 })
    .toBe(0);

  const registered = await apiCall(page, 'post', apiPaths.auth.register, {
    email: `e2e-motion-${runId()}@library.local`,
    password: 'Password123!',
    displayName: 'E2E Motion Reader',
  });
  expect(registered.status).toBe(201);
  const newest = await apiCall<Array<{ id: number }>>(page, 'get', apiPaths.books.newest);
  const [first, second] = newest.data;
  await apiCall(page, 'post', apiPaths.readingList.list, { bookId: first!.id, state: 'READING' });
  await apiCall(page, 'post', apiPaths.readingList.list, {
    bookId: second!.id,
    state: 'WANT_TO_READ',
  });

  await page.goto('/catalog');
  const feed = page.getByRole('feed', { name: 'Books' });
  await expect(feed.getByRole('article').first()).toBeVisible();
  await page.getByLabel('Sort').selectOption('rating');
  await expect(page).toHaveURL(/sort=rating/);
  await expect.poll(() => leftovers(page, '[data-flip-id]'), { timeout: 5000 }).toBe(0);

  await feed.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/books\/\d+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused({ timeout: 5000 });
  await expect(page.locator('.book')).not.toHaveAttribute('data-animating');
  expect(await leftovers(page, '.book, .book-board, .book-page, [data-rise]')).toBe(0);
  await page.getByRole('button', { name: 'Close the book' }).click();
  await expect(page).toHaveURL(/\/catalog/);

  await pressCommandShortcut(page);
  const menu = page.getByRole('dialog', { name: 'Command menu' });
  await expect(menu.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await page.goto('/shelf');
  await expect(page.getByRole('heading', { name: 'Reading', exact: true })).toBeVisible();
  await page.getByLabel('Reading state').first().selectOption('FINISHED');
  await expect(page.getByRole('heading', { name: 'Finished', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.querySelectorAll('body > [data-flip-id]').length))
    .toBe(0);
  await expect.poll(() => leftovers(page, '[data-flip-id]'), { timeout: 5000 }).toBe(0);

  await page.getByRole('banner').getByRole('button', { name: 'Chat with the librarian' }).click();
  const drawer = page.getByRole('dialog', { name: 'Librarian', exact: true });
  await drawer.getByLabel('Your message').fill('add dune to my reading list');
  await drawer.getByLabel('Your message').press('Enter');
  const slip = drawer.getByRole('region', { name: 'Reading list slip' });
  await slip.getByRole('button', { name: 'Confirm' }).click();
  await expect(slip.getByText('Added')).toBeVisible();
  await expect.poll(() => leftovers(page, '.stamp'), { timeout: 5000 }).toBe(0);

  expect((await apiCall(page, 'delete', apiPaths.me)).status).toBe(200);
  expect(errors).toEqual([]);
});
