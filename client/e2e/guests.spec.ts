import { expect, test } from '@playwright/test';
import { PrincipalSchema } from '@tbn/contracts';
import { openScreen, signIn } from './session';
import { RUN_ID } from './stack';

// Letters and digits only, within the 24 characters a guest name allows.
const GUEST_NAME = `Guest ${RUN_ID.replace(/[^a-z0-9]/gi, '').slice(-10)}`;

test('a guest follows an invite, reads the desk, and messages the owner', async ({
  page,
  browser,
}) => {
  test.slow();
  await signIn(page);
  await openScreen(page, 'Guests');
  await page.getByLabel('Who is it for').fill(`Friend ${RUN_ID}`);
  await page.getByRole('button', { name: 'Create link' }).click();
  const link = await page.getByLabel('Invite link').inputValue();
  expect(link).toContain('/invite/');

  const guestContext = await browser.newContext({ baseURL: new URL(link).origin });
  const guest = await guestContext.newPage();
  await guest.goto(link);
  const welcome = guest.getByRole('dialog', { name: /Welcome to e2e_owner's company/ });
  await welcome.getByLabel('Your name').fill(GUEST_NAME);
  await welcome.getByRole('button', { name: 'Enter the world' }).click();
  await expect(welcome).toBeHidden();
  await expect(guest.getByRole('button', { name: 'Desk' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Build' })).toHaveCount(0);

  await guest.getByRole('button', { name: 'Desk' }).click();
  await expect(guest.getByRole('note')).toContainText('You are a guest here');
  const launcher = guest.getByRole('navigation', { name: 'Launcher' });
  await expect(launcher.getByRole('link', { name: 'Tasks' })).toBeVisible();
  await expect(launcher.getByRole('link', { name: 'Providers' })).toHaveCount(0);
  // The link worked once.
  expect((await guest.request.get(new URL(link).pathname)).status()).toBe(410);

  const token = await page.evaluate(() => sessionStorage.getItem('tbn.session'));
  const me = PrincipalSchema.parse(
    await (
      await page.request.get('/auth/me', { headers: { Authorization: `Bearer ${token ?? ''}` } })
    ).json(),
  );
  const sent = await guest.request.post('/player_messages', {
    data: { to_id: me.id, text: `Hello from ${GUEST_NAME}` },
  });
  expect(sent.status()).toBe(201);

  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.getByRole('button', { name: `${GUEST_NAME} sent you a message` }).click();
  const panel = page.getByRole('complementary', { name: `Conversation with ${GUEST_NAME}` });
  await expect(panel.getByText(`Hello from ${GUEST_NAME}`)).toBeVisible();
  await guestContext.close();
});
