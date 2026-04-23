/**
 * Shared test fixtures for cloud E2E tests.
 *
 * The startup probe in App.tsx calls `/api/v1/agents/stats` and blocks all
 * rendering until it resolves (up to 3 s).  In cloud tests we pre-stub that
 * endpoint so the probe resolves immediately with a 200, setting
 * `backendOnline = true` in the Zustand store.  This lets every test load the
 * real SWA and interact with a fully-rendered UI within the first 1–2 s of
 * navigation.  Individual tests can still stub their own API routes in
 * `beforeEach` / `page.route()` — those stubs win because they are registered
 * after the fixture stub.
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *   // use exactly as you would from '@playwright/test'
 */

import { test as base, expect } from '@playwright/test';

const PROBE_RESPONSE = {
  pendingTriage:   0,
  awaitingReview:  0,
  completed:       0,
  online:          true,
};

export const test = base.extend<object>({
  // Override the default `page` fixture to pre-stub the startup probe.
  page: async ({ page }, use) => {
    // Intercept the health-probe endpoint used by App.tsx so it resolves
    // immediately (200) instead of waiting for the real APIM (which returns
    // 404 because ACA back-ends are not deployed yet).
    await page.route('**/api/v1/agents/stats', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PROBE_RESPONSE),
      }),
    );
    await use(page);
  },
});

export { expect };
