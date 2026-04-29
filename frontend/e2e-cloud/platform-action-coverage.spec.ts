import { test, expect } from './fixtures';
import fs from 'node:fs';
import path from 'node:path';

type ActionKind = 'sidebar-nav' | 'tab-switch' | 'switch-toggle' | 'button-click';

type ActionSpec = {
  id: string;
  name: string;
  module: string;
  kind: ActionKind;
  route?: string;
  fromRoute?: string;
  targetRoute?: string;
  tabLabel?: string;
  ariaLabel?: string;
  buttonName?: string;
  expectRoute?: string;
  expectText?: string;
  prefill?: Record<string, string>;
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

const manifestPath = path.resolve(process.cwd(), 'e2e-cloud', 'platform-action-manifest.json');
const actions = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ActionSpec[];

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

test.describe('Platform Action Coverage — Cloud', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((groups) => {
      localStorage.setItem('hq:onboarded-v38', 'done');
      localStorage.setItem('hq:sidebar-groups', groups);
    }, SIDEBAR_GROUPS_ALL_OPEN);

    // Force cloud tests through page fallback paths for deterministic action checks.
    await page.route('**/api/v1/**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'stubbed backend offline for action coverage' }),
      });
    });
  });

  for (const action of actions) {
    test(`[action:${action.id}] ${action.name}`, async ({ page }) => {
      if (action.kind === 'sidebar-nav') {
        const fromRoute = action.fromRoute ?? '/';
        const targetRoute = action.targetRoute;
        if (!targetRoute) throw new Error(`Action ${action.id} is missing targetRoute.`);

        await openRoute(page, fromRoute);

        const link = page.locator(`a[href="${targetRoute}"]`).first();
        await expect(link).toBeVisible({ timeout: 20_000 });
        await link.click();
        await expectRoute(page, targetRoute);
        await expect(page.getByTestId('shell-sidebar')).toBeVisible({ timeout: 20_000 });
        return;
      }

      if (action.kind === 'tab-switch') {
        if (!action.route || !action.tabLabel) {
          throw new Error(`Action ${action.id} is missing route/tabLabel.`);
        }

        await openRoute(page, action.route);
        const tablist = page.getByRole('tablist', { name: /navigation tabs/i }).first();
        const tab = tablist.getByRole('tab', { name: new RegExp(`^${escapeRegex(action.tabLabel)}$`, 'i') });
        await expect(tab).toBeVisible({ timeout: 20_000 });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        return;
      }

      if (action.kind === 'switch-toggle') {
        if (!action.route || !action.ariaLabel) {
          throw new Error(`Action ${action.id} is missing route/ariaLabel.`);
        }

        await openRoute(page, action.route);
        const toggle = page
          .locator(`[data-testid="${action.ariaLabel}-input"], input[aria-label="${action.ariaLabel}"], [aria-label="${action.ariaLabel}"]`)
          .first();
        await expect(toggle).toBeVisible({ timeout: 20_000 });
        const checkedBefore = await toggle.isChecked();
        await toggle.click();
        if (checkedBefore) {
          await expect(toggle).not.toBeChecked();
        } else {
          await expect(toggle).toBeChecked();
        }
        return;
      }

      if (action.kind === 'button-click') {
        if (!action.route || !action.buttonName) {
          throw new Error(`Action ${action.id} is missing route/buttonName.`);
        }

        await openRoute(page, action.route);

        if (action.prefill) {
          for (const [label, value] of Object.entries(action.prefill)) {
            await page.getByLabel(new RegExp(escapeRegex(label), 'i')).fill(value);
          }
        }

        const button = page.getByRole('button', { name: new RegExp(escapeRegex(action.buttonName), 'i') }).first();
        await expect(button).toBeVisible({ timeout: 20_000 });
        await button.click();

        if (action.expectRoute) {
          await expectRoute(page, action.expectRoute);
        }
        if (action.expectText) {
          await expect(page.getByText(new RegExp(escapeRegex(action.expectText), 'i')).first()).toBeVisible({ timeout: 20_000 });
        }
        return;
      }

      throw new Error(`Unsupported action kind in ${action.id}: ${String(action.kind)}`);
    });
  }
});
