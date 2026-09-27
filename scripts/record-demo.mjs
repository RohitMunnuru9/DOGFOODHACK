// Record real UI actions against a disposable/demo instance; includes timed captions.
import {chromium, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const baseURL = process.env.DOGFOOD_TEST_URL || 'http://127.0.0.1:18000';
const localTime = offset => {
  const date = new Date(Date.now()+offset);
  return new Date(date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
};
await mkdir('docs', {recursive:true});
const browser = await chromium.launch({slowMo:100});
const context = await browser.newContext({baseURL, viewport:{width:1280,height:900},
  recordVideo:{dir:'test-results/demo-recording',size:{width:1280,height:900}}});
const page = await context.newPage();
const video = page.video();
const started = Date.now();
const chapter = async (until, title, text, locator) => {
  if (locator) await locator.scrollIntoViewIfNeeded();
  await page.evaluate(({title,text}) => {
    let box = document.getElementById('demo-caption');
    if (!box) { box=document.createElement('aside'); box.id='demo-caption'; document.body.append(box); }
    box.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);width:1000px;max-width:92vw;padding:18px 24px;background:#102c26f5;color:white;border:1px solid #bad196;border-radius:16px;z-index:99999;box-shadow:0 8px 32px #0005;pointer-events:none;font:17px/1.5 system-ui';
    const heading=document.createElement('strong');heading.style.cssText='display:block;font-size:22px;color:#e1efb6;margin-bottom:4px';heading.textContent=title;
    const description=document.createElement('div');description.textContent=text;
    box.replaceChildren(heading,description);
  }, {title,text});
  console.log(`${Math.round((Date.now()-started)/1000)}s: ${title}`);
  const remaining = until*1000 - (Date.now()-started);
  if (remaining>0) await new Promise(resolve => setTimeout(resolve, remaining));
};
try {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const eventName = 'Local Builders / DOGFOOD demo';
  const section = name => page.locator('section').filter({has:page.getByRole('heading',{name,exact:true})});
  const signIn = async role => {
    await page.getByRole('button',{name:'Sign out'}).click();
    await page.getByRole('button',{name:role,exact:true}).click();
  };
  await page.goto('/');
  await chapter(15, 'DOGFOOD / A complete local event', 'Next.js, Python and SQLite. This recording uses the Docker build and real browser actions. No cloud account is required.');
  await page.getByRole('button',{name:'Organizer',exact:true}).click();
  const create = section('Create an event');
  await create.getByPlaceholder('Event name',{exact:true}).fill(eventName);
  await create.getByLabel('Starts',{exact:true}).fill(localTime(-3600000));
  await create.getByLabel('Submissions close',{exact:true}).fill(localTime(3600000));
  await create.getByPlaceholder('Tracks, comma separated').fill('Open innovation');
  await create.getByPlaceholder('Prizes, comma separated').fill('Best working product');
  await chapter(40, '01 / Set the stage', 'The organizer sets the event dates, track and prize. Deadlines are checked by the server on every submission.', create);
  await create.getByRole('button',{name:'Create event',exact:true}).click();
  await expect(page.getByLabel('Select event').locator('option:checked')).toHaveText(eventName);
  await expect(page.getByLabel('Select event')).toBeEnabled();
  const eventId = await page.getByLabel('Select event').inputValue();
  await page.getByPlaceholder('Registered email').fill('marek.nowak@example.org');
  await page.getByRole('button',{name:'Add role',exact:true}).click();
  await expect(section('Judging progress').getByText('Marek Nowak',{exact:true})).toBeVisible();
  await chapter(65, '02 / Invite the jury', 'Marek is granted a judge role for this event. Judges can be restricted to selected tracks; new accounts can join through email-bound invitation links.', section('Judge invitations'));
  await signIn('Participant');
  await page.getByLabel('Select event').selectOption(eventId);
  await page.getByPlaceholder('Team name',{exact:true}).fill('Neighborhood builders');
  await page.getByRole('button',{name:'Create team',exact:true}).click();
  await chapter(85, '03 / Build a team', 'The participant uses a separate account. Teams have up to four members and cannot submit after the event deadline.', section('Your team'));
  await page.getByPlaceholder('Project title',{exact:true}).fill('Neighbor Notes');
  await page.getByPlaceholder('Short summary',{exact:true}).fill('A local-first board for neighborhood projects.');
  await page.getByPlaceholder('Full project story: the problem, approach and what you built').fill('We built a shared board to help neighbors propose and organize practical community projects. This sample submission demonstrates the complete DOGFOOD event lifecycle.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await chapter(115, '04 / Save a draft', 'A project has a title, track, story, links, tags and organizer questions. A draft is private until the team submits it.', section('Project submission'));
  await page.getByRole('button',{name:'Submit project',exact:true}).click();
  await expect(page.getByRole('button',{name:'Submit project',exact:true})).toHaveCount(0);
  expect((await page.request.get(`/dogfood-api/events/${eventId}/results`)).status()).toBe(403);
  await chapter(135, '05 / Submit the project', 'The gallery now includes Neighbor Notes. Required answers and eligibility are validated on the backend. Judging results are still private.', section('Public project gallery'));
  await signIn('Organizer');
  await page.getByLabel('Select event').selectOption(eventId);
  await page.getByLabel('Reviews per project',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Assign batch',exact:true}).click();
  await expect(page.getByText('1 new assignments.',{exact:true})).toBeVisible();
  await chapter(160, '06 / Assign a balanced batch', 'The batch respects track permissions, existing assignments and team conflicts. Shortages stay visible instead of weakening the rules.', section('Judge invitations'));
  await signIn('Judge');
  await page.getByLabel('Select event').selectOption(eventId);
  const review = section('Assigned reviews');
  await review.getByLabel('Functionality · weight 1',{exact:true}).fill('5');
  await review.getByLabel('Quality · weight 1',{exact:true}).fill('4');
  await review.getByLabel('Innovation · weight 1',{exact:true}).fill('3');
  await review.getByPlaceholder('Review notes').fill('Complete and usable end to end.');
  await chapter(190, '07 / Score with a weighted rubric', 'Marek sees his own assignment and the full submission. Scores stay tied to their rubric version. Another judge cannot request these private scores.', review);
  await review.getByRole('button',{name:'Submit review',exact:true}).click();
  await expect(review.getByRole('button',{name:'Update review',exact:true})).toBeVisible();
  await chapter(210, 'Review recorded', 'Scores 5, 4 and 3 produce a raw score of 4. With one judge there is no severity offset. The fixture evidence also tests constant scoring and uneven review coverage.', review);
  await signIn('Organizer');
  await page.getByLabel('Select event').selectOption(eventId);
  await expect(section('Judging progress').getByText('1/1',{exact:true})).toBeVisible();
  await chapter(235, '08 / Inspect progress', 'The organizer sees one completed review out of one assignment. Individual reviews, raw scores and the event audit remain inspectable.', section('Judging progress'));
  await section('Event controls').getByLabel('Submissions close',{exact:true}).fill(localTime(-60000));
  await section('Event controls').getByRole('button',{name:'Save settings',exact:true}).click();
  await page.getByRole('button',{name:'Publish results',exact:true}).click();
  await expect(page.getByText('Published snapshot',{exact:true})).toBeVisible();
  await chapter(255, '09 / Publish a frozen snapshot', 'After submissions close, publication freezes the results. Review edits, timing changes and repeat publication are rejected by the API.', section('Results'));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link',{name:'Export CSV',exact:true}).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('dogfood-results.csv');
  const stream = await download.createReadStream();
  let csv = ''; for await (const chunk of stream) csv += chunk.toString();
  expect(csv).toContain('Neighbor Notes');
  expect(csv).toContain('judge-mean-shrinkage-v1');
  await chapter(275, '10 / Export and verify', 'The downloaded CSV includes raw and adjusted scores, review counts and method. Full JSON archives can restore judging history into an empty event.', section('Move your data'));
  const certificate = page.getByRole('link').filter({hasText:'PROJECT CERTIFICATE'}).first();
  const certificatePath = await certificate.getAttribute('href');
  await page.goto(certificatePath);
  await chapter(288, 'Signed participation records', 'Publication issues project certificates and judge records. Anyone with the link can ask this server to verify its HMAC signature.');
  await page.goto('/');
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.goto(`/events/${eventId}/projects`);
  await expect(page.getByRole('heading',{name:'Published judging results'})).toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'Neighbor Notes'})).toContainText('4.000');
  await chapter(301, '11 / Public results', 'Visitors can read the frozen result without signing in. The Docker build passed all seven host checks, including an isolated runtime without internet access.');
  expect(errors).toEqual([]);

} finally {
  await context.close();
  await video.saveAs(resolve('docs/demo.webm'));
  await browser.close();
}
console.log('Saved docs/demo.webm');
