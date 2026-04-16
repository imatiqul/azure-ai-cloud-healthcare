import { test, expect } from '@playwright/test';

test.describe('Voice Sessions MFE', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/voice');
  });

  test('renders voice session controller', async ({ page }) => {
    await expect(page.getByRole('button', { name: /start session/i })).toBeVisible();
  });

  test('starts a session and shows live state', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'test-session-123', status: 'live' }),
      }),
    );

    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByText('test-session-123')).toBeVisible();
  });

  test('shows end session button when live', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'test-session-123', status: 'live' }),
      }),
    );

    await page.getByRole('button', { name: /start session/i }).click();
    await expect(page.getByRole('button', { name: /end session/i })).toBeVisible();
  });
});
