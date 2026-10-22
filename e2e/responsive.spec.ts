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


test('authenticated workspace keeps navigation, account settings, and panels usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find anything/i })).toBeVisible({ timeout: 20_000 });
  await page.locator('.find-top-links').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();

  await page.locator('.auth-toggle button').click();
  await page.getByLabel('Display name').fill('Responsive UI Test');
  await page.getByLabel('Email address').fill('responsive-' + Date.now() + '@example.org');
  await page.getByLabel('Password').fill('responsive-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page.getByRole('button', { name: /New collection/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.account-shortcut')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

  await page.locator('.account-shortcut').click();
  await expect(page.getByRole('heading', { name: /Your settings/i })).toBeVisible();

  const settingsDimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(settingsDimensions.content).toBeLessThanOrEqual(settingsDimensions.viewport + 1);
});
