import { test, expect } from '@playwright/test';

/**
 * Cloud E2E tests run against deployed Azure infrastructure.
 * They verify that SWA apps load and ACA services respond.
 */

test.describe('Cloud — Shell SWA', () => {
  test('shell loads and renders dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HealthQ|Healthcare/i);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('shell renders navigation sidebar', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('aside, nav, [class*="sidebar"], [class*="Sidebar"]').first();
    await expect(nav).toBeVisible({ timeout: 10000 });
  });

  test('shell renders header', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Healthcare|HealthQ/i).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Cloud — MFE Navigation', () => {
  test('navigates to voice page', async ({ page }) => {
    await page.goto('/voice');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to triage page', async ({ page }) => {
    await page.goto('/triage');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to scheduling page', async ({ page }) => {
    await page.goto('/scheduling');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to population health page', async ({ page }) => {
    await page.goto('/population-health');
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('navigates to revenue page', async ({ page }) => {
    await page.goto('/revenue');
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

test.describe('Cloud — ACA Service Health', () => {
  const services = [
    { name: 'Voice', url: process.env.VOICE_ACA_URL },
    { name: 'AI-Agent', url: process.env.AGENT_ACA_URL },
    { name: 'FHIR', url: process.env.FHIR_ACA_URL },
    { name: 'Identity', url: process.env.IDENTITY_ACA_URL },
    { name: 'OCR', url: process.env.OCR_ACA_URL },
    { name: 'Scheduling', url: process.env.SCHEDULING_ACA_URL },
    { name: 'Notification', url: process.env.NOTIFICATION_ACA_URL },
    { name: 'PopHealth', url: process.env.POPHEALTH_ACA_URL },
    { name: 'Revenue', url: process.env.REVENUE_ACA_URL },
  ];

  for (const svc of services) {
    test(`${svc.name} service health check returns OK`, async ({ request }) => {
      test.skip(!svc.url, `${svc.name} URL not configured`);
      const response = await request.get(`${svc.url}/health`);
      expect(response.status()).toBeLessThan(500);
    });
  }
});

test.describe('Cloud — API Smoke Tests', () => {
  test('agent stats endpoint responds', async ({ request }) => {
    const agentUrl = process.env.AGENT_ACA_URL;
    test.skip(!agentUrl, 'AGENT_ACA_URL not configured');
    const response = await request.get(`${agentUrl}/api/v1/agents/stats`);
    expect(response.status()).toBeLessThan(500);
  });

  test('scheduling stats endpoint responds', async ({ request }) => {
    const url = process.env.SCHEDULING_ACA_URL;
    test.skip(!url, 'SCHEDULING_ACA_URL not configured');
    const response = await request.get(`${url}/api/v1/scheduling/stats`);
    expect(response.status()).toBeLessThan(500);
  });

  test('population health stats endpoint responds', async ({ request }) => {
    const url = process.env.POPHEALTH_ACA_URL;
    test.skip(!url, 'POPHEALTH_ACA_URL not configured');
    const response = await request.get(`${url}/api/v1/population-health/stats`);
    expect(response.status()).toBeLessThan(500);
  });

  test('revenue stats endpoint responds', async ({ request }) => {
    const url = process.env.REVENUE_ACA_URL;
    test.skip(!url, 'REVENUE_ACA_URL not configured');
    const response = await request.get(`${url}/api/v1/revenue/stats`);
    expect(response.status()).toBeLessThan(500);
  });

  test('guide suggestions endpoint responds', async ({ request }) => {
    const agentUrl = process.env.AGENT_ACA_URL;
    test.skip(!agentUrl, 'AGENT_ACA_URL not configured');
    const response = await request.get(`${agentUrl}/api/v1/agents/guide/suggestions`);
    expect(response.status()).toBeLessThan(500);
  });
});
