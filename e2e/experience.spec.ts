import { expect, test } from '@playwright/test';

const publicSearchResponse = {
  data: [{
    title: 'Example renewable energy research',
    url: 'https://example.com/renewable-energy',
    excerpt: 'A public-source excerpt used by the experience test.',
    publisher: 'Example Research',
    provider: 'Test provider',
    linkCheck: { status: 'reachable', note: 'Reachable during test.' },
  }],
  meta: { coverage: 'Test search provider coverage.' },
};

test('intent workspace resolves public sources and renders evidence cards', async ({ page }) => {
  await page.route('**/api/v1/public-search**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(publicSearchResponse),
  }));

  await page.goto('/experience');
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toBeVisible();
  await page.getByLabel('What do you want to accomplish?').fill('Research renewable energy storage');
  await page.getByRole('button', { name: /shape workspace/i }).click();

  await expect(page.getByRole('heading', { name: 'Research workspace' })).toBeVisible();
  await expect(page.getByText('renewable energy storage', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /example renewable energy research/i })).toHaveAttribute('href', 'https://example.com/renewable-energy');
  await expect(page.getByText(/reachable when checked/i)).toBeVisible();
  await expect(page.getByText('Test search provider coverage.')).toBeVisible();
});

test('workspace history survives reload and can be removed', async ({ page }) => {
  await page.route('**/api/v1/public-search**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(publicSearchResponse),
  }));

  await page.goto('/experience');
  await page.getByLabel('What do you want to accomplish?').fill('Compare solar and wind energy');
  await page.getByRole('button', { name: /shape workspace/i }).click();
  await expect(page.getByRole('heading', { name: 'Comparison workspace' })).toBeVisible();
  await page.getByRole('button', { name: /new intent/i }).click();
  await page.reload();

  await expect(page.getByText('RECENT WORKSPACES')).toBeVisible();
  await expect(page.getByText('Compare solar and wind energy')).toBeVisible();
  await page.getByRole('button', { name: 'Delete saved workspace: Compare solar and wind energy' }).click();
  await expect(page.getByText('RECENT WORKSPACES')).toHaveCount(0);
});

test('experience layout remains usable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/experience');
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.locator('.experience-constellation')).toHaveCount(0);
});
