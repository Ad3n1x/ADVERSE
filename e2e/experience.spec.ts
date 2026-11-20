import { expect, test } from '@playwright/test';

test('anonymous visitors are shown the public landing page on the experience route', async ({ page }) => {
  await page.goto('/experience');
  await expect(page.getByRole('heading', { name: /investigate the question/i })).toBeVisible();
  await expect(page.getByText(/preparing your intelligence workspace/i)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toHaveCount(0);
  await expect(page.locator('.landing-nav-login')).toBeVisible();
});

test('a newly registered user enters the intent-first intelligence experience', async ({ page }) => {
  const email = 'adverse-experience-' + Date.now() + '@example.org';
  await page.goto('/');
  await page.locator('.landing-hero .landing-primary').click();
  await page.getByLabel('Display name').fill('ADVERSE Experience Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('adverse-experience-test-password-123');
  await page.locator('button.auth-submit').click();
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('What do you want to accomplish?')).toBeVisible();
});

test('experience route keeps the public landing visible without a workspace loading screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/experience');
  await expect(page.getByRole('heading', { name: /investigate the question/i })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.getByText(/preparing your intelligence workspace/i)).toHaveCount(0);
});
