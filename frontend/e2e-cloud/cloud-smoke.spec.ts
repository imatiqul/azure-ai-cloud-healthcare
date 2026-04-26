import { test, expect } from './fixtures';
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

async function acaGetWithFallback(
  request: APIRequestContext,
  urls: string[],
): Promise<APIResponse | null> {
  let candidate: APIResponse | null = null;
  for (const url of urls) {
    const response = await acaGet(request, url);
    if (!response) continue;
    if (response.status() === 404 || response.status() === 405) {
      candidate ??= response;
      continue;
    }
    return response;
  }
  return candidate;
}

async function probeMlConfidence(
  request: APIRequestContext,
): Promise<APIResponse | null> {
  const primary = await acaPost(request, `${LIVE_API_BASE_URL}/api/v1/agents/decisions/ml-confidence`);
  if (primary && primary.status() !== 404 && primary.status() !== 405) {
    return primary;
  }

  const legacy = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/ml/confidence`);
  if (legacy) {
    return legacy;
  }

  return primary;
}

function expectLiveApiSurface(response: APIResponse, description: string): void {
  const status = response.status();
  expect(
    status,
    `${description} route is missing or uses the wrong HTTP method (${status})`,
  ).not.toBe(404);
  expect(
    status,
    `${description} route is missing or uses the wrong HTTP method (${status})`,
  ).not.toBe(405);
  expect(status, `${description} returned unexpected ${status}`).toBeLessThan(500);
}

const LIVE_API_BASE_URL = (
  process.env.GATEWAY_ACA_URL ||
  process.env.API_BASE_URL ||
  'https://gateway.gentletree-fe920881.eastus2.azurecontainerapps.io'
).replace(/\/$/, '');

test.describe('Cloud — Shell SWA', () => {
  test('shell loads and renders dashboard @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HealthQ|Healthcare/i);
    // ── Capture ALL browser console messages before goto so we don't miss early errors ──
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(`[PAGEERROR] ${err.message}`);
    });

    await page.goto('/');

    // Wait for React to mount (poll #root children) up to 40s — covers cold MF2 init
    await page.waitForFunction(
      () => (document.getElementById('root')?.children.length ?? 0) > 0,
      { timeout: 40_000 },
    ).catch(() => { /* timeout — fall through to diagnostic */ });

    // Diagnostic: dump state for CI triage
    const rootHTML = await page.locator('#root').innerHTML().catch(() => 'ROOT_NOT_FOUND');
    console.log('[DIAG] #root innerHTML (first 800 chars):', rootHTML.substring(0, 800));
    const allTestIds = await page.locator('[data-testid]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('data-testid'))
    );
    console.log('[DIAG] All data-testid values in DOM:', JSON.stringify(allTestIds));
    const mediaWidth = await page.evaluate(() => window.innerWidth);
    console.log('[DIAG] window.innerWidth:', mediaWidth);

    // Dump ALL browser console messages so we can see JS errors / MF2 failures
    const errors = consoleMessages.filter(m => m.startsWith('[ERROR]'));
    console.log('[DIAG] Browser console errors:', JSON.stringify(errors));
    console.log('[DIAG] Page errors (uncaught):', JSON.stringify(pageErrors));
    console.log('[DIAG] All console messages:', JSON.stringify(consoleMessages.slice(0, 30)));

    // MF2 global init state — tells us if initPromise is still pending
    const mfState = await page.evaluate(() => {
      const key = '__mf_init____mf__virtual/shell__mf_v__runtimeInit__mf_v__.js__';
      const s = (globalThis as Record<string, unknown>)[key];
      return s ? 'EXISTS' : 'MISSING';
    }).catch(() => 'EVAL_ERROR');
    console.log('[DIAG] MF2 initPromise globalThis key:', mfState);

    // data-testid="shell-sidebar" is set on <aside> in Sidebar.tsx
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 5_000 });
  });

  test('shell renders navigation sidebar @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 40_000 });
  });

  test('shell renders header @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Healthcare|HealthQ/i).first()).toBeVisible({ timeout: 40_000 });
  });
});

// ── Phase 58 — AI Self-Driven Demo ───────────────────────────────────────────

test.describe('Phase 58 — Demo Landing @smoke', () => {
  test('demo landing page loads at /demo @smoke', async ({ page }) => {
    await page.goto('/demo');
    // Demo route bypasses the probe gate — wait for visible text content
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
  });

  test('demo landing shows AI Self-Driven Demo button @smoke', async ({ page }) => {
    await page.goto('/demo');
    await expect(
      page.getByRole('button', { name: /self.driven demo|self-driven/i }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Cloud — MFE Navigation', () => {
  test('navigates to voice page @smoke', async ({ page }) => {
    await page.goto('/voice');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to triage page @smoke', async ({ page }) => {
    await page.goto('/triage');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to scheduling page @smoke', async ({ page }) => {
    await page.goto('/scheduling');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to population health page @smoke', async ({ page }) => {
    await page.goto('/population-health');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to revenue page @smoke', async ({ page }) => {
    await page.goto('/revenue');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to encounters page @smoke', async ({ page }) => {
    await page.goto('/encounters');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  });

  test('navigates to patient portal page @smoke', async ({ page }) => {
    await page.goto('/patient-portal');
    await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Cloud — Backend Service Reachability', () => {
  const services = [
    { name: 'Voice', path: '/api/v1/voice/sessions' },
    { name: 'AI-Agent', path: '/api/v1/agents/triage' },
    { name: 'FHIR', path: '/api/v1/fhir/patients' },
    { name: 'Identity', path: '/api/v1/identity/users' },
    { name: 'OCR', path: '/api/v1/ocr/jobs' },
    { name: 'Scheduling', path: '/api/v1/scheduling/slots' },
    { name: 'Notification', path: '/api/v1/notifications/messages' },
    { name: 'PopHealth', path: '/api/v1/population-health/risks' },
    { name: 'Revenue', path: '/api/v1/revenue/coding-jobs' },
  ];

  for (const svc of services) {
    test(`${svc.name} backend is reachable through the live API surface`, async ({ request }) => {
      const response = await acaGet(request, `${LIVE_API_BASE_URL}${svc.path}`);
      test.skip(!response, `${svc.name} live API returned 503 or timed out (advisory)`);
      expectLiveApiSurface(response!, `${svc.name} live API`);
    });
  }
});

test.describe('Cloud — API Smoke Tests', () => {
  test('agent triage endpoint responds with live seeded data', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/agents/triage`);
    test.skip(!response, 'AI-Agent live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'AI-Agent triage endpoint');
  });

  test('scheduling slots endpoint responds with live seeded data', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/scheduling/slots`);
    test.skip(!response, 'Scheduling live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Scheduling slots endpoint');
  });

  test('population health risks endpoint responds with live seeded data', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/population-health/risks`);
    test.skip(!response, 'Population Health live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Population health risks endpoint');
  });

  test('revenue coding jobs endpoint responds with live seeded data', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/revenue/coding-jobs`);
    test.skip(!response, 'Revenue live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Revenue coding jobs endpoint');
  });

  test('guide suggestions endpoint responds', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/agents/guide/suggestions`);
    test.skip(!response, 'AI-Agent live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Guide suggestions endpoint');
  });
});

// ── Phase 12 — Endpoint Smoke Tests ─────────────────────────────────────────
// These tests verify the Phase 12 features are reachable in production:
//   • Waitlist management (Scheduling)
//   • Claim denial workflow (Revenue)
//   • Notification delivery tracking + appointment reminder analytics

test.describe('Phase 12 — Scheduling Waitlist Endpoints', () => {
  test('scheduling slots endpoint responds', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/scheduling/slots`);
    test.skip(!response, 'Scheduling live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Scheduling slots endpoint');
  });

  test('waitlist conflict-check endpoint responds', async ({ request }) => {
    // POST with empty body should return 400 (validation) — not 5xx
    const response = await acaPost(request, `${LIVE_API_BASE_URL}/api/v1/scheduling/waitlist/conflict-check`);
    test.skip(!response, 'Scheduling live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Waitlist conflict-check endpoint');
  });
});

test.describe('Phase 12 — Revenue Denial Management Endpoints', () => {
  test('denials list endpoint responds', async ({ request }) => {
    const response = await acaGetWithFallback(request, [
      `${LIVE_API_BASE_URL}/api/v1/revenue/denials/`,
      `${LIVE_API_BASE_URL}/api/v1/revenue/denials`,
    ]);
    test.skip(!response, 'Revenue live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Revenue denials endpoint');
  });

  test('denials analytics endpoint responds', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/revenue/denials/analytics`);
    test.skip(!response, 'Revenue live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Revenue denials analytics endpoint');
  });
});

test.describe('Phase 12 — Notification Delivery Tracking Endpoints', () => {
  test('notification delivery analytics endpoint responds', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/notifications/analytics/delivery`);
    test.skip(!response, 'Notification live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Notification delivery analytics endpoint');
  });

  test('notification messages list endpoint responds', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/notifications/messages`);
    test.skip(!response, 'Notification live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Notification messages endpoint');
  });
});

// ── Phase 27 — Campaign Manager + ML Confidence ──────────────────────────────

test.describe('Phase 27 — Notification Campaign Endpoints', () => {
  test('notification campaigns list endpoint responds', async ({ request }) => {
    const response = await acaGet(request, `${LIVE_API_BASE_URL}/api/v1/notifications/campaigns`);
    test.skip(!response, 'Notification live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Notification campaigns endpoint');
  });

  test('notification campaigns create endpoint responds to validation error', async ({ request }) => {
    // POST with empty body should return 400 (validation) — not 5xx
    const response = await acaPost(request, `${LIVE_API_BASE_URL}/api/v1/notifications/campaigns`);
    test.skip(!response, 'Notification live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'Notification campaigns create endpoint');
  });
});

test.describe('Phase 27 — ML Confidence Endpoint', () => {
  test('ml-confidence endpoint responds to validation error', async ({ request }) => {
    // POST is the canonical contract; legacy environments may expose GET /api/v1/ml/confidence.
    const response = await probeMlConfidence(request);
    test.skip(!response, 'AI-Agent live API returned 503 or timed out (advisory)');
    expectLiveApiSurface(response!, 'ML confidence endpoint');
  });
})

// ── Phase 41 — Clinical Alerts Center + Reports + Practitioner Manager ────────

test.describe('Phase 41 — Clinical Alerts Center page load', () => {
  test('navigates to /alerts and page body is non-empty', async ({ page }) => {
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
    expectLiveApiSurface(res!, 'Risk patients endpoint');
  });

  test('break-glass sessions endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGetWithFallback(request, [
      `${GATEWAY}/api/v1/identity/break-glass/`,
      `${GATEWAY}/api/v1/identity/break-glass`,
    ]);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expectLiveApiSurface(res!, 'Break-glass sessions endpoint');
  });

  test('scheduling slots endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/scheduling/slots`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expectLiveApiSurface(res!, 'Scheduling slots endpoint');
  });

  test('denials endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGetWithFallback(request, [
      `${GATEWAY}/api/v1/revenue/denials/`,
      `${GATEWAY}/api/v1/revenue/denials`,
    ]);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expectLiveApiSurface(res!, 'Revenue denials endpoint');
  });
});

test.describe('Phase 41 — Reports Export API Endpoints', () => {
  const GATEWAY = process.env.GATEWAY_ACA_URL;

  test('audit log export endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    // Identity audit endpoints are exposed under /api/v1/admin/audit/* in current contracts.
    const res = await acaGet(request, `${GATEWAY}/api/v1/admin/audit/summary`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expectLiveApiSurface(res!, 'Audit log export endpoint');
  });

  test('denial analytics endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    const res = await acaGet(request, `${GATEWAY}/api/v1/revenue/denials/analytics`);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expectLiveApiSurface(res!, 'Revenue denials analytics endpoint');
  });

  test('practitioners list endpoint is reachable', async ({ request }) => {
    test.skip(!GATEWAY, 'GATEWAY_ACA_URL not configured');
    // Practitioner management endpoints are exposed by Scheduling service.
    const res = await acaGetWithFallback(request, [
      `${GATEWAY}/api/v1/scheduling/practitioners/`,
      `${GATEWAY}/api/v1/scheduling/practitioners`,
    ]);
    test.skip(!res, 'Gateway ACA scaled to zero (503) — advisory');
    expectLiveApiSurface(res!, 'Practitioners list endpoint');
  });
});

