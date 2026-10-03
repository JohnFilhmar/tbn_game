import { expect, type Page } from '@playwright/test';
import { OWNER } from './stack';

/** Signs in as the e2e owner from the sign-in screen and waits for the desktop. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('./sign_in');
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Launcher' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
}

/** Opens a screen from the launcher, as the owner would. */
export async function openScreen(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Launcher' }).getByRole('link', { name }).click();
}
