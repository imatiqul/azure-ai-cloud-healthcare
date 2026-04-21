export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: 'Patient' | 'Practitioner' | 'Admin';
  accessToken: string;
  /** JWT expiry as Unix timestamp (seconds). Used by SessionExpiryGuard. */
  exp?: number;
}
