import { test, expect } from '@playwright/test';

test.describe('Sidebar Navigation', () => {
  test('renders all navigation links', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar.getByText('Dashboard')).toBeVisible();
    await expect(sidebar.getByText('Voice Sessions')).toBeVisible();
    await expect(sidebar.getByText('AI Triage')).toBeVisible();
    await expect(sidebar.getByText('Scheduling')).toBeVisible();
    await expect(sidebar.getByText('Population Health')).toBeVisible();
    await expect(sidebar.getByText('Revenue Cycle')).toBeVisible();
  });

  test('navigates to voice page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Voice Sessions').click();
    await expect(page).toHaveURL('/voice');
  });

  test('navigates to triage page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('AI Triage').click();
    await expect(page).toHaveURL('/triage');
  });

  test('navigates to scheduling page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Scheduling').click();
    await expect(page).toHaveURL('/scheduling');
  });

  test('navigates to population health page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Population Health').click();
    await expect(page).toHaveURL('/population-health');
  });

  test('navigates to revenue page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Revenue Cycle').click();
    await expect(page).toHaveURL('/revenue');
  });

  test('navigates back to dashboard', async ({ page }) => {
    await page.goto('/voice');
    await page.getByText('Dashboard').click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('TopNav', () => {
  test('renders header title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Healthcare AI Platform')).toBeVisible();
  });

  test('renders sign in button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});
