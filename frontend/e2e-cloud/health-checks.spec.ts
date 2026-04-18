import { test, expect } from '@playwright/test';

const SWA_URLS: Record<string, string> = {
  shell: process.env.SHELL_URL || 'https://gentle-tree-03115af0f.7.azurestaticapps.net',
  voice: process.env.VOICE_URL || 'https://happy-smoke-0ba02780f.7.azurestaticapps.net',
  triage: process.env.TRIAGE_URL || 'https://brave-hill-0d76ab10f.7.azurestaticapps.net',
  scheduling: process.env.SCHEDULING_URL || 'https://yellow-smoke-0e7b6b70f.7.azurestaticapps.net',
  pophealth: process.env.POPHEALTH_URL || 'https://orange-bay-00f28280f.7.azurestaticapps.net',
  revenue: process.env.REVENUE_URL || 'https://lemon-pond-067d2f40f.7.azurestaticapps.net',
  encounters: process.env.ENCOUNTERS_URL || 'https://calm-river-02bddc70f.7.azurestaticapps.net',
  engagement: process.env.ENGAGEMENT_URL || 'https://agreeable-hill-0d3115b0f.7.azurestaticapps.net',
};

// All backend services use internal ACA ingress — only the gateway is externally reachable.
// Per-service health is verified by probing each service through the gateway.
const GATEWAY_URL =
  process.env.GATEWAY_ACA_URL || 'https://gateway.gentletree-fe920881.eastus2.azurecontainerapps.io';

// Gateway-proxied paths that confirm each service is up.
// A 2xx (data) or 401/403 (service up, auth required) response means the service is healthy.
// Only a 5xx (or connection error) indicates a service is down.
const SERVICE_SMOKE_PATHS: Record<string, string> = {
  gateway:        '/health',
  voice:          '/api/v1/voice/sessions',
  'ai-agent':     '/api/v1/agents/escalations',
  fhir:           '/api/v1/fhir/patients',
  identity:       '/api/v1/identity/users',
  ocr:            '/api/v1/ocr/jobs',
  scheduling:     '/api/v1/scheduling/slots',
  'pop-health':   '/api/v1/population-health/risks',
  revenue:        '/api/v1/revenue/coding-jobs',
  notification:   '/api/v1/notifications/messages',
};

test.describe('Frontend SWA Deployment Verification', () => {
  for (const [name, url] of Object.entries(SWA_URLS)) {
    test(`${name} SWA returns HTTP 200`, async ({ request }) => {
      const response = await request.get(url);
      expect(response.status()).toBe(200);
    });
  }
});

test.describe('Backend ACA Health Endpoints', () => {
  // Gateway liveness — confirms the gateway itself is healthy
  test('gateway /health returns healthy', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/health`);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('Healthy');
  });

  // Per-service smoke checks via gateway — a <500 status means the service is reachable
  for (const [name, path] of Object.entries(SERVICE_SMOKE_PATHS)) {
    if (name === 'gateway') continue; // already checked above
    test(`${name} is reachable via gateway`, async ({ request }) => {
      const response = await request.get(`${GATEWAY_URL}${path}`);
      expect(response.status()).toBeLessThan(500);
    });
  }
});
