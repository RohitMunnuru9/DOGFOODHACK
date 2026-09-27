// Capture real UI actions as adjacent scenes, omitting setup and capping idle holds.
// Requires a disposable/demo instance and a full FFmpeg build in FFMPEG_PATH or PATH.
import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {choose as chooseOption,navigate} from '../tests/browser/helpers.js';

const baseURL=process.env.DOGFOOD_TEST_URL||'http://127.0.0.1:14000';
const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
execFileSync(ffmpeg,['-version'],{stdio:'ignore'});
const output=resolve('test-results/demo-recording',String(Date.now()));
await mkdir(output,{recursive:true});await mkdir('public/landing',{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({baseURL,viewport:{width:1440,height:900}});
const page=await context.newPage();
const cdp=await context.newCDPSession(page);
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const frames=[],chapters=[];let serial=0;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const localTime=offset=>{const d=new Date(Date.now()+offset);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const section=name=>page.locator('section:visible').filter({has:page.getByRole('heading',{name,exact:true})});
const click=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:12});await pause(180);await locator.click();await pause(280);};
const type=async(locator,value)=>{await click(locator);await locator.fill('');await locator.pressSequentially(value,{delay:25});};
const ready=async()=>{await pause(200);await expect(page.locator('.clay-sidebar')).toBeVisible();await expect(page.getByRole('status',{name:'Loading event',exact:true})).toHaveCount(0);await pause(250);};
const choose=async(...args)=>{await chooseOption(...args);await ready();};
const signIn=async role=>{await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:role,exact:true}).click();await ready();};
const caption=async(title,text)=>page.evaluate(({title,text})=>{
  let box=document.getElementById('demo-caption');if(!box){box=document.createElement('aside');box.id='demo-caption';document.body.append(box);}
  box.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);width:920px;max-width:90vw;padding:14px 22px;background:#fffefbf5;color:#41483c;border:1px solid #e3d8c8;border-radius:17px;z-index:99999;box-shadow:0 6px 25px #53594718;pointer-events:none;font:15px/1.5 Segoe UI,sans-serif';
  const h=document.createElement('strong');h.style.cssText='display:block;font-size:19px;color:#a3654b;margin-bottom:2px';h.textContent=title;const p=document.createElement('div');p.textContent=text;box.replaceChildren(h,p);
},{title,text});
async function record(title,text,action){
  await caption(title,text);await pause(120);
  const scene=[];let running=true,last=null,hold=0,captureError;
  const capture=(async()=>{
    while(running){
      const began=performance.now();
      const result=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:90,optimizeForSpeed:true});
      const data=Buffer.from(result.data,'base64');
      const rest=Math.max(0,65-(performance.now()-began));
      const elapsed=Math.min(.15,Math.max(.04,(performance.now()-began+rest)/1000));
      if(last?.equals(data)&&hold>=1.2){await pause(40);continue;}
      if(last?.equals(data)){hold+=elapsed;scene.at(-1).duration+=elapsed;}
      else{hold=0;const path=join(output,`frame-${String(serial++).padStart(6,'0')}.jpg`);await writeFile(path,data);scene.push({path,duration:elapsed});last=data;}
      await pause(rest);
    }
  })().catch(error=>{captureError=error;});
  try{await action();await pause(650);}finally{running=false;await capture;}
  if(captureError)throw captureError;
  if(!scene.length)throw new Error(`No frames captured for ${title}`);
  const start=frames.reduce((sum,frame)=>sum+frame.duration,0);frames.push(...scene);
  const end=frames.reduce((sum,frame)=>sum+frame.duration,0);
  chapters.push({title,text,start,end});console.log(`${title}: ${(end-start).toFixed(1)}s, ${scene.length} frames`);
}
try{
  await page.goto('/');await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
  await page.locator('.clay-landing-hero').evaluate(image=>image.decode());
  await record('01 / Good ideas. Great company.','One workspace for teams, organizers, and judges.',async()=>{
    await page.mouse.move(320,350,{steps:25});await pause(1000);
  });
  await click(page.getByRole('button',{name:'Organizer',exact:true}));await ready();
  await choose(page,'Select event','evt_01');await navigate(page,'Overview');await ready();
  await page.evaluate(()=>document.getElementById('demo-caption')?.remove());
  await page.screenshot({path:'public/landing/demo-poster.jpg',type:'jpeg',quality:90});
  await record('02 / The whole event, at a glance','Real project counts, review progress, and clear next steps.',async()=>{
    await page.mouse.move(780,425,{steps:30});await pause(550);await navigate(page,'Submissions');await page.mouse.move(940,720,{steps:22});await page.mouse.wheel(0,320);await pause(700);await navigate(page,'Overview');
  });
  await navigate(page,'Settings');const create=section('Create an event');await create.scrollIntoViewIfNeeded();
  const eventName=`Clay Showcase ${new Date().toISOString().slice(0,10)} ${Date.now().toString().slice(-4)}`;
  await record('03 / Make room for your next event','Set the dates, tracks, and prizes with custom clay controls.',async()=>{
    await type(create.getByPlaceholder('Event name',{exact:true}),eventName);
    await create.getByLabel('Starts',{exact:true}).fill(localTime(-3600000));
    await create.getByLabel('Submissions close',{exact:true}).fill(localTime(3600000));
    await type(create.getByPlaceholder('Tracks, comma separated'),'Open innovation');
    await type(create.getByPlaceholder('Prizes, comma separated'),'Best working product');
    await click(create.getByRole('button',{name:'Create event',exact:true}));
    await expect(page.getByRole('combobox',{name:'Select event',exact:true})).toHaveText(eventName);
  });
  const eventId=await page.getByRole('combobox',{name:'Select event',exact:true}).getAttribute('data-value');
  await navigate(page,'Judging');await page.getByPlaceholder('Registered email').fill('marek.nowak@example.org');await page.getByRole('button',{name:'Add role',exact:true}).click();await expect(section('Judging progress').getByText('Marek Nowak',{exact:true})).toBeVisible();
  await signIn('Participant');await choose(page,'Select event',eventId);await ready();
  await record('04 / Build a team. Tell your story.','Draft your project before sharing it with the event.',async()=>{
    await type(page.getByPlaceholder('Team name',{exact:true}),'Neighborhood builders');await click(page.getByRole('button',{name:'Create team',exact:true}));
    await type(page.getByPlaceholder('Project title',{exact:true}),'Neighbor Notes');
    await type(page.getByPlaceholder('Short summary',{exact:true}),'A shared board for local community projects.');
    await page.getByPlaceholder('Full project story: the problem, approach and what you built').fill('A simple place for neighbors to propose, organize, and celebrate community projects. Built and reviewed in the real DOGFOOD workspace.');
    await click(page.getByRole('button',{name:'Save draft',exact:true}));await expect(page.getByRole('button',{name:'Submit project',exact:true})).toBeVisible();
  });
  await record('05 / Ready to share','Submit your project and make it discoverable in the gallery.',async()=>{
    await click(page.getByRole('button',{name:'Submit project',exact:true}));await expect(page.getByRole('button',{name:'Submit project',exact:true})).toHaveCount(0);
    await section('Public project gallery').scrollIntoViewIfNeeded();await pause(850);
  });
  expect((await page.request.get(`/dogfood-api/events/${eventId}/results`)).status()).toBe(403);
  await signIn('Organizer');await choose(page,'Select event',eventId);await navigate(page,'Judging');
  await record('06 / Give every project a fair review','Assign a balanced batch and keep track of completed reviews.',async()=>{
    await page.getByLabel('Reviews per project',{exact:true}).fill('1');await click(page.getByRole('button',{name:'Assign batch',exact:true}));await expect(page.getByText('1 new assignments.',{exact:true})).toBeVisible();await pause(700);
  });
  await signIn('Judge');await choose(page,'Select event',eventId);const review=section('Assigned reviews');await review.scrollIntoViewIfNeeded();
  await record('07 / Thoughtful, private judging','Use the weighted rubric and leave useful feedback.',async()=>{
    for(const [label,value] of [['Functionality · weight 1','5'],['Quality · weight 1','4'],['Innovation · weight 1','3']]){await click(review.getByLabel(label,{exact:true}));await review.getByLabel(label,{exact:true}).fill(value);await pause(350);}
    await type(review.getByPlaceholder('Review notes'),'Clear idea. Complete and usable end to end.');await click(review.getByRole('button',{name:'Submit review',exact:true}));await expect(review.getByRole('button',{name:'Update review',exact:true})).toBeVisible();
  });
  await signIn('Organizer');await choose(page,'Select event',eventId);await navigate(page,'Settings');await section('Event controls').getByLabel('Submissions close',{exact:true}).fill(localTime(-60000));await section('Event controls').getByRole('button',{name:'Save settings',exact:true}).click();await navigate(page,'Results');
  await record('08 / Publish a result everyone can trust','After the deadline, freeze the scores and export the results.',async()=>{
    await click(page.getByRole('button',{name:'Publish results',exact:true}));await expect(page.getByText('Published snapshot',{exact:true})).toBeVisible();
    const pending=page.waitForEvent('download');await click(page.getByRole('link',{name:'Export CSV',exact:true}));const download=await pending;expect(download.suggestedFilename()).toBe('dogfood-results.csv');await pause(600);
  });
  await page.goto(`/events/${eventId}/projects`);await expect(page.getByRole('heading',{name:'Published judging results'})).toBeVisible();
  await record('09 / Celebrate the work','Visitors can explore projects and read the published scores.',async()=>{
    await page.getByRole('heading',{name:'Published judging results'}).scrollIntoViewIfNeeded();await page.mouse.move(760,500,{steps:30});await pause(850);await expect(page.getByRole('row').filter({hasText:'Neighbor Notes'})).toContainText('4.000');
  });
  await page.goto('/');await ready();await navigate(page,'Arcade');await expect(page.getByRole('button',{name:'Play Stacker 3D',exact:true})).toBeVisible();
  await record('10 / A little room to play','Six arcade games. Your high scores stay in this browser.',async()=>{
    await click(page.getByRole('button',{name:'Play Stacker 3D',exact:true}));await click(page.getByRole('button',{name:'Start Game',exact:true}));await pause(1600);await page.keyboard.press('Space');await pause(600);await click(page.locator('.clay-arcade-back'));
  });
  await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('button',{name:'Organize',exact:true}).click();await ready();await choose(page,'Select event',eventId);
  await navigate(page,'Overview');await ready();
  await record('DOGFOOD / Make something that matters','Build together. Review thoughtfully. Keep everything moving.',async()=>{await page.mouse.move(900,480,{steps:25});await pause(1000);});
  expect(errors).toEqual([]);
}finally{await context.close();await browser.close();}

const escape=path=>path.replaceAll('\\','/').replaceAll("'","'\\''");
const concat=frames.map(frame=>`file '${escape(frame.path)}'\noption framerate 1000\nduration ${frame.duration.toFixed(6)}`).join('\n')+`\nfile '${escape(frames.at(-1).path)}'\noption framerate 1000\n`;
await writeFile(join(output,'frames.ffconcat'),'ffconcat version 1.0\n'+concat);
const mp4=join(output,'demo.mp4'),webm=join(output,'demo.webm');
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',join(output,'frames.ffconcat'),'-vf','fps=25','-t',String(chapters.at(-1).end),'-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',mp4],{stdio:'inherit'});
execFileSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i',mp4,'-c:v','libvpx-vp9','-b:v','0','-crf','34','-row-mt','1',webm],{stdio:'inherit'});
await copyFile(mp4,resolve('public/landing/demo.mp4'));await copyFile(webm,resolve('docs/landing-demo.webm'));
const stamp=seconds=>new Date(seconds*1000).toISOString().slice(11,23);
await writeFile('public/landing/demo.vtt','WEBVTT\n\n'+chapters.map(c=>`${stamp(c.start)} --> ${stamp(c.end)}\n${c.title}\n${c.text}\n`).join('\n'));
await writeFile('docs/demo-timeline.json',JSON.stringify({width:1440,height:900,fps:25,duration:chapters.at(-1).end,frames:frames.length,chapters},null,2)+'\n');
console.log(`Saved continuous ${chapters.at(-1).end.toFixed(1)}s walkthrough, ${frames.length} source frames.`);
