import { createClient, type Client } from 'graphql-ws';

export { type Client };

// ── GraphQL BFF endpoint configuration ───────────────────────────────────────

const BFF_URL    = import.meta.env?.VITE_BFF_URL    ?? 'http://localhost:5010';
const BFF_WS_URL = import.meta.env?.VITE_BFF_WS_URL ?? 'ws://localhost:5010';

// ── Global auth token provider ────────────────────────────────────────────────
// Call `setAuthTokenProvider` once (e.g. in shell main.tsx) to wire the MSAL
// token into every `gqlFetch` request automatically. Individual callers can
// still pass their own `getHeaders` callback to override the global provider.

type TokenProvider = () => string | undefined;
let _authTokenProvider: TokenProvider | null = null;

export function setAuthTokenProvider(provider: TokenProvider): void {
  _authTokenProvider = provider;
}

// ── Singleton HTTP fetch client ───────────────────────────────────────────────

export interface GraphQLRequest<V = Record<string, unknown>> {
  query: string;
  variables?: V;
  operationName?: string;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; locations?: unknown; path?: string[] }[];
}

/**
 * Executes a GraphQL query or mutation against the HealthQ Copilot BFF.
 *
 * Uses fetch (no additional runtime dependency beyond `graphql-ws` for subscriptions).
 * Attach authorization headers via `getHeaders` callback — typically the MSAL token.
 */
export async function gqlFetch<T, V = Record<string, unknown>>(
  request: GraphQLRequest<V>,
  getHeaders?: () => Record<string, string>,
): Promise<T> {
  // Resolve auth: explicit getHeaders callback takes precedence; fall back to
  // the global token provider registered via setAuthTokenProvider().
  const resolvedAuthHeaders = (): Record<string, string> => {
    if (getHeaders) return getHeaders();
    const token = _authTokenProvider?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...resolvedAuthHeaders(),
  };

  const res = await fetch(`${BFF_URL}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`GraphQL BFF HTTP error ${res.status}: ${res.statusText}`);
  }

  const json: GraphQLResponse<T> = await res.json();

  if (json.errors?.length) {
    const msg = json.errors.map(e => e.message).join('; ');
    throw new Error(`GraphQL error: ${msg}`);
  }

  if (json.data === undefined) {
    throw new Error('GraphQL response contained no data field.');
  }

  return json.data;
}

// ── Singleton WebSocket subscription client ───────────────────────────────────

let _wsClient: Client | null = null;

/**
 * Returns (creating if necessary) the shared graphql-ws client used for
 * real-time GraphQL subscriptions (SDOH updates, coding-job status changes).
 */
export function getSubscriptionClient(getAuthToken?: () => string): Client {
  if (!_wsClient) {
    _wsClient = createClient({
      url: `${BFF_WS_URL}/graphql`,
      connectionParams: () =>
        getAuthToken ? { Authorization: `Bearer ${getAuthToken()}` } : {},
      retryAttempts: 5,
      shouldRetry: () => true,
    });
  }
  return _wsClient;
}

// ── Pre-built query helpers ──────────────────────────────────────────────────

export const Queries = {
  GET_PATIENT_RISKS: /* GraphQL */ `
    query GetPatientRisks {
      patientRisks {
        id patientId level riskScore conditions assessedAt
      }
    }
  `,

  GET_PATIENT_RISK: /* GraphQL */ `
    query GetPatientRisk($patientId: String!) {
      patientRisk(patientId: $patientId) {
        id patientId level riskScore conditions assessedAt
      }
    }
  `,

  GET_CARE_GAPS: /* GraphQL */ `
    query GetCareGaps {
      careGaps {
        id patientId measureName status dueDate identifiedAt
      }
    }
  `,

  GET_POP_HEALTH_STATS: /* GraphQL */ `
    query GetPopHealthStats {
      popHealthStats {
        highRiskPatients totalPatients openCareGaps closedCareGaps
      }
    }
  `,

  GET_SDOH_ASSESSMENT: /* GraphQL */ `
    query GetSdohAssessment($patientId: String!) {
      sdohAssessment(patientId: $patientId) {
        id patientId totalScore riskLevel compositeRiskWeight
        prioritizedNeeds recommendedActions assessedAt
      }
    }
  `,

  GET_COST_PREDICTION: /* GraphQL */ `
    query GetCostPrediction($patientId: String!) {
      costPrediction(patientId: $patientId) {
        patientId predicted12mCostUsd lowerBound95Usd upperBound95Usd
        costTier costDrivers predictedAt
      }
    }
  `,

  GET_CODING_JOBS: /* GraphQL */ `
    query GetCodingJobs {
      codingJobs {
        id encounterId patientId patientName status suggestedCodes createdAt
      }
    }
  `,

  GET_PRIOR_AUTHS: /* GraphQL */ `
    query GetPriorAuths {
      priorAuths {
        id patientId procedure status createdAt
      }
    }
  `,

  GET_APPOINTMENTS: /* GraphQL */ `
    query GetAppointments {
      appointments {
        id patientId providerId appointmentType status scheduledAt
      }
    }
  `,
} as const;

export const Mutations = {
  SCORE_SDOH: /* GraphQL */ `
    mutation ScoreSdoh($input: SdohInput!) {
      scoreSdoh(input: $input) {
        id patientId totalScore riskLevel compositeRiskWeight
        prioritizedNeeds recommendedActions assessedAt
      }
    }
  `,

  PREDICT_COST: /* GraphQL */ `
    mutation PredictCost($input: CostPredictionInput!) {
      predictCost(input: $input) {
        patientId predicted12mCostUsd lowerBound95Usd upperBound95Usd
        costTier costDrivers predictedAt
      }
    }
  `,

  CHECK_DRUG_INTERACTIONS: /* GraphQL */ `
    mutation CheckDrugInteractions($drugs: [String!]!) {
      checkDrugInteractions(drugs: $drugs) {
        alertLevel hasContraindication hasMajorInteraction interactionCount
        interactions { drugA drugB severity clinicalEffect management }
      }
    }
  `,

  COMPUTE_ML_CONFIDENCE: /* GraphQL */ `
    mutation ComputeMlConfidence($probability: Float!, $featureValues: [Float!]) {
      computeMlConfidence(probability: $probability, featureValues: $featureValues) {
        probability
        confidenceInterval {
          confidenceLevel decisionConfidence lowerBound95 upperBound95
          method interpretation
        }
      }
    }
  `,
} as const;

export const Subscriptions = {
  SDOH_UPDATED: /* GraphQL */ `
    subscription OnSdohUpdated($patientId: String!) {
      onSdohUpdated(patientId: $patientId) {
        id patientId totalScore riskLevel compositeRiskWeight
        prioritizedNeeds recommendedActions assessedAt
      }
    }
  `,

  CODING_JOB_APPROVED: /* GraphQL */ `
    subscription OnCodingJobApproved {
      onCodingJobApproved {
        id encounterId patientId patientName status suggestedCodes createdAt
      }
    }
  `,
} as const;
