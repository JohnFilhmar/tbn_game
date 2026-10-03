import { expect, test, type Page } from '@playwright/test';
import { DELEGATE_MARKER, PART_TITLE } from './fakeModel';
import { openDesk, openScreen, signIn } from './session';
import { OWNER, RUN_ID } from './stack';

const MANAGER = `Ada ${RUN_ID}`;
const ROLE = `Research ${RUN_ID}`;
const TASK = `Tea guide ${RUN_ID}`;

// The world flows build on the company the company flows left: a provider and a manager.
test.describe.configure({ mode: 'serial' });

/** The hidden line the HUD writes once the pack, its navigation mesh and the roster are in. */
function worldReady(page: Page) {
  return page.getByRole('status').filter({ hasText: 'The world is ready.' });
}

function narration(page: Page) {
  return page.getByRole('list', { name: 'What happened' });
}

async function backToWorld(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Desk' })).toBeVisible();
}

/** Sets the world menu's two choices, which a kept database may hold from an earlier run. */
async function chooseWorld(page: Page, environment: string, timeOfDay: string): Promise<void> {
  await page.getByRole('button', { name: 'World', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'World' });
  await dialog.getByLabel('Environment').selectOption(environment);
  await expect(dialog.getByLabel('Environment')).toBeEnabled();
  await dialog.getByLabel('Time of day').selectOption(timeOfDay);
  await expect(dialog.getByLabel('Time of day')).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

test('the owner lands in the world and walks to the computer', async ({ page }, testInfo) => {
  await signIn(page);
  await chooseWorld(page, 'Office', 'Noon');
  await expect(page.getByText('Office', { exact: true })).toBeVisible();
  await expect(worldReady(page)).toBeAttached();
  await expect(page.getByRole('list', { name: 'Agents in the world' })).toContainText(MANAGER);
  await page.screenshot({ path: testInfo.outputPath('office_third_person.png') });

  // C toggles the camera, and only the camera.
  const camera = page.getByRole('button', { name: /^Camera:/ });
  await expect(camera).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('c');
  await expect(camera).toHaveAttribute('aria-pressed', 'true');
  await expect(camera).toHaveText('Camera: top down');
  await page.screenshot({ path: testInfo.outputPath('office_top_down.png') });

  // Standing up from the desk leaves the owner by the computer: walk east out of its reach, then
  // west back to it. From above, left is west.
  const prompt = page.getByText('Press E to use the computer');
  await page.keyboard.down('d');
  await expect(prompt).toBeHidden({ timeout: 15_000 });
  await page.keyboard.up('d');
  await page.keyboard.down('a');
  await expect(page.getByText('Press E to use the computer')).toBeVisible({ timeout: 15_000 });
  await page.keyboard.up('a');
  await page.keyboard.press('e');
  await expect(page.getByRole('navigation', { name: 'Launcher' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Agents' })).toBeVisible();
  await backToWorld(page);

  await page.keyboard.press('c');
  await expect(camera).toHaveAttribute('aria-pressed', 'false');
});

test('the three environments and the night', async ({ page }, testInfo) => {
  await signIn(page);
  await expect(worldReady(page)).toBeAttached();
  for (const environment of ['Home', 'Warehouse']) {
    await chooseWorld(page, environment, 'Noon');
    await expect(page.getByText(environment, { exact: true })).toBeVisible();
    await expect(worldReady(page)).toBeAttached();
    await expect(page.getByRole('list', { name: 'Agents in the world' })).toContainText(MANAGER);
    await page.screenshot({
      path: testInfo.outputPath(`${environment.toLowerCase()}_third_person.png`),
    });
    await page.keyboard.press('c');
    await page.screenshot({
      path: testInfo.outputPath(`${environment.toLowerCase()}_top_down.png`),
    });
    await page.keyboard.press('c');
  }

  await chooseWorld(page, 'Warehouse', 'Night');
  await page.screenshot({ path: testInfo.outputPath('warehouse_night.png') });

  // The preferences screen shows the same settings, so the desk can change them too.
  await openDesk(page);
  await openScreen(page, 'Preferences');
  await expect(page.getByLabel('Environment')).toHaveValue('warehouse');
  await page.getByLabel('Environment').selectOption('Office');
  await page.getByLabel('Time of day').selectOption('My clock');
  await backToWorld(page);
  await expect(page.getByText('Office', { exact: true })).toBeVisible();
});

test('the owner customises their character', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Customise' }).click();
  const dialog = page.getByRole('dialog', { name: 'Customise your character' });
  await dialog.getByLabel('Body').selectOption('Broad');
  await dialog.getByLabel('Hair', { exact: true }).selectOption('Bun');
  await dialog.getByLabel('Accessory').selectOption('Glasses');
  await dialog.getByLabel('Top').fill('#2a9d8f');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Customise' }).click();
  await expect(dialog.getByLabel('Body')).toHaveValue('broad');
  await expect(dialog.getByLabel('Hair', { exact: true })).toHaveValue('bun');
  await expect(dialog.getByLabel('Accessory')).toHaveValue('glasses');
  await expect(dialog.getByLabel('Top')).toHaveValue('#2a9d8f');
  await dialog.getByRole('button', { name: 'Close' }).click();
});

test('a desk screen reloads seated, and an expired session signs in again at the monitor', async ({
  page,
}) => {
  await signIn(page);
  await openScreen(page, 'Tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Launcher' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Desk' })).toBeHidden();

  // A token the server no longer knows: the monitor swaps to sign in, then back to the screen.
  await page.evaluate(() => window.sessionStorage.setItem('tbn.session', 'tbn_expired'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('You were signed out')).toBeVisible();
  await page.getByLabel('Username').fill(OWNER.username);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/tasks$/);
});

test('the owner goes to an agent and sits back down at the desk', async ({ page }) => {
  await signIn(page);
  await expect(worldReady(page)).toBeAttached();
  const agents = page.getByRole('list', { name: 'Agents in the world' });
  await expect(agents).toContainText(MANAGER);
  await page.keyboard.press('1');
  await expect(narration(page)).toContainText('You go to ');
  await agents.getByRole('button', { name: `Go to ${MANAGER}` }).click();
  await expect(narration(page)).toContainText(`You go to ${MANAGER}.`);

  await page.getByRole('button', { name: 'Desk' }).click();
  await expect(page.getByRole('navigation', { name: 'Launcher' })).toBeVisible();
  await backToWorld(page);
  await expect(page.getByText('Press E to use the computer')).toBeVisible();
});

test('an idle agent takes a break and comes back to the desk', async ({ page }) => {
  await signIn(page);
  await expect(worldReady(page)).toBeAttached();
  const agents = page.getByRole('list', { name: 'Agents in the world' });
  await expect(narration(page)).toContainText(
    /goes for a drink|looks out of the window|checks on a plant|doodles on the whiteboard|touches some grass|stretches their legs|has a look around|chats with/,
    { timeout: 45_000 },
  );
  await expect(agents).toContainText('taking a break');
  await expect(agents).toContainText(`${MANAGER}: at the desk`, { timeout: 45_000 });
});

test('an agent walks, works, hands off, and the intern arrives and leaves', async ({ page }) => {
  await signIn(page);
  await expect(worldReady(page)).toBeAttached();

  // Idle interns end almost at once, so the departure is part of the flow.
  await openDesk(page);
  await openScreen(page, 'Preferences');
  const idleTime = page.getByLabel('Intern idle time (minutes)');
  if ((await idleTime.inputValue()) !== '0.01') {
    await idleTime.fill('0.01');
    await page.getByRole('button', { name: 'Save Intern idle time' }).click();
  }
  await expect(idleTime).toHaveValue('0.01');

  await openScreen(page, 'Tasks');
  await page.getByRole('button', { name: 'Assign a task' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign a task' });
  await dialog.getByLabel('Title').fill(TASK);
  await dialog
    .getByLabel('Instructions')
    .fill(`Have an intern write the guide. ${DELEGATE_MARKER}`);
  await dialog.getByLabel('Assignee').selectOption({ label: `${MANAGER} (manager, ${ROLE})` });
  await dialog.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(TASK);
  await backToWorld(page);

  const happened = narration(page);
  await expect(happened).toContainText(`${MANAGER} starts on "${TASK}".`, { timeout: 30_000 });
  await expect(happened).toContainText(`hands "${PART_TITLE}" to`, { timeout: 30_000 });
  await expect(happened).toContainText('arrives.', { timeout: 30_000 });
  await expect(happened).toContainText(`brings the result of "${PART_TITLE}" back to ${MANAGER}.`, {
    timeout: 60_000,
  });
  await expect(happened).toContainText(`${MANAGER} finishes "${TASK}".`, { timeout: 60_000 });
  await expect(happened).toContainText('leaves.', { timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Agents in the world' })).toContainText(
    `${MANAGER}: at the desk`,
    { timeout: 30_000 },
  );
});

test('the owner talks to an agent in the world', async ({ page }) => {
  await signIn(page);
  await expect(worldReady(page)).toBeAttached();
  await page
    .getByRole('list', { name: 'Agents in the world' })
    .getByRole('button', { name: `Talk to ${MANAGER}` })
    .click();
  const panel = page.getByRole('complementary', { name: `Conversation with ${MANAGER}` });
  await expect(panel).toBeVisible();
  const box = panel.getByLabel(`Message to ${MANAGER}`);
  await expect(box).toBeFocused();
  await box.fill('How is the office?');
  await panel.getByRole('button', { name: 'Send' }).click();
  const log = panel.getByRole('log', { name: `Chat with ${MANAGER}` });
  await expect(log).toContainText('How is the office?');
  await expect(log).toContainText('You wrote: How is the office?', { timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Agents in the world' })).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('list', { name: 'Agents in the world' })).toBeVisible();
});
