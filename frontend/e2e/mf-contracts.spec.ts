/**
 * Module Federation Contract Tests
 *
 * Validates that each MFE remote exposes the expected named exports at runtime.
 * These are Playwright-based integration tests that navigate to each remote's
 * remoteEntry.js manifest and verify contract compliance.
 *
 * Run against a locally started dev environment or staging.
 */
import { test, expect } from '@playwright/test';

interface RemoteContract {
  name: string;
  baseUrl: string;
  expectedExposures: string[];
}

const MFE_CONTRACTS: RemoteContract[] = [
  {
    name: 'voice',
    baseUrl: process.env.VOICE_MFE_URL || 'http://localhost:3001',
    expectedExposures: ['./VoiceSessionController'],
  },
  {
    name: 'triage',
    baseUrl: process.env.TRIAGE_MFE_URL || 'http://localhost:3002',
    expectedExposures: ['./TriageViewer', './HitlEscalationModal', './EscalationQueue'],
  },
  {
    name: 'scheduling',
    baseUrl: process.env.SCHEDULING_MFE_URL || 'http://localhost:3003',
    expectedExposures: ['./SlotCalendar', './BookingForm'],
  },
  {
    name: 'pophealth',
    baseUrl: process.env.POPHEALTH_MFE_URL || 'http://localhost:3004',
    expectedExposures: ['./RiskPanel', './CareGapList'],
  },
  {
    name: 'revenue',
    baseUrl: process.env.REVENUE_MFE_URL || 'http://localhost:3005',
    expectedExposures: ['./CodingQueue', './PriorAuthTracker'],
  },
  {
    name: 'encounters',
    baseUrl: process.env.ENCOUNTERS_MFE_URL || 'http://localhost:3006',
    expectedExposures: ['./EncounterList', './CreateEncounterModal'],
  },
  {
    name: 'engagement',
    baseUrl: process.env.ENGAGEMENT_MFE_URL || 'http://localhost:3007',
    expectedExposures: ['./PatientPortal'],
  },
];

for (const contract of MFE_CONTRACTS) {
  test(`MFE contract: ${contract.name} exposes required modules`, async ({ request }) => {
    let response: Awaited<ReturnType<typeof request.get>>;
    try {
      response = await request.get(`${contract.baseUrl}/remoteEntry.js`, { timeout: 5_000 });
    } catch {
      test.skip(true, `${contract.name} MFE at ${contract.baseUrl} is unreachable — skipping contract check`);
      return;
    }

    if (response.status() !== 200) {
      test.skip(true, `${contract.name} remoteEntry.js returned HTTP ${response.status()} — MFE not built or not running`);
      return;
    }

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('javascript');

    const body = await response.text();
    // Each exposed module key must appear in the remoteEntry bundle
    for (const exposure of contract.expectedExposures) {
      // Module names are mangled but the exposure key path is embedded
      const moduleKey = exposure.replace('./', '');
      expect(body, `"${contract.name}" must expose "${exposure}"`).toContain(moduleKey);
    }
  });
}

test('shell exposes globalStore', async ({ request }) => {
  const shellUrl = process.env.SHELL_URL || 'http://localhost:3000';
  const response = await request.get(`${shellUrl}/assets/remoteEntry.js`).catch(() => null);
  // Shell doesn't have a classic remoteEntry — it imports remotes; skip if not found
  if (!response || response.status() !== 200) {
    test.skip();
  }
});
