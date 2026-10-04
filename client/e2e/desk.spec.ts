import { expect, test } from '@playwright/test';
import { openScreen, signIn } from './session';
import { RUN_ID } from './stack';

// The company flows recruited this manager, who heads a department named after the role.
const ROLE = `Research ${RUN_ID}`;

test('the owner renames a department and gives it its name back', async ({ page }) => {
  await signIn(page);
  await openScreen(page, 'Departments');
  const table = page.getByRole('table', { name: 'Departments' });
  const renamed = `${ROLE} and ops`;

  for (const [from, to] of [
    [ROLE, renamed],
    [renamed, ROLE],
  ] as const) {
    await table.getByRole('button', { name: `Rename ${from}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Rename ${from}` });
    await dialog.getByLabel('Name').fill(to);
    await dialog.getByRole('button', { name: 'Rename' }).click();
    await expect(dialog).toBeHidden();
    await expect(table.getByText(to, { exact: true })).toBeVisible();
  }
});
