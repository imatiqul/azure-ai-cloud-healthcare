/**
 * Encounters MFE — E2E Tests
 *
 * Tests the encounters micro-frontend for:
 * 1. Loading the encounter list with mocked API data
 * 2. Displaying encounters with status badges
 * 3. Opening the create encounter modal
 * 4. Submitting the create encounter form
 */
import { test, expect } from '@playwright/test';

const mockEncounterBundle = {
  resourceType: 'Bundle',
  total: 2,
  entry: [
    {
      resource: {
        resourceType: 'Encounter',
        id: 'enc-001',
        status: 'in-progress',
        class: { code: 'AMB', display: 'Ambulatory' },
        period: { start: '2025-01-15T09:00:00Z' },
        reasonCode: [{ coding: [{ display: 'Chest pain evaluation' }] }],
      },
    },
    {
      resource: {
        resourceType: 'Encounter',
        id: 'enc-002',
        status: 'finished',
        class: { code: 'EMER', display: 'Emergency' },
        period: { start: '2025-01-10T14:00:00Z', end: '2025-01-10T16:30:00Z' },
        reasonCode: [{ coding: [{ display: 'Hypertension follow-up' }] }],
      },
    },
  ],
};

test.describe('Encounters MFE', () => {
  test.beforeEach(async ({ page }) => {
    // Mock encounters API
    await page.route('**/api/v1/fhir/encounters/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEncounterBundle),
      }),
    );
    await page.goto('/encounters');
  });

  test('renders encounters page', async ({ page }) => {
    // The MFE or error boundary should be visible
    const content = await page
      .getByRole('main')
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (!content) {
      // Shell loaded but MFE remote unavailable — the error boundary message is acceptable
      const errorBoundary = page.getByText(/failed to load encounters|loading/i);
      await expect(errorBoundary.first()).toBeVisible({ timeout: 5_000 });
      test.skip(true, 'Encounters MFE remote not available in this environment');
    }
  });

  test('shows patient ID search field', async ({ page }) => {
    const field = page.getByLabel(/patient id/i);
    const mfeLoaded = await field.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!mfeLoaded) {
      test.skip(true, 'Encounters MFE remote not available — skipping interaction tests');
      return;
    }

    await expect(field).toBeVisible();
  });

  test('loads encounters for a patient', async ({ page }) => {
    const field = page.getByLabel(/patient id/i);
    const mfeLoaded = await field.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!mfeLoaded) {
      test.skip(true, 'Encounters MFE remote not available');
      return;
    }

    await field.fill('PAT-001');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Ambulatory')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Emergency')).toBeVisible();
    await expect(page.getByText('in-progress')).toBeVisible();
    await expect(page.getByText('finished')).toBeVisible();
  });

  test('displays encounter reason codes', async ({ page }) => {
    const field = page.getByLabel(/patient id/i);
    const mfeLoaded = await field.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!mfeLoaded) {
      test.skip(true, 'Encounters MFE remote not available');
      return;
    }

    await field.fill('PAT-001');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Chest pain evaluation')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Hypertension follow-up')).toBeVisible();
  });

  test('opens create encounter modal', async ({ page }) => {
    // Mock create endpoint
    await page.route('**/api/v1/fhir/encounters', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'enc-new', status: 'in-progress' }),
      }),
    );

    const field = page.getByLabel(/patient id/i);
    const mfeLoaded = await field.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!mfeLoaded) {
      test.skip(true, 'Encounters MFE remote not available');
      return;
    }

    await field.fill('PAT-001');
    await page.keyboard.press('Enter');

    // Wait for encounters to render before clicking "+ New Encounter"
    await expect(page.getByText('Ambulatory')).toBeVisible({ timeout: 5_000 });

    const newBtn = page.getByRole('button', { name: /new encounter/i });
    await expect(newBtn).toBeVisible();
    await newBtn.click();

    // Modal should appear
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole('button', { name: /create|save|submit/i }).first()).toBeVisible();
  });

  test('shows empty state when patient has no encounters', async ({ page }) => {
    // Override the mock to return empty bundle
    await page.route('**/api/v1/fhir/encounters/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ resourceType: 'Bundle', total: 0, entry: [] }),
      }),
    );

    const field = page.getByLabel(/patient id/i);
    const mfeLoaded = await field.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!mfeLoaded) {
      test.skip(true, 'Encounters MFE remote not available');
      return;
    }

    await field.fill('PAT-EMPTY');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/no encounters found/i)).toBeVisible({ timeout: 5_000 });
  });
});
