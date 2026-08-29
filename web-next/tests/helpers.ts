import type { Page } from '@playwright/test';

export async function loginAsAgent(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Elias (Agent)' }).click();
  await page.waitForURL('**/app/home');
}

export async function loginAsManager(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Management (Manager)' }).click();
  await page.waitForURL('**/app/mgr');
}
