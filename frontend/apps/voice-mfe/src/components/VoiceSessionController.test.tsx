import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  VoiceSessionController,
  getMicrophoneFallbackMessage,
  getPcmWorkletModuleCandidates,
} from './VoiceSessionController';

vi.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: vi.fn(() => ({
    withUrl: vi.fn().mockReturnThis(),
    withAutomaticReconnect: vi.fn().mockReturnThis(),
    configureLogging: vi.fn().mockReturnThis(),
    build: vi.fn(() => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
      state: 'Disconnected',
    })),
  })),
  LogLevel: { Warning: 3 },
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('VoiceSessionController', () => {
  it('renders voice session card', () => {
    render(<VoiceSessionController />);
    expect(screen.getByText('Voice Session')).toBeInTheDocument();
  });

  it('shows Start Session and End Session buttons', () => {
    render(<VoiceSessionController />);
    expect(screen.getByText('Start Session')).toBeInTheDocument();
    expect(screen.getByText('End Session')).toBeInTheDocument();
  });

  it('Start Session is enabled in idle state', () => {
    render(<VoiceSessionController />);
    const startBtn = screen.getByText('Start Session');
    expect(startBtn.closest('button')).not.toBeDisabled();
  });

  it('End Session is disabled in idle state', () => {
    render(<VoiceSessionController />);
    const endBtn = screen.getByText('End Session');
    expect(endBtn.closest('button')).toBeDisabled();
  });
});

describe('getMicrophoneFallbackMessage', () => {
  it('maps worklet module failures to a friendly message', () => {
    const message = getMicrophoneFallbackMessage(new Error("Unable to load a worklet's module."));

    expect(message).toMatch(/failed to load/i);
    expect(message).toMatch(/refresh the page/i);
  });

  it('maps blocked microphone permissions to a guidance message', () => {
    const message = getMicrophoneFallbackMessage({ name: 'NotAllowedError', message: 'Permission denied' });

    expect(message).toMatch(/permission is blocked/i);
  });

  it('returns a generic fallback for unknown errors', () => {
    const message = getMicrophoneFallbackMessage({});

    expect(message).toMatch(/temporarily unavailable/i);
  });
});

describe('getPcmWorkletModuleCandidates', () => {
  it('includes a public worklet fallback URL for the provided origin', () => {
    const candidates = getPcmWorkletModuleCandidates('https://voice.example.com');

    expect(candidates).toContain('https://voice.example.com/worklets/pcm-processor.js');
  });

  it('returns unique candidate URLs', () => {
    const candidates = getPcmWorkletModuleCandidates('https://voice.example.com/');

    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
