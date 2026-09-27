import {choose, navigate} from './helpers';
import {test, expect} from '@playwright/test';

test('organizer can assign a batch and see unassigned judges', async ({page}) => {
  const org = {Authorization:'Bearer dogfood-organizer-2026'};
  const participant = {Authorization:'Bearer dogfood-participant-2026'};
  const name = `Batch browser ${Date.now()}`;
  const event = await (await page.request.post('/dogfood-api/events', {headers:org, data:{
    name, starts_at:new Date(Date.now()-3600000).toISOString(),
    submissions_close:new Date(Date.now()+3600000).toISOString(), tracks:['Open'], prizes:[],
  }})).json();
  const detail = await (await page.request.get(`/dogfood-api/events/${event.id}`)).json();
  const team = await (await page.request.post(`/dogfood-api/events/${event.id}/teams`, {headers:participant,data:{name:'Browser builders'}})).json();
  await page.request.post(`/dogfood-api/events/${event.id}/projects`, {headers:participant,data:{
    team_id:team.id, track_id:detail.tracks[0].id, title:'Browser batch entry', submit:true,
  }});
  for (const email of ['marek.nowak@example.org','priya.nair@example.org','participant@demo.local'])
    await page.request.post(`/dogfood-api/events/${event.id}/roles`, {headers:org,data:{email,role:'judge'}});
  await page.goto('/');
  await page.getByRole('button', {name:'Organizer',exact:true}).click();
  await choose(page, 'Select event', event.id);
  await navigate(page, 'Judging');
  await expect(page.getByRole('heading',{name:'Judging progress'})).toBeVisible();
  await page.getByRole('button', {name:'Assign batch',exact:true}).click();
  await expect(page.getByText('2 new assignments.', {exact:true})).toBeVisible();
  await expect(page.getByText('Browser batch entry: needs 1 more eligible judges.',{exact:true})).toBeVisible();
  const progress = await (await page.request.get(`/dogfood-api/events/${event.id}/progress`)).json();
  expect(progress.judges).toHaveLength(3);
  expect(progress.judges.find(j => j.judge_user_id === 'demo_participant').assigned).toBe(0);
});
