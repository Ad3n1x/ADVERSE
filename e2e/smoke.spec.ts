import { test, expect } from '@playwright/test';

test('public search page loads with an accessible search field', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find the website/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('combobox', { name: 'Search anything online' })).toBeVisible();
  await expect(page.getByRole('button', { name: /find it/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /search is the start/i })).toBeVisible();
  await expect(page.getByText(/reachable.*not that every statement on it is true/i)).toBeVisible();
});

test('public search exposes recent searches and saved links before sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find the website/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /recent searches/i }).click();
  await expect(page.getByText('Your searches will appear here on this device.')).toBeVisible();
  await page.getByRole('button', { name: /saved links/i }).click();
  await expect(page.getByText('Save a result to keep it handy on this device.')).toBeVisible();
});
