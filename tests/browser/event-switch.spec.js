import {choose, navigate} from './helpers';
import {test, expect} from '@playwright/test';

test('switching events clears the selected archive and integration form state', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await navigate(page, 'Settings');
  await page.getByLabel('Import JSON file').setInputFiles({name:'event.json',mimeType:'application/json',buffer:Buffer.from('{"teams":[]}')});
  await expect(page.getByRole('button',{name:'Import event data',exact:true})).toBeEnabled();
  await choose(page, 'Select event', 'evt_demo');
  await expect(page.getByRole('button',{name:'Import event data',exact:true})).toBeDisabled();
  await expect(page.getByLabel('Import JSON file')).toHaveValue('');
});

test('a delayed old event response cannot replace the selected workspace', async ({page}) => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  let intercepted;
  const started = new Promise(resolve => { intercepted = resolve; });
  let finished;
  const delivered = new Promise(resolve => { finished = resolve; });
  await page.route('**/dogfood-api/events/evt_demo/projects', async route => {
    const response = await route.fetch();
    intercepted();
    await hold;
    await route.fulfill({response});
    finished();
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Participant',exact:true}).click();
  await started;
  await choose(page, 'Select event', 'evt_01');
  const gallery = page.locator('section').filter({has:page.getByRole('heading',{name:'Public project gallery'})});
  await expect(gallery.getByText('41 projects',{exact:true})).toBeVisible();
  release();
  await delivered;
  await expect(page.getByRole('combobox',{name:'Select event',exact:true})).toHaveAttribute('data-value','evt_01');
  await expect(gallery.getByText('41 projects',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Create team',exact:true})).toBeDisabled();
});
