import { test, expect } from '@playwright/test';

test('researcher can register, create an investigation, and inspect the evidence graph', async ({ page }) => {
  const email = 'e2e-' + Date.now() + '@example.org';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /find anything/i })).toBeVisible();
  await page.locator('.find-top-links').getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();

  await page.locator('.auth-toggle button').click();
  await page.getByLabel('Display name').fill('Browser Test Researcher');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('browser-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page.getByRole('button', { name: /New collection/ })).toBeVisible();
  await page.getByRole('button', { name: /New collection/ }).click();
  await page.getByLabel('Collection name').fill('E2E Public History Case');
  await page.getByLabel(/What do you want to find/).fill('Can the source history be reconstructed?');
  await page.getByRole('button', { name: /Create collection/ }).click();
  await expect(page.locator('header').getByText('E2E Public History Case')).toBeVisible();

  await page.getByRole('button', { name: /Graph & links/i }).click();
  await expect(page.getByRole('heading', { name: /Within-collection connections/i })).toBeVisible();
  await page.getByRole('button', { name: /Add entity/ }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Example Corporation');
  await page.getByLabel('Public link (optional)').fill('https://example.org');
  await page.locator('.modal form').getByRole('button', { name: 'Add entity' }).click();

  // The current graph exposes a dedicated entity picker rather than the older
  // filter/.graph-entity-option UI. Select the newly-created entity directly.
  const entityOption = page.locator('.graph-entity-picker-list button').filter({ hasText: 'Example Corporation' });
  await expect(entityOption).toBeVisible();
  await entityOption.click();
  await expect(page.getByText('SELECTED ENTITY')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Open source: Example Corporation/i })).toBeVisible();
});
