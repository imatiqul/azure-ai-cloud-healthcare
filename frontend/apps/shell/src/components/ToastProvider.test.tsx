import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './ToastProvider';

// Helper component that exposes showToast for testing
function ToastTrigger({ message, severity }: { message: string; severity?: 'success' | 'error' | 'warning' | 'info' }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message, severity)}>
      Show Toast
    </button>
  );
}

function renderWithProvider(message: string, severity?: 'success' | 'error' | 'warning' | 'info') {
  return render(
    <ToastProvider>
      <ToastTrigger message={message} severity={severity} />
    </ToastProvider>
  );
}



describe('ToastProvider', () => {
  it('renders children without showing a snackbar initially', () => {
    renderWithProvider('Hello');
    expect(screen.getByText('Show Toast')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a toast message when showToast is called', async () => {
    const user = userEvent.setup();
    renderWithProvider('Operation successful', 'success');
    await user.click(screen.getByText('Show Toast'));
    expect(await screen.findByText('Operation successful')).toBeInTheDocument();
  });

  it('shows toast with error severity', async () => {
    const user = userEvent.setup();
    renderWithProvider('Something went wrong', 'error');
    await user.click(screen.getByText('Show Toast'));
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows toast with warning severity', async () => {
    const user = userEvent.setup();
    renderWithProvider('Warning message', 'warning');
    await user.click(screen.getByText('Show Toast'));
    expect(await screen.findByText('Warning message')).toBeInTheDocument();
  });

  it('useToast throws when used outside ToastProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Bad() { useToast(); return null; }
    expect(() => render(<Bad />)).toThrow('useToast must be used inside <ToastProvider>');
    spy.mockRestore();
  });

  it('close button exists and is clickable', async () => {
    const user = userEvent.setup();
    renderWithProvider('Closable toast', 'info');
    await user.click(screen.getByText('Show Toast'));
    await screen.findByText('Closable toast');
    const closeBtn = screen.getByLabelText('Close');
    await expect(user.click(closeBtn)).resolves.not.toThrow();
  });
});
