interface AuthPatientIdResult {
    patientId: string | null;
    /** True while the token / identity lookup is in progress. */
    loading: boolean;
    /** Error message if the lookup failed. */
    error: string | null;
    /** True when the user is authenticated via B2C. */
    isAuthenticated: boolean;
}
/**
 * Resolves the current B2C-authenticated patient's internal HealthQ patient ID.
 *
 * Flow:
 *   1. Acquire B2C token (silent → interactive fallback).
 *   2. POST /api/v1/identity/patients/register with the Entra sub + profile.
 *   3. The IdP sub is stored as ExternalId; the response returns the internal Id.
 *
 * When B2C is not configured (VITE_B2C_CLIENT_ID not set) returns
 * { patientId: null, loading: false, isAuthenticated: false }.
 */
export declare function useAuthPatientId(): AuthPatientIdResult;
export {};
//# sourceMappingURL=useAuthPatientId.d.ts.map