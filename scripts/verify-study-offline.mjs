import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext();
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:5242/artifacts/refinamiento-tanda-3/browser.html?view=estudios&state=filled');await page.locator('h1').waitFor();const seed=await page.evaluate(()=>window.fixtureState);seed.settings.onboardingCompleted=true;seed.settings.hiddenTabs=[];
 await page.goto('http://127.0.0.1:5000/');await page.evaluate(seed=>localStorage.setItem('lifeos-state-v1',JSON.stringify(seed)),seed);
 await page.goto('http://127.0.0.1:5000/?view=estudios');await page.getByRole('heading',{name:'Estudios',exact:true,level:1}).waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'Estudios',exact:true,level:1}).waitFor();
 await page.getByRole('button',{name:'Reproducir',exact:true}).click();await page.getByRole('status').filter({hasText:'Reproduciendo'}).waitFor();
 await page.getByLabel('Ambiente',{exact:true}).selectOption('pure_white');
 await page.getByRole('button',{name:'Pausar sonido',exact:true}).click();await page.getByRole('status').filter({hasText:'En pausa'}).waitFor();
 await page.screenshot({path:'artifacts/refinamiento-tanda-3/offline-reload.png',fullPage:true});
 await fs.writeFile('artifacts/refinamiento-tanda-3/offline.json',JSON.stringify({serviceWorkerControlled:true,offlineReload:true,playbackAndChangeAndPause:true},null,2));
 assert.equal(await page.evaluate(()=>navigator.onLine),false);console.log('Built App reloaded offline; sound playback/change/pause passed.');
}finally{await browser.close();}
