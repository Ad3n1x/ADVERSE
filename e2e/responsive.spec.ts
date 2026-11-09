import { expect, test } from '@playwright/test';

test.describe('ADVERSE public landing responsive experience', () => {
  test('keeps the workspace introduction usable at a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /investigate the question/i })).toBeVisible();
    await expect(page.locator('.landing-hero .landing-primary')).toBeVisible();
    await expect(page.locator('.landing-access-note')).toBeVisible();
    await expect(page.locator('.landing-capability')).toHaveCount(6);

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });

  test('keeps the landing page within a desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /investigate the question/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /research tools, not just search results/i })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
});

test('authentication remains usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.landing-nav-login').click();
  await expect(page.getByRole('heading', { name: 'Welcome back to ADVERSE.' })).toBeVisible();
  await expect(page.locator('.auth-card')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
