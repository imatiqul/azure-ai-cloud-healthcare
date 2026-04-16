import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('renders stat cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Active Encounters')).toBeVisible();
    await expect(page.getByText('Pending Triage')).toBeVisible();
    await expect(page.getByText('Scheduled Today')).toBeVisible();
    await expect(page.getByText('Open Care Gaps')).toBeVisible();
    await expect(page.getByText('Coding Queue')).toBeVisible();
    await expect(page.getByText('Prior Auths Pending')).toBeVisible();
  });

  test('displays stat values', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('24')).toBeVisible();
    await expect(page.getByText('42')).toBeVisible();
    await expect(page.getByText('156')).toBeVisible();
  });
});
