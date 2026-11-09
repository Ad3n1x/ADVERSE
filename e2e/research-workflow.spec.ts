import { test, expect } from '@playwright/test';

test('a new account enters the authenticated ADVERSE research workspace', async ({ page }) => {
  const email = 'adverse-workspace-' + Date.now() + '@example.org';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /investigate the question/i })).toBeVisible();
  await page.locator('.landing-hero .landing-primary').click();
  await expect(page.getByRole('heading', { name: 'Create your ADVERSE account.' })).toBeVisible();

  await page.getByLabel('Display name').fill('ADVERSE Workspace Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('adverse-workspace-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Choose active research collection')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /investigate the question/i })).toHaveCount(0);
});
