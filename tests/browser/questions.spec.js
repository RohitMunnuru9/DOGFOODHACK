import {test, expect} from '@playwright/test';

test('organizer questions reach the participant form and gate submission', async ({page}) => {
  const event = await (await page.request.post('/dogfood-api/events', {
    headers:{Authorization:'Bearer dogfood-organizer-2026'}, data:{name:`Questions ${Date.now()}`,
      starts_at:new Date(Date.now()-3600000).toISOString(), submissions_close:new Date(Date.now()+3600000).toISOString(), tracks:['Open'],prizes:[]},
  })).json();
  await page.goto('/');
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await page.getByLabel('Select event').selectOption(event.id);
  await page.getByRole('button',{name:'Add question',exact:true}).click();
  await page.getByLabel('Question 1',{exact:true}).fill('What problem do you solve?');
  await page.getByLabel('Required',{exact:true}).check();
  await page.getByRole('button',{name:'Save questions',exact:true}).click();
  await expect.poll(async () => (await (await page.request.get(`/dogfood-api/events/${event.id}`)).json()).questions.length).toBe(1);
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.getByRole('button',{name:'Participant',exact:true}).click();
  await page.getByLabel('Select event').selectOption(event.id);
  await page.getByPlaceholder('Team name',{exact:true}).fill('Questions browser team');
  await page.getByRole('button',{name:'Create team',exact:true}).click();
  await page.getByPlaceholder('Project title',{exact:true}).fill('Question browser entry');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.getByRole('button',{name:'Submit project',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Required answers missing'})).toBeVisible();
  await page.getByLabel('What problem do you solve? (required)',{exact:true}).fill('Helping organizers run events.');
  await page.getByRole('button',{name:'Submit project',exact:true}).click();
  await expect(page.getByRole('button',{name:'Submit project',exact:true})).toHaveCount(0);
  const projects = await (await page.request.get(`/dogfood-api/events/${event.id}/projects`)).json();
  expect(projects.projects[0].status).toBe('submitted');
  expect(Object.values(projects.projects[0].custom_answers)).toEqual(['Helping organizers run events.']);
});
