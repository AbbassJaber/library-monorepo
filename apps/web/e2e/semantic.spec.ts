import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('"Search by meaning" finds a book by its description', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto(
    '/catalog?q=a%20fireman%20whose%20job%20is%20burning%20books%20begins%20hiding%20them%20instead'
  );
  const feed = page.getByRole('feed', { name: 'Books' });
  await expect(page.getByRole('heading', { name: /No books match/ })).toBeVisible();

  await page.getByRole('button', { name: 'Search by meaning' }).click();
  await expect(page).toHaveURL(/mode=semantic/);
  await expect(feed.getByRole('heading', { name: 'Fahrenheit 451', exact: true })).toBeVisible();
});

test('"Search by meaning" shows the normal empty state for gibberish', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog?q=xqzv%20plorbt%20wuggle%20frim&mode=semantic');
  await expect(page.getByRole('button', { name: 'Search by meaning' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByRole('heading', { name: 'No books match these filters' })).toBeVisible();
  await expect(page.getByRole('feed', { name: 'Books' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reset search' })).toBeVisible();
});

test('a book page lists books like it', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog?q=dune');
  await page
    .getByRole('feed', { name: 'Books' })
    .getByRole('link', { name: /Dune/ })
    .first()
    .click();
  const similar = page.getByRole('region', { name: 'Books like this' });
  await expect(similar).toBeVisible();
  await expect(similar.getByRole('link')).not.toHaveCount(0);
  await expect(similar.getByRole('link', { name: /^Dune,/ })).toHaveCount(0);
});
