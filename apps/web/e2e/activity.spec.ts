import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import { apiCall, loginAs, runId } from './helpers';

test('a librarian sees their own change on the Activity page, filtered by kind', async ({
  page,
}) => {
  await loginAs(page, 'librarian');
  const name = `E2E Genre ${runId()}`;
  expect((await apiCall(page, 'post', apiPaths.genres.list, { name })).status).toBe(201);

  await page.goto('/librarian/activity');
  await page.getByLabel('Show').selectOption('genre');
  await expect(page).toHaveURL(/type=genre/);
  const first = page.getByRole('list', { name: 'Activity' }).getByRole('listitem').first();
  await expect(first).toContainText(`Demo Librarian Librarian added the genre ${name}`);
  await expect(first).toContainText('Web app');
});
