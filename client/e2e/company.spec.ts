import { expect, test } from '@playwright/test';
import { APPROVAL_MARKER } from './fakeModel';
import { openScreen, signIn } from './session';
import { OWNER, RUN_ID } from './stack';

const PROVIDER = `Fake model ${RUN_ID}`;
const MANAGER = `Ada ${RUN_ID}`;
const ROLE = `Research ${RUN_ID}`;
const TASK = `Roster check ${RUN_ID}`;

function modelUrl(): string {
  const url = process.env['E2E_MODEL_URL'];
  if (url === undefined) throw new Error('The global setup sets E2E_MODEL_URL');
  return url;
}

// Each flow builds on the company the one before left.
test.describe.configure({ mode: 'serial' });

test('sign in', async ({ page }) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/app\/sign_in$/);
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('Password').fill('not-the-password-at-all');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid');

  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Agents' })).toBeVisible();
  await expect(page.getByText(OWNER.username)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Agents' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('add provider', async ({ page }) => {
  await signIn(page);
  await openScreen(page, 'Providers');
  await page.getByRole('link', { name: 'Add a provider' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill(PROVIDER);
  await page.getByLabel('API format').selectOption('anthropic_messages');
  await page.getByLabel('Base URL').fill(modelUrl());
  await page.getByLabel('API key').fill('fake-key-for-e2e');
  await page.getByLabel('Model id 1').fill('fake-large');
  await page.getByRole('button', { name: 'Add a model' }).click();
  await page.getByLabel('Model id 2').fill('fake-small');
  await page.getByLabel('Cost tier of fake-small').selectOption('cheap');
  await page.getByRole('button', { name: 'Add provider' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText(PROVIDER);
  await expect(page.getByText('Taking calls')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Usage caps' })).toBeVisible();
});

test('recruit', async ({ page }) => {
  await signIn(page);
  await openScreen(page, 'Agents');
  await page.getByRole('link', { name: 'Recruit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(MANAGER);
  await page.getByLabel('Role').fill(ROLE);
  await page.getByLabel('Job description').fill('Finds out who is on the team and reports.');
  await page.getByLabel('Provider').selectOption({ label: PROVIDER });
  await page.getByLabel('Model', { exact: true }).selectOption('fake-large');
  await page.getByLabel('Model for its interns').selectOption('fake-small');
  await page.getByRole('button', { name: 'Add a tool' }).click();
  await page.getByLabel('Tool 1', { exact: true }).fill('list_roster');
  await page.getByLabel('Policy of tool 1').selectOption('ask');
  await page.getByRole('button', { name: 'Recruit', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText(MANAGER);
  await expect(page.getByText('Nothing said yet')).toBeVisible();

  // The new manager answers a message, streamed, and the stored reply takes its place.
  await page.getByLabel(`Message to ${MANAGER}`).fill('Hello there');
  await page.getByRole('button', { name: 'Send' }).click();
  const chat = page.getByRole('log', { name: `Chat with ${MANAGER}` });
  await expect(chat).toContainText('Hello there');
  await expect(chat).toContainText('Hello from the fake model. You wrote: Hello there');

  await openScreen(page, 'Departments');
  await expect(page.getByRole('heading', { name: ROLE })).toBeVisible();
});

test('assign', async ({ page }) => {
  await signIn(page);
  await openScreen(page, 'Tasks');
  await page.getByRole('button', { name: 'Assign a task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign a task' });
  await dialog.getByLabel('Title').fill(TASK);
  await dialog.getByLabel('Instructions').fill(`Check who is on the team. ${APPROVAL_MARKER}`);
  await dialog.getByLabel('Assignee').selectOption({ label: `${MANAGER} (manager, ${ROLE})` });
  await dialog.getByRole('button', { name: 'Assign' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText(TASK);
  // The manager's policy makes its roster call wait for the owner.
  await expect(page.getByText('Awaiting approval')).toBeVisible();
});

test('approve', async ({ page }) => {
  await signIn(page);
  const launcher = page.getByRole('navigation', { name: 'Launcher' });
  await expect(launcher.getByRole('link', { name: /Approvals 1 waiting/ })).toBeVisible();
  await openScreen(page, 'Approvals');
  const card = page.getByRole('article', { name: /Wants to call list_roster/ });
  await expect(card).toContainText(MANAGER);
  await card.getByLabel('Note to the agent').fill('Go ahead.');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Nothing waits for you')).toBeVisible();
  await page.getByRole('button', { name: /Decided/ }).click();
  await expect(card).toContainText('Your note: Go ahead.');
});

test('read report', async ({ page }) => {
  await signIn(page);
  await openScreen(page, 'Tasks');
  await page.getByRole('button', { name: /^Done/ }).click();
  await page.getByRole('link', { name: TASK }).click();
  await page.getByRole('link', { name: 'Read the report' }).click();
  const report = page.getByRole('article', { name: 'Report' });
  await expect(report).toContainText('The roster check is done and the team is ready.');
  await expect(report).toContainText('Listed the roster after the owner approved it.');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .md' }).click();
  expect((await download).suggestedFilename()).toBe(`${TASK}.md`);
});
