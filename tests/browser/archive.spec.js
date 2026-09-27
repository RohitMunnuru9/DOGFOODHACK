import {test, expect} from '@playwright/test';

test('full fixture archive can be restored through the organizer interface', async ({page}) => {
  const headers = {Authorization:'Bearer dogfood-organizer-2026'};
  const archive = await (await page.request.get('/dogfood-api/events/evt_01/export.json',{headers})).json();
  const destination = await (await page.request.post('/dogfood-api/events',{headers,data:{
    name:`Archive ${Date.now()}`, starts_at:new Date(Date.now()-3600000).toISOString(),
    submissions_close:new Date(Date.now()+3600000).toISOString(),tracks:['Empty'],prizes:[],
  }})).json();
  await page.goto('/');
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await page.getByLabel('Select event').selectOption(destination.id);
  await page.getByLabel('Import JSON file').setInputFiles({name:'event.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archive))});
  await page.getByRole('button',{name:'Import event data',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'126 reviews'})).toBeVisible();
  const result = await (await page.request.get(`/dogfood-api/events/${destination.id}/export.json`)).json();
  expect(result.projects).toHaveLength(41);
  expect(result.reviews).toHaveLength(126);
});
