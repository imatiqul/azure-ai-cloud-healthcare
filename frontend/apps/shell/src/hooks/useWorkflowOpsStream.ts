import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createWorkflowOpsClient,
  type WorkflowOpsClient,
  type WorkflowUpdatedMessage,
  type WorkflowSummary,
} from '@healthcare/web-pubsub-client';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WorkflowOpsStreamState {
  /** Latest workflow update received via Web PubSub push. Null until first event. */
  lastUpdate: WorkflowUpdatedMessage | null;
  /** Accumulated map of workflowId → latest summary for fast lookup. */
  liveWorkflows: Map<string, WorkflowSummary>;
  connectionState: ConnectionState;
  /** Call to reset liveWorkflows (e.g., after a full re-fetch from the API). */
  clearLiveCache: () => void;
}

const AGENTS_BASE = import.meta.env.VITE_AGENTS_API_URL || import.meta.env.VITE_API_BASE_URL || '';

/**
 * Subscribes to the workflow-ops WebPubSub group and surfaces live workflow
 * state updates. Gracefully degrades when Web PubSub is not configured.
 *
 * @param userId - The authenticated user identifier (used for the negotiate call).
 * @param enabled - Set to false to skip connecting (e.g., in demo mode).
 */
export function useWorkflowOpsStream(userId = 'anonymous', enabled = true): WorkflowOpsStreamState {
  const [lastUpdate, setLastUpdate] = useState<WorkflowUpdatedMessage | null>(null);
  const [liveWorkflows, setLiveWorkflows] = useState<Map<string, WorkflowSummary>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const clientRef = useRef<WorkflowOpsClient | null>(null);

  const clearLiveCache = useCallback(() => setLiveWorkflows(new Map()), []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const connect = async () => {
      setConnectionState('connecting');
      try {
        const client = await createWorkflowOpsClient(AGENTS_BASE, userId);
        if (cancelled) { await client.stop(); return; }

        clientRef.current = client;

        client.onConnected(() => setConnectionState('connected'));
        client.onDisconnected(() => setConnectionState('disconnected'));

        unsubscribe = client.onWorkflowUpdated((msg) => {
          setLastUpdate(msg);
          setLiveWorkflows(prev => {
            const next = new Map(prev);
            next.set(msg.workflow.id, msg.workflow);
            return next;
          });
        });

        await client.start();
        if (!cancelled) setConnectionState('connected');
      } catch (err) {
        if (!cancelled) {
          // Web PubSub not configured in dev — silent degradation
          console.debug('[WorkflowOpsStream] connect failed (dev mode):', err);
          setConnectionState('error');
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      unsubscribe?.();
      clientRef.current?.stop().catch(() => { /* ignore cleanup errors */ });
      clientRef.current = null;
    };
  }, [userId, enabled]);

  return { lastUpdate, liveWorkflows, connectionState, clearLiveCache };
}
