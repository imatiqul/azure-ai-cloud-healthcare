import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { selectShellTab } from '@healthcare/mfe-events';
import { TabbedPageLayout } from './TabbedPageLayout';

const defaultTabs = [
  { label: 'Tab One',   content: <div>Content One</div>   },
  { label: 'Tab Two',   content: <div>Content Two</div>   },
  { label: 'Tab Three', content: <div>Content Three</div> },
];

function renderLayout(overrides: Record<string, unknown> = {}) {
  return render(
    <TabbedPageLayout tabs={defaultTabs} title="Test Page" {...overrides} />
  );
}

describe('TabbedPageLayout', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders the page title when provided', () => {
    renderLayout();
    expect(screen.getByText('Test Page')).toBeInTheDocument();
  });

  it('renders all tab labels', () => {
    renderLayout();
    expect(screen.getByRole('tab', { name: 'Tab One' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab Three' })).toBeInTheDocument();
  });

  it('shows first tab content by default', () => {
    renderLayout();
    expect(screen.getByText('Content One')).toBeInTheDocument();
  });

  it('does not render inactive tab content initially', () => {
    renderLayout();
    expect(screen.queryByText('Content Two')).not.toBeInTheDocument();
    expect(screen.queryByText('Content Three')).not.toBeInTheDocument();
  });

  it('switches content when another tab is clicked', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('tab', { name: 'Tab Two' }));
    expect(screen.getByText('Content Two')).toBeInTheDocument();
    expect(screen.queryByText('Content One')).not.toBeInTheDocument();
  });

  it('can cycle through multiple tabs', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('tab', { name: 'Tab Three' }));
    expect(screen.getByText('Content Three')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Tab One' }));
    expect(screen.getByText('Content One')).toBeInTheDocument();
    expect(screen.queryByText('Content Three')).not.toBeInTheDocument();
  });

  it('persists active tab index to sessionStorage', () => {
    renderLayout({ storageKey: 'hq:test-tabs' });
    fireEvent.click(screen.getByRole('tab', { name: 'Tab Two' }));
    expect(sessionStorage.getItem('hq:test-tabs')).toBe('1');
  });

  it('restores active tab from sessionStorage on mount', () => {
    sessionStorage.setItem('hq:test-tabs', '2');
    renderLayout({ storageKey: 'hq:test-tabs' });
    expect(screen.getByText('Content Three')).toBeInTheDocument();
    expect(screen.queryByText('Content One')).not.toBeInTheDocument();
  });

  it('falls back to tab 0 for out-of-bounds sessionStorage value', () => {
    sessionStorage.setItem('hq:test-tabs', '99');
    renderLayout({ storageKey: 'hq:test-tabs' });
    expect(screen.getByText('Content One')).toBeInTheDocument();
  });

  it('tabs have correct aria-controls attributes', () => {
    renderLayout();
    expect(screen.getByRole('tab', { name: 'Tab One' })).toHaveAttribute('aria-controls', 'tabpanel-0');
    expect(screen.getByRole('tab', { name: 'Tab Two' })).toHaveAttribute('aria-controls', 'tabpanel-1');
  });

  it('tabpanels have correct aria-labelledby attributes', () => {
    renderLayout();
    expect(document.getElementById('tabpanel-0')).toHaveAttribute('aria-labelledby', 'tab-0');
    expect(document.getElementById('tabpanel-1')).toHaveAttribute('aria-labelledby', 'tab-1');
  });

  it('does not render title when title prop is omitted', () => {
    render(<TabbedPageLayout tabs={defaultTabs} />);
    // No heading-level element for the title
    expect(screen.queryByText('Test Page')).not.toBeInTheDocument();
  });

  it('works without a storageKey (no sessionStorage writes)', () => {
    renderLayout(); // no storageKey
    fireEvent.click(screen.getByRole('tab', { name: 'Tab Three' }));
    expect(screen.getByText('Content Three')).toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });

  it('switches tabs when a shell tab-selection request is emitted', () => {
    renderLayout({ storageKey: 'hq:test-tabs' });

    act(() => {
      selectShellTab('hq:test-tabs', 2);
    });

    expect(screen.getByText('Content Three')).toBeInTheDocument();
    expect(sessionStorage.getItem('hq:test-tabs')).toBe('2');
  });
});
