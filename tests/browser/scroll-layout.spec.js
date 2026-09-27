import {test,expect} from '@playwright/test';
import {navigate,choose} from './helpers';

for(const viewport of [{width:1440,height:800},{width:1024,height:600},{width:390,height:844}]) {
  test(`workspace content scrolls independently at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/');
    await page.getByRole('button',{name:'Organizer',exact:true}).click();
    await choose(page,'Select event','evt_01');
    const main=page.locator('.clay-main'),sidebar=page.locator('.clay-sidebar'),header=page.locator('.clay-topbar');
    for(const section of ['Overview','Submissions','Teams','Judging','Results','Community','Arcade','Settings']){
      await navigate(page,section);
      await expect.poll(()=>main.evaluate(el=>el.scrollTop)).toBe(0);
      const initial=await sidebar.boundingBox(),top=await header.boundingBox();
      const box=await main.boundingBox();
      await page.mouse.move(box.x+box.width-10,box.y+Math.min(100,box.height/2));
      await page.mouse.wheel(0,650);
      const max=await main.evaluate(el=>el.scrollHeight-el.clientHeight);
      if(max>0)await expect.poll(()=>main.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(()=>window.scrollY),section).toBe(0);
      expect((await sidebar.boundingBox()).y,section).toBeCloseTo(initial.y,0);
      expect((await header.boundingBox()).y,section).toBeCloseTo(top.y,0);
      expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),section).toBe(true);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),section).toBe(true);
    }
    await navigate(page,'Overview');
    await page.screenshot({path:`test-results/scroll-layout-${viewport.width}.png`,animations:'disabled'});
    // All navigation stays reachable even when the rail is taller than a short desktop viewport.
    if(viewport.width>900){await sidebar.hover();await page.mouse.wheel(0,700);}
    else await page.getByRole('navigation',{name:'Event navigation'}).getByRole('button',{name:'Settings',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('navigation',{name:'Event navigation'}).getByRole('button',{name:'Settings',exact:true})).toBeInViewport();
    expect(await page.evaluate(()=>window.scrollY)).toBe(0);
  });
}
