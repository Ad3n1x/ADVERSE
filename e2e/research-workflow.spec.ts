import { test, expect } from '@playwright/test';

test('public landing leads to the authenticated intent-first ADVERSE workspace', async ({ page }) => {
  const email = 'adverse-phase-three-' + Date.now() + '@example.org';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find the right source.*follow the evidence/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /create your workspace/i })).toBeVisible();

  await page.getByRole('button', { name: /create your workspace/i }).click();
  await expect(page.getByRole('heading', { name: 'Create your ADVERSE account.' })).toBeVisible();

  await page.getByLabel('Display name').fill('ADVERSE Phase Three Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('adverse-phase-three-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page).toHaveURL(/\/experience$/);
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('What do you want to accomplish?')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /legacy workspace/i })).toHaveCount(0);

  await page.goto('/classic');
  await expect(page).toHaveURL(/\/experience$/);
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toBeVisible();

  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /find the right source.*follow the evidence/i })).toBeVisible();
});
