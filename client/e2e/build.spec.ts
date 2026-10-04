import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';
import { signIn } from './session';

// The flows load `@tbn/contracts` as CommonJS, which has no named exports here, so this reads
// only the fields the flow checks.
const SavedOfficeSchema = z.object({
  layout: z
    .object({
      theme: z.record(z.string(), z.string()),
      placements: z.array(z.object({ kind: z.string() })),
    })
    .nullable(),
});

/** The owner's saved office, read straight from the server. */
async function savedOffice(page: Page): Promise<z.infer<typeof SavedOfficeSchema>['layout']> {
  const token = await page.evaluate(() => window.sessionStorage.getItem('tbn.session'));
  const response = await page.request.get('/world/office', {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  expect(response.ok()).toBe(true);
  return SavedOfficeSchema.parse(await response.json()).layout;
}

/** Opens build mode from the world. */
async function openBuild(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.getByRole('button', { name: 'Build' }).click();
  const panel = page.getByRole('complementary', { name: 'Build mode' });
  await expect(panel).toBeVisible();
  return panel;
}

// The world flows read the office as the pack ships it, so this flow resets it before it ends.
test('the owner places a plant, paints the floor, saves, and resets to the default', async ({
  page,
}) => {
  // The office's props load and redraw several times, which outlasts the default time in CI.
  test.slow();
  await signIn(page);
  const before = await savedOffice(page);
  let panel = await openBuild(page);

  // A plant from the catalog starts where it fits; Enter drops it.
  await panel.getByRole('button', { name: 'Pot plant' }).click();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('heading', { name: 'Pot plant' })).toBeVisible();
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('status')).toHaveText('Saved.');

  await panel.getByRole('tab', { name: 'Theme' }).click();
  await panel.getByRole('button', { name: 'Night shift' }).click();
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel.getByRole('status')).toHaveText('Saved.');

  const saved = await savedOffice(page);
  expect(saved?.theme['floor']).toBe('#2b3242');
  const plants = saved?.placements.filter((one) => one.kind === 'plant').length ?? 0;
  const plantsBefore = (before?.placements ?? []).filter((one) => one.kind === 'plant').length;
  expect(plants).toBe((before === null ? 3 : plantsBefore) + 1);

  // After a reload the layout is still there, and Reset brings the pack default back.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Build' })).toBeVisible();
  panel = await openBuild(page);
  await panel.getByRole('button', { name: 'Reset' }).click();
  await page
    .getByRole('dialog', { name: 'Reset to the pack default?' })
    .getByRole('button', { name: 'Reset' })
    .click();
  await expect(panel.getByRole('status')).toHaveText('Back to the pack default.');
  expect(await savedOffice(page)).toBeNull();
  await panel.getByRole('button', { name: 'Leave' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Desk' })).toBeVisible();
});
