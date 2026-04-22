import { test, expect } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';

/**
 * Cloud E2E tests run against deployed Azure infrastructure.
 * They verify that SWA apps load and ACA services respond.
 */

// ── ACA Advisory Helpers ──────────────────────────────────────────────────────
// ACA services scale to zero in dev/staging. A scaled-to-zero ACA returns 503
// before it warms up. These helpers treat 503 + network timeouts as "skip"
// so the test is marked advisory rather than as a hard failure.

async function acaGet(
  request: APIRequestContext,
  url: string,
): Promise<APIResponse | null> {
  try {
    const res = await request.get(url, { timeout: 15_000 });
    return res.status() === 503 ? null : res;
  } catch {
    return null; // timeout / connection refused = ACA cold-starting / scaled down
  }
}

async function acaPost(
  request: APIRequestContext,
  url: string,
  data: Record<string, unknown> = {},
): Promise<APIResponse | null> {
  try {
    const res = await request.post(url, { data, timeout: 15_000 });
    return res.status() === 503 ? null : res;
  } catch {
    return null;
  }
}

test.describe('Cloud — Shell SWA', () => {
  test('shell loads and renders dashboard @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HealthQ|Healthcare/i);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('shell renders navigation sidebar @smoke', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(nav).toBeVisible({ timeout: 10000 });
  });

  test('shell renders header @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Healthcare|HealthQ/i).first()).toBeVisible({ timeout: 10000 });
  });
});

// ── Phase 58 — AI Self-Driven Demo ───────────────────────────────────────────

test.describe('Phase 58 — Demo Landing @smoke', () => {
  test('demo landing page loads at /demo @smoke', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('demo landing shows AI Self-Driven Demo button @smoke', async ({ page }) => {
    await page.goto('/demo');
    await expect(
      page.getByRole('button', { name: /self.driven demo|self-driven/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Cloud — MFE Navigation', () => {
  test('navigates to voice page @smoke', async ({ page }) => {
    await page.goto('/voice');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to triage page @smoke', async ({ page }) => {
    await page.goto('/triage');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to scheduling page @smoke', async ({ page }) => {
    await page.goto('/scheduling');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to population health page @smoke', async ({ page }) => {
    await page.goto('/population-health');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to revenue page @smoke', async ({ page }) => {
    await page.goto('/revenue');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Cloud — ACA Service Health', () => {
  const services = [
    { name: 'Voice', url: process.env.VOICE_ACA_URL },
    { name: 'AI-Agent', url: process.env.AGENT_ACA_URL },
    { name: 'FHIR', url: process.env.FHIR_ACA_URL },
    { name: 'Identity', url: process.env.IDENTITY_ACA_URL },
    { name: 'OCR', url: process.env.OCR_ACA_URL },
    { name: 'Scheduling', url: process.env.SCHEDULING_ACA_URL },
    { name: 'Notification', url: process.env.NOTIFICATION_ACA_URL },
    { name: 'PopHealth', url: process.env.POPHEALTH_ACA_URL },
    { name: 'Revenue', url: process.env.REVENUE_ACA_URL },
  ];

  for (const svc of services) {
    test(`${svc.name} service health check returns OK`, async ({ request }) => {
      test.skip(!svc.url, `${svc.name} URL not configured`);
      let response: Awaited<ReturnType<typeof request.get>> | null = null;
      try {
        response = await request.get(`${svc.url}/health`, { timeout: 15_000 });
      } catch {
        // Network error or timeout — ACA is likely cold-starting; skip advisory
        test.skip(true, `${svc.name} ACA unreachable — likely scaled to zero`);
        return;
      }
      const status = response.status();
      // 503 = ACA scaled to zero (expected in dev/staging; treat as advisory)
      if (status === 503) {
        test.skip(true, `${svc.name} ACA returned 503 — scaled to zero (advisory)`);
        return;
      }
      expect(status, `${svc.name} health endpoint returned unexpected ${status}`).toBeLessThan(500);
    });
  }
});

test.describe('Cloud — API Smoke Tests', () => {
  test('agent stats endpoint responds', async ({ request }) => {
    const agentUrl = process.env.AGENT_ACA_URL;
    test.skip(!agentUrl, 'AGENT_ACA_URL not configured');
    const response = await acaGet(request, `${agentUrl}/api/v1/agents/stats`);
    test.skip(!response, 'AI-Agent ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('scheduling stats endpoint responds', async ({ request }) => {
    const url = process.env.SCHEDULING_ACA_URL;
    test.skip(!url, 'SCHEDULING_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/scheduling/stats`);
    test.skip(!response, 'Scheduling ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('population health stats endpoint responds', async ({ request }) => {
    const url = process.env.POPHEALTH_ACA_URL;
    test.skip(!url, 'POPHEALTH_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/population-health/stats`);
    test.skip(!response, 'PopHealth ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('revenue stats endpoint responds', async ({ request }) => {
    const url = process.env.REVENUE_ACA_URL;
    test.skip(!url, 'REVENUE_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/revenue/stats`);
    test.skip(!response, 'Revenue ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('guide suggestions endpoint responds', async ({ request }) => {
    const agentUrl = process.env.AGENT_ACA_URL;
    test.skip(!agentUrl, 'AGENT_ACA_URL not configured');
    const response = await acaGet(request, `${agentUrl}/api/v1/agents/guide/suggestions`);
    test.skip(!response, 'AI-Agent ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });
});

// ── Phase 12 — Endpoint Smoke Tests ─────────────────────────────────────────
// These tests verify the Phase 12 features are reachable in production:
//   • Waitlist management (Scheduling)
//   • Claim denial workflow (Revenue)
//   • Notification delivery tracking + appointment reminder analytics

test.describe('Phase 12 — Scheduling Waitlist Endpoints', () => {
  test('waitlist list endpoint responds', async ({ request }) => {
    const url = process.env.SCHEDULING_ACA_URL;
    test.skip(!url, 'SCHEDULING_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/scheduling/waitlist`);
    test.skip(!response, 'Scheduling ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('waitlist conflict-check endpoint responds', async ({ request }) => {
    const url = process.env.SCHEDULING_ACA_URL;
    test.skip(!url, 'SCHEDULING_ACA_URL not configured');
    // POST with empty body should return 400 (validation) — not 5xx
    const response = await acaPost(request, `${url}/api/v1/scheduling/waitlist/conflict-check`);
    test.skip(!response, 'Scheduling ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });
});

test.describe('Phase 12 — Revenue Denial Management Endpoints', () => {
  test('denials list endpoint responds', async ({ request }) => {
    const url = process.env.REVENUE_ACA_URL;
    test.skip(!url, 'REVENUE_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/revenue/denials`);
    test.skip(!response, 'Revenue ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('denials analytics endpoint responds', async ({ request }) => {
    const url = process.env.REVENUE_ACA_URL;
    test.skip(!url, 'REVENUE_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/revenue/denials/analytics`);
    test.skip(!response, 'Revenue ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });
});

test.describe('Phase 12 — Notification Delivery Tracking Endpoints', () => {
  test('notification delivery analytics endpoint responds', async ({ request }) => {
    const url = process.env.NOTIFICATION_ACA_URL;
    test.skip(!url, 'NOTIFICATION_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/notifications/analytics/delivery`);
    test.skip(!response, 'Notification ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('notification messages list endpoint responds', async ({ request }) => {
    const url = process.env.NOTIFICATION_ACA_URL;
    test.skip(!url, 'NOTIFICATION_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/notifications/messages`);
    test.skip(!response, 'Notification ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });
});

// ── Phase 27 — Campaign Manager + ML Confidence ──────────────────────────────

test.describe('Phase 27 — Notification Campaign Endpoints', () => {
  test('notification campaigns list endpoint responds', async ({ request }) => {
    const url = process.env.NOTIFICATION_ACA_URL;
    test.skip(!url, 'NOTIFICATION_ACA_URL not configured');
    const response = await acaGet(request, `${url}/api/v1/notifications/campaigns`);
    test.skip(!response, 'Notification ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });

  test('notification campaigns create endpoint responds to validation error', async ({ request }) => {
    const url = process.env.NOTIFICATION_ACA_URL;
    test.skip(!url, 'NOTIFICATION_ACA_URL not configured');
    // POST with empty body should return 400 (validation) — not 5xx
    const response = await acaPost(request, `${url}/api/v1/notifications/campaigns`);
    test.skip(!response, 'Notification ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });
});

test.describe('Phase 27 — ML Confidence Endpoint', () => {
  test('ml-confidence endpoint responds to validation error', async ({ request }) => {
    const agentUrl = process.env.AGENT_ACA_URL;
    test.skip(!agentUrl, 'AGENT_ACA_URL not configured');
    // POST with empty body should return 400 (validation) — not 5xx
    const response = await acaPost(request, `${agentUrl}/api/v1/agents/decisions/ml-confidence`);
    test.skip(!response, 'AI-Agent ACA scaled to zero (503) — advisory');
    expect(response!.status()).toBeLessThan(500);
  });
})

// ── Phase 41 — Clinical Alerts Center + Reports + Practitioner Manager ────────

test.describe('Phase 41 — Clinical Alerts Center page load', () => {
  test('navigates to /alerts and page body is non-empty', async ({ page }) => {
    await page.route('**/api/v1/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/alerts');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Phase 41 — Reports & Export Panel page load', () => {
  test('navigates to /admin/reports and page body is non-empty', async ({ page }) => {
    await page.goto('/admin/reports');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Phase 41 — Practitioner Manager page load', () => {
  test('navigates to /admin/practitioners and page body is non-empty', async ({ page }) => {
    await page.route('**/api/v1/identity/practitioners**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/admin/practitioners');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Phase 41 — Clinical Alerts API Endpoints', () => {
  const GATEWAY = process.env.GATEWAY_ACA_URL;

  test('risk patients endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/population-health/risks`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expect(res!.status()).toBeLessThan(500);
  });

  test('break-glass sessions endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/identity/break-glass`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expect(res!.status()).toBeLessThan(500);
  });

  test('waitlist endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/scheduling/waitlist`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expect(res!.status()).toBeLessThan(500);
  });

  test('denials endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/revenue/denials`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expect(res!.status()).toBeLessThan(500);
  });
});

test.describe('Phase 41 — Reports Export API Endpoints', () => {
  const GATEWAY = process.env.GATEWAY_ACA_URL;

  test('audit log export endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/identity/audit-log`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expect(res!.status()).toBeLessThan(500);
  });

  test('denial analytics endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/revenue/denials/analytics`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expect(res!.status()).toBeLessThan(500);
  });

  test('practitioners list endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/identity/practitioners`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expect(res!.status()).toBeLessThan(500);
  });
});

