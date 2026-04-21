import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingWizard, ONBOARDING_KEY, isOnboardingComplete, markOnboardingComplete } from './OnboardingWizard';

vi.mock('@healthcare/design-system', () => ({
  SkeletonStatGrid: () => null,
}));

beforeEach(() => {
  localStorage.clear();
});

function renderWizard() {
  return render(
    <MemoryRouter>
      <OnboardingWizard />
    </MemoryRouter>
  );
}

describe('OnboardingWizard', () => {
  it('opens automatically when onboarding has not been completed', () => {
    renderWizard();
    expect(screen.getByLabelText('Onboarding wizard')).toBeInTheDocument();
    expect(screen.getByText('Welcome to HealthQ Copilot')).toBeInTheDocument();
  });

  it('does not open when onboarding key is already set', () => {
    markOnboardingComplete();
    renderWizard();
    // Dialog should not be open (no visible heading)
    expect(screen.queryByText('Welcome to HealthQ Copilot')).not.toBeInTheDocument();
  });

  it('advances to next step on Next click', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('AI-Powered Clinical Triage')).toBeInTheDocument();
  });

  it('goes back to previous step on Back click', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByText('Welcome to HealthQ Copilot')).toBeInTheDocument();
  });

  it('Back button is disabled on the first step', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled();
  });

  it('Skip tour dismisses without marking complete when checkbox unchecked', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Skip onboarding' }));
    // With conditional render, open=false means component returns null
    expect(screen.queryByLabelText('Onboarding wizard')).not.toBeInTheDocument();
    // key NOT persisted (checkbox was unchecked)
    expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull();
  });

  it("Skip tour with 'Don't show again' marks onboarding complete", () => {
    renderWizard();
    // single checkbox in the dialog — toggle it then skip
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Skip onboarding' }));
    expect(isOnboardingComplete()).toBe(true);
  });

  it('isOnboardingComplete returns false when key is absent', () => {
    expect(isOnboardingComplete()).toBe(false);
  });

  it('markOnboardingComplete sets the key', () => {
    markOnboardingComplete();
    expect(isOnboardingComplete()).toBe(true);
  });

  it('final step shows Get Started and finishes onboarding on click', () => {
    renderWizard();
    // Navigate through all 4 "Next" clicks to reach final step
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    }
    // Final step button label changes to "Get Started"
    expect(screen.getByRole('button', { name: 'Finish onboarding' })).toBeInTheDocument();
    expect(screen.getByText("You're all set!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish onboarding' }));
    // Dialog closes after finishing
    expect(screen.queryByLabelText('Onboarding wizard')).not.toBeInTheDocument();
    expect(isOnboardingComplete()).toBe(true);
  });

  it('action button on a non-final step navigates and closes wizard', () => {
    renderWizard();
    // Navigate to step 1 (AI Triage) which has an action button
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('AI-Powered Clinical Triage')).toBeInTheDocument();
    // Click the quick-nav action button
    fireEvent.click(screen.getByRole('button', { name: 'Go to Triage' }));
    // Wizard closes
    expect(screen.queryByLabelText('Onboarding wizard')).not.toBeInTheDocument();
    expect(isOnboardingComplete()).toBe(true);
  });
});
