import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import { apiCall, loginAs } from './helpers';

test('adding, changing and removing a book on the shelf is optimistic and persists', async ({
  page,
}) => {
  await loginAs(page, 'reader');
  const newest = await apiCall<Array<{ id: number; title: string }>>(
    page,
    'get',
    apiPaths.books.newest
  );
  const shelf = await apiCall<Array<{ book: { id: number } }>>(
    page,
    'get',
    apiPaths.readingList.list
  );
  const onShelf = new Set(shelf.data.map(entry => entry.book.id));
  const book = newest.data.find(
    candidate => !onShelf.has(candidate.id) && !candidate.title.startsWith('E2E ')
  );
  if (!book) throw new Error('every newest book is already on the shelf');

  await page.goto(`/books/${book.id}`);
  await page.getByRole('button', { name: 'Add to reading list' }).click();
  await expect(page.getByLabel('Reading state')).toHaveValue('WANT_TO_READ');
  await expect(page.getByLabel('Reading state')).toBeEnabled();

  let release: (() => void) | undefined;
  const entryUrl = `**${apiPaths.readingList.entry(book.id)}`;
  await page.route(entryUrl, async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    await new Promise<void>(resolve => (release = resolve));
    return route.continue();
  });
  const patched = page.waitForResponse(
    response =>
      response.url().endsWith(apiPaths.readingList.entry(book.id)) &&
      response.request().method() === 'PATCH'
  );
  await page.getByLabel('Reading state').selectOption('READING');
  await expect(page.getByLabel('Reading state')).toHaveValue('READING');
  await expect.poll(() => release !== undefined).toBe(true);
  release?.();
  expect((await patched).status()).toBe(200);
  await page.unroute(entryUrl);

  await page.goto('/shelf');
  const entry = page.getByRole('article', { name: new RegExp(book.title) });
  await expect(entry).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^Reading/ })).toBeVisible();
  await entry.getByRole('button', { name: /^Remove / }).click();
  await expect(entry).toBeHidden();
  await page.reload();
  await expect(page.getByRole('article', { name: new RegExp(book.title) })).toHaveCount(0);
});
