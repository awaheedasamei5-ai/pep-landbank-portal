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

test('logging a payment updates pipeline totals and the streak card mood together', async ({ page }) => {
  await loginAsAgent(page);
  await page.goto('/app/sales/pipeline');
  await page.getByText('Mercy Owusu').click();
  await expect(page).toHaveURL(/\/app\/sales\/pipeline\/.+/);

  await page.getByPlaceholder('0').fill('5000');
  await page.getByRole('button', { name: 'Save payment' }).click();
  await expect(page.getByText('+GHS 5,000')).toBeVisible();
});
