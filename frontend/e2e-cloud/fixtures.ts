/**
 * Shared test fixtures for cloud E2E tests.
 *
 * Two-layer probe stub:
 *
 * 1. addInitScript — patches window.fetch BEFORE any page script runs.
 *    When App.tsx useEffect fires and calls fetch(APIM_URL + /api/v1/agents/stats),
 *    the patched fetch returns a 404 Response immediately (synchronously resolved
 *    Promise). This means:
 *      - backendOnline = false is set in <10 ms (no 3-second fallback wait)
 *      - React StrictMode double-invoke is harmless (both calls resolve instantly)
 *      - The full shell UI renders before page.goto() even returns
 *
 * 2. page.route — network-level interception as belt-and-suspenders in case
 *    the fetch patch is bypassed (e.g. native XHR or a future refactor).
 *
 * Result: every test sees a fully-rendered shell (backendOnline=false, demo data)
 * with real text content in the DOM, so body.not.toBeEmpty() always passes.
 */

import { test as base, expect } from '@playwright/test';

export const test = base.extend<object>({
  page: async ({ page }, use) => {
    // Layer 1: patch window.fetch inside the page context before any scripts run.
    // The probe URL is an absolute APIM URL, so we match on the path suffix.
    await page.addInitScript(() => {
      const _fetch = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/api/v1/agents/stats')) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'backend not deployed - test stub' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            }),
          );
        }
        return _fetch(input, init);
      };
    });

    // Layer 2: network-level interception as fallback.
    await page.route('**/api/v1/agents/stats', (route) =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'backend not deployed - network stub' }),
      }),
    );

    await use(page);
  },
});

export { expect };

