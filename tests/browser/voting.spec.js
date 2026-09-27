import {test, expect} from '@playwright/test';

test('organizer-configured invitations gate the browser ballot', async ({page}) => {
  const headers = {Authorization:'Bearer dogfood-organizer-2026'};
  const event = await (await page.request.post('/dogfood-api/events',{headers,data:{
    name:`Private ballot ${Date.now()}`, starts_at:new Date(Date.now()-7200000).toISOString(),
    submissions_close:new Date(Date.now()+3600000).toISOString(),tracks:['Open'],prizes:[],
  }})).json();
  const detail = await (await page.request.get(`/dogfood-api/events/${event.id}`)).json();
  const participant = {Authorization:'Bearer dogfood-participant-2026'};
  const team = await (await page.request.post(`/dogfood-api/events/${event.id}/teams`,{headers:participant,data:{name:'Voting builders'}})).json();
  await page.request.post(`/dogfood-api/events/${event.id}/projects`,{headers:participant,data:{team_id:team.id,track_id:detail.tracks[0].id,title:'Private ballot entry',submit:true}});
  await page.request.patch(`/dogfood-api/events/${event.id}`,{headers,data:{status:'voting',submissions_close:new Date(Date.now()-3600000).toISOString(),voting_close:new Date(Date.now()+3600000).toISOString()}});
  await page.goto('/');
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await page.getByLabel('Select event').selectOption(event.id);
  await page.getByLabel('Voting access').selectOption('invitation');
  await page.getByRole('button',{name:'Save voting access',exact:true}).click();
  await expect.poll(async () => (await (await page.request.get(`/dogfood-api/events/${event.id}`)).json()).voting_policy).toBe('invitation');
  const email = `voter-${Date.now()}@example.org`;
  await page.getByPlaceholder('Voter email',{exact:true}).fill(email);
  await page.getByRole('button',{name:'Create voter invitation',exact:true}).click();
  const link = page.getByText(/http:\/\/.*\/vote-invite\//).first();
  await expect(link).toBeVisible();
  const url = await link.textContent();
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.goto(url);
  await page.locator('input[name="name"]').fill('Invited voter');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill('voter-password-123');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.locator('#message')).toContainText('Signed in');
  await page.getByRole('button',{name:'Accept invitation'}).click();
  await expect(page.locator('#message')).toContainText('Invitation accepted');
  await page.goto('/');
  await page.getByLabel('Select event').selectOption(event.id);
  await page.getByRole('button',{name:'Vote',exact:true}).click();
  await expect(page.getByText('Your vote is recorded. Results stay hidden until publication.',{exact:true})).toBeVisible();
  expect((await page.request.get(`/dogfood-api/events/${event.id}/community-results`)).status()).toBe(403);
});
