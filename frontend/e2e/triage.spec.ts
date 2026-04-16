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
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('John Smith')).toBeVisible();
    await expect(page.getByText('Alice Brown')).toBeVisible();
  });

  test('displays priority badges', async ({ page }) => {
    await expect(page.getByText('P1_Immediate')).toBeVisible();
    await expect(page.getByText('P2_Urgent')).toBeVisible();
    await expect(page.getByText('P3_Standard')).toBeVisible();
  });

  test('shows review button for awaiting human review', async ({ page }) => {
    await expect(page.getByRole('button', { name: /review.*approve/i })).toBeVisible();
  });

  test('opens HITL escalation modal on review click', async ({ page }) => {
    await page.getByRole('button', { name: /review.*approve/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /approve/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });
});
