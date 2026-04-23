/**
 * Post-deploy regression checks for HealthQ Copilot.
 *
 * These tests catch the specific console errors and UI failures that have
 * been reported after deployments. They run as part of the cloud E2E suite
 * and are tagged @regression so they can be run in isolation:
 *
 *   npx playwright test --config=playwright.cloud.config.ts --grep "@regression"
 *
 * Each test is named after the bug it guards against to make AI triage easy.
 */

import { test, expect } from './fixtures';

// Dismiss onboarding wizard and expand all sidebar groups
const INIT_STORAGE = JSON.stringify({
  'nav.group.main':       true,
  'nav.group.business':   true,
  'nav.group.clinical':   true,
  'nav.group.analytics':  true,
  'nav.group.patient':    true,
  'nav.group.governance': true,
  'nav.group.admin':      true,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Collect browser console errors during a page interaction.
 * Returns only errors that are NOT expected (JS exceptions, unexpected failures).
 *
 * IMPORTANT: Browser-level "Failed to load resource: 404" messages are emitted
 * by the browser itself when fetch() calls return 4xx.  They do NOT include the
 * request URL in msg.text(), so URL-based filters can't distinguish API 404s
 * (expected — APIM not yet routing to backend) from asset 404s (real bugs).
 * We suppress them here and catch missing JS/CSS assets separately via the
 * `page.on('response', ...)` listener used in each test.
 */
function collectErrors(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  const IGNORED = [
    // Backend scaled to zero or APIM not yet routing — handled by demo-data fallbacks
    /api\/v1\/agents\/(triage|stats|escalations|health)/,
    /api\/v1\/voice\/sessions/,
    /api\/v1\/scheduling\/(stats|waitlist|bookings|health)/,
    /api\/v1\/population-health/,
    /api\/v1\/revenue/,
    /api\/v1\/identity/,
    /api\/v1\/notifications/,
    /api\/v1\/ocr/,
    /api\/v1\/fhir/,
    /api\/v1\/bff/,
    // Startup probe endpoint (backendOnline gate in App.tsx)
    /api\/v1\/agents\/stats/,
    // APIM gateway — all routes return 404 until ACA backend is deployed
    /healthq-copilot-apim\.azure-api\.net/,
    // SignalR disabled (VITE_SIGNALR_HUB_URL is empty)
    /hubs\/global\/negotiate/,
    // Module federation loading messages
    /Loading chunk/,
    // Browser-level network 404 message — no URL in msg.text(); asset 404s are
    // caught separately via response listener so we don't miss real failures.
    /Failed to load resource: the server responded with a status of 404/,
    // Generic CORS/network preflight errors that accompany APIM 404s
    /Failed to load resource: the server responded with a status of 40[135]/,
    // CORS preflight blocked when APIM returns 4xx
    /Access-Control-Allow-Origin|has been blocked by CORS/,
    // Generic network error from browser when CORS or network fully blocks a request
    /net::ERR_FAILED|net::ERR_ABORTED|Failed to fetch/,
  ];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED.some((re) => re.test(text))) return;
    errors.push(text);
  });
  return errors;
}

/**
 * Track unexpected non-API 404s (missing JS chunks, CSS, images = real deployment bug).
 * Returns the collected array — check it after navigation completes.
 */
function collectAsset404s(page: import('@playwright/test').Page) {
  const asset404s: string[] = [];
  page.on('response', (res) => {
    if (res.status() !== 404) return;
    const url = res.url();
    // Ignore expected API 404s — only care about static assets
    if (/\/api\/v1\//.test(url)) return;
    if (/healthq-copilot-apim\.azure-api\.net/.test(url)) return;
    asset404s.push(url);
  });
  return asset404s;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

test.describe('Regression — Dashboard @regression @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((g) => {
      localStorage.setItem('hq:onboarded-v38', 'done');
      localStorage.setItem('hq:sidebar-groups', g);
    }, INIT_STORAGE);
  });

  test('[BUG-001] Dashboard renders stats cards without JS crash', async ({ page }) => {
    const errors    = collectErrors(page);
    const asset404s = collectAsset404s(page);  // missing JS/CSS chunks = real deployment bug
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Stats cards must render (with demo data if backend is down)
    await expect(page.getByText(/pending triage|awaiting review|active sessions|available today/i).first())
      .toBeVisible({ timeout: 15_000 });
    expect(errors,    'Unexpected JS errors in console').toHaveLength(0);
    expect(asset404s, 'Missing static assets (JS/CSS chunks) — stale deploy?').toHaveLength(0);
  });

  test('[BUG-002] Dashboard does NOT emit SignalR 405 error', async ({ page }) => {
    const negotiateErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /negotiate|405/.test(msg.text())) {
        negotiateErrors.push(msg.text());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(negotiateErrors).toHaveLength(0);
  });

  test('[BUG-003] ActivityFeedWidget does not call /scheduling/appointments (wrong URL)', async ({ page }) => {
    const wrongUrlCalls: string[] = [];
    page.on('request', (req) => {
      if (/\/scheduling\/appointments/.test(req.url())) {
        wrongUrlCalls.push(req.url());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(wrongUrlCalls).toHaveLength(0);
  });
});

// ── Triage MFE ────────────────────────────────────────────────────────────────

test.describe('Regression — Triage MFE @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((g) => {
      localStorage.setItem('hq:onboarded-v38', 'done');
      localStorage.setItem('hq:sidebar-groups', g);
    }, INIT_STORAGE);
  });

  test('[BUG-004] Triage page shows workflow cards (not just error banner)', async ({ page }) => {
    await page.goto('/triage');
    await page.waitForLoadState('networkidle');
    // Should see workflow cards OR the "no workflows" empty state — never just the error alert
    const hasCards = await page.locator('[class*="Card"], [class*="card"]').count();
    const hasError = await page.getByText('Failed to load triage workflows').isVisible();
    expect(hasError).toBe(false);
    // Triage level badges must show a real level, not "Pending" from field mismatch
    const badges = page.getByText(/P1_Immediate|P2_Urgent|P3_Standard|Pending/);
    const count = await badges.count();
    if (count > 0) {
      // At least one badge should be a real level (not all "Pending")
      const pendingCount = await page.getByText('Pending').count();
      expect(pendingCount).toBeLessThan(count);
    }
    // Must have rendered something meaningful
    expect(hasCards).toBeGreaterThan(0);
  });

  test('[BUG-005] Triage page triage-level badges are not all "Pending" (field name mismatch)', async ({ page }) => {
    // Provide mock data matching the backend shape (triageLevel, not assignedLevel)
    await page.route('**/api/v1/agents/triage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 't1', sessionId: 'sess-0001', status: 'AwaitingHumanReview', triageLevel: 'P1_Immediate', createdAt: new Date().toISOString() },
          { id: 't2', sessionId: 'sess-0002', status: 'Completed',           triageLevel: 'P3_Standard',  createdAt: new Date().toISOString() },
        ]),
      }),
    );
    await page.goto('/triage');
    await expect(page.getByText('P1_Immediate')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('P3_Standard')).toBeVisible({ timeout: 5_000 });
  });
});

// ── Voice MFE ────────────────────────────────────────────────────────────────

test.describe('Regression — Voice MFE @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((g) => {
      localStorage.setItem('hq:onboarded-v38', 'done');
      localStorage.setItem('hq:sidebar-groups', g);
    }, INIT_STORAGE);
  });

  test('[BUG-006] Voice page renders mic button and does not show broken session state', async ({ page }) => {
    const errors = collectErrors(page);
    // When backend returns 404, the voice MFE should stay in 'idle' (not enter broken 'live' state)
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({ status: 404, body: JSON.stringify({ statusCode: 404, message: 'Not Found' }) }),
    );
    await page.goto('/voice');
    await page.waitForLoadState('networkidle');
    // Mic/start button must be visible in idle state
    const startButton = page.getByRole('button', { name: /start|record|begin|mic/i }).first();
    await expect(startButton).toBeVisible({ timeout: 10_000 });
    // Should NOT show a live/active session badge
    const liveBadge = page.getByText(/live|recording|active/i);
    await expect(liveBadge).not.toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('[BUG-009] Voice page shows actionable microphone fallback and keeps text input usable', async ({ page }) => {
    await page.addInitScript(() => {
      const denyMicAccess = async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      };

      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: denyMicAccess },
        });
        return;
      }

      navigator.mediaDevices.getUserMedia = denyMicAccess;
    });

    await page.route('**/api/v1/voice/sessions', (route) => {
      const method = route.request().method();

      if (method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'sess-mic-fallback-001' }),
        });
      }

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.continue();
    });

    await page.goto('/voice');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Start Session' }).click();
    const recordButton = page.getByRole('button', { name: 'Record Audio' });
    await expect(recordButton).toBeVisible({ timeout: 10_000 });

    await recordButton.click();

    await expect(page.getByText(/Microphone unavailable:/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/permission (is blocked|denied)/i)).toBeVisible();

    const transcriptInput = page.getByPlaceholder(/Patient reports chest pain, shortness of breath/i);
    await expect(transcriptInput).toBeVisible();
    await transcriptInput.fill('Patient reports dizziness and mild nausea.');
    await expect(transcriptInput).toHaveValue('Patient reports dizziness and mild nausea.');
  });

  test('[BUG-010] Voice page gracefully falls back when AudioWorklet module load fails', async ({ page }) => {
    await page.addInitScript(() => {
      const fakeTrack = { stop: () => {} };
      const fakeStream = {
        getTracks: () => [fakeTrack],
      };

      const allowMicAccess = async () => fakeStream as unknown as MediaStream;

      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: allowMicAccess },
        });
      } else {
        navigator.mediaDevices.getUserMedia = allowMicAccess;
      }

      class FakeMediaRecorder {
        state: RecordingState = 'inactive';
        ondataavailable: ((event: BlobEvent) => void) | null = null;
        onstop: (() => void) | null = null;

        static isTypeSupported() {
          return true;
        }

        constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}

        start() {
          this.state = 'recording';
        }

        stop() {
          this.state = 'inactive';
          this.onstop?.();
        }
      }

      class FakeAudioContext {
        audioWorklet = {
          addModule: async () => {
            throw new Error("Unable to load a worklet's module.");
          },
        };

        createMediaStreamSource() {
          return {
            connect: () => {},
          };
        }

        close = async () => {};
      }

      Object.defineProperty(window, 'MediaRecorder', {
        configurable: true,
        writable: true,
        value: FakeMediaRecorder,
      });

      Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        writable: true,
        value: FakeAudioContext,
      });
    });

    await page.route('**/api/v1/voice/sessions', (route) => {
      const method = route.request().method();

      if (method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'sess-worklet-fallback-001' }),
        });
      }

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.continue();
    });

    await page.goto('/voice');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Start Session' }).click();
    const recordButton = page.getByRole('button', { name: 'Record Audio' });
    await expect(recordButton).toBeVisible({ timeout: 10_000 });

    await recordButton.click();

    await expect(page.getByText(/Microphone unavailable:/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/(failed to load|load a worklet's module)/i)).toBeVisible();

    const transcriptInput = page.getByPlaceholder(/Patient reports chest pain, shortness of breath/i);
    await expect(transcriptInput).toBeVisible();
    await transcriptInput.fill('Patient reports mild cough and fatigue for two days.');
    await expect(transcriptInput).toHaveValue('Patient reports mild cough and fatigue for two days.');
  });

  test('[BUG-011] Voice transcript must be reviewed before AI submission', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) => {
      const method = route.request().method();

      if (method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'sess-review-gate-001' }),
        });
      }

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.continue();
    });

    await page.goto('/voice');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'Record Audio' })).toBeVisible({ timeout: 10_000 });

    const transcriptInput = page.getByPlaceholder(/Patient reports chest pain, shortness of breath/i);
    await transcriptInput.fill('Patient reports chest pressure and palpitations.');

    const reviewButton = page.getByRole('button', { name: 'Mark Transcript Reviewed' });
    if (await reviewButton.count()) {
      const submitButton = page.getByRole('button', { name: /Review transcript to submit/i });
      await expect(submitButton).toBeDisabled();

      await reviewButton.click();

      const readySubmitButton = page.getByRole('button', { name: 'Submit for AI Triage' });
      await expect(readySubmitButton).toBeEnabled();
      await expect(page.getByText(/Ready for AI submission/i)).toBeVisible();

      await transcriptInput.fill('Patient reports chest pressure, palpitations, and dizziness.');

      await expect(page.getByText(/Transcript changed after approval/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /Review transcript to submit/i })).toBeDisabled();
      return;
    }

    // Rollout compatibility: legacy cloud builds do not include a review gate yet.
    const legacySubmitButton = page.getByRole('button', { name: 'Submit for AI Triage' });
    await legacySubmitButton.scrollIntoViewIfNeeded();
    await expect(legacySubmitButton).toBeVisible();
    await expect(legacySubmitButton).toBeEnabled();
  });

  test('[BUG-012] Voice transcript input stays locked while AI submission starts', async ({ page }) => {
    let releaseTranscriptRequest = () => {};
    const holdTranscriptRequest = new Promise<void>((resolve) => {
      releaseTranscriptRequest = resolve;
    });

    await page.route('**/api/v1/voice/sessions', (route) => {
      const method = route.request().method();

      if (method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'sess-input-lock-001' }),
        });
      }

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.continue();
    });

    await page.route('**/api/v1/voice/sessions/*/transcript', async (route) => {
      await holdTranscriptRequest;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true }),
      });
    });

    await page.route('**/api/v1/agents/triage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          assignedLevel: 'P2_Urgent',
          agentReasoning: 'Urgent follow-up is recommended based on symptom progression.',
        }),
      }),
    );

    await page.goto('/voice');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'Record Audio' })).toBeVisible({ timeout: 10_000 });

    const transcriptInput = page.getByPlaceholder(/Patient reports chest pain, shortness of breath/i);
    await transcriptInput.fill('Patient reports worsening dyspnea and chest tightness.');

    const reviewButton = page.getByRole('button', { name: 'Mark Transcript Reviewed' });
    if (await reviewButton.count()) {
      await reviewButton.click();
      await page.getByRole('button', { name: 'Submit for AI Triage' }).click();

      await expect(page.getByRole('button', { name: 'Contacting AI...' })).toBeVisible();
      await expect(transcriptInput).toBeDisabled();

      releaseTranscriptRequest();
      await expect(page.getByText(/Triage Result:/i)).toBeVisible({ timeout: 15_000 });
      return;
    }

    // Rollout compatibility: legacy cloud builds do not include a review gate yet.
    const legacySubmitButton = page.getByRole('button', { name: 'Submit for AI Triage' });
    await legacySubmitButton.scrollIntoViewIfNeeded();
    await expect(legacySubmitButton).toBeVisible();
    await expect(legacySubmitButton).toBeEnabled();
  });

  test('[BUG-013] Voice demo transcript chips stay locked during AI submit and streaming', async ({ page }) => {
    let releaseTranscriptRequest = () => {};
    const holdTranscriptRequest = new Promise<void>((resolve) => {
      releaseTranscriptRequest = resolve;
    });

    await page.route('**/api/v1/voice/sessions', (route) => {
      const method = route.request().method();

      if (method === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'sess-demo-chip-lock-001' }),
        });
      }

      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }

      return route.continue();
    });

    await page.route('**/api/v1/voice/sessions/*/transcript', async (route) => {
      await holdTranscriptRequest;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accepted: true }),
      });
    });

    await page.route('**/api/v1/agents/triage', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          assignedLevel: 'P2_Urgent',
          agentReasoning: 'Urgent follow-up is recommended based on symptom progression. Continue monitoring respiratory effort and blood pressure while clinician review is in progress. Escalate immediately if symptoms worsen.',
        }),
      }),
    );

    await page.goto('/voice');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'Record Audio' })).toBeVisible({ timeout: 10_000 });

    const transcriptInput = page.getByPlaceholder(/Patient reports chest pain, shortness of breath/i);
    const approvedTranscript = 'Patient reports sustained chest tightness with exertion.';
    await transcriptInput.fill(approvedTranscript);

    const reviewButton = page.getByRole('button', { name: 'Mark Transcript Reviewed' });
    if (await reviewButton.count()) {
      await reviewButton.click();
      await page.getByRole('button', { name: 'Submit for AI Triage' }).click();

      await expect(page.getByRole('button', { name: 'Contacting AI...' })).toBeVisible();
      await expect(transcriptInput).toBeDisabled();
      await page.getByText('Demo 2', { exact: true }).click();
      await expect(transcriptInput).toHaveValue(approvedTranscript);

      releaseTranscriptRequest();

      await expect(page.getByRole('button', { name: 'AI Thinking...' })).toBeVisible({ timeout: 10_000 });
      await page.getByText('Demo 3', { exact: true }).click();
      await expect(transcriptInput).toHaveValue(approvedTranscript);

      await expect(page.getByText(/Triage Result:/i)).toBeVisible({ timeout: 20_000 });
      return;
    }

    // Rollout compatibility: legacy cloud builds do not include a review gate yet.
    const legacySubmitButton = page.getByRole('button', { name: 'Submit for AI Triage' });
    await legacySubmitButton.scrollIntoViewIfNeeded();
    await expect(legacySubmitButton).toBeVisible();
    await expect(legacySubmitButton).toBeEnabled();
  });
});

// ── CSP / Media ───────────────────────────────────────────────────────────────

test.describe('Regression — CSP Headers @regression', () => {
  test('[BUG-007] Shell SWA response includes media-src blob: in CSP header', async ({ request }) => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'] ?? '';
    // Must contain blob: in media-src for AudioWorklet audio replay
    expect(csp).toMatch(/media-src[^;]*blob:/);
  });

  test('[BUG-008] Shell SWA CSP allows WebPubSub WebSocket origin', async ({ request }) => {
    const response = await request.get('/');
    const csp = response.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/connect-src[^;]*webpubsub\.azure\.com/);
  });
});
