import { PublicClientApplication } from '@azure/msal-browser';
export declare const b2cConfigured: boolean;
/** Scopes for interactive login (ID token + consent). */
export declare const loginScopes: string[];
/** Scopes for silent token acquisition — includes the backend API scope. */
export declare const patientPortalScopes: string[];
export declare const msalInstance: PublicClientApplication;
/**
 * Password-reset authority. Used by the "Forgot password?" link.
 * Triggers the B2C_1_password_reset policy instead of signup_signin.
 */
export declare const passwordResetRequest: {
    authority: string | undefined;
    scopes: string[];
};
//# sourceMappingURL=msalConfig.d.ts.map