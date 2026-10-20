import { test, expect } from '@playwright/test';

test('researcher can register, create an investigation, and inspect the evidence graph', async ({ page }) => {
  const email = 'e2e-' + Date.now() + '@example.org';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();

  await page.locator('.auth-toggle button').click();
  await page.getByLabel('Display name').fill('Browser Test Researcher');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('browser-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page.getByRole('button', { name: /New investigation/ })).toBeVisible();
  await page.getByRole('button', { name: /New investigation/ }).click();
  await page.getByLabel('Investigation title').fill('E2E Public History Case');
  await page.getByLabel('Research question').fill('Can the source history be reconstructed?');
  await page.getByRole('button', { name: /Create case/ }).click();
  await expect(page.getByText('E2E Public History Case')).toBeVisible();

  await page.getByRole('button', { name: 'Evidence graph' }).click();
  await page.getByRole('button', { name: /Add entity/ }).click();
  await page.getByLabel('Entity name').fill('Example Corporation');
  await page.getByLabel('Canonical public URL').fill('https://example.org');
  await page.getByRole('button', { name: 'Add entity' }).click();

  const filter = page.getByPlaceholder('Filter by entity name, type, or description');
  await expect(filter).toBeVisible();
  await filter.fill('Example Corporation');
  await expect(page.getByRole('button', { name: 'Inspect entity Example Corporation' })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect entity Example Corporation' }).click();
  await expect(page.getByText('SELECTED ENTITY')).toBeVisible();
});
