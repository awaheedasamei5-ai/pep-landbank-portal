import { test, expect } from '@playwright/test';
import { loginAsAgent, loginAsManager } from './helpers';

test('agent can navigate the whole shell with zero console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await loginAsAgent(page);
  for (const path of ['/app/sales', '/app/sales/pipeline', '/app/office', '/app/office/myday', '/app/chat', '/app/more', '/app/home']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toBeEmpty();
  }

  expect(errors, `console errors: ${errors.join('\n')}`).toEqual([]);
});

test('manager lands on the manager home route and stays role-gated', async ({ page }) => {
  await loginAsManager(page);
  await expect(page).toHaveURL(/\/app\/mgr$/);

  // An agent-only route must bounce a manager back to their own home, not
  // loop -- this is the exact bug caught and fixed during Phase 1.
  await page.goto('/app/home');
  await expect(page).toHaveURL(/\/app\/mgr$/);
});

test('add-lead form validates required fields before submit', async ({ page }) => {
  await loginAsAgent(page);
  await page.goto('/app/sales/pipeline/new');
  await page.getByRole('button', { name: 'Save lead' }).click();
  await expect(page.getByText('Required').first()).toBeVisible();
});

test('logging a payment as elias goes to pending, not the collected total', async ({ page }) => {
  // Real production RLS (payments_ins, confirmed live) only lets manager
  // or the 'elias' key insert a payment at all -- and only a manager's
  // own entry auto-approves. elias logging one here must land as
  // 'pending' and leave the lead's Collected pill untouched until a
  // manager reviews it -- this replaced an earlier, incorrect assumption
  // that any agent could self-log an already-applied payment.
  await loginAsAgent(page);
  await page.goto('/app/sales/pipeline');
  await page.getByText('Mercy Owusu').click();
  await expect(page).toHaveURL(/\/app\/sales\/pipeline\/.+/);

  const collectedBefore = await page.getByText('GHS 24,000').first().isVisible();
  expect(collectedBefore).toBe(true);

  await page.getByPlaceholder('0').fill('5000');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('+GHS 5,000')).toBeVisible();
  await expect(page.getByText('awaiting approval')).toBeVisible();
  // Collected must still read the pre-payment total -- a pending entry
  // has not been applied to the lead yet.
  await expect(page.getByText('GHS 24,000').first()).toBeVisible();
});
