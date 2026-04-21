import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsModal, useKeyboardShortcutsModal } from './KeyboardShortcutsModal';

// Mock design-system to avoid @mui/lab/Timeline import error in tests
vi.mock('@healthcare/design-system', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

function renderModal(open = true) {
  const onClose = vi.fn();
  render(<KeyboardShortcutsModal open={open} onClose={onClose} />);
  return { onClose };
}

describe('KeyboardShortcutsModal', () => {
  it('renders the dialog title when open', () => {
    renderModal(true);
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('does not show content when closed', () => {
    renderModal(false);
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
  });

  it('renders Navigation group', () => {
    renderModal();
    expect(screen.getByText('Navigation')).toBeInTheDocument();
    expect(screen.getByText('Open command palette')).toBeInTheDocument();
  });

  it('renders Command Palette group', () => {
    renderModal();
    expect(screen.getByText('Command Palette')).toBeInTheDocument();
    expect(screen.getByText('Move selection up / down')).toBeInTheDocument();
  });

  it('renders General group', () => {
    renderModal();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Move focus forward')).toBeInTheDocument();
  });

  it('calls onClose when Close button is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the "Press ? to toggle" hint', () => {
    renderModal();
    expect(screen.getByText(/Press/i)).toBeInTheDocument();
  });
});

// Hook tests — render a component that uses the hook
describe('useKeyboardShortcutsModal', () => {

  function HookConsumer() {
    const { open, openModal } = useKeyboardShortcutsModal();
    return (
      <>
        <button onClick={openModal}>Open</button>
        <span data-testid="state">{open ? 'open' : 'closed'}</span>
      </>
    );
  }

  it('starts closed', () => {
    render(<HookConsumer />);
    expect(screen.getByTestId('state').textContent).toBe('closed');
  });

  it('openModal opens the modal', async () => {
    const user = userEvent.setup();
    render(<HookConsumer />);
    await user.click(screen.getByText('Open'));
    expect(screen.getByTestId('state').textContent).toBe('open');
  });

  it('pressing ? opens the modal', async () => {
    render(<HookConsumer />);
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('state').textContent).toBe('open');
  });
});
