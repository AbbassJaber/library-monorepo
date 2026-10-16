import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test('catalog under forced colours / reduced motion', async ({ page }, testInfo) => {
  await loginAs(page, 'reader');
  await page.goto('/catalog');
  await expect(page.getByRole('feed', { name: 'Books' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuous scroll' }).click();
  await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible();
  await page.bringToFront();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  const outline = await page.evaluate(
    () => getComputedStyle(document.activeElement as Element).outlineStyle
  );
  expect(outline).toBe('solid');
  await page.screenshot({ path: testInfo.outputPath('catalog.png'), fullPage: false });
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const forced = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
  testInfo.annotations.push({
    type: 'mode',
    description: `reduced-motion=${reduced} forced-colors=${forced}`,
  });
  if (testInfo.project.name === 'reduced-motion') expect(reduced).toBe(true);
  if (testInfo.project.name === 'forced-colors') expect(forced).toBe(true);
});
