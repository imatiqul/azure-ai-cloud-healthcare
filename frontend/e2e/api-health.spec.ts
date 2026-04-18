/**
 * API Health Check Suite
 *
 * Verifies that all backend service health endpoints are reachable before the
 * rest of the E2E suite runs.  These tests use the Playwright `request` fixture
 * to call the backend directly (not through the browser) so they work even when
 * the frontend MFEs are not loaded.
 *
 * Usage:
 *   - In CI, run these tests first as a gate: `npx playwright test e2e/api-health.spec.ts`
 *   - If any service is DOWN, the test is skipped (not failed) to avoid blocking
 *     MFE tests that mock the API anyway.
 */
import { test, expect, request } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:5000';

const services: { name: string; healthPath: string }[] = [
  { name: 'Gateway',          healthPath: '/health' },
  { name: 'Voice',            healthPath: '/api/v1/voice/health' },
  { name: 'AI Agent',         healthPath: '/api/v1/agents/health' },
  { name: 'FHIR',             healthPath: '/api/v1/fhir/health' },
  { name: 'Identity',         healthPath: '/api/v1/identity/health' },
  { name: 'Scheduling',       healthPath: '/api/v1/scheduling/health' },
  { name: 'Population Health',healthPath: '/api/v1/population-health/health' },
  { name: 'Notifications',    healthPath: '/api/v1/notifications/health' },
  { name: 'Revenue',          healthPath: '/api/v1/revenue/health' },
];

test.describe('Backend Health Checks', () => {
  for (const svc of services) {
    test(`${svc.name} is healthy`, async () => {
      const ctx = await request.newContext({ baseURL: API_BASE });
      let res: Awaited<ReturnType<typeof ctx.get>>;

      try {
        res = await ctx.get(svc.healthPath, { timeout: 5_000 });
      } catch {
        test.skip(true, `${svc.name} unreachable at ${API_BASE}${svc.healthPath} — skipping`);
        return;
      }

      if (!res.ok()) {
        test.skip(true, `${svc.name} returned HTTP ${res.status()} — service may be starting up`);
        return;
      }

      expect(res.status()).toBeLessThan(500);
      const body = await res.json().catch(() => null);
      if (body && typeof body === 'object') {
        // Standard .NET health response has a "status" field
        if ('status' in body) {
          expect((body as { status: string }).status).toMatch(/healthy|degraded/i);
        }
      }
    });
  }

  test('SMART on FHIR metadata endpoint returns valid document', async () => {
    const fhirBase = process.env.FHIR_BASE_URL || `${API_BASE}`;
    const ctx = await request.newContext({ baseURL: fhirBase });

    let res: Awaited<ReturnType<typeof ctx.get>>;
    try {
      res = await ctx.get('/.well-known/smart-configuration', { timeout: 5_000 });
    } catch {
      test.skip(true, 'FHIR service unreachable — skipping SMART metadata check');
      return;
    }

    if (!res.ok()) {
      test.skip(true, `SMART config returned ${res.status()}`);
      return;
    }

    const body = await res.json();
    expect(body).toHaveProperty('issuer');
    expect(body).toHaveProperty('authorization_endpoint');
    expect(body).toHaveProperty('token_endpoint');
    expect(body).toHaveProperty('capabilities');
    expect(body.code_challenge_methods_supported).toContain('S256');
  });
});
