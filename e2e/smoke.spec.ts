import { test, expect } from '@playwright/test';

test('public search page loads with an accessible search field', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find anything.*skip the dead ends/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: 'Search public information' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^search$/i })).toBeVisible();
});

test('public discovery modes are available before signing in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /everything/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /images/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /videos/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /people/i })).toBeVisible();
  await expect(page.getByText(/source-linked results/i)).toBeVisible();
});
