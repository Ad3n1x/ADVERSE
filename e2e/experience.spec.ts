import { expect, test } from '@playwright/test';

test('anonymous visitors are shown the public landing page on the experience route', async ({ page }) => {
  await page.goto('/experience');
  await expect(page.getByRole('heading', { name: /find the right source/i })).toBeVisible();
  await expect(page.getByText(/preparing your intelligence workspace/i)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toHaveCount(0);
  await expect(page.locator('.landing-nav-login')).toBeVisible();
});

test('a newly registered user enters the intent-first intelligence experience', async ({ page }) => {
  const email = 'adverse-experience-' + Date.now() + '@example.org';
  await page.goto('/');
  await page.locator('.landing-hero .landing-primary').click();
  await page.getByLabel('Display name').fill('ADVERSE Experience Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('adverse-experience-test-password-123');
  await page.locator('button.auth-submit').click();
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('What do you want to accomplish?')).toBeVisible();
});

test('experience route keeps the public landing visible without a workspace loading screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/experience');
  await expect(page.getByRole('heading', { name: /find the right source/i })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  await expect(page.getByText(/preparing your intelligence workspace/i)).toHaveCount(0);
});


test('authenticated experience supports source triage, claim links, chronology, and dossier export', async ({ page }) => {
  let savedSources: any[] = [];
  let savedClaims: any[] = [];
  let savedRuns: any[] = [];

  await page.route('**/api/v1/experience/resolve', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          plan: {
            kind: 'research',
            request: 'Research public energy storage',
            focus: 'public energy storage',
            outcome: 'An evidence-led understanding with sources and unanswered questions',
            constraints: [],
            steps: ['Clarify the question and scope', 'Gather relevant sources', 'Review evidence'],
            spaces: ['Source collection', 'Key findings', 'Open questions'],
            approvalRequired: false,
          },
          engine: { mode: 'deterministic', provider: 'ADVERSE local planner', model: 'intent-rules-v1' },
        },
      }),
    });
  });
  await page.route('**/api/v1/experience/workspaces', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'workspace-e2e-review', intent: 'Research public energy storage', kind: 'research', createdAt: Date.now() } }) });
  });
  await page.route('**/api/v1/public-search?*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{
          title: 'Public energy storage report',
          url: 'https://example.org/energy-storage',
          excerpt: 'A public research summary about grid-scale energy storage deployment.',
          publisher: 'Example Research',
          provider: 'Provider A',
          providers: ['Provider A', 'Provider B'],
          publishedAt: '2026-10-10T00:00:00.000Z',
          retrievedAt: '2026-11-20T10:00:00.000Z',
          linkCheck: { status: 'reachable', checkedAt: '2026-11-20T10:01:00.000Z' },
        }],
        meta: { coverage: 'Two configured search providers returned one merged source.', successfulSearches: 2 },
      }),
    });
  });
  await page.route('**/api/v1/experience/workspaces/*/sources', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: savedSources }) });
      return;
    }
    const body = route.request().postDataJSON();
    savedSources = (body.sources || []).map((source: any) => ({
      ...source,
      reviewStatus: source.reviewStatus || 'unreviewed',
      analystNote: source.analystNote || '',
      savedAt: source.savedAt || '2026-11-20T10:02:00.000Z',
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: savedSources, meta: { saved: savedSources.length } }) });
  });
  await page.route('**/api/v1/experience/workspaces/*/claims', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: savedClaims }) });
      return;
    }
    savedClaims = route.request().postDataJSON().claims || [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: savedClaims, meta: { saved: savedClaims.length } }) });
  });
  await page.route('**/api/v1/experience/workspaces/*/runs', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: savedRuns }) });
      return;
    }
    const run = route.request().postDataJSON();
    savedRuns = [{ ...run, recordedAt: '2026-11-20T10:03:00.000Z' }, ...savedRuns.filter(item => item.runId !== run.runId)].slice(0, 20);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: savedRuns, meta: { saved: savedRuns.length } }) });
  });

  const email = 'adverse-review-' + Date.now() + '@example.org';
  await page.goto('/');
  await page.locator('.landing-hero .landing-primary').click();
  await page.getByLabel('Display name').fill('ADVERSE Review Test');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('adverse-review-test-password-123');
  await page.locator('button.auth-submit').click();
  await expect(page.getByRole('heading', { name: /stop searching for pages/i })).toBeVisible({ timeout: 30_000 });

  await page.getByLabel('What do you want to accomplish?').fill('Research public energy storage');
  await page.getByRole('button', { name: /start investigation/i }).click();
  await expect(page.getByText('Public energy storage report').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /what this result set covers/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /known source dates/i })).toBeVisible();

  await page.locator('.experience-source-review-actions button').filter({ hasText: 'Useful' }).click();
  await page.getByLabel('Analyst note for Public energy storage report').fill('Compare this with an independent deployment dataset.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Review saved to this workspace.')).toBeVisible();
  await page.locator('.experience-review-toolbar button').filter({ hasText: 'Useful' }).click();
  await expect(page.getByText('Public energy storage report').first()).toBeVisible();

  await page.getByLabel('Statement to examine').fill('Grid-scale energy storage deployment increased during the reporting period.');
  await page.getByLabel('Link source: Public energy storage report').check();
  await page.getByLabel('Evidence role for Public energy storage report').selectOption('supports');
  await page.getByRole('button', { name: 'Add claim' }).click();
  await expect(page.getByText('Claim ledger saved to this workspace.')).toBeVisible();
  await expect(page.locator('.experience-claim-card')).toContainText('Grid-scale energy storage deployment increased');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /export json/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('dossier.json');
  await expect(page.getByRole('heading', { name: /reproducible search runs/i })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
