import {test,expect} from '@playwright/test';
import {choose,navigate} from './helpers';

test('clay navigation preserves drafts and moves its active highlight',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.getByRole('button',{name:'Participant',exact:true}).click();
  await page.getByPlaceholder('Team name',{exact:true}).fill('A draft worth keeping');
  await navigate(page,'Overview');
  await expect(page.getByRole('heading',{name:'Event overview',exact:true})).toBeVisible();
  const nav=page.getByRole('navigation',{name:'Event navigation'});
  await expect(nav.locator('.clay-nav-highlight')).toHaveCount(1);
  await navigate(page,'Submissions');
  await expect(page.getByPlaceholder('Team name',{exact:true})).toHaveValue('A draft worth keeping');
  // Rapid reversals must not leave the view transparent or inert.
  await nav.getByRole('button',{name:'Overview',exact:true}).click();
  await nav.getByRole('button',{name:'Submissions',exact:true}).click();
  await expect(page.locator('.clay-view-stage')).not.toHaveAttribute('inert');
  await expect(page.getByRole('heading',{name:'Your team',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('custom dropdown supports keyboard selection, escape and outside dismissal',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Organizer',exact:true}).click();
  const picker=page.getByRole('combobox',{name:'Select event',exact:true});
  await picker.focus();await picker.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await picker.press('Home');
  const first=await page.getByRole('option').first().getAttribute('data-value');
  await picker.press('Enter');await expect(picker).toHaveAttribute('data-value',first);
  await picker.click();await picker.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(picker).toBeFocused();
  await picker.click();await page.getByRole('heading',{level:1}).click();await expect(page.getByRole('listbox')).toHaveCount(0);
  expect(await page.locator('select:visible,input[type="datetime-local"]:visible').count()).toBe(0);
});

test('custom calendar selects a date and time and submits real event values',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Organizer',exact:true}).click();await navigate(page,'Settings');
  const form=page.locator('section:visible').filter({has:page.getByRole('heading',{name:'Create an event',exact:true})});
  const name=`Calendar ${Date.now()}`;await form.getByPlaceholder('Event name',{exact:true}).fill(name);
  const starts=form.getByLabel('Starts',{exact:true});await starts.fill('2027-01-15T09:00');
  await form.getByRole('button',{name:'Open starts at calendar'}).click();
  const calendar=page.getByRole('dialog',{name:'Choose date and time'});
  await expect(calendar).toBeVisible();await calendar.getByRole('button',{name:'Next month'}).click();
  await calendar.getByRole('button',{name:'2027-02-16',exact:true}).click();
  await choose(page,'Hour','10');await choose(page,'Minute','30');
  await expect(calendar).toBeVisible();await calendar.getByRole('button',{name:'Done',exact:true}).click();
  await expect(starts).toHaveValue('2027-02-16T10:30');
  await form.getByLabel('Submissions close',{exact:true}).fill('2027-02-17T18:00');
  await form.getByPlaceholder('Tracks, comma separated').fill('Open');
  const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/dogfood-api/events'));
  await form.getByRole('button',{name:'Create event',exact:true}).click();expect((await saved).status()).toBe(201);
  await expect(page.getByRole('combobox',{name:'Select event',exact:true})).toHaveText(name);
});

test('loading skeletons replace stale data and reduced motion stays usable',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  let release;const held=new Promise(r=>release=r);
  await page.route('**/dogfood-api/events/evt_demo/projects',async route=>{const response=await route.fetch();await held;await route.fulfill({response});});
  await page.goto('/');await page.getByRole('button',{name:'Participant',exact:true}).click();
  await expect(page.getByRole('status',{name:'Loading event',exact:true})).toBeVisible();
  await choose(page,'Select event','evt_01');await expect(page.getByRole('status',{name:'Loading event',exact:true})).toHaveCount(0);
  release();await navigate(page,'Overview');
  const card=page.locator('[data-tilt]').first();await card.hover();
  expect(await card.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
});

test('white clay layout is usable on desktop and mobile across every section',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');
  await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
  await expect(page.locator('.clay-auth-card')).toHaveCSS('opacity','1');
  await page.screenshot({path:'test-results/clay-login-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Event overview',exact:true})).toBeVisible();
  await expect(page.getByRole('status',{name:'Loading event',exact:true})).toHaveCount(0);
  await expect.poll(async()=>page.getByRole('progressbar',{name:'Completed reviews',exact:true}).evaluate(el=>{
    const scale=new DOMMatrix(getComputedStyle(el.firstElementChild).transform).a;
    return Math.abs(scale-Number(el.getAttribute('aria-valuenow'))/100);
  })).toBeLessThan(.01);
  const surface=page.locator('[data-tilt]').first();
  await surface.hover({position:{x:15,y:15}});
  await expect.poll(()=>surface.evaluate(el=>el.style.getPropertyValue('--tilt-x'))).not.toBe('');
  await page.mouse.move(0,0);
  await expect.poll(()=>surface.evaluate(el=>el.style.getPropertyValue('--tilt-x'))).toBe('');
  await page.screenshot({path:'test-results/clay-overview-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  for(const name of ['Overview','Submissions','Teams','Judging','Results','Community','Settings']) {
    await navigate(page,name);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name).toBe(true);
    await page.screenshot({path:`test-results/clay-${name.toLowerCase()}-mobile.png`,fullPage:true,animations:'disabled'});
  }
  await page.goto('/events/evt_01/projects');await expect(page.getByRole('combobox',{name:'Browse event'})).toBeVisible();
  const filter=page.getByRole('combobox',{name:'Filter by track',exact:true});
  await filter.focus();await filter.press('End');await filter.press('Enter');
  const selectedTrack=await page.locator('select[name="track"]').inputValue();
  expect(selectedTrack).not.toBe('');
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`track=${selectedTrack}`));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/clay-gallery-mobile.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('judge track multi-select and number stepper send the chosen values',async({page})=>{
  const headers={Authorization:'Bearer dogfood-organizer-2026'};
  const created=await page.request.post('/dogfood-api/events',{headers,data:{name:`Clay controls ${Date.now()}`,starts_at:new Date(Date.now()-3600000).toISOString(),submissions_close:new Date(Date.now()+3600000).toISOString(),tracks:['Climate','Open'],prizes:[]}});
  const event=(await created.json()).id;
  const detail=await (await page.request.get(`/dogfood-api/events/${event}`)).json();
  await page.goto('/');await page.getByRole('button',{name:'Organizer',exact:true}).click();await choose(page,'Select event',event);await navigate(page,'Judging');
  const section=page.locator('section:visible').filter({has:page.getByRole('heading',{name:'Judge invitations',exact:true})});
  const form=section.locator('form').first();
  await form.getByRole('combobox',{name:'Judge tracks',exact:true}).click();
  await page.getByRole('option',{name:'Climate',exact:true}).click();
  await form.getByRole('combobox',{name:'Judge tracks',exact:true}).press('Escape');
  await form.getByPlaceholder('Email address',{exact:true}).fill('clay-judge@example.org');
  const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/role-invites'));
  await form.getByRole('button',{name:'Invite',exact:true}).click();
  expect((await sent).postDataJSON().track_ids).toEqual([detail.tracks.find(t=>t.name==='Climate').id]);
  const count=section.getByLabel('Reviews per project',{exact:true});await expect(count).toHaveValue('3');
  await section.getByRole('button',{name:'Increase reviews_per_project',exact:true}).click();await expect(count).toHaveValue('4');
  await section.getByRole('button',{name:'Decrease reviews_per_project',exact:true}).click();await expect(count).toHaveValue('3');
});

test('invalid calendar dates and public form validation show inline feedback',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Organizer',exact:true}).click();await navigate(page,'Settings');
  const form=page.locator('section:visible').filter({has:page.getByRole('heading',{name:'Create an event',exact:true})});
  await form.getByPlaceholder('Event name',{exact:true}).fill('Invalid calendar date');
  await form.getByLabel('Starts',{exact:true}).fill('2027-02-31T09:00');
  await form.getByLabel('Submissions close',{exact:true}).fill('2027-03-02T18:00');
  await form.getByPlaceholder('Tracks, comma separated').fill('Open');
  await form.getByRole('button',{name:'Create event',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'Enter a valid local date and time.'})).toBeVisible();
  const invite=await (await page.request.post('/dogfood-api/events/evt_demo/role-invites',{headers:{Authorization:'Bearer dogfood-organizer-2026'},data:{email:`validation-${Date.now()}@example.org`,role:'participant'}})).json();
  await page.goto(invite.invite_path);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.locator('#message')).toHaveAttribute('role','alert');
  await expect(page.locator('input[name="email"]')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('input[name="email"]')).toBeFocused();
});
