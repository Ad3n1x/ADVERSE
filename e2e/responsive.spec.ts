import { expect, test } from '@playwright/test';

test.describe('public Find Anything responsive experience', () => {
  test('keeps the search flow usable at a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /find anything/i })).toBeVisible();
    const search = page.getByRole('textbox', { name: 'Search anything online' });
    await expect(search).toBeVisible();
    await expect(page.getByRole('button', { name: /find it/i })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

    await page.getByRole('button', { name: /recent searches/i }).click();
    await expect(page.getByText('Your searches will appear here on this device.')).toBeVisible();
  });

  test('keeps the public search form usable at a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /find anything/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search anything online' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});
