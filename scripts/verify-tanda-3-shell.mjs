import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/refinamiento-tanda-3/shell';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const seedPage=await browser.newPage();await seedPage.goto('http://127.0.0.1:5242/artifacts/refinamiento-tanda-3/browser.html?view=ia&state=filled');await seedPage.locator('h1').waitFor();
 const seed=await seedPage.evaluate(()=>window.fixtureState);seed.settings.onboardingCompleted=true;seed.settings.hiddenTabs=[];await seedPage.close();
 const results=[];const errors=[];
 for(const [width,height] of [[1920,1080],[2560,1440],[768,1024],[390,844]])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height}});
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await context.addInitScript(({seed,theme})=>{seed.settings.darkMode=theme==='dark';localStorage.setItem('lifeos-state-v1',JSON.stringify(seed));},{seed,theme});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  for(const [view,title,scope] of [['estudios','Estudios','study-refinement'],['notas','Notas y herramientas','notes-refinement'],['ia','IA · Oportunidades e ideas','ai-refinement']]){
   await page.goto(`http://127.0.0.1:5242/?view=${view}`);await page.getByRole('heading',{name:title,exact:true,level:1}).waitFor();await page.evaluate(()=>document.fonts.ready);
   const metrics=await page.locator(`.${scope}`).evaluate(root=>({font:getComputedStyle(root.querySelector('h1')).fontFamily,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.match(metrics.font,/Instrument Sans/);assert.equal(metrics.overflow,false);
   await page.screenshot({path:`${out}/${view}-${width}-${theme}.png`,fullPage:true});results.push({view,width,theme,...metrics});
  }await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log('24 real App checks passed.');
}finally{await browser.close();}
