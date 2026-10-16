import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { THEMES, UI_STORAGE_KEY } from '../src/lib/preferences';
import { apiCall, runId } from './helpers';

const axe = async (page: Page) =>
  (
    await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
      .analyze()
  ).violations.map(v => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);

const register = async (page: Page) => {
  await page.goto('/');
  const registered = await apiCall(page, 'post', apiPaths.auth.register, {
    email: `e2e-voice-${runId()}@library.local`,
    password: 'Password123!',
    displayName: 'E2E Voice Reader',
  });
  expect(registered.status).toBe(201);
};

test('a call: full screen, the librarian greets, a cited answer, Confirm on the call screen, a call record', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await register(page);
  const shelf = async () =>
    (await apiCall<Array<{ book: { title: string } }>>(page, 'get', apiPaths.readingList.list))
      .data;

  await page.goto('/catalog');
  await page.getByRole('banner').getByRole('button', { name: 'Call the librarian' }).click();
  const call = page.getByRole('dialog', { name: 'On call with the librarian' });
  await expect(call).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Librarian', exact: true })).toHaveCount(0);
  await expect(call.getByRole('textbox')).toHaveCount(0);
  await expect(call.getByRole('log')).toHaveCount(0);
  await expect(
    call
      .getByText('Hi, I’m the librarian. What are you in the mood for?')
      .or(call.getByText("Hi, I'm the librarian. What are you in the mood for?"))
  ).toBeVisible({ timeout: 15_000 });
  await expect(call.getByText(/left$/)).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await expect(call.getByText('books by tolkien')).toBeVisible({ timeout: 15_000 });
  await expect(call.getByText(/^I found /)).toBeVisible({ timeout: 15_000 });
  await expect(
    call
      .getByRole('region', { name: 'Mentioned in this call' })
      .getByRole('link', { name: /The Hobbit|The Fellowship of the Ring/ })
      .first()
  ).toBeVisible();

  const card = call.getByRole('region', { name: 'Reading list slip' });
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect(await shelf()).toEqual([]);
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(call.getByText('Done: it is on your reading list.')).toBeVisible({
    timeout: 10_000,
  });
  expect(await shelf()).toHaveLength(1);

  await page.keyboard.press('Escape');
  const pill = page.getByRole('region', { name: 'Call with the librarian' });
  await expect(pill).toBeVisible();
  await expect(call).toBeHidden();
  expect(await axe(page)).toEqual([]);
  await pill.getByRole('button', { name: 'Back to the call' }).click();
  await call.getByRole('button', { name: 'End call' }).click();
  await expect(call).toBeHidden({ timeout: 10_000 });
  await expect(pill).toBeHidden();

  await page.getByRole('banner').getByRole('button', { name: 'Chat with the librarian' }).click();
  const log = page.getByRole('dialog', { name: 'Librarian', exact: true }).getByRole('log');
  await expect(log.getByText(/^Call · \d\d:\d\d$/)).toBeVisible();
  await log.getByRole('button', { name: 'Transcript' }).click();
  await expect(log.getByText('books by tolkien').first()).toBeVisible();
  expect((await apiCall(page, 'delete', apiPaths.me)).status).toBe(200);
});

test('with voice off on the server, there is no call button anywhere', async ({ page }) => {
  await register(page);
  await page.route('**/api/v1/ai/status', async route => {
    const response = await route.fetch();
    const body = (await response.json()) as { data: Record<string, unknown> };
    await route.fulfill({ response, json: { ...body, data: { ...body.data, voiceMode: 'off' } } });
  });
  await page.goto('/catalog');
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Chat with the librarian' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Call the librarian' })).toHaveCount(0);
  await page.getByRole('banner').getByRole('button', { name: 'Chat with the librarian' }).click();
  const drawer = page.getByRole('dialog', { name: 'Librarian', exact: true });
  await expect(drawer.getByLabel('Your message')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Call the librarian' })).toHaveCount(0);
  expect((await apiCall(page, 'delete', apiPaths.me)).status).toBe(200);
});

test('the call screen and the pill pass axe in the light theme too', async ({ page }) => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    UI_STORAGE_KEY,
    JSON.stringify({ state: { theme: THEMES.light, locale: 'en' }, version: 0 }),
  ] as const);
  await register(page);
  await page.goto('/catalog');
  await page.getByRole('banner').getByRole('button', { name: 'Call the librarian' }).click();
  const call = page.getByRole('dialog', { name: 'On call with the librarian' });
  await expect(call.getByText(/left$/)).toBeVisible({ timeout: 15_000 });
  await call.getByRole('button', { name: 'Mute' }).click();
  await expect(call.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'true');
  expect(await axe(page)).toEqual([]);
  await call.getByRole('button', { name: 'Minimize' }).click();
  await expect(page.getByRole('region', { name: 'Call with the librarian' })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page
    .getByRole('region', { name: 'Call with the librarian' })
    .getByRole('button', { name: 'End call' })
    .click();
  await expect(page.getByRole('region', { name: 'Call with the librarian' })).toBeHidden({
    timeout: 10_000,
  });
  expect((await apiCall(page, 'delete', apiPaths.me)).status).toBe(200);
});
