import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('every filter lives in the URL, survives a reload and the back button', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog');
  await expect(page.getByRole('feed', { name: 'Books' })).toBeVisible();

  await page.getByLabel('Search by title or author').fill('tolkein');
  await expect(page).toHaveURL(/q=tolkein/);
  await expect(page.getByRole('heading', { name: 'The Hobbit' })).toBeVisible();

  await page.getByLabel('Sort').selectOption('title');
  await expect(page).toHaveURL(/sort=title/);
  await page.getByLabel('From year').fill('1950');
  await expect(page).toHaveURL(/yearFrom=1950/);

  await expect(page.getByText('from 1950')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Search by title or author')).toHaveValue('tolkein');
  await expect(page.getByLabel('Sort')).toHaveValue('title');
  await page.getByRole('button', { name: 'Remove from 1950' }).click();
  await expect(page).not.toHaveURL(/yearFrom/);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.goBack();
  await expect(page).toHaveURL(/q=tolkein/);
});

test('pagination is link-based: page 2 has its own URL and keeps the previous page on screen', async ({
  page,
}) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog?pageSize=12');
  const feed = page.getByRole('feed', { name: 'Books' });
  await expect(feed).toBeVisible();
  const firstOnPageOne = await feed.getByRole('article').first().getAttribute('aria-label');

  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText(/Page 2 of/)).toBeVisible();
  await expect(feed.getByRole('article').first()).not.toHaveAttribute(
    'aria-label',
    firstOnPageOne ?? ''
  );
  await page.goBack();
  await expect(page).not.toHaveURL(/page=2/);
});
