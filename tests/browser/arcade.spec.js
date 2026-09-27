import {test,expect} from '@playwright/test';
import {navigate} from './helpers';

const games=[['Stacker 3D','Start Game'],['Crossy Road','START HOPPING'],['Glass Ascent',null],['Whack-a-Mole','PLAY'],['Flatline','INITIALIZE SYSTEM'],['Hex Ultra','TAP TO START']];

test('all six arcade games launch, run, and return to the clay workspace',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await navigate(page,'Arcade');
  await expect(page.locator('.portal-arcade-card')).toHaveCount(6);
  for(const [title,start] of games){
    await page.getByRole('button',{name:`Play ${title}`,exact:true}).click();
    const game=page.getByRole('dialog',{name:title,exact:true});
    await expect(game).toBeVisible();
    if(start){
      const trigger=title==='Hex Ultra'?game.getByText(start,{exact:true}):game.getByRole('button',{name:start,exact:true});
      await trigger.click();await expect(trigger).toHaveCount(0);
    }
    if(title==='Stacker 3D'){
      await expect(game.locator('.cube').first()).toBeVisible();
      expect(await game.locator('.cube').first().evaluate(el=>getComputedStyle(el).transformStyle)).toBe('preserve-3d');
    }
    if(['Crossy Road','Glass Ascent','Hex Ultra'].includes(title))await expect(game.locator('canvas').first()).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await game.locator('.clay-arcade-back').click();
    await expect(game).toHaveCount(0);
    await expect(page.getByRole('button',{name:`Play ${title}`,exact:true})).toBeFocused();
  }
  await page.getByTitle('Arcade Leaderboard').first().click();
  await expect(page.getByRole('dialog',{name:'Arcade leaderboard',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close leaderboard'}).click();
  await navigate(page,'Overview');
  await expect(page.getByRole('heading',{name:'Event overview',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('arcade remains available in every role and on phones without losing saved scores',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Organizer',exact:true}).click();
  await navigate(page,'Arcade');
  await page.evaluate(()=>localStorage.setItem('dogfood-local-panels-v1',JSON.stringify({'arcade_scores/stacker3d/scores':{'organizer@demo.local':{userName:'Demo Organizer',userEmail:'organizer@demo.local',score:54321}}})));
  await page.reload();await navigate(page,'Arcade');
  await expect(page.locator('.portal-arcade-card').filter({has:page.getByRole('heading',{name:'Stacker 3D',exact:true})})).toContainText('54,321');
  await page.setViewportSize({width:390,height:844});
  for(const role of ['Participate','Judge','Organize']){
    await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('button',{name:role,exact:true}).click();
    await navigate(page,'Arcade');
    await expect(page.getByRole('button',{name:'Play Stacker 3D',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.screenshot({path:'test-results/clay-arcade-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Play Stacker 3D',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Stacker 3D',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
