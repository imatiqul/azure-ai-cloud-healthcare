import { test, expect } from '@playwright/test';

const activeWorkflow = {
  workflowId: 'wf-active-1',
  sessionId: 'sess-active-1',
  patientId: 'PAT-ACTIVE',
  patientName: 'Alice Active',
  triageLevel: 'P2_Urgent',
  status: 'AwaitingHumanReview',
  createdAt: '2025-01-01T08:00:00.000Z',
  updatedAt: '2025-01-01T08:00:00.000Z',
};

const newerWorkflow = {
  workflowId: 'wf-newer-2',
  sessionId: 'sess-newer-2',
  patientId: 'PAT-NEWER',
  patientName: 'Nora Newer',
  triageLevel: 'P3_Standard',
  status: 'Completed',
  createdAt: '2025-01-02T09:00:00.000Z',
  updatedAt: '2025-01-02T09:00:00.000Z',
};

test.describe('Workflow Handoff', () => {
  test('approval, scheduling, and booking stay attached to the active workflow', async ({ page }) => {
    let approvedWorkflowId: string | null = null;
    let bookingPayload: Record<string, unknown> | null = null;

    await page.addInitScript(({ handoffs, activeWorkflowId }) => {
      window.localStorage.setItem('hq:onboarded-v38', 'done');
      window.sessionStorage.setItem('hq:workflow-handoffs', JSON.stringify(handoffs));
      window.sessionStorage.setItem('hq:active-workflow-id', activeWorkflowId);
    }, {
      handoffs: [newerWorkflow, activeWorkflow],
      activeWorkflowId: activeWorkflow.workflowId,
    });

    await page.route('**/api/v1/agents/triage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: activeWorkflow.workflowId,
            sessionId: activeWorkflow.sessionId,
            patientId: activeWorkflow.patientId,
            patientName: activeWorkflow.patientName,
            priority: activeWorkflow.triageLevel,
            triageLevel: activeWorkflow.triageLevel,
            status: activeWorkflow.status,
            summary: 'Escalated chest pain case',
            agentReasoning: 'Immediate clinician review is required before scheduling.',
            createdAt: activeWorkflow.createdAt,
          },
          {
            id: newerWorkflow.workflowId,
            sessionId: newerWorkflow.sessionId,
            patientId: newerWorkflow.patientId,
            patientName: newerWorkflow.patientName,
            priority: newerWorkflow.triageLevel,
            triageLevel: newerWorkflow.triageLevel,
            status: newerWorkflow.status,
            summary: 'Routine follow-up case',
            agentReasoning: 'Completed and ready for standard scheduling.',
            createdAt: newerWorkflow.createdAt,
          },
        ]),
      }),
    );

    await page.route('**/api/v1/agents/triage/**/approve', async (route) => {
      const match = route.request().url().match(/\/triage\/([^/]+)\/approve/i);
      approvedWorkflowId = match?.[1] ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: approvedWorkflowId, status: 'Approved' }),
      });
    });

    await page.route('**/api/v1/scheduling/slots**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'slot-active-1',
            practitionerId: 'DR-ACTIVE',
            startTime: '2026-04-16T09:00:00.000Z',
            endTime: '2026-04-16T09:30:00.000Z',
            status: 'Available',
            aiRecommended: true,
          },
        ]),
      }),
    );

    await page.route('**/api/v1/scheduling/slots/slot-active-1/reserve', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'slot-active-1', status: 'reserved' }),
      }),
    );

    await page.route('**/api/v1/scheduling/bookings', async (route) => {
      if (route.request().method() === 'POST') {
        bookingPayload = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'booking-active-1', status: 'confirmed' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/triage', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(activeWorkflow.patientName, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /review.*approve/i }).click();
    await page.getByLabel(/clinical justification note/i).fill('Escalation reviewed and approved for scheduling.');
    await page.getByRole('button', { name: /approve.*continue/i }).click();

    await expect(page).toHaveURL(/\/scheduling$/);
    await expect(page.getByText(`Scheduling appointment for ${activeWorkflow.patientName}.`)).toBeVisible({ timeout: 8000 });
    expect(approvedWorkflowId).toBe(activeWorkflow.workflowId);

    await page.getByRole('button', { name: /reserve slot slot-active-1/i }).click();

    await expect(page.getByLabel(/slot id/i)).toHaveValue('slot-active-1');
    await expect(page.getByLabel(/patient id/i)).toHaveValue(activeWorkflow.patientId);
    await expect(page.getByLabel(/practitioner id/i)).toHaveValue('DR-ACTIVE');

    await page.locator('form').getByRole('button', { name: /^Book Appointment$/ }).click();
    await expect(page.getByText(/appointment booked successfully/i)).toBeVisible({ timeout: 8000 });

    expect(bookingPayload).toEqual({
      slotId: 'slot-active-1',
      patientId: activeWorkflow.patientId,
      practitionerId: 'DR-ACTIVE',
    });

    await expect
      .poll(() => page.evaluate(() => window.sessionStorage.getItem('hq:active-workflow-id')))
      .toBe(null);

    const storedState = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('hq:workflow-handoffs');
      return raw ? JSON.parse(raw) as Array<Record<string, unknown>> : [];
    });
    const bookedWorkflow = storedState.find((record) => record.workflowId === 'wf-active-1');
    const untouchedWorkflow = storedState.find((record) => record.workflowId === 'wf-newer-2');

    expect(bookedWorkflow).toMatchObject({
      workflowId: activeWorkflow.workflowId,
      patientId: activeWorkflow.patientId,
      practitionerId: 'DR-ACTIVE',
      slotId: 'slot-active-1',
      status: 'Booked',
    });
    expect(untouchedWorkflow).toMatchObject({
      workflowId: newerWorkflow.workflowId,
      patientId: newerWorkflow.patientId,
      status: newerWorkflow.status,
    });
  });
});