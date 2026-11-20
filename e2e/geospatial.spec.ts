import { expect, test } from '@playwright/test';

test('geospatial workspace combines public feeds, STAC discovery and evidence capture', async ({ page }) => {
  await page.route('https://earthquake.usgs.gov/**', route => route.fulfill({
    status: 200,
    contentType: 'application/geo+json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      metadata: { generated: Date.now() },
      features: [{
        type: 'Feature',
        id: 'adverse-e2e-quake',
        geometry: { type: 'Point', coordinates: [10.25, 20.5, 7.2] },
        properties: {
          mag: 4.2,
          time: Date.now(),
          place: 'ADVERSE test earthquake location',
          url: 'https://earthquake.usgs.gov/earthquakes/eventpage/adverse-e2e-quake',
        },
      }],
    }),
  }));
  await page.route('https://eonet.gsfc.nasa.gov/api/v3/events**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      events: [{
        id: 'adverse-e2e-natural-event',
        title: 'ADVERSE test natural event',
        categories: [{ title: 'Wildfires' }],
        geometry: [{ type: 'Point', date: new Date().toISOString(), coordinates: [-121.5, 38.2] }],
        sources: [{ url: 'https://eonet.gsfc.nasa.gov/'}],
      }],
    }),
  }));
  await page.route('https://earth-search.aws.element84.com/v1/collections', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      collections: [{
        id: 'adverse-e2e-sentinel',
        title: 'ADVERSE test satellite collection',
        description: 'Test STAC collection metadata.',
        license: 'CC-BY-4.0',
        links: [{ rel: 'self', href: 'https://earth-search.aws.element84.com/v1/collections/adverse-e2e-sentinel' }],
      }],
    }),
  }));
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());

  const email = 'adverse-geospatial-' + Date.now() + '@example.org';
  await page.goto('/classic');
  await page.locator('.landing-hero .landing-primary').click();
  await page.getByLabel('Display name').fill('ADVERSE Geospatial Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('adverse-geospatial-test-password-123');
  await page.locator('button.auth-submit').click();

  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /new collection/i }).click();
  await page.getByLabel('Collection name').fill('Geospatial integration test');
  await page.getByRole('button', { name: 'Create collection' }).click();
  await expect(page.getByLabel('Choose active research collection')).toContainText('Geospatial integration test');

  await page.getByRole('button', { name: 'Geospatial' }).click();
  await expect(page.getByRole('heading', { name: 'Global event monitor' })).toBeVisible();
  await expect(page.getByText('ADVERSE test earthquake location')).toBeVisible();
  await expect(page.getByText('ADVERSE test satellite collection')).toBeVisible();

  await page.getByRole('tab', { name: /Natural/ }).click();
  await expect(page.getByText('ADVERSE test natural event')).toBeVisible();

  await page.getByRole('tab', { name: /Earthquakes/ }).click();
  await page.getByRole('button', { name: 'Save evidence' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 20_000 });
});
