import { test, expect } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

type JourneyStep =
  | { kind: 'open'; route: string }
  | { kind: 'sidebar-nav'; targetRoute: string }
  | { kind: 'tab-switch'; tabLabel: string }
  | { kind: 'button-click'; buttonName: string; prefill?: Record<string, string>; expectRoute?: string; expectText?: string };

type JourneySpec = {
  id: string;
  name: string;
  steps: JourneyStep[];
};

const SIDEBAR_GROUPS_ALL_OPEN = JSON.stringify({
  'nav.group.main': true,
  'nav.group.business': true,
  'nav.group.clinical': true,
  'nav.group.analytics': true,
  'nav.group.patient': true,
  'nav.group.governance': true,
  'nav.group.admin': true,
});

const manifestPath = path.resolve(process.cwd(), 'e2e-cloud', 'platform-journey-manifest.json');
const journeys = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as JourneySpec[];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function expectRoute(page: import('@playwright/test').Page, route: string): Promise<void> {
  if (route === '/') {
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    return;
  }
  await expect(page).toHaveURL(new RegExp(`${escapeRegex(route)}$`), { timeout: 20_000 });
}

async function openRoute(page: import('@playwright/test').Page, route: string): Promise<void> {
  await page.goto(route);
  await expectRoute(page, route);

  if (route.startsWith('/demo')) {
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
    return;
  }

  await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main')).toBeVisible({ timeout: 20_000 });
}

test.describe.configure({ mode: 'parallel' });

test.describe('Platform Journey Coverage — Cloud', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((groups) => {
      localStorage.setItem('hq:onboarded-v38', 'done');
      localStorage.setItem('hq:sidebar-groups', groups);
    }, SIDEBAR_GROUPS_ALL_OPEN);

    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'stubbed backend offline for journey coverage' }),
      });
    });
  });

  for (const journey of journeys) {
    test(`[journey:${journey.id}] ${journey.name}`, async ({ page }) => {
      if (!Array.isArray(journey.steps) || journey.steps.length === 0) {
        throw new Error(`Journey ${journey.id} has no steps.`);
      }

      for (const step of journey.steps) {
        if (step.kind === 'open') {
          await openRoute(page, step.route);
          continue;
        }

        if (step.kind === 'sidebar-nav') {
          const link = page.locator(`a[href="${step.targetRoute}"]`).first();
          await expect(link).toBeVisible({ timeout: 20_000 });
          await link.click();
          await expectRoute(page, step.targetRoute);
          await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
          continue;
        }

        if (step.kind === 'tab-switch') {
          const tablist = page.getByRole('tablist', { name: /navigation tabs/i }).first();
          const tab = tablist.getByRole('tab', { name: new RegExp(`^${escapeRegex(step.tabLabel)}$`, 'i') });
          await expect(tab).toBeVisible({ timeout: 20_000 });
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          continue;
        }

        if (step.kind === 'button-click') {
          if (step.prefill) {
            for (const [label, value] of Object.entries(step.prefill)) {
              await page.getByLabel(new RegExp(escapeRegex(label), 'i')).fill(value);
            }
          }

          const button = page.getByRole('button', { name: new RegExp(escapeRegex(step.buttonName), 'i') }).first();
          await expect(button).toBeVisible({ timeout: 20_000 });
          await button.click();

          if (step.expectRoute) {
            await expectRoute(page, step.expectRoute);
          }
          if (step.expectText) {
            await expect(page.getByText(new RegExp(escapeRegex(step.expectText), 'i')).first()).toBeVisible({ timeout: 20_000 });
          }
          continue;
        }

        throw new Error(`Journey ${journey.id} has unsupported step: ${JSON.stringify(step)}`);
      }
    });
  }
});
