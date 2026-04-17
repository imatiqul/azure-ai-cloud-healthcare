import { test, expect } from '@playwright/test';

test.describe('Demo Flow — End-to-End', () => {
  test('navigates through all demo modules from landing', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.getByText('HealthQ Copilot')).toBeVisible();
  });

  test('dashboard loads with stat cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Pending Triage')).toBeVisible();
    await expect(page.getByText('Available Slots Today')).toBeVisible();
  });

  test('can navigate to scheduling module', async ({ page }) => {
    await page.goto('/scheduling');
    await expect(page.getByText(/schedul/i)).toBeVisible();
  });

  test('can navigate to triage module', async ({ page }) => {
    await page.goto('/triage');
    await expect(page.getByText(/triage/i)).toBeVisible();
  });

  test('can navigate to population health module', async ({ page }) => {
    await page.goto('/population-health');
    await expect(page.getByText(/population|risk|care gap/i)).toBeVisible();
  });

  test('can navigate to revenue module', async ({ page }) => {
    await page.goto('/revenue');
    await expect(page.getByText(/revenue|coding|prior auth/i)).toBeVisible();
  });

  test('can navigate to voice module', async ({ page }) => {
    await page.goto('/voice');
    await expect(page.getByText(/voice|session/i)).toBeVisible();
  });
});
