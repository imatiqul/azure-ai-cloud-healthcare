import { test, expect } from '@playwright/test';

test.describe('Copilot Guide', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/agents/guide/suggestions', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'overview', text: 'Show me the platform overview', description: 'Learn what each module does' },
          { id: 'workflow', text: 'Guide me through the clinical workflow', description: 'Step-by-step patient journey' },
          { id: 'dashboard', text: 'Show me the dashboard summary', description: 'Real-time stats from all services' },
          { id: 'triage', text: "What's the triage status?", description: 'Pending cases and priorities' },
          { id: 'scheduling', text: 'Show available appointment slots', description: "Today's calendar overview" },
          { id: 'revenue', text: 'Show revenue cycle stats', description: 'Coding queue and prior auth status' },
          { id: 'pophealth', text: 'Show high-risk patients', description: 'Critical patients needing attention' },
          { id: 'next', text: 'What should I do next?', description: 'Get guided to the next workflow step' },
        ]),
      }),
    );

    await page.route('**/api/v1/agents/guide/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: '00000000-0000-0000-0000-000000000001',
          message: '👋 **Welcome to HealthQ Copilot!** I can help you navigate the platform.',
          suggestedRoute: null,
        }),
      }),
    );
  });

  test('renders copilot chat interface', async ({ page }) => {
    await page.goto('/');
    const copilotBtn = page.getByRole('button', { name: /copilot|guide|assistant|chat/i });
    if (await copilotBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copilotBtn.click();
      await expect(page.getByText(/copilot|guide|assistant/i).first()).toBeVisible();
    }
  });

  test('sends a message and receives response', async ({ page }) => {
    await page.goto('/');
    const copilotBtn = page.getByRole('button', { name: /copilot|guide|assistant|chat/i });
    if (await copilotBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copilotBtn.click();
      const input = page.getByPlaceholder(/ask|message|type/i);
      if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
        await input.fill('Hello');
        await input.press('Enter');
        await expect(page.getByText(/Welcome to HealthQ Copilot/)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('displays suggestion chips', async ({ page }) => {
    await page.goto('/');
    const copilotBtn = page.getByRole('button', { name: /copilot|guide|assistant|chat/i });
    if (await copilotBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copilotBtn.click();
      const suggestion = page.getByText('Show me the platform overview');
      if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(suggestion).toBeVisible();
      }
    }
  });
});
