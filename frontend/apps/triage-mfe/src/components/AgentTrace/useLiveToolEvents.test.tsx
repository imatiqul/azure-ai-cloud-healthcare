import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => {
  const onMessageHandlers: Array<(msg: unknown) => void> = [];
  const startMock = vi.fn().mockResolvedValue(undefined);
  const joinSessionMock = vi.fn().mockResolvedValue(undefined);
  const leaveSessionMock = vi.fn().mockResolvedValue(undefined);
  const onMessageMock = vi.fn((handler: (msg: unknown) => void) => {
    onMessageHandlers.push(handler);
    return () => {
      const i = onMessageHandlers.indexOf(handler);
      if (i >= 0) onMessageHandlers.splice(i, 1);
    };
  });
  return { onMessageHandlers, startMock, joinSessionMock, leaveSessionMock, onMessageMock };
});

vi.mock('@healthcare/web-pubsub-client', () => ({
  createGlobalVoiceClient: vi.fn().mockImplementation(async () => ({
    start: mocks.startMock,
    joinSession: mocks.joinSessionMock,
    leaveSession: mocks.leaveSessionMock,
    onMessage: mocks.onMessageMock,
  })),
  hasGlobalVoiceClient: vi.fn().mockReturnValue(true),
}));

vi.stubEnv('VITE_AGENTS_API_BASE', 'http://localhost:5001');

import { useLiveToolEvents } from './useLiveToolEvents';

describe('useLiveToolEvents', () => {
  beforeEach(() => {
    mocks.onMessageHandlers.length = 0;
    mocks.startMock.mockClear();
    mocks.joinSessionMock.mockClear();
    mocks.leaveSessionMock.mockClear();
    mocks.onMessageMock.mockClear();
  });

  it('returns [] when sessionId is empty', () => {
    const { result } = renderHook(() => useLiveToolEvents(undefined));
    expect(result.current).toEqual([]);
    expect(mocks.joinSessionMock).not.toHaveBeenCalled();
  });

  it('joins the session and accumulates ToolInvoked / ToolCompleted events', async () => {
    const { result } = renderHook(() => useLiveToolEvents('s1'));

    await waitFor(() => expect(mocks.joinSessionMock).toHaveBeenCalledWith('s1'));
    expect(mocks.onMessageHandlers.length).toBe(1);

    act(() => {
      mocks.onMessageHandlers[0]({
        type: 'ToolInvoked',
        agentName: 'TriageAgent',
        pluginName: 'Patient',
        functionName: 'lookup',
        timestamp: '2026-04-27T00:00:00Z',
      });
      mocks.onMessageHandlers[0]({
        type: 'ToolCompleted',
        pluginName: 'Patient',
        functionName: 'lookup',
        durationMs: 120,
        success: true,
        timestamp: '2026-04-27T00:00:01Z',
      });
      // Unrelated message types must be ignored.
      mocks.onMessageHandlers[0]({ type: 'AiThinking', token: 'x', isFinal: false, timestamp: 't' });
    });

    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toMatchObject({ kind: 'invoked', pluginName: 'Patient', functionName: 'lookup' });
    expect(result.current[1]).toMatchObject({ kind: 'completed', durationMs: 120, success: true });
  });

  it('caps to maxItems most-recent events', async () => {
    const { result } = renderHook(() => useLiveToolEvents('s1', 3));
    await waitFor(() => expect(mocks.onMessageHandlers.length).toBe(1));

    act(() => {
      for (let i = 0; i < 5; i++) {
        mocks.onMessageHandlers[0]({
          type: 'ToolInvoked',
          agentName: 'A',
          pluginName: 'P',
          functionName: `f${i}`,
          timestamp: `t${i}`,
        });
      }
    });

    expect(result.current).toHaveLength(3);
    expect((result.current[0] as { functionName: string }).functionName).toBe('f2');
    expect((result.current[2] as { functionName: string }).functionName).toBe('f4');
  });
});
