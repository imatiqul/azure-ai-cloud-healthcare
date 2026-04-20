import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelRegisterPanel from './ModelRegisterPanel';

const mockRegistered = {
  id: 'reg-001',
  modelName: 'gpt-4o',
  modelVersion: '2024-11-20',
  deploymentName: 'healthq-gpt4o-prod',
  deployedAt: '2026-04-20T09:00:00Z',
  isActive: true,
};

const mockDetail = {
  id: 'reg-002',
  modelName: 'gpt-4o-mini',
  modelVersion: '2024-07-18',
  deploymentName: 'healthq-mini-prod',
  skVersion: '1.30.0',
  promptHash: 'sha256:deadbeef',
  lastEvalScore: 0.91,
  deployedAt: '2026-04-15T12:00:00Z',
  isActive: true,
};

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('ModelRegisterPanel', () => {
  it('renders Register Model heading', () => {
    render(<ModelRegisterPanel />);
    expect(screen.getByText('Register New Model Deployment')).toBeTruthy();
    expect(screen.getByText('Lookup Registry Entry by ID')).toBeTruthy();
  });

  it('Register Model button is disabled when required fields are empty', () => {
    render(<ModelRegisterPanel />);
    const btn = screen.getByRole('button', { name: /register model/i });
    expect(btn).toBeDefined();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('POSTs to /api/v1/agents/governance/register on submit', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRegistered),
    });
    const user = userEvent.setup();
    render(<ModelRegisterPanel />);

    await user.type(screen.getByPlaceholderText('gpt-4o'), 'gpt-4o');
    await user.type(screen.getByPlaceholderText('2024-11-20'), '2024-11-20');
    await user.type(screen.getByPlaceholderText('healthq-gpt4o-prod'), 'healthq-gpt4o-prod');
    await user.type(screen.getByLabelText(/deployed by user id/i), 'user-xyz');

    await user.click(screen.getByRole('button', { name: /register model/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/governance/register'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows registered model name and ID on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockRegistered),
    });
    const user = userEvent.setup();
    render(<ModelRegisterPanel />);

    await user.type(screen.getByPlaceholderText('gpt-4o'), 'gpt-4o');
    await user.type(screen.getByPlaceholderText('2024-11-20'), '2024-11-20');
    await user.type(screen.getByPlaceholderText('healthq-gpt4o-prod'), 'healthq-gpt4o-prod');
    await user.type(screen.getByLabelText(/deployed by user id/i), 'user-xyz');
    await user.click(screen.getByRole('button', { name: /register model/i }));

    await waitFor(() => {
      expect(screen.getByText(/model registered: gpt-4o v2024-11-20/i)).toBeTruthy();
      expect(screen.getByText(/id: reg-001/i)).toBeTruthy();
    });
  });

  it('Lookup button is disabled when ID field is empty', () => {
    render(<ModelRegisterPanel />);
    const btn = screen.getByRole('button', { name: /^lookup$/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('GETs /api/v1/agents/governance/{id} on lookup', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    });
    const user = userEvent.setup();
    render(<ModelRegisterPanel />);

    await user.type(screen.getByLabelText('registry entry id'), 'reg-002');
    await user.click(screen.getByRole('button', { name: /^lookup$/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/agents/governance/reg-002')
      );
    });
  });

  it('shows model name and Active badge on lookup success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    });
    const user = userEvent.setup();
    render(<ModelRegisterPanel />);

    await user.type(screen.getByLabelText('registry entry id'), 'reg-002');
    await user.click(screen.getByRole('button', { name: /^lookup$/i }));

    await waitFor(() => {
      expect(screen.getByText('gpt-4o-mini')).toBeTruthy();
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.getByText('91%')).toBeTruthy();
    });
  });
});
