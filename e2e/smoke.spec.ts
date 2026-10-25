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

test('direct link checker displays redirect-aware reachability evidence', async ({ page }) => {
  await page.route('**/public-search/check-link', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: {
        url: 'https://example.org/start',
        finalUrl: 'https://www.example.org/home',
        redirects: [{ status: 301, from: 'https://example.org/start', to: 'https://www.example.org/home' }],
        httpStatus: 200,
        title: 'Example home',
        excerpt: 'Example public page',
        status: 'reachable',
        checkedAt: new Date().toISOString(),
        note: 'A readable public page responded after redirects.'
      }})
    });
  });
  await page.goto('/');
  await page.getByLabel('Website URL').fill('https://example.org/start');
  await page.getByRole('button', { name: /check link/i }).click();
  await expect(page.getByText('Readable page confirmed')).toBeVisible();
  await expect(page.getByText('Example home')).toBeVisible();
  await expect(page.getByRole('link', { name: /open final destination/i })).toHaveAttribute('href', 'https://www.example.org/home');
});
