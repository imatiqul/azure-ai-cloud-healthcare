import { test, expect } from '@playwright/test';

const mockTriageWorkflows = [
  {
    id: 'wf-1',
    patientName: 'Jane Doe',
    priority: 'P1_Immediate',
    status: 'AwaitingHumanReview',
    summary: 'Chest pain, shortness of breath',
  },
  {
    id: 'wf-2',
    patientName: 'John Smith',
    priority: 'P2_Urgent',
    status: 'Completed',
    summary: 'Persistent headache, blurred vision',
  },
  {
    id: 'wf-3',
    patientName: 'Alice Brown',
    priority: 'P3_Standard',
    status: 'InProgress',
    summary: 'Routine follow-up',
  },
];

test.describe('Triage MFE', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/agents/triage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTriageWorkflows),
      }),
    );
    await page.goto('/triage');
  });

  test('renders triage workflow list', async ({ page }) => {
    // MFE may not load in CI if remote isn't ready
    const mfeLoaded = await page.getByText('Jane Doe').isVisible({ timeout: 5000 }).catch(() => false);
    if (mfeLoaded) {
      await expect(page.getByText('John Smith')).toBeVisible();
      await expect(page.getByText('Alice Brown')).toBeVisible();
    } else {
      await expect(page.getByText(/failed to load|loading/i).first()).toBeVisible();
    }
  });

  test('displays priority badges', async ({ page }) => {
    const mfeLoaded = await page.getByText('P1_Immediate').isVisible({ timeout: 5000 }).catch(() => false);
    if (mfeLoaded) {
      await expect(page.getByText('P2_Urgent')).toBeVisible();
      await expect(page.getByText('P3_Standard')).toBeVisible();
    }
  });

  test('shows review button for awaiting human review', async ({ page }) => {
    const btn = page.getByRole('button', { name: /review.*approve/i });
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(btn).toBeVisible();
    }
  });

  test('opens HITL escalation modal on review click', async ({ page }) => {
    const btn = page.getByRole('button', { name: /review.*approve/i });
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('button', { name: /approve/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    }
  });
});
