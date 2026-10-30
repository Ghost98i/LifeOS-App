import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = 'artifacts/refinamiento-tanda-3/flows'; await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
try {
 const context = await browser.newContext();
 await context.route('**/*', route => ['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
 await context.addInitScript(() => {
   const Native = window.AudioContext;
   window.audioProbe = { sources: [], ramps: [], contexts: [] };
   window.AudioContext = class extends Native {
     constructor(...args) { super(...args); window.audioProbe.contexts.push(this); }
     createBufferSource() {
       const source = super.createBufferSource(); window.audioProbe.sources.push(source); return source;
     }
     createGain() {
       const gain = super.createGain(); const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
       gain.gain.linearRampToValueAtTime = (value, time) => { window.audioProbe.ramps.push({ value, time, now: this.currentTime }); return ramp(value, time); };
       return gain;
     }
   };
 });
 const page = await context.newPage(); page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error') console.error(msg.text());}); const checks=[];
 const goto=async(view,theme='light')=>{
   await context.setOffline(false);
   await page.goto(`http://127.0.0.1:5242/artifacts/refinamiento-tanda-3/browser.html?view=${view}&state=filled&theme=${theme}`);
   await page.locator('h1').waitFor();await page.evaluate(()=>document.fonts.ready);
 };
 const state=()=>page.evaluate(()=>JSON.stringify(window.fixtureState));
 const audioPlaying=()=>page.evaluate(async()=>{const audio=await import('/src/lib/audio.ts');return audio.isAnyAmbientNoisePlaying();});
 for(const [width,height] of [[1920,1080],[2560,1440],[768,1024],[390,844]]) for(const theme of ['light','dark']) {
   await page.setViewportSize({width,height}); await goto('ia',theme);
   const original=await state(); const input=page.getByLabel('Respuesta de la IA (JSON)',{exact:true});
   await input.fill('{broken');await page.getByRole('button',{name:'Revisar resultados',exact:true}).click();
   await page.getByText('La respuesta no contiene un JSON válido.',{exact:true}).waitFor();assert.equal(await state(),original);
   await page.screenshot({path:`${out}/ia-invalid-${width}-${theme}.png`,fullPage:true});
   const payload={empleo:[{empresa:'Empresa de prueba',puesto:'Soporte',rating:3,link:'javascript:window.pwned=true',nota:'<img src=x onerror=window.pwned=true>'}],reventa:[{item:'Equipo de prueba',buyPrice:100,marketPrice:180,nota:'Verificar estado'}],ideas:['Revisar una idea antes de actuar']};
   await input.fill(JSON.stringify(payload));await page.getByRole('button',{name:'Revisar resultados',exact:true}).click();
   const preview=page.locator('[aria-label="Vista previa de la importación"]');await preview.getByText('Empresa de prueba',{exact:true}).waitFor();
   assert.equal(await preview.locator('img,script,a[href^="javascript:"]').count(),0);assert.equal(await state(),original);
   assert.equal(await page.getByRole('button',{name:'Confirmar importación',exact:true}).isDisabled(),true);
   await page.screenshot({path:`${out}/ia-unsafe-link-${width}-${theme}.png`,fullPage:true});
   await page.getByRole('button',{name:'Cancelar revisión',exact:true}).click();assert.equal(await state(),original);
   payload.empleo[0].link='https://example.org/oferta';await input.fill(JSON.stringify(payload));
   await page.getByRole('button',{name:'Revisar resultados',exact:true}).click();
   await page.evaluate(()=>{window.failSave=true;});await page.getByRole('button',{name:'Confirmar importación',exact:true}).click();
   assert.equal(await state(),original);assert.equal(await input.inputValue(),JSON.stringify(payload));
   await page.screenshot({path:`${out}/ia-review-save-error-${width}-${theme}.png`,fullPage:true});
   await page.evaluate(()=>{window.failSave=false;});await page.getByRole('button',{name:'Confirmar importación',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.fixtureState.jobs.opportunities.length),2);
   assert.equal(await page.evaluate(()=>window.pwned),undefined);
   assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
   await page.getByRole('button',{name:'Crear postulación',exact:true}).last().click();
   assert.equal(await page.evaluate(()=>window.fixtureState.jobs.applications.some(item=>item.empresa==='Empresa de prueba')),true);
   await goto('notas',theme); await page.getByRole('button',{name:/^Herramientas/}).click();
   assert.equal(await page.getByRole('navigation',{name:'Herramientas personales'}).count(),1);
   await page.getByRole('button',{name:'Lista de compras',exact:true}).click();
   const shop=page.getByLabel('Artículo para comprar',{exact:true});await shop.fill('Avena de prueba');
   await page.evaluate(()=>{window.failSave=true;});await page.getByRole('button',{name:'Agregar',exact:true}).click();
   assert.equal(await shop.inputValue(),'Avena de prueba');assert.equal(await page.evaluate(()=>window.fixtureState.notes.shopping.length),1);
   await page.screenshot({path:`${out}/tools-save-error-${width}-${theme}.png`,fullPage:true});
   await page.evaluate(()=>{window.failSave=false;});await page.getByRole('button',{name:'Agregar',exact:true}).click();
   await page.getByRole('button',{name:'Marcar comprado: Avena de prueba',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.fixtureState.notes.shopping.at(-1).done),true);
   await page.getByRole('button',{name:'Eliminar Avena de prueba',exact:true}).click();
   await page.getByRole('button',{name:'Enlaces',exact:true}).click();await page.getByLabel('Nombre del enlace',{exact:true}).fill('Documentación');await page.getByLabel('Dirección del enlace',{exact:true}).fill('example.org/manual');
   await page.getByRole('button',{name:'Agregar',exact:true}).click();assert.equal(await page.getByRole('link',{name:'Documentación',exact:true}).getAttribute('href'),'https://example.org/manual');
   await page.getByRole('button',{name:'Eliminar enlace Documentación',exact:true}).click();
   await page.getByRole('button',{name:'Objetos y regalos',exact:true}).click();await page.getByLabel('Objeto o regalo',{exact:true}).fill('Libro de prueba');await page.getByRole('button',{name:'Guardar',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.fixtureState.notes.possessions.length),1);await page.getByRole('button',{name:'Eliminar Libro de prueba',exact:true}).click();
   await page.getByRole('button',{name:'Proyectos y objetivos',exact:true}).click();await page.getByRole('button',{name:'Objetivos · avance numérico',exact:true}).click();
   await page.getByLabel('Nombre del objetivo',{exact:true}).fill('Capítulos');await page.getByLabel('Valor inicial',{exact:true}).fill('0');await page.getByLabel('Meta',{exact:true}).fill('5');
   await page.getByRole('button',{name:/Crear objetivo/}).click();assert.equal(await page.evaluate(()=>window.fixtureState.goals.length),2);
   await page.screenshot({path:`${out}/goals-${width}-${theme}.png`,fullPage:true});
   await page.getByRole('button',{name:'Eliminar objetivo Capítulos',exact:true}).click();
   await page.evaluate(()=>window.fixtureOpenProject());
   await page.getByRole('button',{name:'Nuevo proyecto',exact:true}).waitFor();
   assert.equal(await page.getByRole('heading',{name:'Objetivos con progreso',exact:true}).isVisible(),false);
   if ((width===1920 && theme==='light') || (width===390 && theme==='dark')) {
     await page.getByRole('button',{name:'Proyectos · tareas y próximo paso',exact:true}).click();
     await page.getByRole('button',{name:'Nuevo proyecto',exact:true}).click();
     const projectName=page.getByPlaceholder('Ej: Lanzamiento de producto, Mudanza, Certificación AWS',{exact:true});
     await projectName.fill('Proyecto de prueba');await page.evaluate(()=>{window.failSave=true;});
     await page.getByRole('button',{name:/Crear Proyecto/}).click();assert.equal(await projectName.inputValue(),'Proyecto de prueba');
     assert.equal(await page.evaluate(()=>window.fixtureState.projects.length),1);
     await page.evaluate(()=>{window.failSave=false;});await page.getByRole('button',{name:/Crear Proyecto/}).click();
     assert.equal(await page.evaluate(()=>window.fixtureState.projects.length),2);
     await page.getByRole('button',{name:'Editar proyecto',exact:true}).first().click();await projectName.fill('Proyecto actualizado');
     await page.getByRole('button',{name:'Guardar Cambios',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixtureState.projects[0].name),'Proyecto actualizado');
     page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Eliminar proyecto',exact:true}).first().click();
     assert.equal(await page.evaluate(()=>window.fixtureState.projects.length),1);
     await page.getByRole('button',{name:'Streaming y contenido',exact:true}).click();await page.getByLabel('Horas del directo',{exact:true}).fill('2');
     await page.getByRole('button',{name:/Registrar horas/}).click();assert.equal(await page.evaluate(()=>window.fixtureState.streaming.sessions.at(-1).hours),2);
     await page.getByLabel('Control antes del directo',{exact:true}).fill('Revisar micrófono');await page.getByRole('button',{name:'Agregar control',exact:true}).click();
     assert.equal(await page.evaluate(()=>window.fixtureState.streaming.preStreamChecklist.length),1);
     await page.getByLabel('Título del contenido',{exact:true}).fill('Contenido nuevo');
     await page.locator('form').filter({has:page.getByLabel('Título del contenido',{exact:true})}).getByRole('button',{name:'Agregar',exact:true}).click();
     await page.getByLabel('Estado de Contenido nuevo',{exact:true}).selectOption('recording');
     assert.equal(await page.evaluate(()=>window.fixtureState.streaming.contentPipeline.at(-1).status),'recording');
     await page.screenshot({path:`${out}/streaming-${width}-${theme}.png`,fullPage:true});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   }
   await page.getByRole('button',{name:'Mis notas',exact:true}).click();await page.getByRole('button',{name:'Nueva nota',exact:true}).click();
   await page.getByLabel('Título de la nueva nota',{exact:true}).fill('Repaso');await page.getByPlaceholder('Escribí el contenido de la nota...',{exact:true}).fill('Contenido que debe conservarse');
   await page.evaluate(()=>{window.failSave=true;});await page.getByRole('button',{name:'Guardar nota',exact:true}).click();
   assert.equal(await page.getByPlaceholder('Escribí el contenido de la nota...',{exact:true}).inputValue(),'Contenido que debe conservarse');
   await page.evaluate(()=>{window.failSave=false;});await page.getByRole('button',{name:'Guardar nota',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixtureState.notes.postits.length),2);
   await page.evaluate(()=>{const next=structuredClone(window.fixtureState);next.notes.postits=Array.from({length:1000},(_,i)=>({id:`large-${i}`,title:`Registro ${i}`,text:`Contenido ${i}`,date:'2026-10-29'}));window.fixtureSetState(next);});
   assert.equal(await page.getByRole('button',{name:/^Abrir nota /}).count(),50);
   await page.getByPlaceholder('Buscar por título, texto o etiqueta',{exact:true}).fill('Registro 999');
   await page.getByRole('button',{name:/^Abrir nota Registro 999/}).click();await page.getByRole('button',{name:'Guardar cambios',exact:true}).waitFor();
   assert.equal(await page.locator('.fixed textarea').inputValue(),'Contenido 999');
   await goto('estudios',theme);
   const studyOriginal=await page.evaluate(()=>JSON.stringify(window.fixtureState.study));
   assert.equal(await audioPlaying(),false);await page.getByRole('button',{name:'Reproducir',exact:true}).click();
   await page.waitForFunction(async()=>{const a=await import('/src/lib/audio.ts');return a.isAnyAmbientNoisePlaying();});
   await context.setOffline(true);await page.getByLabel('Ambiente',{exact:true}).selectOption('pure_white');
   await page.waitForFunction(async()=>{const a=await import('/src/lib/audio.ts');return a.isAnyAmbientNoisePlaying();});
   await page.getByLabel('Volumen del ambiente',{exact:true}).fill('0.4');
   await page.evaluate(async()=>{const audio=await import('/src/lib/audio.ts');audio.setSoundEnabled(false);});
   assert.equal(await audioPlaying(),false);
   await page.getByText('Los sonidos están silenciados. Activálos en la barra superior para reproducir un ambiente.',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Reproducir',exact:true}).isDisabled(),true);
   await page.evaluate(async()=>{const audio=await import('/src/lib/audio.ts');audio.setSoundEnabled(true);});
   await page.getByRole('button',{name:'Reproducir',exact:true}).click();
   assert.ok(await page.evaluate(()=>window.audioProbe.ramps.some(item=>item.time>item.now && item.value>0)));
   const bufferInfo=await page.evaluate(()=>{const b=window.audioProbe.sources.at(-1).buffer;return {duration:b.duration,channels:b.numberOfChannels};});assert.deepEqual(bufferInfo,{duration:12,channels:2});
   await page.getByRole('button',{name:'Pausar sonido',exact:true}).click();assert.equal(await audioPlaying(),false);
   await page.getByRole('button',{name:'Reproducir',exact:true}).click();
   await page.getByRole('button',{name:/Iniciar Enfoque/}).click();
   await page.getByRole('button',{name:/Pausar/}).filter({hasNotText:'sonido'}).click();assert.equal(await audioPlaying(),false);
   await page.getByRole('button',{name:/Reanudar/}).click();await page.waitForFunction(async()=>{const a=await import('/src/lib/audio.ts');return a.isAnyAmbientNoisePlaying();});
   await page.getByRole('button',{name:'Pausar sonido',exact:true}).waitFor();
   await page.getByRole('button',{name:/Reiniciar/}).click();assert.equal(await audioPlaying(),false);
   assert.equal(await page.evaluate(()=>window.fixtureState.study.studyLog.length),JSON.parse(studyOriginal).studyLog.length);
   await page.getByRole('button',{name:'Registrar estudio',exact:true}).click();await page.getByLabel('Minutos de estudio',{exact:true}).fill('30');await page.getByRole('button',{name:'Registrar',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.fixtureState.study.studyLog.at(-1).minutes),30);
   if (width===390 && theme==='dark') {
     await page.getByRole('button',{name:'Reproducir',exact:true}).click();await page.getByRole('button',{name:/Iniciar Enfoque/}).click();
     await page.evaluate(()=>{const next=structuredClone(window.fixtureState);next.study.activeSession.startedAt=Date.now()-120000;next.study.activeSession.endsAt=Date.now()+23*60000;next.study.activeSession.lastTickAt=Date.now();window.fixtureSetState(next);});
     await page.getByRole('button',{name:'Terminar ahora',exact:true}).click();
     await page.waitForFunction(async()=>{const a=await import('/src/lib/audio.ts');return !a.isAnyAmbientNoisePlaying();});
     assert.equal(await page.evaluate(()=>window.fixtureState.study.studyLog.at(-1).minutes),2);
     await page.getByRole('button',{name:'Reproducir',exact:true}).click();
     await page.getByRole('button',{name:/Iniciar Enfoque/}).click();
     const beforeAutomatic=await page.evaluate(()=>window.fixtureState.study.studyLog.length);
     await page.evaluate(()=>{const next=structuredClone(window.fixtureState);const session=next.study.activeSession;session.plannedMinutes=1;session.focusMinutes=1;session.startedAt=Date.now()-59000;session.endsAt=Date.now()+400;session.lastTickAt=Date.now();session.remainingSeconds=1;window.fixtureSetState(next);});
     await page.waitForFunction(()=>window.fixtureState.study.activeSession?.phase==='short_break');
     assert.equal(await page.evaluate(()=>window.fixtureState.study.studyLog.length),beforeAutomatic+1);
     assert.equal(await page.evaluate(()=>window.fixtureState.study.studyLog.at(-1).minutes),1);
     await page.waitForFunction(async()=>{const audio=await import('/src/lib/audio.ts');return audio.isAnyAmbientNoisePlaying();});
     await page.getByRole('button',{name:'Omitir descanso',exact:true}).click();
     await page.waitForFunction(async()=>{const audio=await import('/src/lib/audio.ts');return !audio.isAnyAmbientNoisePlaying();});
     // A browser/device interruption remains paused until another user gesture.
     await page.getByRole('button',{name:'Reproducir',exact:true}).click();
     await page.evaluate(async()=>{const ctx=window.audioProbe.contexts.at(-1);await ctx.suspend();ctx.resume=()=>Promise.reject(new Error('Synthetic autoplay restriction'));});
     await page.getByRole('button',{name:'Reproducir',exact:true}).click();
     await page.getByRole('alert').filter({hasText:'No se pudo iniciar el audio'}).waitFor();assert.equal(await audioPlaying(),false);
     await page.screenshot({path:`${out}/audio-blocked-${width}-${theme}.png`,fullPage:true});
     await page.evaluate(()=>{delete window.audioProbe.contexts.at(-1).resume;});
   }
   await page.getByRole('button',{name:'Reproducir',exact:true}).click();await page.evaluate(()=>window.fixtureSetVisible(false));
   assert.equal(await audioPlaying(),false);await context.setOffline(false);
   checks.push({width,theme,aiReviewConfirmCancel:true,unsafeContentInert:true,toolsCRUD:true,failedSaveRetainsDraft:true,largeNotes:1000,audioOffline:true,bufferInfo,pauseResumeResetNavigation:true});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(`${out}/results.json`,JSON.stringify({checks,errors},null,2));
 console.log(`${checks.length} multi-module scenarios passed.`);
} finally {await browser.close();}
