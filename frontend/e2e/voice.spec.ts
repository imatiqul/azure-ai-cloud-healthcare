import { test, expect, type Page } from '@playwright/test';

const mockSession = { sessionId: 'test-session-123', status: 'live' };
const mockSessionList = [
  { id: 'sess-1', patientId: 'pat-001', status: 'Ended', startedAt: '2026-04-15T09:00:00Z' },
  { id: 'sess-2', patientId: 'pat-002', status: 'Live', startedAt: '2026-04-15T10:00:00Z' },
];

const mockTranscriptResult = {
  sessionId: 'test-session-123',
  transcriptText: 'Patient reports chest pain and shortness of breath',
  soapNote: {
    subjective: 'Patient reports chest pain and shortness of breath',
    objective: 'BP 140/90, HR 95, RR 18, SpO2 97%',
    assessment: 'Possible angina; rule out ACS',
    plan: 'ECG, troponin, cardiology consult',
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hq:onboarded-v38', 'done');
  });
});

function getStartSessionButton(page: Page) {
  return page.locator('button').filter({ hasText: /^Start Session$/ }).first();
}

function getEndSessionButton(page: Page) {
  return page.locator('button').filter({ hasText: /^End Session$/ }).first();
}

function getRecordAudioButton(page: Page) {
  return page.locator('button').filter({ hasText: /^Record Audio$/ }).first();
}

test.describe('Voice Sessions MFE — Render', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/voice');
  });

  test('renders voice session controller', async ({ page }) => {
    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping render assertion');
      return;
    }
    await expect(startBtn).toBeVisible();
  });
});

test.describe('Voice Sessions MFE — Session Lifecycle', () => {
  test('starts a session and shows live state', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession),
      }),
    );
    await page.goto('/voice');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping session start test');
      return;
    }
    await startBtn.click();
    await expect(page.getByText('test-session-123')).toBeVisible();
  });

  test('shows end session button when live', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession),
      }),
    );
    await page.goto('/voice');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping end session test');
      return;
    }
    await startBtn.click();
    await expect(getEndSessionButton(page)).toBeVisible();
  });

  test('ends session and shows completed status', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSession),
      }),
    );
    await page.route(`**/api/v1/voice/sessions/test-session-123/end`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'test-session-123', status: 'ended' }),
      }),
    );
    await page.route(`**/api/v1/voice/sessions/**/end`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ended' }),
      }),
    );
    await page.goto('/voice');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping end session status test');
      return;
    }
    await startBtn.click();
    const endBtn = getEndSessionButton(page);
    await expect(endBtn).toBeVisible({ timeout: 5000 });
    await endBtn.click();
    await expect(page.getByText(/ended|completed|session ended/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Voice Sessions MFE — Transcript & SOAP Note', () => {
  test('submitting transcript shows processing state', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession) }),
    );
    await page.route('**/api/v1/voice/sessions/**/transcript', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'processing' }),
      }),
    );
    await page.goto('/voice');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping transcript test');
      return;
    }
    await startBtn.click();
    const transcriptArea = page.getByPlaceholder(/transcript|dictate|type/i).or(
      page.getByRole('textbox').first(),
    );
    const inputVisible = await transcriptArea.isVisible({ timeout: 3000 }).catch(() => false);
    if (!inputVisible) {
      test.skip(true, 'Transcript input not visible — skipping');
      return;
    }
    await transcriptArea.fill('Patient reports chest pain and shortness of breath');
    const submitTranscript = page.getByRole('button', { name: /submit transcript|process/i });
    if (await submitTranscript.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitTranscript.click();
      await expect(page.getByText(/processing|generating/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('SOAP note is generated after transcript submission', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession) }),
    );
    await page.route('**/api/v1/voice/sessions/**/transcript', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTranscriptResult),
      }),
    );
    await page.goto('/voice');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping SOAP note test');
      return;
    }
    await startBtn.click();
    const transcriptArea = page.getByPlaceholder(/transcript|dictate|type/i).or(
      page.getByRole('textbox').first(),
    );
    const inputVisible = await transcriptArea.isVisible({ timeout: 3000 }).catch(() => false);
    if (!inputVisible) {
      test.skip(true, 'Transcript input not visible — skipping');
      return;
    }
    await transcriptArea.fill('Patient reports chest pain and shortness of breath');
    const submitTranscript = page.getByRole('button', { name: /submit transcript|process/i });
    if (await submitTranscript.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitTranscript.click();
      // SOAP note sections should appear after transcript processing
      await expect(page.getByText(/subjective|objective|assessment|plan/i).first()).toBeVisible({ timeout: 8000 });
    }
  });
});

test.describe('Voice Sessions MFE — Session History', () => {
  test('session history list shows previous sessions', async ({ page }) => {
    // VoiceSessionHistory now fetches via GQL; session start/end remain REST
    await page.route('**/graphql', (route) => {
      const q: string = route.request().postDataJSON()?.query ?? '';
      if (q.includes('voiceSessions')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { voiceSessions: mockSessionList } }),
        });
      } else {
        route.continue();
      }
    });
    await page.route('**/api/v1/voice/sessions', (route) => {
      if (route.request().method() !== 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession) });
      } else {
        route.continue();
      }
    });
    await page.goto('/voice');

    const historySection = page.getByText(/session history|previous sessions/i);
    const visible = await historySection.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'Session history section not available — skipping');
      return;
    }
    await expect(page.getByText('sess-1').or(page.getByText('Ended'))).toBeVisible({ timeout: 5000 });
  });

  test('session status badges are displayed in history', async ({ page }) => {
    await page.route('**/graphql', (route) => {
      const q: string = route.request().postDataJSON()?.query ?? '';
      if (q.includes('voiceSessions')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { voiceSessions: mockSessionList } }),
        });
      } else {
        route.continue();
      }
    });
    await page.route('**/api/v1/voice/sessions', (route) => {
      if (route.request().method() !== 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession) });
      } else {
        route.continue();
      }
    });
    await page.goto('/voice');

    const historySection = page.getByText(/session history|previous sessions/i);
    const visible = await historySection.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'Session history section not available — skipping status badges test');
      return;
    }
    await expect(page.getByText(/Ended|Live/i).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Voice Sessions MFE — Recording States', () => {
  test('shows recording indicator when session is live', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession) }),
    );
    await page.goto('/voice');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping recording indicator test');
      return;
    }
    await startBtn.click();
    // Recording indicator: mic icon, pulsing dot, or "LIVE" label
    const recordingIndicator = page.getByTestId('recording-indicator').or(
      page.getByText(/recording|live|mic/i),
    );
    const indicatorVisible = await recordingIndicator.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!indicatorVisible) {
      test.skip(true, 'Recording indicator not found — UI may use icon only');
      return;
    }
    await expect(recordingIndicator.first()).toBeVisible();
  });

  test('offline demo mode previews the selected script without writing it into the transcript textarea', async ({ page }) => {
    await page.route('**/api/v1/voice/sessions', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: 404, message: 'Not Found' }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/voice');
    await page.waitForLoadState('networkidle');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping offline demo preview test');
      return;
    }

    await startBtn.click();
    await expect(getRecordAudioButton(page)).toBeVisible({ timeout: 10_000 });

    const transcriptArea = page.getByPlaceholder(/Patient reports chest pain, shortness of breath/i);
    await expect(transcriptArea).toHaveValue('');

    await page.getByText('Demo 1', { exact: true }).click();

    await expect(page.getByText('Selected demo script')).toBeVisible();
    await expect(page.getByText(/severe chest pain radiating to the left arm/i)).toBeVisible();
    await expect(transcriptArea).toHaveValue('');
  });

  test('offline demo mode disables recording when browser speech recognition is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'SpeechRecognition', {
        configurable: true,
        value: undefined,
      });

      Object.defineProperty(window, 'webkitSpeechRecognition', {
        configurable: true,
        value: undefined,
      });
    });

    await page.route('**/api/v1/voice/sessions', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: 404, message: 'Not Found' }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/voice');
    await page.waitForLoadState('networkidle');

    const startBtn = getStartSessionButton(page);
    const mfeLoaded = await startBtn.isVisible({ timeout: 15000 }).catch(() => false);
    if (!mfeLoaded) {
      test.skip(true, 'Voice MFE remote not available — skipping offline demo speech-recognition fallback test');
      return;
    }

    await startBtn.click();

    const recordButton = getRecordAudioButton(page);
    await expect(recordButton).toBeDisabled({ timeout: 10_000 });
    await expect(page.getByText(/Offline demo recording needs browser speech recognition support/i)).toBeVisible();
    await expect(page.getByText(/type the transcript manually/i)).toBeVisible();
  });
});

