import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const seedPage=await browser.newPage();await seedPage.goto('http://127.0.0.1:5242/artifacts/refinamiento-tanda-3/browser.html?view=notas&state=filled');await seedPage.locator('h1').waitFor();
 const seed=await seedPage.evaluate(()=>window.fixtureState);seed.settings.onboardingCompleted=true;seed.settings.hiddenTabs=[];await seedPage.close();
 const results=[];
 for(const [width,dark] of [[768,false],[390,true]]){
  const context=await browser.newContext({viewport:{width,height:1000}});
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await context.addInitScript(({seed,dark})=>{if(!localStorage.getItem('lifeos-state-v1')){seed.settings.darkMode=dark;localStorage.setItem('lifeos-state-v1',JSON.stringify(seed));}},{seed,dark});
  const page=await context.newPage();await page.goto('http://127.0.0.1:5242/?view=notas');await page.getByRole('heading',{name:'Notas y herramientas',exact:true,level:1}).waitFor();
  await page.getByRole('button',{name:'Nueva nota',exact:true}).click();await page.getByLabel('Título de la nueva nota',{exact:true}).fill('Nota persistida de prueba');await page.getByPlaceholder('Escribí el contenido de la nota...',{exact:true}).fill('Texto original');await page.getByRole('button',{name:'Guardar nota',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'Abrir nota Nota persistida de prueba',exact:true}).click();
  const body=page.locator('.fixed textarea');assert.equal(await body.inputValue(),'Texto original');await body.fill('Texto corregido');
  await page.evaluate(()=>{window.originalTanda3SetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('lifeos-state-v1'))throw new Error('Synthetic storage failure');return window.originalTanda3SetItem.call(this,key,value);};});
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();assert.equal(await body.inputValue(),'Texto corregido');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lifeos-state-v1')).notes.postits.find(note=>note.title==='Nota persistida de prueba').text),'Texto original');
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalTanda3SetItem;delete window.originalTanda3SetItem;});
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:'Abrir nota Nota persistida de prueba',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lifeos-state-v1')).notes.postits.find(note=>note.title==='Nota persistida de prueba').text),'Texto corregido');
  const actions=()=>page.getByRole('button',{name:'Acciones de la nota Nota persistida de prueba',exact:true});
  await actions().click();await page.getByRole('menuitem',{name:'Archivar',exact:true}).click();
  await page.getByRole('button',{name:/^Archivadas/}).click();await actions().click();await page.getByRole('menuitem',{name:'Restaurar',exact:true}).click();
  await page.getByRole('button',{name:/^Activas/}).click();await actions().click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('menuitem',{name:'Eliminar',exact:true}).click();
  await page.reload();await page.getByRole('heading',{name:'Notas y herramientas',exact:true,level:1}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Abrir nota Nota persistida de prueba',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('lifeos-state-v1')).notes.postits.length),1);
  results.push({width,dark,createReloadEditRetryArchiveRestoreDeleteReload:true});await context.close();
 }
 await fs.writeFile('artifacts/refinamiento-tanda-3/notes-persistence.json',JSON.stringify({results},null,2));console.log('Actual App note lifecycle and persistence passed in tablet/light and mobile/dark.');
}finally{await browser.close();}
