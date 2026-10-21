import { test, expect } from '@playwright/test';

test('public search page loads with a usable search field', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find anything/i }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('textbox', { name: /search anything online/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /find it/i })).toBeVisible();
});

test('public search page exposes sign-in without blocking public discovery', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/public-source search/i)).toBeVisible();
});
