import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientRegistrationForm } from './PatientRegistrationForm';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('PatientRegistrationForm', () => {
  it('renders the register button in collapsed state', () => {
    const onRegistered = vi.fn();
    render(<PatientRegistrationForm onRegistered={onRegistered} />);
    expect(screen.getByRole('button', { name: /Register New Patient/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Full Name/)).not.toBeInTheDocument();
  });

  it('expands the form when register button is clicked', async () => {
    const user = userEvent.setup();
    render(<PatientRegistrationForm onRegistered={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Register New Patient/ }));
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
  });

  it('shows validation error when fields are empty', async () => {
    const user = userEvent.setup();
    render(<PatientRegistrationForm onRegistered={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Register New Patient/ }));
    await user.click(screen.getByRole('button', { name: /Register Patient/ }));
    expect(screen.getByText(/Full name and email are required/)).toBeInTheDocument();
  });

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup();
    render(<PatientRegistrationForm onRegistered={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Register New Patient/ }));
    await user.type(screen.getByLabelText(/Full Name/), 'Jane Doe');
    await user.type(screen.getByLabelText(/Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /Register Patient/ }));
    expect(screen.getByText(/valid email address/)).toBeInTheDocument();
  });

  it('submits form and calls onRegistered on success', async () => {
    const user = userEvent.setup();
    const onRegistered = vi.fn();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'patient-uuid-123' }),
      })
    ) as unknown as typeof fetch;

    render(<PatientRegistrationForm onRegistered={onRegistered} />);
    await user.click(screen.getByRole('button', { name: /Register New Patient/ }));
    await user.type(screen.getByLabelText(/Full Name/), 'Jane Smith');
    await user.type(screen.getByLabelText(/Email/), 'jane@healthq.io');
    await user.click(screen.getByRole('button', { name: /Register Patient/ }));

    await waitFor(() => {
      expect(onRegistered).toHaveBeenCalledWith('patient-uuid-123');
    });
    expect(screen.getByText(/patient-uuid-123/)).toBeInTheDocument();
  });

  it('shows API error message when registration fails', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Email already registered' }),
      })
    ) as unknown as typeof fetch;

    render(<PatientRegistrationForm onRegistered={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Register New Patient/ }));
    await user.type(screen.getByLabelText(/Full Name/), 'Duplicate User');
    await user.type(screen.getByLabelText(/Email/), 'dup@healthq.io');
    await user.click(screen.getByRole('button', { name: /Register Patient/ }));

    await waitFor(() => {
      expect(screen.getByText(/Email already registered/)).toBeInTheDocument();
    });
  });

  it('collapses form when Cancel Registration is clicked', async () => {
    const user = userEvent.setup();
    render(<PatientRegistrationForm onRegistered={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Register New Patient/ }));
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Cancel Registration/ }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/Full Name/)).not.toBeInTheDocument();
    });
  });
});
