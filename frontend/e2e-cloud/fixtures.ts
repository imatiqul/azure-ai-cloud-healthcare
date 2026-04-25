/**
 * Shared test fixtures for cloud E2E tests.
 *
 * Cloud workflows are expected to validate the deployed system against live,
 * seeded data. Specs that need mocked responses must declare those mocks
 * locally instead of inheriting a suite-wide demo-mode fallback.
 */

export { test, expect } from '@playwright/test';

