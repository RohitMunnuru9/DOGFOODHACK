import {test,expect} from '@playwright/test';

for(const width of [1440,390])test(`landing artwork and video work at ${width}px`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height:900});await page.goto('/');
  await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
  for(const source of ['build-together-clay.png','judging-clay.png']){
    const illustration=page.locator(`img[src="/landing/${source}"]`);
    await illustration.scrollIntoViewIfNeeded();
    await expect.poll(()=>illustration.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  }
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.getByRole('link',{name:'Watch the demo',exact:true}).click();
  const video=page.getByLabel('DOGFOOD workspace walkthrough',{exact:true});
  await expect(video).toBeInViewport();
  await video.evaluate(async player=>{player.muted=true;await player.play();});
  await expect.poll(()=>video.evaluate(player=>player.currentTime)).toBeGreaterThan(.2);
  expect(await video.evaluate(player=>player.duration)).toBeGreaterThan(25);
  await video.evaluate(player=>{player.pause();player.currentTime=player.duration-1;});
  await expect.poll(()=>video.evaluate(player=>!player.seeking&&player.readyState>=2)).toBe(true);
  expect(await video.evaluate(player=>player.error)).toBeNull();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await video.evaluate(player=>player.load());
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
  await page.screenshot({path:`test-results/landing-${width}.png`,fullPage:true});
  const range=await page.request.get('/landing/demo.mp4',{headers:{Range:'bytes=0-1023'}});
  expect(range.status()).toBe(206);expect(range.headers()['content-type']).toContain('video/mp4');
  expect((await page.request.get('/landing/demo.vtt')).ok()).toBe(true);
  expect(errors).toEqual([]);
});
