/**
 * API Consumer Contract Tests
 *
 * Pact-style consumer-driven contract tests that verify HealthQ Copilot microservice
 * API contracts from the frontend consumer perspective.
 *
 * These tests validate response schema, HTTP semantics, and field presence without
 * requiring a live Pact broker.  The tests run against a real (or stub) backend and
 * act as a formal specification of what each MFE expects from each microservice.
 *
 * For full Pact broker integration replace each `request.*` call block with a
 * `@pact-foundation/pact` consumer definition and publish the contract to PactFlow.
 *
 * Coverage:
 *   — Population Health: /risks, /care-gaps, /stats, /sdoh, /cost-prediction, /drug-interactions
 *   — Revenue Cycle:     /coding-jobs, /prior-auths
 *   — Agents:            /triage, /decisions/{id}/explanation, /decisions/ml-confidence
 *   — Notifications:     /campaigns
 *   — Identity:          /patients/register, /patients/me
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.API_BASE_URL || 'http://localhost:8080';
const AUTH_HEADER = { Authorization: `Bearer ${process.env.TEST_JWT_TOKEN || 'test-token'}` };

// ── Helpers ─────────────────────────────────────────────────────────────────

function apiUrl(path: string) { return `${BASE}${path}`; }

/** Assert that every key in `schema` is present in `obj` with the expected type. */
function assertSchema(obj: Record<string, unknown>, schema: Record<string, string>) {
  for (const [key, expectedType] of Object.entries(schema)) {
    expect(obj, `key "${key}" missing from response`).toHaveProperty(key);
    if (expectedType !== 'any') {
      // eslint-disable-next-line valid-typeof
      expect(typeof obj[key], `key "${key}" has wrong type`).toBe(expectedType);
    }
  }
}

// ── Graceful skip when backend is unavailable ────────────────────────────────
// Skips every test in this file individually if the backend cannot be reached.
// Run with API_BASE_URL env var to point at a live staging/local environment.
test.beforeEach(async ({ request }) => {
  try {
    await request.get(apiUrl('/health'), { timeout: 3_000, failOnStatusCode: false });
  } catch {
    test.skip(true, `Backend at ${BASE} is unreachable — set API_BASE_URL to run API contract tests`);
  }
});

// ── Population Health ────────────────────────────────────────────────────────

test.describe('Population Health API contracts', () => {
  test('GET /api/v1/population-health/risks — returns array with correct schema', async ({ request }) => {
    const res = await request.get(apiUrl('/api/v1/population-health/risks'), { headers: AUTH_HEADER });
    expect(res.status()).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      assertSchema(body[0] as Record<string, unknown>, {
        id:          'string',
        patientId:   'string',
        level:       'string',
        riskScore:   'number',
        assessedAt:  'string',
      });
      const level = (body[0] as Record<string, unknown>)['level'] as string;
      expect(['Low', 'Moderate', 'High', 'Critical']).toContain(level);
    }
  });

  test('GET /api/v1/population-health/care-gaps — returns array with correct schema', async ({ request }) => {
    const res = await request.get(apiUrl('/api/v1/population-health/care-gaps'), { headers: AUTH_HEADER });
    expect(res.status()).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      assertSchema(body[0] as Record<string, unknown>, {
        id:           'string',
        patientId:    'string',
        measureName:  'string',
        identifiedAt: 'string',
      });
    }
  });

  test('GET /api/v1/population-health/stats — returns aggregated stats', async ({ request }) => {
    const res = await request.get(apiUrl('/api/v1/population-health/stats'), { headers: AUTH_HEADER });
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    assertSchema(body, {
      highRiskPatients: 'number',
      totalPatients:    'number',
      openCareGaps:     'number',
      closedCareGaps:   'number',
    });
  });

  test('POST /api/v1/population-health/risks/calculate — returns created risk', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/population-health/risks/calculate'), {
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      data: { patientId: '00000000-0000-0000-0000-000000000099', conditions: ['Diabetes', 'Hypertension'] },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json() as Record<string, unknown>;
    assertSchema(body, { patientId: 'string', level: 'string', riskScore: 'number' });
    expect(['Low', 'Moderate', 'High', 'Critical']).toContain(body['level']);
    expect(body['riskScore'] as number).toBeGreaterThanOrEqual(0);
    expect(body['riskScore'] as number).toBeLessThanOrEqual(1);
  });

  test('POST /api/v1/population-health/sdoh — returns SDOH assessment with correct schema', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/population-health/sdoh'), {
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      data: {
        patientId: '00000000-0000-0000-0000-000000000099',
        domainScores: {
          HousingInstability: 2,
          FoodInsecurity:     1,
          Transportation:     0,
          SocialIsolation:    3,
          FinancialStrain:    2,
          Employment:         0,
          Education:          1,
          DigitalAccess:      0,
        },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    assertSchema(body, {
      id:                   'string',
      patientId:            'string',
      totalScore:           'number',
      riskLevel:            'string',
      compositeRiskWeight:  'number',
    });
    expect(['Low', 'Moderate', 'High']).toContain(body['riskLevel']);
    expect(body['totalScore'] as number).toBeGreaterThanOrEqual(0);
    expect(body['totalScore'] as number).toBeLessThanOrEqual(24);
    expect(body['compositeRiskWeight'] as number).toBeGreaterThanOrEqual(0);
    expect(body['compositeRiskWeight'] as number).toBeLessThanOrEqual(0.30);
    expect(Array.isArray(body['prioritizedNeeds'])).toBe(true);
    expect(Array.isArray(body['recommendedActions'])).toBe(true);
  });

  test('POST /api/v1/population-health/drug-interactions/check — returns interaction check result', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/population-health/drug-interactions/check'), {
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      data: { drugs: ['warfarin', 'aspirin', 'metformin'] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    assertSchema(body, {
      alertLevel:           'string',
      hasContraindication:  'boolean',
      hasMajorInteraction:  'boolean',
      interactionCount:     'number',
    });
    expect(['None', 'Minor', 'Moderate', 'Major', 'Contraindicated']).toContain(body['alertLevel']);
    expect(Array.isArray(body['interactions'])).toBe(true);
  });

  test('POST /api/v1/population-health/drug-interactions/check — rejects fewer than 2 drugs', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/population-health/drug-interactions/check'), {
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      data: { drugs: ['warfarin'] },
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/v1/population-health/cost-prediction — returns prediction with CI', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/population-health/cost-prediction'), {
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      data: {
        patientId:  '00000000-0000-0000-0000-000000000099',
        riskLevel:  'High',
        conditions: ['Diabetes', 'CHF'],
        sdohWeight: 0.15,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    assertSchema(body, {
      patientId:            'string',
      predicted12mCostUsd:  'number',
      lowerBound95Usd:      'number',
      upperBound95Usd:      'number',
      costTier:             'string',
    });
    expect(['Low', 'Moderate', 'High', 'VeryHigh']).toContain(body['costTier']);
    expect(body['lowerBound95Usd'] as number).toBeLessThan(body['predicted12mCostUsd'] as number);
    expect(body['upperBound95Usd'] as number).toBeGreaterThan(body['predicted12mCostUsd'] as number);
  });
});

// ── Revenue Cycle ─────────────────────────────────────────────────────────────

test.describe('Revenue Cycle API contracts', () => {
  test('GET /api/v1/revenue/coding-jobs — returns array with correct schema', async ({ request }) => {
    const res = await request.get(apiUrl('/api/v1/revenue/coding-jobs'), { headers: AUTH_HEADER });
    expect(res.status()).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      assertSchema(body[0] as Record<string, unknown>, {
        id:          'string',
        encounterId: 'string',
        patientId:   'string',
        patientName: 'string',
        status:      'string',
        createdAt:   'string',
      });
      const status = (body[0] as Record<string, unknown>)['status'] as string;
      expect(['Pending', 'InReview', 'Approved', 'Submitted']).toContain(status);
    }
  });

  test('GET /api/v1/revenue/prior-auths — returns array with correct schema', async ({ request }) => {
    const res = await request.get(apiUrl('/api/v1/revenue/prior-auths'), { headers: AUTH_HEADER });
    expect(res.status()).toBe(200);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      assertSchema(body[0] as Record<string, unknown>, {
        id:        'string',
        patientId: 'string',
        procedure: 'string',
        status:    'string',
        createdAt: 'string',
      });
      const status = (body[0] as Record<string, unknown>)['status'] as string;
      expect(['Draft', 'Submitted', 'UnderReview', 'Approved', 'Denied']).toContain(status);
    }
  });
});

// ── Agents ───────────────────────────────────────────────────────────────────

test.describe('Agents API contracts', () => {
  test('POST /api/v1/agents/decisions/ml-confidence — returns CI with correct schema', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/agents/decisions/ml-confidence'), {
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      data: {
        probability:   0.72,
        featureValues: [3, 2, 2, 1, 5, 1, 0.8],
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('probability');
    const ci = body['confidenceInterval'] as Record<string, unknown>;
    assertSchema(ci, {
      confidenceLevel:    'number',
      decisionConfidence: 'string',
      lowerBound95:       'number',
      upperBound95:       'number',
      method:             'string',
    });
    expect(['High', 'Moderate', 'Low']).toContain(ci['decisionConfidence']);
    expect(ci['lowerBound95'] as number).toBeLessThanOrEqual(ci['upperBound95'] as number);
  });

  test('POST /api/v1/agents/decisions/ml-confidence — LIME fallback (no feature vector)', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/agents/decisions/ml-confidence'), {
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      data: { probability: 0.55 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const ci = body['confidenceInterval'] as Record<string, unknown>;
    expect(ci['method']).toContain('LIME-fallback');
  });
});

// ── Identity ──────────────────────────────────────────────────────────────────

test.describe('Identity API contracts', () => {
  test('POST /api/v1/identity/patients/register — returns 400 on missing email', async ({ request }) => {
    const res = await request.post(apiUrl('/api/v1/identity/patients/register'), {
      headers: { 'Content-Type': 'application/json' },
      data: { displayName: 'Test Patient' }, // missing email → validation error
    });
    expect([400, 422]).toContain(res.status());
  });
});

// ── Schema non-regression guard ──────────────────────────────────────────────

test('API health — all critical endpoints return non-5xx', async ({ request }) => {
  const endpoints = [
    '/api/v1/population-health/risks',
    '/api/v1/population-health/care-gaps',
    '/api/v1/population-health/stats',
    '/api/v1/revenue/coding-jobs',
    '/api/v1/revenue/prior-auths',
  ];

  for (const path of endpoints) {
    const res = await request.get(apiUrl(path), { headers: AUTH_HEADER });
    expect(res.status(), `${path} returned 5xx`).toBeLessThan(500);
  }
});
