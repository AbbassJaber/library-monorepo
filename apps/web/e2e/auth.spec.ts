import { apiPaths } from '@library/contracts';
import { expect, test } from '@playwright/test';
import { DEMO } from './config';
import { apiCall, runId } from './helpers';

test('register, log out, log in (wrong then right password), session survives a reload', async ({
  page,
}) => {
  const email = `e2e-${runId()}@library.local`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Reader');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO.reader.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  const account = page.getByRole('banner').getByRole('button', { name: 'Account: E2E Reader' });
  await expect(account).toBeVisible();

  await account.click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Log in' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toContainText(/Invalid email or password/);

  await page.getByLabel('Password').fill(DEMO.reader.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.reload();
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Account: E2E Reader' })
  ).toBeVisible();

  expect((await apiCall(page, 'delete', apiPaths.me)).status).toBe(200);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO.reader.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('an expired session sends the reader to login and back to where they were', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO.reader.email);
  await page.getByLabel('Password').fill(DEMO.reader.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/catalog$/);

  await context.clearCookies();
  await page.goto('/shelf');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email').fill(DEMO.reader.email);
  await page.getByLabel('Password').fill(DEMO.reader.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/shelf$/);
});
