import { expect, test } from '@playwright/test';

test.describe('ADVERSE personal search responsive experience', () => {
  test('keeps the search flow usable at a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /find what you’re looking for/i })).toBeVisible();
    const search = page.getByRole('combobox', { name: 'Search anything online' });
    await expect(search).toBeVisible();
    await expect(page.getByRole('button', { name: /find it/i })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

    await page.getByRole('button', { name: /recent searches/i }).click();
    await expect(page.getByText('Your searches will appear here on this device.')).toBeVisible();
    await page.getByRole('button', { name: /saved links/i }).click();
    await expect(page.getByText('Save a result to keep it handy on this device.')).toBeVisible();
  });

  test('keeps the search form and results canvas within a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /find what you’re looking for/i })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Search anything online' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});

test('signed-in users stay in the personal search experience on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find what you’re looking for/i })).toBeVisible({ timeout: 20_000 });
  await page.locator('.find-top-links').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back to ADVERSE.' })).toBeVisible();

  await page.locator('.auth-toggle button').click();
  await page.getByLabel('Display name').fill('Search Experience Test');
  await page.getByLabel('Email address').fill('search-ui-' + Date.now() + '@example.org');
  await page.getByLabel('Password').fill('search-ui-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page.getByText('Account active')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('combobox', { name: 'Search anything online' })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.locator('.find-research-next')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
