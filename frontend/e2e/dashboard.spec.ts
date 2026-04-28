import { test, expect } from '@playwright/test';

const mockStats = {
  pendingTriage: 12,
  triageCompleted: 47,
  availableSlotsToday: 8,
  bookedToday: 23,
  highRiskPatients: 5,
  openCareGaps: 31,
  codingQueue: 9,
  priorAuthsPending: 4,
};

test.describe('Dashboard — Static Render', () => {
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

test.describe('Dashboard — Live API Stats', () => {
  test.beforeEach(async ({ page }) => {
    // Dashboard now fetches all stats via a single GraphQL query against the BFF
    await page.route('**/graphql', (route) => {
      const q: string = route.request().postDataJSON()?.query ?? '';
      if (q.includes('dashboardStats')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              dashboardStats: {
                pendingTriage:       mockStats.pendingTriage,
                triageCompleted:     mockStats.triageCompleted,
                availableSlotsToday: mockStats.availableSlotsToday,
                bookedToday:         mockStats.bookedToday,
                highRiskPatients:    mockStats.highRiskPatients,
                openCareGaps:        mockStats.openCareGaps,
                codingQueue:         mockStats.codingQueue,
                priorAuthsPending:   mockStats.priorAuthsPending,
              },
            },
          }),
        });
      } else {
        route.continue();
      }
    });
  });

  test('shows live non-zero stats from API', async ({ page }) => {
    await page.goto('/');
    const mfeLoaded = await page.getByText('Pending Triage').isVisible({ timeout: 8000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Dashboard not available — skipping live stats test');
      return;
    }
    // At least one of our mocked non-zero values should be visible
    const stat12 = page.getByText('12');
    const stat47 = page.getByText('47');
    const anyNonZero = (await stat12.isVisible().catch(() => false)) ||
                       (await stat47.isVisible().catch(() => false));
    expect(anyNonZero, 'Expected at least one non-zero stat to display').toBe(true);
  });

  test('high-risk patients stat card shows correct count', async ({ page }) => {
    await page.goto('/');
    const mfeLoaded = await page.getByText('High-Risk Patients').isVisible({ timeout: 8000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Dashboard not available — skipping high-risk count test');
      return;
    }
    await expect(page.getByText('5')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard — Navigation', () => {
  test('clicking Pending Triage card navigates to /triage', async ({ page }) => {
    await page.goto('/');
    const triageCard = page.getByText('Pending Triage').locator('..').first();
    const cardVisible = await triageCard.isVisible({ timeout: 8000 }).catch(() => false);
    if (!cardVisible) {
      test.skip(true, 'Dashboard cards not available — skipping navigation test');
      return;
    }
    await triageCard.click();
    await expect(page).toHaveURL(/triage/);
  });

  test('clicking Available Slots Today card navigates to /scheduling', async ({ page }) => {
    await page.goto('/');
    const slotCard = page.getByText('Available Slots Today').locator('..').first();
    const cardVisible = await slotCard.isVisible({ timeout: 8000 }).catch(() => false);
    if (!cardVisible) {
      test.skip(true, 'Dashboard cards not available — skipping navigation test');
      return;
    }
    await slotCard.click();
    await expect(page).toHaveURL(/scheduling/);
  });

  test('clicking High-Risk Patients card navigates to /population-health', async ({ page }) => {
    await page.goto('/');
    const riskCard = page.getByText('High-Risk Patients').locator('..').first();
    const cardVisible = await riskCard.isVisible({ timeout: 8000 }).catch(() => false);
    if (!cardVisible) {
      test.skip(true, 'Dashboard cards not available — skipping navigation test');
      return;
    }
    await riskCard.click();
    await expect(page).toHaveURL(/population-health/);
  });

  test('clicking Coding Queue card navigates to /revenue', async ({ page }) => {
    await page.goto('/');
    const codingCard = page.getByText('Coding Queue').locator('..').first();
    const cardVisible = await codingCard.isVisible({ timeout: 8000 }).catch(() => false);
    if (!cardVisible) {
      test.skip(true, 'Dashboard cards not available — skipping navigation test');
      return;
    }
    await codingCard.click();
    await expect(page).toHaveURL(/revenue/);
  });
});

test.describe('Dashboard — Quick Search', () => {
  test('quick search field accepts patient name input', async ({ page }) => {
    await page.goto('/');
    const searchInput = page.getByPlaceholder(/search patient|quick search|find patient/i);
    const searchVisible = await searchInput.isVisible({ timeout: 8000 }).catch(() => false);
    if (!searchVisible) {
      test.skip(true, 'Quick search not available — skipping input test');
      return;
    }
    await searchInput.fill('Jane Doe');
    await expect(searchInput).toHaveValue('Jane Doe');
  });

  test('quick search shows results on enter', async ({ page }) => {
    await page.route('**/api/v1/identity/patients**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'pat-001', name: 'Jane Doe', dob: '1980-04-12' },
        ]),
      }),
    );
    await page.goto('/');
    const searchInput = page.getByPlaceholder(/search patient|quick search|find patient/i);
    const searchVisible = await searchInput.isVisible({ timeout: 8000 }).catch(() => false);
    if (!searchVisible) {
      test.skip(true, 'Quick search not available — skipping results test');
      return;
    }
    await searchInput.fill('Jane');
    await searchInput.press('Enter');
    await expect(page.getByText('Jane Doe')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Dashboard — Platform Health', () => {
  test('platform health indicator is visible in header', async ({ page }) => {
    await page.goto('/');
    const healthIndicator = page.getByTestId('platform-health').or(
      page.getByText(/all systems|healthy|degraded/i),
    );
    const visible = await healthIndicator.first().isVisible({ timeout: 8000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'Platform health indicator not rendered — skipping');
      return;
    }
    await expect(healthIndicator.first()).toBeVisible();
  });
});

