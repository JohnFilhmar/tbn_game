import { expect, test, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';
import { signIn } from './session';
import { RUN_ID } from './stack';

// The flows load `@tbn/contracts` as CommonJS, which has no named exports here, so this reads
// only the fields the flows check.
const PropStatesSchema = z.object({
  states: z.array(z.object({ kind: z.string(), state: z.record(z.string(), z.unknown()) })),
});
const BoardSchema = z.object({
  strokes: z.array(z.unknown()),
  texts: z.array(z.object({ text: z.string() })),
});
const PreferencesSchema = z.object({ grass_touched: z.number() });

// Each flow leaves the office's objects as the pack ships them, for the flows after it. The
// owner walks to some of them, and in CI's software renderer walking is slow, so each flow gets
// three minutes.
test.describe.configure({ mode: 'serial', timeout: 180_000 });

/** Reads a path of the API as the signed-in owner. */
async function read(page: Page, path: string): Promise<unknown> {
  const token = await page.evaluate(() => window.sessionStorage.getItem('tbn.session'));
  const response = await page.request.get(path, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/** Signs in and stands up from the computer in the office at noon, ready to use things. */
async function standInOffice(page: Page): Promise<void> {
  await signIn(page);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'World' });
  await dialog.getByLabel('Environment').selectOption('Office');
  await expect(dialog.getByLabel('Environment')).toBeEnabled();
  await dialog.getByLabel('Time of day').selectOption('Noon');
  await expect(dialog.getByLabel('Time of day')).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await besideComputer(page);
}

/**
 * Sits at the computer and stands up once the world is drawn, which leaves the owner beside the
 * chair. Standing up before the world has loaded leaves them at the pack's spawn instead.
 */
async function besideComputer(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: 'The world is ready.' })).toBeAttached();
  await page.getByRole('button', { name: 'Desk' }).click();
  await expect(page.getByRole('navigation', { name: 'Launcher' })).toBeVisible();
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Desk' })).toBeVisible();
}

/** Reloads the world and stands beside the computer again. */
async function reloadBesideComputer(page: Page): Promise<void> {
  await page.reload();
  await besideComputer(page);
}

function withinReach(page: Page) {
  return page.getByRole('list', { name: 'Within reach' });
}

/**
 * Runs the owner with a movement key until `button` is within reach. The camera faces north
 * behind the owner, so `a` runs west and `w` runs north. A step lasts one frame, so a slow
 * renderer walks slowly.
 */
async function walkTo(page: Page, key: 'a' | 'w', button: Locator): Promise<void> {
  await page.keyboard.down('Shift');
  await page.keyboard.down(key);
  await expect(button).toBeVisible({ timeout: 45_000 });
  await page.keyboard.up(key);
  await page.keyboard.up('Shift');
}

/** Walks from the computer to the blinds of the west window: left to the board, then up. */
async function walkToBlinds(page: Page, button: Locator): Promise<void> {
  await walkTo(page, 'a', drawButton(page));
  await walkTo(page, 'w', button);
}

/** The board on the west wall, a few steps left of the computer. */
function drawButton(page: Page): Locator {
  return withinReach(page).getByRole('button', { name: 'Draw on the whiteboard' });
}

test('the owner draws and writes on the whiteboard, and both are there after a reload', async ({
  page,
}) => {
  await standInOffice(page);
  await walkTo(page, 'a', drawButton(page));
  await drawButton(page).click();
  let board = page.getByRole('dialog', { name: 'Whiteboard' });
  await expect(board).toBeVisible();

  const canvas = board.getByLabel('The whiteboard: draw with the pointer');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('The whiteboard has no box');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.7, { steps: 12 });
  await page.mouse.up();
  const word = `Plan ${RUN_ID}`;
  await board.getByLabel('Text to write').fill(word);
  await board.getByRole('button', { name: 'Write' }).click();
  await expect(board.getByRole('status')).toContainText('Saved.');
  await board.getByRole('button', { name: 'Done' }).click();
  await expect(board).toBeHidden();
  await expect(page.getByRole('list', { name: 'What happened' })).toContainText(
    'You draw on the whiteboard.',
  );

  await reloadBesideComputer(page);
  const { states } = PropStatesSchema.parse(await read(page, '/world/office/props'));
  const saved = states
    .filter((one) => one.kind === 'whiteboard')
    .map((one) => BoardSchema.parse(one.state))
    .find((one) => one.texts.some((text) => text.text === word));
  expect(saved?.strokes.length).toBeGreaterThan(0);

  // The board opens with both on it; Clear leaves it empty for the next run.
  await walkTo(page, 'a', drawButton(page));
  await drawButton(page).click();
  board = page.getByRole('dialog', { name: 'Whiteboard' });
  await expect(board.getByRole('status')).toContainText(/[1-9]\d* strokes? and [1-9]\d* notes?/);
  await board.getByRole('button', { name: 'Clear' }).click();
  await expect(board.getByRole('status')).toContainText('0 strokes and 0 notes');
  await board.getByRole('button', { name: 'Done' }).click();
  await expect(board).toBeHidden();
});

test('the owner switches a light off and closes the blinds, and both hold after a reload', async ({
  page,
}) => {
  await standInOffice(page);
  await withinReach(page).getByRole('button', { name: 'Use the light switch' }).click();
  let lights = page.getByRole('dialog', { name: 'Lights' });
  await lights.getByRole('group', { name: 'Zone 1, lamp 1' }).getByLabel('Off').check();
  await expect(
    lights.getByRole('group', { name: 'Zone 1, lamp 1' }).getByLabel('Off'),
  ).toBeChecked();
  await lights.getByRole('button', { name: 'Close' }).click();

  // The west window is left past the board, then a few steps up.
  const closeBlinds = withinReach(page).getByRole('button', { name: 'Close the blinds' });
  await walkToBlinds(page, closeBlinds);
  await closeBlinds.click();
  const openBlinds = withinReach(page).getByRole('button', { name: 'Open the blinds' });
  await expect(openBlinds).toBeVisible();

  await reloadBesideComputer(page);
  const { states } = PropStatesSchema.parse(await read(page, '/world/office/props'));
  expect(states.some((one) => one.kind === 'blinds' && one.state['open'] === false)).toBe(true);
  expect(states.some((one) => one.kind === 'lamp' && one.state['mode'] === 'off')).toBe(true);
  await withinReach(page).getByRole('button', { name: 'Use the light switch' }).click();
  lights = page.getByRole('dialog', { name: 'Lights' });
  await expect(
    lights.getByRole('group', { name: 'Zone 1, lamp 1' }).getByLabel('Off'),
  ).toBeChecked();

  // Back as the pack ships: every lamp on auto, the blinds open.
  await lights.getByRole('button', { name: 'All auto' }).click();
  await expect(
    lights.getByRole('group', { name: 'Zone 1, lamp 1' }).getByLabel('Auto'),
  ).toBeChecked();
  await lights.getByRole('button', { name: 'Close' }).click();
  await walkToBlinds(page, openBlinds);
  await openBlinds.click();
  await expect(closeBlinds).toBeVisible();
});

test('the owner touches grass twice and the count goes up by two', async ({ page }) => {
  await standInOffice(page);
  const before = PreferencesSchema.parse(await read(page, '/preferences')).grass_touched;
  const touch = withinReach(page).getByRole('button', { name: 'Touch grass' });
  await touch.click();
  await expect(page.getByText(`You touched grass. That makes ${before + 1}.`)).toBeVisible();
  await touch.click();
  await expect(page.getByText(`You touched grass. That makes ${before + 2}.`)).toBeVisible();
  await expect
    .poll(async () => PreferencesSchema.parse(await read(page, '/preferences')).grass_touched)
    .toBe(before + 2);
});
