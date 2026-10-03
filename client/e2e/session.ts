import { expect, type Page } from '@playwright/test';
import { OWNER } from './stack';

/**
 * Signs in as the e2e owner at the monitor, which then shows the desk, and stands up into the
 * world, where every flow starts.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto('./sign_in');
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Launcher' })).toBeVisible();
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Desk' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
}

/** Opens the desk from the world, as pressing E at the computer does. */
export async function openDesk(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Desk' }).click();
  await expect(page.getByRole('navigation', { name: 'Launcher' })).toBeVisible();
}

/** Opens a screen from the launcher, opening the desk first when the owner is in the world. */
export async function openScreen(page: Page, name: string): Promise<void> {
  const launcher = page.getByRole('navigation', { name: 'Launcher' });
  if (!(await launcher.isVisible())) await openDesk(page);
  await launcher.getByRole('link', { name }).click();
}
