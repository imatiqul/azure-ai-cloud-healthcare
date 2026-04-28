import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LiveToolFeed, type LiveToolEvent } from './LiveToolFeed';

describe('LiveToolFeed', () => {
  it('renders nothing when events is empty', () => {
    const { container } = render(<LiveToolFeed events={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an invoked event with plugin.function and agent', () => {
    const events: LiveToolEvent[] = [
      {
        kind: 'invoked',
        pluginName: 'Patient',
        functionName: 'lookup',
        agentName: 'TriageAgent',
        timestamp: '2026-04-26T20:00:00Z',
      },
    ];
    render(<LiveToolFeed events={events} />);
    expect(screen.getByText('invoked')).toBeTruthy();
    expect(screen.getByText('Patient.lookup')).toBeTruthy();
    expect(screen.getByText(/TriageAgent/)).toBeTruthy();
  });

  it('renders a completed event with duration and success chip', () => {
    const events: LiveToolEvent[] = [
      {
        kind: 'completed',
        pluginName: 'Patient',
        functionName: 'lookup',
        durationMs: 142.7,
        success: true,
        timestamp: '2026-04-26T20:00:01Z',
      },
    ];
    render(<LiveToolFeed events={events} />);
    expect(screen.getByText('completed')).toBeTruthy();
    expect(screen.getByText('Patient.lookup')).toBeTruthy();
    expect(screen.getByText(/143 ms/)).toBeTruthy();
  });

  it('caps to maxItems most-recent events', () => {
    const events: LiveToolEvent[] = Array.from({ length: 25 }).map((_, i) => ({
      kind: 'invoked' as const,
      pluginName: 'P',
      functionName: `f${i}`,
      agentName: 'A',
      timestamp: `2026-04-26T20:00:${String(i).padStart(2, '0')}Z`,
    }));
    render(<LiveToolFeed events={events} maxItems={5} />);
    const feed = screen.getByLabelText('Live agent tool activity');
    const items = within(feed).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(within(feed).getByText('P.f24')).toBeTruthy();
    expect(within(feed).queryByText('P.f0')).toBeNull();
  });
});
