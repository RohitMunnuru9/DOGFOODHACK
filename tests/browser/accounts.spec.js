import {test, expect} from '@playwright/test';

test('a registered account survives reloads and workspace switches', async ({page}) => {
  const email = `browser-${Date.now()}@example.org`;
  await page.goto('/');
  await page.getByRole('button', {name:'New here? Create an account'}).click();
  await page.getByLabel('Name', {exact:true}).fill('Browser Participant');
  await page.getByLabel('Email', {exact:true}).fill(email);
  await page.getByLabel('Password', {exact:true}).fill('browser-test-password');
  await page.getByRole('button', {name:'Create account', exact:true}).click();
  await expect(page.getByTestId('account-email')).toHaveText(email);
  const unexpectedLogins = [];
  page.on('request', request => {if (request.url().endsWith('/login')) unexpectedLogins.push(request.url());});
  for (const name of ['Organize','Judge','Participate']) {
    await page.getByRole('navigation', {name:'Workspace'}).getByRole('button', {name,exact:true}).click();
    await expect(page.getByTestId('account-email')).toHaveText(email);
  }
  await page.reload();
  await expect(page.getByTestId('account-email')).toHaveText(email);
  expect((await (await page.request.get('/dogfood-api/me')).json()).user.email).toBe(email);
  expect(unexpectedLogins).toEqual([]);
  await page.getByRole('button', {name:'Sign out'}).click();
  await expect(page.getByRole('heading', {name:'Welcome back'})).toBeVisible();
  expect((await (await page.request.get('/dogfood-api/me')).json()).user).toBeNull();
});

test('an invited account session is retained on entering the portal', async ({page}) => {
  const email = `invited-${Date.now()}@example.org`;
  const organizer = {Authorization:'Bearer dogfood-organizer-2026'};
  const inviteResponse = await page.request.post('/dogfood-api/events/evt_demo/role-invites', {
    headers:organizer, data:{email,role:'participant'},
  });
  expect(inviteResponse.status()).toBe(201);
  const invite = await inviteResponse.json();
  await page.goto(invite.invite_path);
  await page.locator('input[name="name"]').fill('Invited Participant');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('invited-test-password');
  await page.getByRole('button', {name:'Create account'}).click();
  await expect(page.locator('#message')).toContainText('Signed in');
  await page.getByRole('button', {name:'Accept invitation'}).click();
  await expect(page.locator('#message')).toContainText('Invitation accepted');
  await page.goto('/');
  await expect(page.getByTestId('account-email')).toHaveText(email);
  expect((await (await page.request.get('/dogfood-api/me')).json()).user.email).toBe(email);
});
