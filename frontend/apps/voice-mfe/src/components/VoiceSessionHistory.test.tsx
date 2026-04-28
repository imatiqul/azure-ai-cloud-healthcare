import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { VoiceSessionHistory } from './VoiceSessionHistory';
import { gqlFetch } from '@healthcare/graphql-client';

vi.mock('@healthcare/graphql-client', () => ({ gqlFetch: vi.fn() }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(gqlFetch).mockReset();
});

const makeSessions = () => [
  {
    id: 'aaaa-0001-0001-0001-000000000001',
    patientId: 'PAT-001',
    status: 'Ended',
    transcriptText: null,
    createdAt: '2026-04-19T08:30:00Z',
    endedAt: '2026-04-19T09:00:00Z',
  },
  {
    id: 'bbbb-0002-0002-0002-000000000002',
    patientId: 'PAT-002',
    status: 'Live',
    transcriptText: null,
    createdAt: new Date(Date.now() - 300000).toISOString(),
    endedAt: null,
  },
];

describe('VoiceSessionHistory', () => {
  it('renders Voice Session History header', () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: [] });
    render(<VoiceSessionHistory />);
    expect(screen.getByText('Voice Session History')).toBeInTheDocument();
  });

  it('shows demo sessions when API returns empty list', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: [] });
    render(<VoiceSessionHistory />);
    await waitFor(() =>
      expect(screen.getByText('PAT-00142')).toBeInTheDocument()
    );
  });

  it('calls gqlFetch on mount', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: [] });
    render(<VoiceSessionHistory />);
    await waitFor(() => expect(gqlFetch).toHaveBeenCalled());
  });

  it('displays patient IDs after load', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: makeSessions() });
    render(<VoiceSessionHistory />);
    await waitFor(() => expect(screen.getByText('PAT-001')).toBeInTheDocument());
    expect(screen.getByText('PAT-002')).toBeInTheDocument();
  });

  it('shows Live and Ended status chips', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: makeSessions() });
    render(<VoiceSessionHistory />);
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    expect(screen.getByText('Ended')).toBeInTheDocument();
  });

  it('shows live sessions banner when sessions are live', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: makeSessions() });
    render(<VoiceSessionHistory />);
    await waitFor(() => expect(screen.getByText('1 live')).toBeInTheDocument());
  });

  it('shows summary chips with total and ended counts', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: makeSessions() });
    render(<VoiceSessionHistory />);
    await waitFor(() => expect(screen.getByText('2 total')).toBeInTheDocument());
    expect(screen.getByText('1 ended')).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked(gqlFetch).mockRejectedValue(new Error('Network error'));
    render(<VoiceSessionHistory />);
    await waitFor(() =>
      expect(screen.getByText(/Failed to load sessions/)).toBeInTheDocument()
    );
  });

  it('re-fetches when refresh button clicked', async () => {
    vi.mocked(gqlFetch).mockResolvedValue({ voiceSessions: [] });
    render(<VoiceSessionHistory />);
    await waitFor(() => expect(gqlFetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /refresh sessions/i }));
    await waitFor(() => expect(gqlFetch).toHaveBeenCalledTimes(2));
  });
});
