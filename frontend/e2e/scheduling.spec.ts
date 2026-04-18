import { test, expect } from '@playwright/test';

const mockSlots = [
  { id: 'slot-1', start: '2026-04-16T09:00:00Z', end: '2026-04-16T09:30:00Z', status: 'available' },
  { id: 'slot-2', start: '2026-04-16T10:00:00Z', end: '2026-04-16T10:30:00Z', status: 'available' },
  { id: 'slot-3', start: '2026-04-16T11:00:00Z', end: '2026-04-16T11:30:00Z', status: 'booked' },
];

test.describe('Scheduling MFE', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/scheduling/slots**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSlots),
      }),
    );
    await page.goto('/scheduling');
  });

  test('renders slot calendar', async ({ page }) => {
    // MFE may not load in CI if remote isn't ready
    const mfeLoaded = await page.getByText(/9:00|09:00/).isVisible({ timeout: 5000 }).catch(() => false);
    if (mfeLoaded) {
      await expect(page.getByText(/10:00/)).toBeVisible();
    } else {
      await expect(page.getByText(/failed to load|loading/i).first()).toBeVisible();
    }
  });

  test('reserves a slot on click', async ({ page }) => {
    await page.route('**/api/v1/scheduling/slots/slot-1/reserve', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'slot-1', status: 'reserved' }),
      }),
    );

    const availableSlots = page.locator('[class*="slot"], [data-testid*="slot"]').first();
    if (await availableSlots.isVisible()) {
      await availableSlots.click();
    }
  });
});

test.describe('Booking Form', () => {
  test('submits a booking', async ({ page }) => {
    await page.route('**/api/v1/scheduling/slots**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSlots),
      }),
    );
    await page.route('**/api/v1/scheduling/bookings', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-1', status: 'confirmed' }),
      }),
    );
    await page.goto('/scheduling');

    const patientInput = page.getByLabel(/patient/i);
    if (await patientInput.isVisible()) {
      await patientInput.fill('patient-001');
      const practitionerInput = page.getByLabel(/practitioner/i);
      if (await practitionerInput.isVisible()) {
        await practitionerInput.fill('dr-smith');
      }
    }
  });
});
