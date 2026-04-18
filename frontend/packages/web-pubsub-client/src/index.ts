import { WebPubSubClient, WebPubSubJsonReliableProtocol } from '@azure/web-pubsub-client';

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

  constructor(options: VoiceSessionClientOptions) {
    this.inner = new WebPubSubClient(
      { getClientAccessUrl: () => Promise.resolve(options.clientAccessUrl) },
      { protocol: new WebPubSubJsonReliableProtocol() },
    );
  }

  async start(): Promise<void> {
    await this.inner.start();
  }

  async stop(): Promise<void> {
    await this.inner.stop();
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
    const listener = (e: { message: { data: unknown; group: string } }) => {
      try {
        const msg = e.message.data as VoiceSessionMessage;
        if (msg?.type) handler(msg);
      } catch {
        // malformed message — ignore
      }
    };

    this.inner.on('group-message', listener);
    return () => this.inner.off('group-message', listener);
  }

  onConnected(handler: () => void): void {
    this.inner.on('connected', handler);
  }

  onDisconnected(handler: () => void): void {
    this.inner.on('disconnected', handler);
  }

  onReconnecting(handler: () => void): void {
    this.inner.on('reconnecting', handler);
  }
}

// ── Global singleton ──────────────────────────────────────────────────────────

let globalClient: VoiceSessionClient | null = null;

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
