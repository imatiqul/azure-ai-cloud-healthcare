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
  const res = await fetch(negotiateUrl, { credentials: 'include' });

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
