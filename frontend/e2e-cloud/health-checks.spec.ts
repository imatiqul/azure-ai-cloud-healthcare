import { test, expect } from '@playwright/test';

const SWA_URLS: Record<string, string> = {
  shell: process.env.SHELL_URL || 'https://gentle-tree-03115af0f.7.azurestaticapps.net',
  voice: process.env.VOICE_URL || 'https://happy-smoke-0ba02780f.7.azurestaticapps.net',
  triage: process.env.TRIAGE_URL || 'https://brave-hill-0d76ab10f.7.azurestaticapps.net',
  scheduling: process.env.SCHEDULING_URL || 'https://yellow-smoke-0e7b6b70f.7.azurestaticapps.net',
  pophealth: process.env.POPHEALTH_URL || 'https://orange-bay-00f28280f.7.azurestaticapps.net',
  revenue: process.env.REVENUE_URL || 'https://lemon-pond-067d2f40f.7.azurestaticapps.net',
  encounters: process.env.ENCOUNTERS_URL || 'https://healthq-copilot-encounters-mfe.azurestaticapps.net',
  engagement: process.env.ENGAGEMENT_URL || 'https://healthq-copilot-engagement-mfe.azurestaticapps.net',
};

const ACA_HEALTH_URLS: Record<string, string> = {
  voice: process.env.VOICE_ACA_URL || 'https://voice.gentletree-fe920881.eastus2.azurecontainerapps.io',
  'ai-agent': process.env.AGENT_ACA_URL || 'https://ai-agent.gentletree-fe920881.eastus2.azurecontainerapps.io',
  fhir: process.env.FHIR_ACA_URL || 'https://fhir.gentletree-fe920881.eastus2.azurecontainerapps.io',
  identity: process.env.IDENTITY_ACA_URL || 'https://identity.gentletree-fe920881.eastus2.azurecontainerapps.io',
  ocr: process.env.OCR_ACA_URL || 'https://ocr.gentletree-fe920881.eastus2.azurecontainerapps.io',
  scheduling: process.env.SCHEDULING_ACA_URL || 'https://scheduling.gentletree-fe920881.eastus2.azurecontainerapps.io',
  notification: process.env.NOTIFICATION_ACA_URL || 'https://notification.gentletree-fe920881.eastus2.azurecontainerapps.io',
  'pop-health': process.env.POPHEALTH_ACA_URL || 'https://pop-health.gentletree-fe920881.eastus2.azurecontainerapps.io',
  revenue: process.env.REVENUE_ACA_URL || 'https://revenue.gentletree-fe920881.eastus2.azurecontainerapps.io',
  gateway: process.env.GATEWAY_ACA_URL || 'https://gateway.gentletree-fe920881.eastus2.azurecontainerapps.io',
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
  for (const [name, baseUrl] of Object.entries(ACA_HEALTH_URLS)) {
    test(`${name} /health returns healthy`, async ({ request }) => {
      const response = await request.get(`${baseUrl}/health`);
      expect(response.status()).toBe(200);
      const body = await response.text();
      expect(body).toContain('Healthy');
    });

    test(`${name} /alive returns OK`, async ({ request }) => {
      const response = await request.get(`${baseUrl}/alive`);
      expect(response.status()).toBe(200);
    });
  }
});
