# Voice MFE

Micro frontend for **real-time voice session management** — provides the clinical voice interface with live transcript streaming via Azure Web PubSub.

## Exposed Components

| Component | Path | Description |
|---|---|---|
| `VoiceSessionController` | `./src/components/VoiceSessionController.tsx` | Start/stop/manage voice recording sessions |
| `LiveTranscriptFeed` | `./src/components/LiveTranscriptFeed.tsx` | Real-time transcript display with Azure Web PubSub streaming |

These components are consumed by the Shell host app via Module Federation at runtime.

## Technology Choices

| Technology | Version | Why |
|---|---|---|
| **Vite** | 6.4 | Fast HMR for real-time UI iteration; native ESM dev server |
| **@module-federation/vite** | 1.14 | Exposes components to Shell host; independently deployable |
| **React** | 19 | Concurrent rendering for smooth transcript updates during active voice sessions |
| **MUI** | 6.4 | Consistent healthcare UI — buttons, cards, status indicators aligned with platform theme |
| **@microsoft/signalr** | — | WebSocket connection to Voice Service `/hubs/voice` for bidirectional audio streaming; shared singleton avoids duplicate connections |
| **zustand** | 5 | Local state for session status, audio levels, transcript buffer — shared singleton with Shell |

## Running

```bash
# As part of the full monorepo (recommended)
cd frontend
pnpm dev          # Starts on port 3001

# Standalone
cd frontend/apps/voice-mfe
pnpm dev          # Starts on port 3001
```

## Environment Configuration

| Setting | Local | Staging | Production |
|---|---|---|---|
| **Port** | 3001 | Azure Static Web Apps | CDN |
| **API Proxy** | `http://localhost:5001` (Vite proxy) | API Management | API Management |
| **SignalR Hub** | `ws://localhost:5001/hubs/voice` | Azure SignalR Service | Azure SignalR Service |

## Build & Deploy

```bash
pnpm build        # Output in dist/ with mf-manifest.json for federation
```

Deployed independently via `frontend-deploy.yml` — changes to this MFE don't require rebuilding other MFEs or the Shell.

## Backend Service

Communicates with **HealthcareAI.Voice** (port 5001) for:
- Voice session lifecycle (REST API)
- Real-time audio streaming (SignalR WebSocket)
