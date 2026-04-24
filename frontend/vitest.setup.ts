import '@testing-library/jest-dom/vitest';

// Prevent AbortSignal.timeout() from creating real timers in tests.
// Components use AbortSignal.timeout(10_000) for network requests; in tests
// the fetch is mocked so the timer never needs to fire — but it would linger
// for 10 s, polluting subsequent tests with out-of-act state updates.
const _neverAbort = new AbortController();
AbortSignal.timeout = (_ms: number) => _neverAbort.signal;
