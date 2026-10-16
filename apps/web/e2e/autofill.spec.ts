import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('an ISBN fills the new-book form with reviewed values', async ({ page }) => {
  await loginAs(page, 'librarian');
  await page.goto('/librarian/books/new');
  await page.getByLabel('Look-up ISBN').fill('978-0-441-17271-9');
  await page.getByRole('button', { name: 'Look up' }).click();

  const panel = page.getByRole('region', { name: 'Fill from Open Library' });
  await expect(panel.getByText('Dune', { exact: true })).toBeVisible();
  await expect(panel.getByText('From Open Library').first()).toBeVisible();
  await expect(panel.getByText('Suggested by AI')).toBeVisible();

  await panel.getByRole('button', { name: 'Use these values' }).click();
  await expect(page.getByLabel(/^Title/)).toHaveValue('Dune');
  await expect(page.getByLabel(/^Author/)).toHaveValue('Frank Herbert');
  await expect(page.getByLabel(/^Published/)).toHaveValue('1965');
  await expect(page.getByRole('checkbox', { name: 'Science Fiction' })).toBeChecked();
});
