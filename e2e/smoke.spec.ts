import { test, expect } from '@playwright/test';

test('public landing explains ADVERSE and makes the sign-in boundary clear', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find the right source/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/preparing your intelligence workspace/i)).toHaveCount(0);
  await expect(page.getByText(/investigation tools are inside the secure workspace after you sign in/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /research tools, not just search results/i })).toBeVisible();
  await expect(page.locator('.landing-access-tag')).toHaveCount(6);
  await expect(page.locator('.landing-hero .landing-primary')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search anything online' })).toHaveCount(0);
});

test('sign-in opens the secure workspace authentication screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('.landing-nav-login').click();
  await expect(page.getByRole('heading', { name: 'Welcome back to ADVERSE.' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.locator('button.auth-submit')).toHaveText(/Sign in/);
});

test('create workspace opens account registration', async ({ page }) => {
  await page.goto('/');
  await page.locator('.landing-hero .landing-primary').click();
  await expect(page.getByRole('heading', { name: 'Create your ADVERSE account.' })).toBeVisible();
  await expect(page.getByLabel('Display name')).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
});


test('experience route keeps anonymous visitors on the public landing page', async ({ page }) => {
  await page.goto('/experience');
  await expect(page.getByRole('heading', { name: /find the right source/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/preparing your intelligence workspace/i)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toHaveCount(0);
});
