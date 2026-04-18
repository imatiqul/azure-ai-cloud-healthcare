import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('renders stat cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Pending Triage')).toBeVisible();
    await expect(page.getByText('Triage Completed')).toBeVisible();
    await expect(page.getByText('Available Slots Today')).toBeVisible();
    await expect(page.getByText('Booked Today')).toBeVisible();
    await expect(page.getByText('High-Risk Patients')).toBeVisible();
    await expect(page.getByText('Open Care Gaps')).toBeVisible();
    await expect(page.getByText('Coding Queue')).toBeVisible();
    await expect(page.getByText('Prior Auths Pending')).toBeVisible();
  });

  test('displays stat values as zero without backend', async ({ page }) => {
    await page.goto('/');
    // Without backend, fetchSafe returns fallback zeros
    const zeros = page.getByText('0');
    await expect(zeros.first()).toBeVisible();
  });
});
