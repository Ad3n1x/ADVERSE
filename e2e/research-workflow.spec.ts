import { test, expect } from '@playwright/test';

test('authenticated users return to the personal search engine, not the retired research workspace', async ({ page }) => {
  const email = 'search-engine-' + Date.now() + '@example.org';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find what you’re looking for/i })).toBeVisible();
  await page.locator('.find-top-links').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back to ADVERSE.' })).toBeVisible();

  await page.locator('.auth-toggle button').click();
  await page.getByLabel('Display name').fill('ADVERSE Search User');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('search-engine-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page.getByText('Account active')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('combobox', { name: 'Search anything online' })).toBeVisible();
  await expect(page.getByRole('button', { name: /recent searches/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /saved links/i })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.locator('.find-research-next')).toHaveCount(0);
});
