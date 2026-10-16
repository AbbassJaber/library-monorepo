import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import { apiCall, loginAs, runId } from './helpers';

test('a stale edit shows the version-conflict dialog and can retry on top of the latest version', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await loginAs(pageA, 'librarian');
  await loginAs(pageB, 'librarian');

  const genres = await apiCall<Array<{ id: number }>>(pageA, 'get', apiPaths.genres.list);
  const title = `E2E Versioned ${runId()}`;
  const created = await apiCall<{ id: number; version: number }>(
    pageA,
    'post',
    apiPaths.books.list,
    {
      title,
      author: 'E2E',
      publishedYear: 2001,
      synopsis: 'Created by the e2e suite.',
      rating: 3,
      genreIds: [genres.data[0]!.id, genres.data[1]!.id],
    }
  );
  expect(created.status).toBe(201);
  const editUrl = `/librarian/books/${created.data.id}/edit`;

  try {
    await pageA.goto(editUrl);
    await pageB.goto(editUrl);
    await expect(pageA.getByText('Editing version 1')).toBeVisible();
    await expect(pageB.getByText('Editing version 1')).toBeVisible();

    await pageA.getByRole('textbox', { name: 'Title' }).fill(`${title} (A)`);
    await pageA.getByRole('button', { name: 'Save changes' }).click();
    await expect(pageA).toHaveURL(new RegExp(`/books/${created.data.id}$`));

    await pageB.getByRole('textbox', { name: 'Title' }).fill(`${title} (B)`);
    await pageB.getByRole('button', { name: 'Save changes' }).click();
    const dialog = pageB.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: /changed since you opened it/ })
    ).toBeVisible();
    await expect(dialog.getByText(`${title} (A)`)).toBeVisible();

    await dialog.getByRole('button', { name: 'Keep my changes and retry' }).click();
    await pageB.getByRole('button', { name: 'Save changes' }).click();
    await expect(pageB).toHaveURL(new RegExp(`/books/${created.data.id}$`));
    await expect(pageB.getByRole('heading', { level: 1 })).toHaveText(`${title} (B)`);
    await expect(pageB.getByText('version 3')).toBeVisible();
  } finally {
    const current = await apiCall<{ version: number }>(
      pageA,
      'get',
      apiPaths.books.detail(created.data.id)
    );
    await apiCall(pageA, 'post', apiPaths.books.archive(created.data.id), {
      version: current.data.version,
    });
    await contextA.close();
    await contextB.close();
  }
});
