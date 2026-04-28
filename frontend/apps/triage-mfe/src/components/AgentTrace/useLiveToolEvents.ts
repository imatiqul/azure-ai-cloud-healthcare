import { useEffect, useState } from 'react';
import {
  createGlobalVoiceClient,
  hasGlobalVoiceClient,
  type VoiceSessionMessage,
} from '@healthcare/web-pubsub-client';
import type { LiveToolEvent } from './LiveToolFeed';

/**
 * W5.2 — subscribes to ToolInvoked / ToolCompleted Web PubSub messages for the
 * given session and returns a rolling event list. No-op (returns empty array)
 * when sessionId is absent or the negotiate base URL is not configured.
 */
export function useLiveToolEvents(sessionId: string | undefined, maxItems = 50): LiveToolEvent[] {
  const [events, setEvents] = useState<LiveToolEvent[]>([]);

  useEffect(() => {
    const negotiateBase = (import.meta.env.VITE_AGENTS_API_BASE as string | undefined) ?? '';
    if (!sessionId || !negotiateBase) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let joinedSessionId: string | undefined;

    const handle = (msg: VoiceSessionMessage) => {
      if (msg.type === 'ToolInvoked') {
        setEvents(prev => trim(prev.concat({
          kind: 'invoked',
          pluginName: msg.pluginName,
          functionName: msg.functionName,
          agentName: msg.agentName,
          timestamp: msg.timestamp,
        }), maxItems));
      } else if (msg.type === 'ToolCompleted') {
        setEvents(prev => trim(prev.concat({
          kind: 'completed',
          pluginName: msg.pluginName,
          functionName: msg.functionName,
          durationMs: msg.durationMs,
          success: msg.success,
          timestamp: msg.timestamp,
        }), maxItems));
      }
    };

    (async () => {
      try {
        const client = await createGlobalVoiceClient(negotiateBase, sessionId);
        if (cancelled) return;
        if (!hasGlobalVoiceClient()) return;
        await client.start();
        await client.joinSession(sessionId);
        joinedSessionId = sessionId;
        unsubscribe = client.onMessage(handle);
      } catch {
        // Real-time stream unavailable — viewer falls back to polling-only.
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      // Best-effort leave; ignore errors during teardown.
      if (joinedSessionId) {
        void (async () => {
          try {
            const client = await createGlobalVoiceClient(negotiateBase, joinedSessionId!);
            await client.leaveSession(joinedSessionId!);
          } catch {
            /* ignore */
          }
        })();
      }
    };
  }, [sessionId, maxItems]);

  return events;
}

function trim<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(arr.length - max) : arr;
}
