import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('a request in plain words becomes editable filters that drive the catalog', async ({
  page,
}) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog?q=dune');
  await expect(page.getByRole('feed', { name: 'Books' })).toBeVisible();

  await page
    .getByLabel('Describe what you are looking for')
    .fill('fantasy from the 50s sorted by rating');
  await page.getByRole('button', { name: 'Interpret' }).click();
  const chips = page.getByRole('group', { name: 'What I understood' });
  await expect(chips.getByText('Fantasy')).toBeVisible();
  await expect(chips.getByText('from 1950')).toBeVisible();
  await expect(chips.getByText('to 1959')).toBeVisible();
  await expect(chips.getByText('sorted by Rating')).toBeVisible();
  await expect(page.getByText(/mock-small · \d+ ms/)).toBeVisible();

  await chips.getByRole('button', { name: 'Edit to 1959' }).click();
  await chips.getByLabel('To year').fill('1960');
  await chips.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page).toHaveURL(/genre=fantasy/);
  await expect(page).toHaveURL(/yearFrom=1950/);
  await expect(page).toHaveURL(/yearTo=1960/);
  await expect(page).toHaveURL(/sort=rating/);
  await expect(page).not.toHaveURL(/q=dune/);
  await expect(
    page.getByRole('feed', { name: 'Books' }).getByRole('heading', { level: 2 }).first()
  ).toHaveText('The Fellowship of the Ring');
});

test('Arabic and French requests map to the same genres', async ({ page }) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog');
  const input = page.getByLabel('Describe what you are looking for');
  await input.fill('روايات خيال علمي');
  await page.getByRole('button', { name: 'Interpret' }).click();
  await expect(
    page.getByRole('group', { name: 'What I understood' }).getByText('Science Fiction')
  ).toBeVisible();
  await input.fill('romans policiers des années 80');
  await page.getByRole('button', { name: 'Interpret' }).click();
  const chips = page.getByRole('group', { name: 'What I understood' });
  await expect(chips.getByText(/Mystery/)).toBeVisible();
  await expect(chips.getByText('from 1980')).toBeVisible();
});
