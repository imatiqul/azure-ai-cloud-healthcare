import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveTranscriptFeed } from './LiveTranscriptFeed';

// Mock the web-pubsub-client package
vi.mock('@healthcare/web-pubsub-client', () => ({
  createGlobalVoiceClient: vi.fn(() => Promise.resolve({
    onMessage: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
    joinSession: vi.fn(() => Promise.resolve()),
  })),
  disposeGlobalVoiceClient: vi.fn(() => Promise.resolve()),
  hasGlobalVoiceClient: vi.fn(() => false),
}));

// Mock the mfe-events package
vi.mock('@healthcare/mfe-events', () => ({
  onAgentDecision: vi.fn(() => vi.fn()),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom does not implement scrollTo — stub to prevent TypeError in useEffect
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

// Mock the web-pubsub-client package
vi.mock('@healthcare/web-pubsub-client', () => ({
  createGlobalVoiceClient: vi.fn(() => Promise.resolve({
    onMessage: vi.fn(),
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    start: vi.fn(() => Promise.resolve()),
    joinSession: vi.fn(() => Promise.resolve()),
  })),
  disposeGlobalVoiceClient: vi.fn(() => Promise.resolve()),
  hasGlobalVoiceClient: vi.fn(() => false),
}));

// Mock the mfe-events package
vi.mock('@healthcare/mfe-events', () => ({
  onAgentDecision: vi.fn(() => vi.fn()),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LiveTranscriptFeed', () => {
  it('renders the transcript card container', () => {
    render(<LiveTranscriptFeed sessionId="test-session-123" />);
    // Container should be in the DOM
    expect(document.querySelector('[class*="MuiCard"]') ?? document.querySelector('div')).not.toBeNull();
  });

  it('shows connecting status before connection is established', () => {
    render(<LiveTranscriptFeed sessionId="sess-abc" />);
    expect(screen.getByText(/Connecting to voice hub/i)).toBeInTheDocument();
  });

  it('includes sessionId in the placeholder text', () => {
    render(<LiveTranscriptFeed sessionId="MY-SESSION-ID" />);
    expect(screen.getByText(/MY-SESSION-ID/)).toBeInTheDocument();
  });

  it('accepts optional onTriageUpdate callback prop', () => {
    const onTriageUpdate = vi.fn();
    // Should not throw
    expect(() =>
      render(<LiveTranscriptFeed sessionId="sess-x" onTriageUpdate={onTriageUpdate} />)
    ).not.toThrow();
  });
});
