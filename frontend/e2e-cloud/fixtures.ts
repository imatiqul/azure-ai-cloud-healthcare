/**
 * Shared test fixtures for cloud E2E tests.
 *
 * The startup probe in App.tsx calls `/api/v1/agents/stats` and blocks all
 * rendering until it resolves (up to 3 s).  In cloud tests we pre-stub that
 * endpoint so the probe resolves immediately with a 404, setting
 * `backendOnline = false` in the Zustand store within milliseconds.
 *
 * Returning 404 (not 200) is intentional:
 *  - `backendOnline = false` causes every guarded component to render demo
 *    data immediately — no real APIM calls, no CORS errors in the console.
 *  - The 3-second safety fallback timer is cancelled the instant the stubbed
 *    404 response arrives, so the shell renders without any wait.
 *  - Individual tests that need live API responses can stub `**/api/v1/**`
 *    inside their own `page.route()` or `beforeEach`; those routes take
 *    priority over this fixture because Playwright processes routes in
 *    reverse-registration order (last registered = first matched).
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *   // use exactly as you would from '@playwright/test'
 */

import { test as base, expect } from '@playwright/test';

export const test = base.extend<object>({
  // Override the default `page` fixture to pre-stub the startup probe.
  page: async ({ page }, use) => {
    // Returning 404 → startupProbe() sets backendOnline = false instantly.
    // All guarded components then use demo data and make zero APIM calls.
    await page.route('**/api/v1/agents/stats', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'backend not deployed' }),
      }),
    );
    await use(page);
  },
});

export { expect };
