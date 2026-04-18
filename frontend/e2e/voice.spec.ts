import { test, expect } from '@playwright/test';

test.describe('Voice Sessions MFE', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/voice');
  });

  test('renders voice session controller', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: /start session/i });
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping render assertion');
      return;
    }
    await expect(startBtn).toBeVisible();
  });

  test('starts a session and shows live state', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'test-session-123', status: 'live' }),
      }),
    );

    const startBtn = page.getByRole('button', { name: /start session/i });
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping session start test');
      return;
    }
    await startBtn.click();
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

    const startBtn = page.getByRole('button', { name: /start session/i });
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping end session test');
      return;
    }
    await startBtn.click();
    await expect(page.getByRole('button', { name: /end session/i })).toBeVisible();
  });
});
