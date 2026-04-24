import { test, expect } from './fixtures';

const SIDEBAR_GROUPS_ALL_OPEN = JSON.stringify({
  'nav.group.main': true,
  'nav.group.business': true,
  'nav.group.clinical': true,
  'nav.group.analytics': true,
  'nav.group.patient': true,
  'nav.group.governance': true,
  'nav.group.admin': true,
});

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

async function seedWorkflowStorage(page: import('@playwright/test').Page, handoffs: Array<Record<string, unknown>>, activeWorkflowId: string) {
  await page.addInitScript(({ groups, workflowState, activeId }) => {
    localStorage.setItem('hq:onboarded-v38', 'done');
    localStorage.setItem('hq:sidebar-groups', groups);
    sessionStorage.setItem('hq:workflow-handoffs', JSON.stringify(workflowState));
    sessionStorage.setItem('hq:active-workflow-id', activeId);
  }, {
    groups: SIDEBAR_GROUPS_ALL_OPEN,
    workflowState: handoffs,
    activeId: activeWorkflowId,
  });
}

async function stubWorkflowApis(
  page: import('@playwright/test').Page,
  options?: { emptySlots?: boolean; waitlistPractitionerId?: string },
) {
  const emptySlots = options?.emptySlots ?? false;
  const waitlistPractitionerId = options?.waitlistPractitionerId ?? 'DR-WAIT';

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/api/v1/agents/stats')) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'stubbed backend offline for workflow handoff cloud test' }),
      });
      return;
    }

    if (/\/api\/v1\/agents\/triage\/[^/]+\/approve/i.test(url) && method === 'POST') {
      const match = url.match(/\/triage\/([^/]+)\/approve/i);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: match?.[1] ?? activeWorkflow.workflowId, status: 'Approved' }),
      });
      return;
    }

    if (/\/api\/v1\/agents\/triage(?:\?|$)/i.test(url)) {
      await route.fulfill({
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
      });
      return;
    }

    if (/\/api\/v1\/scheduling\/slots(?:\?|$)/i.test(url)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          emptySlots
            ? []
            : [
                {
                  id: 'slot-active-1',
                  practitionerId: 'DR-ACTIVE',
                  startTime: '2026-04-16T09:00:00.000Z',
                  endTime: '2026-04-16T09:30:00.000Z',
                  status: 'Available',
                  aiRecommended: true,
                },
              ],
        ),
      });
      return;
    }

    if (/\/api\/v1\/scheduling\/slots\/slot-active-1\/reserve/i.test(url) && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'slot-active-1', status: 'Reserved' }),
      });
      return;
    }

    if (/\/api\/v1\/scheduling\/bookings(?:\?|$)/i.test(url)) {
      if (method === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'booking-active-1',
            status: 'confirmed',
            patientId: body.patientId,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (/\/api\/v1\/scheduling\/waitlist(?:\?|$)/i.test(url)) {
      if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'wait-1',
            patientId: activeWorkflow.patientId,
            practitionerId: waitlistPractitionerId,
            priority: 2,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: `stubbed offline response for ${url}` }),
    });
  });
}

test.describe('Workflow Handoff — Cloud @regression', () => {
  test('approval, scheduling, and booking stay attached to the active workflow', async ({ page }) => {
    let approvedWorkflowId: string | null = null;
    let bookingPayload: Record<string, unknown> | null = null;

    await seedWorkflowStorage(page, [newerWorkflow, activeWorkflow], activeWorkflow.workflowId);
    await stubWorkflowApis(page);

    await page.route('**/api/v1/agents/triage/**/approve', async (route) => {
      approvedWorkflowId = route.request().url().match(/\/triage\/([^/]+)\/approve/i)?.[1] ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: approvedWorkflowId, status: 'Approved' }),
      });
    });

    await page.route('**/api/v1/scheduling/bookings', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
        return;
      }

      bookingPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'booking-active-1', status: 'confirmed' }),
      });
    });

    await page.goto('/triage');
    await expect(page.getByText(activeWorkflow.patientName, { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /review.*approve/i }).click();
    await page.getByLabel(/clinical justification note/i).fill('Escalation reviewed and approved for scheduling.');
    await page.getByRole('button', { name: /approve.*continue/i }).click();

    await expect(page).toHaveURL(/\/scheduling$/);
    await expect(page.getByText(`Scheduling appointment for ${activeWorkflow.patientName}.`)).toBeVisible({ timeout: 20_000 });
    expect(approvedWorkflowId).toBe(activeWorkflow.workflowId);

    await page.getByRole('button', { name: /reserve slot slot-active-1/i }).click();
    await expect(page.getByLabel(/slot id/i)).toHaveValue('slot-active-1');
    await expect(page.getByLabel(/patient id/i)).toHaveValue(activeWorkflow.patientId);
    await expect(page.getByLabel(/practitioner id/i)).toHaveValue('DR-ACTIVE');

    await page.locator('form').getByRole('button', { name: /^Book Appointment$/ }).click();
    await expect(page.getByText(/appointment booked successfully/i)).toBeVisible({ timeout: 20_000 });

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
    const bookedWorkflow = storedState.find((record) => record.workflowId === activeWorkflow.workflowId);
    const untouchedWorkflow = storedState.find((record) => record.workflowId === newerWorkflow.workflowId);

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

  test('waitlist fallback opens with the active workflow prefilled', async ({ page }) => {
    await seedWorkflowStorage(page, [
      newerWorkflow,
      {
        ...activeWorkflow,
        status: 'Scheduling',
        practitionerId: 'DR-WAIT',
      },
    ], activeWorkflow.workflowId);
    await stubWorkflowApis(page, { emptySlots: true, waitlistPractitionerId: 'DR-WAIT' });

    await page.goto('/scheduling');
    await expect(page.getByText(`Scheduling appointment for ${activeWorkflow.patientName}.`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/no available slots for this date/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /open waitlist/i }).click();

    await expect(page.getByRole('heading', { name: 'Add to Waitlist' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(/patient id/i)).toHaveValue(activeWorkflow.patientId, { timeout: 20_000 });
    await expect(page.getByLabel(/practitioner id/i)).toHaveValue('DR-WAIT', { timeout: 20_000 });
    await expect(page.getByText(`Continuing scheduling fallback for ${activeWorkflow.patientName}.`)).toBeVisible({ timeout: 20_000 });
  });
});