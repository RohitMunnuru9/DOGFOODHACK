import {choose, navigate} from './helpers';
import {test, expect} from '@playwright/test';

test('an archive larger than one megabyte restores through the portal', async ({page}) => {
  const headers = {Authorization:'Bearer dogfood-organizer-2026'};
  const createEvent = async name => {
    const response = await page.request.post('/dogfood-api/events',{headers,data:{
      name:`${name} ${Date.now()}`, starts_at:new Date(Date.now()-3600000).toISOString(),
      submissions_close:new Date(Date.now()+3600000).toISOString(),tracks:['Open'],prizes:[],
    }});
    expect(response.status()).toBe(201);
    return (await response.json()).id;
  };
  const source = await createEvent('Large archive source');
  for (let batch=0; batch<2; batch++) {
    const teams = Array.from({length:75},(_,i)=>({name:`Team ${batch}-${i}`}));
    const projects = teams.map(team=>({team:team.name,track:'Open',title:`Project ${team.name}`,description:'x'.repeat(8000)}));
    expect((await page.request.post(`/dogfood-api/events/${source}/import.json`,{headers,data:{teams,projects}})).status()).toBe(201);
  }
  const download = await page.request.get(`/dogfood-api/events/${source}/export.json`,{headers});
  expect(download.status()).toBe(200);
  const buffer = await download.body();
  expect(buffer.length).toBeGreaterThan(1_000_000);
  const destination = await createEvent('Large archive destination');
  await page.goto('/');
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await choose(page, 'Select event', destination);
  await navigate(page, 'Settings');
  await page.getByLabel('Import JSON file').setInputFiles({name:'large-event.json',mimeType:'application/json',buffer});
  await page.getByRole('button',{name:'Import event data',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'150 projects'})).toBeVisible();
  const result = await (await page.request.get(`/dogfood-api/events/${destination}/export.json`)).json();
  expect(result.projects).toHaveLength(150);
  expect(result.project_details.every(project=>project.description === 'x'.repeat(8000))).toBe(true);
});

test('full fixture archive can be restored through the organizer interface', async ({page}) => {
  const headers = {Authorization:'Bearer dogfood-organizer-2026'};
  const archive = await (await page.request.get('/dogfood-api/events/evt_01/export.json',{headers})).json();
  const destination = await (await page.request.post('/dogfood-api/events',{headers,data:{
    name:`Archive ${Date.now()}`, starts_at:new Date(Date.now()-3600000).toISOString(),
    submissions_close:new Date(Date.now()+3600000).toISOString(),tracks:['Empty'],prizes:[],
  }})).json();
  await page.goto('/');
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await choose(page, 'Select event', destination.id);
  await navigate(page, 'Settings');
  await page.getByLabel('Import JSON file').setInputFiles({name:'event.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archive))});
  await page.getByRole('button',{name:'Import event data',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'126 reviews'})).toBeVisible();
  const result = await (await page.request.get(`/dogfood-api/events/${destination.id}/export.json`)).json();
  expect(result.projects).toHaveLength(41);
  expect(result.reviews).toHaveLength(126);
});
