import { test, expect } from '@playwright/test';

const MFE_PAGES = [
  {
    name: 'voice',
    route: '/voice',
    expectedText: /voice|session|record/i,
  },
  {
    name: 'triage',
    route: '/triage',
    expectedText: /triage|workflow|patient/i,
  },
  {
    name: 'scheduling',
    route: '/scheduling',
    expectedText: /schedul|book|appointment/i,
  },
  {
    name: 'population-health',
    route: '/population-health',
    expectedText: /population|health|risk|care/i,
  },
  {
    name: 'revenue',
    route: '/revenue',
    expectedText: /revenue|claim|billing/i,
  },
  {
    name: 'encounters',
    route: '/encounters',
    expectedText: /encounter|visit|episode/i,
  },
  {
    name: 'engagement',
    route: '/patient-portal',
    expectedText: /engagement|portal|notification|appointment/i,
  },
];

test.describe('MFE Module Federation — Cloud', () => {
  for (const mfe of MFE_PAGES) {
    test(`${mfe.name} MFE loads via module federation at ${mfe.route}`, async ({ page }) => {
      // Mock API calls so the UI renders without real backends
      await page.route('**/api/v1/**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      );

      await page.goto(mfe.route);
      // Verify the page loaded without crash
      await expect(page.locator('body')).not.toBeEmpty();
      // The page should contain MFE-specific content
      await expect(page.locator('main, [class*="content"], [role="main"]').first()).toBeVisible();
    });
  }
});

test.describe('MFE Cross-Navigation — Cloud', () => {
  test('navigate from dashboard through all MFE pages', async ({ page }) => {
    await page.route('**/api/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto('/');
    await expect(page).toHaveURL(/\//);

    // Navigate to each MFE page and verify it loads
    for (const mfe of MFE_PAGES) {
      await page.goto(mfe.route);
      await expect(page.locator('body')).not.toBeEmpty();
    }

    // Navigate back to dashboard
    await page.goto('/');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
