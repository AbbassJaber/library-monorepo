import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import { apiCall, loginAs, runId } from './helpers';

test('a genre can be created, renamed, archived and restored; one in use cannot be archived', async ({
  page,
}) => {
  await loginAs(page, 'librarian');
  await page.goto('/librarian/genres');
  const name = `E2E Genre ${runId()}`;

  await page.getByLabel('New genre').fill(name);
  await page.getByRole('button', { name: 'Add genre' }).click();
  const row = page.getByRole('row', { name });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: `Rename ${name}` }).click();
  await page.getByLabel(`New name for ${name}`).fill(`${name} renamed`);
  await page.getByRole('button', { name: 'Save' }).click();
  const renamed = page.getByRole('row', { name: `${name} renamed` });
  await expect(renamed).toBeVisible();

  await renamed.getByRole('button', { name: `Archive ${name} renamed` }).click();
  await expect(renamed.getByText('Archived')).toBeVisible();
  await renamed.getByRole('button', { name: `Restore ${name} renamed` }).click();
  await expect(renamed.getByText('Active')).toBeVisible();

  await page.getByRole('button', { name: 'Archive Fantasy' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Fantasy cannot be archived yet' })
  ).toBeVisible();
  await expect(dialog.getByRole('listitem').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Ok' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: 'Fantasy' }).getByText('Active')).toBeVisible();

  const genres = await apiCall<Array<{ id: number; name: string }>>(
    page,
    'get',
    `${apiPaths.genres.list}?includeArchived=true`
  );
  const mine = genres.data.find(genre => genre.name === `${name} renamed`);
  if (mine) await apiCall(page, 'post', apiPaths.genres.archive(mine.id));
});
