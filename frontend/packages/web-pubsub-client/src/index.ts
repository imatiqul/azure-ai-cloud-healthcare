import {
  WebPubSubClient,
  WebPubSubJsonReliableProtocol,
  type OnGroupDataMessageArgs,
} from '@azure/web-pubsub-client';

// ── Typed message payloads ────────────────────────────────────────────────────

export interface AiThinkingMessage {
  type: 'AiThinking';
  token: string;
  isFinal: boolean;
  timestamp: string;
}

export interface AgentResponseMessage {
  type: 'AgentResponse';
  text: string;
  triageLevel: string | null;
  guardApproved: boolean;
  timestamp: string;
}

export interface TranscriptReceivedMessage {
  type: 'TranscriptReceived';
  text: string;
  timestamp: string;
}

export interface TranscriptionStartedMessage {
  type: 'TranscriptionStarted';
  sessionId: string;
}

export interface EscalationRequiredMessage {
  type: 'EscalationRequired';
  sessionId: string;
  reason?: string;
}

export type VoiceSessionMessage =
  | AiThinkingMessage
  | AgentResponseMessage
  | TranscriptReceivedMessage
  | TranscriptionStartedMessage
  | EscalationRequiredMessage;

// ── Client wrapper ────────────────────────────────────────────────────────────

export interface VoiceSessionClientOptions {
  /** URL returned by the backend's /api/webpubsub/negotiate endpoint */
  clientAccessUrl: string;
}

export class VoiceSessionClient {
  private readonly inner: WebPubSubClient;
  private sessionGroupName = '';
  private started = false;

  constructor(options: VoiceSessionClientOptions) {
    this.inner = new WebPubSubClient(
      options.clientAccessUrl,
      { protocol: WebPubSubJsonReliableProtocol() },
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.inner.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.inner.stop();
    this.started = false;
  }

  async joinSession(sessionId: string): Promise<void> {
    this.sessionGroupName = `session-${sessionId}`;
    await this.inner.joinGroup(this.sessionGroupName);
  }

  async leaveSession(sessionId: string): Promise<void> {
    const group = `session-${sessionId}`;
    await this.inner.leaveGroup(group);
  }

  /**
   * Subscribe to all typed messages from the current session group.
   * Returns an unsubscribe function.
   */
  onMessage(handler: (msg: VoiceSessionMessage) => void): () => void {
    const listener = (e: OnGroupDataMessageArgs) => {
      try {
        const data = e.message.data;
        if (data && typeof data === 'object' && 'type' in data) {
          handler(data as VoiceSessionMessage);
        }
      } catch {
        // malformed message — ignore
      }
    };

    this.inner.on('group-message', listener);
    return () => this.inner.off('group-message', listener);
  }

  onConnected(handler: () => void): void {
    this.inner.on('connected', () => handler());
  }

  onDisconnected(handler: () => void): void {
    this.inner.on('disconnected', () => handler());
  }

  /**
   * The Azure Web PubSub SDK does not emit a 'reconnecting' event.
   * Auto-reconnect is handled internally; subscribe to onDisconnected/onConnected
   * to react to connectivity state changes.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onReconnecting(_handler: () => void): void {
    // no-op: SDK uses autoReconnect internally; onDisconnected + onConnected cover state changes
  }
}

// ── Global singleton ──────────────────────────────────────────────────────────

let globalClient: VoiceSessionClient | null = null;

/** Returns true if a global client has already been created and is running. */
export function hasGlobalVoiceClient(): boolean {
  return globalClient !== null;
}

/**
 * Creates (or returns existing) a global VoiceSessionClient.
 * Negotiates with the backend to get a time-limited WebSocket URL.
 */
export async function createGlobalVoiceClient(
  negotiateBaseUrl: string,
  sessionId: string,
  userId = 'anonymous',
): Promise<VoiceSessionClient> {
  if (globalClient) return globalClient;

  const negotiateUrl = `${negotiateBaseUrl}/api/webpubsub/negotiate?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userId)}`;
  const res = await fetch(negotiateUrl, { credentials: 'omit' });

  if (!res.ok) {
    throw new Error(`Web PubSub negotiate failed: ${res.status}`);
  }

  const { url } = (await res.json()) as { url: string };
  globalClient = new VoiceSessionClient({ clientAccessUrl: url });
  return globalClient;
}

export async function disposeGlobalVoiceClient(): Promise<void> {
  if (globalClient) {
    await globalClient.stop();
    globalClient = null;
  }
}

// ── Workflow Ops real-time push ───────────────────────────────────────────────

export interface WorkflowUpdatedMessage {
  type: 'WorkflowUpdated';
  action: 'Approved' | 'EscalationClaimed' | 'EscalationReleased' | 'RetryEncounter' | 'RetryRevenue' | 'RetryNotification' | 'RetryScheduling' | 'RequeueScheduling';
  workflow: WorkflowSummary;
}

export interface WorkflowSummary {
  id: string;
  sessionId: string;
  patientId: string;
  patientName?: string;
  status: string;
  triageLevel?: string;
  requiresAttention: boolean;
  escalationStatus?: string;
  schedulingStatus?: string;
  encounterStatus?: string;
  revenueStatus?: string;
  notificationStatus?: string;
  approvedBy?: string;
  approvedAt?: string;
  latestExceptionCode?: string;
  latestExceptionMessage?: string;
}

/**
 * Subscribes to real-time workflow state changes broadcast by the Agents service.
 * Connects to the `workflow-ops` WebPubSub group.
 */
export class WorkflowOpsClient {
  private readonly inner: WebPubSubClient;
  private readonly groupName = 'workflow-ops';
  private started = false;

  constructor(clientAccessUrl: string) {
    this.inner = new WebPubSubClient(clientAccessUrl, {
      protocol: WebPubSubJsonReliableProtocol(),
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.inner.start();
    await this.inner.joinGroup(this.groupName);
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    try { await this.inner.leaveGroup(this.groupName); } catch { /* ignore */ }
    this.inner.stop();
    this.started = false;
  }

  onWorkflowUpdated(handler: (msg: WorkflowUpdatedMessage) => void): () => void {
    const listener = (e: OnGroupDataMessageArgs) => {
      try {
        const data = e.message.data;
        if (data && typeof data === 'object' && 'type' in data && (data as { type: string }).type === 'WorkflowUpdated') {
          handler(data as WorkflowUpdatedMessage);
        }
      } catch {
        // malformed — ignore
      }
    };
    this.inner.on('group-message', listener);
    return () => this.inner.off('group-message', listener);
  }

  onConnected(handler: () => void): void { this.inner.on('connected', () => handler()); }
  onDisconnected(handler: () => void): void { this.inner.on('disconnected', () => handler()); }
}

/**
 * Negotiates a workflow-ops client access URL from the Agents API
 * and returns a ready-to-start WorkflowOpsClient.
 */
export async function createWorkflowOpsClient(agentsBaseUrl: string, userId = 'anonymous'): Promise<WorkflowOpsClient> {
  const res = await fetch(
    `${agentsBaseUrl}/api/v1/agents/workflows/realtime/negotiate?userId=${encodeURIComponent(userId)}`,
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(`Workflow ops negotiate failed: ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  return new WorkflowOpsClient(url);
}
