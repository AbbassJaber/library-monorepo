import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import { apiCall, runId } from './helpers';

test('the assistant cites catalog books and changes the shelf only after Confirm', async ({
  page,
}) => {
  await page.goto('/');
  const registered = await apiCall(page, 'post', apiPaths.auth.register, {
    email: `e2e-chat-${runId()}@library.local`,
    password: 'Password123!',
    displayName: 'E2E Chat Reader',
  });
  expect(registered.status).toBe(201);
  const shelf = async () =>
    (await apiCall<Array<{ book: { title: string } }>>(page, 'get', apiPaths.readingList.list))
      .data;

  await page.goto('/catalog');
  await page.getByRole('banner').getByRole('button', { name: 'Chat with the librarian' }).click();
  const drawer = page.getByRole('dialog', { name: 'Librarian', exact: true });
  const input = drawer.getByLabel('Your message');

  await input.fill('books by tolkien');
  await input.press('Enter');
  const log = drawer.getByRole('log');
  await expect(log.getByRole('link', { name: /^The Hobbit/ })).toBeVisible();

  await input.fill('add dune to my reading list');
  await input.press('Enter');
  const card = drawer.getByRole('region', { name: 'Reading list slip' });
  await expect(card.getByText(/^Dune →/)).toHaveText(/Want to read/);
  expect(await shelf()).toEqual([]);

  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(card.getByText('Confirmed by you')).toBeVisible();
  await expect(card.getByText('Added')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Confirm' })).toHaveCount(0);
  expect((await shelf()).map(entry => entry.book.title)).toEqual(['Dune']);

  expect((await apiCall(page, 'delete', apiPaths.me)).status).toBe(200);
});
