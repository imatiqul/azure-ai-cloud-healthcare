import { test, expect } from './fixtures';

// Phase 51: Dismiss onboarding wizard and expand admin sidebar group before each test.
// The wizard intercepts clicks; the admin group is collapsed by default (Phase 51).
const SIDEBAR_GROUPS_ALL_OPEN = JSON.stringify({
  'nav.group.main':       true,
  'nav.group.business':   true,
  'nav.group.clinical':   true,
  'nav.group.analytics':  true,
  'nav.group.patient':    true,
  'nav.group.governance': true,
  'nav.group.admin':      true,
});

test.describe('Shell App — Cloud Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((groups) => {
      localStorage.setItem('hq:onboarded-v38', 'done');
      localStorage.setItem('hq:sidebar-groups', groups);
    }, SIDEBAR_GROUPS_ALL_OPEN);
  });

  test('shell loads and shows the dashboard', async ({ page }) => {
    await page.goto('/');
    // Phase 56 set document.title = 'HealthQ Copilot'; initial HTML is 'Healthcare AI Platform'
    await expect(page).toHaveTitle(/HealthQ Copilot|Healthcare AI/i);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('sidebar navigation links are present', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar.getByText('Dashboard')).toBeVisible();
    await expect(sidebar.getByText('Voice Sessions')).toBeVisible();
    await expect(sidebar.getByText('Triage')).toBeVisible();
    await expect(sidebar.getByText('Scheduling')).toBeVisible();
    await expect(sidebar.getByText('Population Health')).toBeVisible();
    await expect(sidebar.getByText('Revenue Cycle')).toBeVisible();
  });

  // Phase 41 — new sidebar nav items
  test('sidebar shows Clinical Alerts nav item', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar.getByText('Clinical Alerts')).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar shows Reports & Export nav item', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(sidebar.getByText('Reports & Export')).toBeVisible({ timeout: 10_000 });
  });

  test('can navigate to voice page', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/voice"]').first().click();
    await expect(page).toHaveURL(/\/voice/);
  });

  test('can navigate to triage page', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/triage"]').first().click();
    await expect(page).toHaveURL(/\/triage/);
  });

  test('can navigate to scheduling page', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/scheduling"]').first().click();
    await expect(page).toHaveURL(/\/scheduling/);
  });

  test('can navigate to population health page', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/population-health"]').first().click();
    await expect(page).toHaveURL(/\/population-health/);
  });

  test('can navigate to revenue page', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/revenue"]').first().click();
    await expect(page).toHaveURL(/\/revenue/);
  });

  // Phase 41 — new route navigation
  test('can navigate to Clinical Alerts page via sidebar', async ({ page }) => {
    await page.route('**/api/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/');
    await page.locator('a[href="/alerts"]').first().click();
    await expect(page).toHaveURL(/\/alerts/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('can navigate to Reports & Export page via sidebar', async ({ page }) => {
    await page.route('**/api/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/');
    await page.locator('a[href="/admin/reports"]').first().click();
    await expect(page).toHaveURL(/\/admin\/reports/);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
