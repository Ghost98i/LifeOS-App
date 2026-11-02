import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
const out=path.resolve('artifacts/finance-trust');fs.mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','portable','--host','127.0.0.1','--port','5329','--strictPort'],{stdio:'pipe',windowsHide:true});
for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:5329')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:5329';
const browser=await chromium.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
const errors=[],external=[];
async function open(kind='new',width=1440,dark=false,privacy=false){
 const context=await browser.newContext({viewport:{width,height:width===1440?900:width===390?844:812},locale:'es-UY',timezoneId:'America/Montevideo',serviceWorkers:'block',reducedMotion:'reduce',hasTouch:width<640,isMobile:width<640});
 await context.clock.setFixedTime(new Date('2026-10-31T14:00:00-03:00'));
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push(route.request().url());return route.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);page.setDefaultTimeout(12000);
 assert.equal(await page.evaluate(async()=>(await import('/src/lib/cloudSync.ts')).cloudSyncConfigured),false);
 const seeded=await page.evaluate(async({kind,dark,privacy})=>{
 const {defaultState}=await import('/src/lib/storage.ts');const {addTransaction}=await import('/src/lib/financeFlows.ts');const {createFinancingAgreement}=await import('/src/lib/financeAgreements.ts');
 const s=defaultState();s.settings.onboardingCompleted=true;s.settings.darkMode=dark;s.settings.privacyMode=privacy;s.settings.hiddenTabs=[];
 if(kind==='none')s.finance.accounts=[];
 if(kind!=='new'&&kind!=='none'){
 s.finance.accounts=[{id:'a',name:'Cuenta principal para gastos de la casa y compras del mes',currency:'UYU',balance:42000,initialBalance:42000},{id:'b',name:'Ahorros familiares en dólares para proyectos a largo plazo',currency:'USD',balance:2345.67,initialBalance:2345.67},{id:'c',name:'Efectivo',currency:'UYU',balance:0,initialBalance:0}];
 const cat=s.finance.categories[0].id;
 addTransaction(s,{id:'i',type:'ingreso',amount:28000,category:cat,accountId:'a',fixed:'variable',date:'2026-10-01',note:'Trabajo de octubre',reviewStatus:'reviewed'});
 for(const [id,day,note]of[['e1','2026-10-20','Supermercado para la semana'],['e2','2026-10-20','Compra independiente de productos de limpieza']]){
 addTransaction(s,{id,type:'gasto',amount:1234.56,category:cat,accountId:'a',fixed:'variable',date:day,note,reviewStatus:'reviewed'});}
 if(['full','review','long'].includes(kind)){
 s.finance.commitments=[{id:'rent',name:'Alquiler del apartamento y gastos comunes correspondientes a noviembre',amount:18500.75,currency:'UYU',frequency:'monthly',nextDueDate:'2026-11-05',active:true},{id:'overdue',name:'Factura de electricidad del mes de octubre',amount:8765.43,currency:'UYU',frequency:'once',nextDueDate:'2026-10-30',active:true},{id:'usd',name:'Servicio profesional con descripción extensa',amount:750.25,currency:'UYU',frequency:'monthly',nextDueDate:'2026-11-10',active:true}];
 s.finance.expectedIncomes=[{id:'salary',name:'Ingreso por trabajo previsto para noviembre',amount:28000,currency:'UYU',frequency:'monthly',startDate:'2026-11-01',active:true}];
 s.finance.subscriptions=[{id:'sub',name:'Servicio de música y almacenamiento de archivos familiares',amount:350,dueDay:5}];
 s.finance.debts=[{id:'legacy',name:'Deuda personal pendiente de devolución',amount:4000,monthlyPayment:500,currency:'UYU',dueDate:'2026-11-03'}];
 createFinancingAgreement(s,{title:'Compra de heladera para el hogar en seis cuotas',creditorName:'Comercio de prueba',currency:'UYU',initialRemainingBalance:12000,initialReferenceDate:'2026-10-01',originalPrincipal:12000,acquisition:{category:cat,acquisitionDate:'2026-10-01',totalPurchaseAmount:12000},schedule:{totalInstallments:6,installmentAmount:2000,firstDueDate:'2026-10-10',dueDay:10,frequency:'monthly'}});
 }
 if(kind==='review'){for(const t of s.finance.transactions.filter(t=>t.type==='gasto')){delete t.reviewStatus;delete t.reviewed;}s.finance.transactions.find(t=>t.id==='e1').requiresReview=true;}
 if(kind==='long'){s.finance.accounts[0].initialBalance=1234567890.12;s.finance.accounts[0].balance=1234567890.12; addTransaction(s,{id:'long',type:'gasto',amount:12345678.91,category:cat,accountId:'a',fixed:'variable',date:'2026-10-31',note:'Compra extraordinaria con descripción extensa y categoría identificable'});}
 }
 if(kind==='review'){addTransaction(s,{id:'match',type:'gasto',amount:8765.43,category:s.finance.categories[0].id,accountId:'a',fixed:'variable',date:'2026-10-30',note:'Factura de electricidad del mes de octubre',reviewStatus:'pending'});}localStorage.setItem('lifeos-state-v1',JSON.stringify(s));return {accounts:s.finance.accounts.map(a=>({name:a.name,balance:a.balance,currency:a.currency})),transactions:s.finance.transactions.length};
 },{kind,dark,privacy});
 await page.reload();await page.locator('.today-shell').waitFor();await page.getByRole('button',{name:width<640?'Ir a Finanzas':'Finanzas',exact:true}).click();await page.locator('.finance-workspace').waitFor();await page.evaluate(()=>document.fonts.ready);
 return{context,page,seeded};
}
async function tab(page,name){await page.locator('.finance-tabs').getByRole('button',{name:new RegExp('^'+name)}).click();}

let passed=0;const checks=[];async function check(name,fn){await fn();passed++;checks.push(name);console.log('PASS '+name);}
async function state(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('lifeos-state-v1')));}
async function financialDom(page) { return page.locator('.finance-workspace').evaluate(root => { const texts=[]; const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); while(walker.nextNode())texts.push(walker.currentNode.textContent); for(const e of root.querySelectorAll('*')){for(const a of e.attributes)if(/^(aria-|title$|value$|placeholder$|alt$)/.test(a.name))texts.push(a.value);if(e instanceof HTMLInputElement)texts.push(e.value);}return texts.join(' | '); }); }
const secret=/67[.]530|67530|2[.]345|2345|8[.]765|8765|1[.]234|1234|18[.]500|18500|12[.]000|12000/;
try{
for(const width of [1440,390,375])for(const dark of [false,true])await check('privacidad DOM/atributos/revelado '+width+' '+dark,async()=>{
 const{context,page}=await open('review',width,dark,true);
 for(const name of ['Movimientos','Cuentas','Futuro','Análisis']){
 await tab(page,name);assert.doesNotMatch(await financialDom(page),secret,name+' no revela importes en HTML');
 const access=await page.locator('.finance-workspace .privacy-amount').first().ariaSnapshot();assert.doesNotMatch(access,secret);
 if(name==='Análisis'){await page.getByRole('button',{name:'Compras realizadas',exact:true}).click();assert.doesNotMatch(await financialDom(page),secret);}
 }
 await tab(page,'Movimientos');
 const amount=page.locator('.finance-workspace .privacy-amount').first();await amount.focus();await page.keyboard.press('Enter');assert.match(await amount.innerText(),/58[.]765,45/);await page.keyboard.press(' ');assert.equal(await amount.innerText(),'••••');
 const toggle=width<640?page.locator('button[title="Alternar Stream Guard"]'):page.getByRole('button',{name:'Desactivar Stream Guard',exact:true});await toggle.click();assert.match(await page.locator('.finance-workspace').innerText(),/58[.]765,45/);
 if(width<640)await page.locator('button[title="Alternar Stream Guard"]').click();else await page.getByRole('button',{name:'Activar Stream Guard',exact:true}).click();
 assert.doesNotMatch(await financialDom(page),secret);
 await page.screenshot({path:path.join(out,'private-'+width+'-'+dark+'.png')});
 await context.close();
});
await check('fallo de conciliación, formulario conservado, reintento único y recarga',async()=>{
 const{context,page}=await open('full',390,false,false);const original=await state(page);
 await tab(page,'Cuentas');await page.getByRole('button',{name:'Conciliar',exact:true}).first().click();const rec=page.locator('div.fixed.inset-0').filter({has:page.getByRole('heading',{name:'Conciliar saldo de cuenta',exact:true})}).last();
 await rec.locator('input[placeholder="0,00"]').fill('67550,88');await rec.locator('input[type="date"]').fill('2026-10-30');await rec.locator('input[placeholder^="Ej. Comisiones"]').fill('Control sintético');
 await page.evaluate(()=>{window.auditToasts=[];window.addEventListener('lifeos:toast',e=>window.auditToasts.push(e.detail));window.auditSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='lifeos-state-v1')throw new DOMException('Synthetic quota','QuotaExceededError');return window.auditSet.call(this,k,v);};});
 await rec.getByRole('button',{name:'Confirmar conciliación',exact:true}).click();
 assert.equal(await rec.isVisible(),true);assert.equal(await rec.locator('input[placeholder="0,00"]').inputValue(),'67550,88');assert.equal(await rec.locator('input[type="date"]').inputValue(),'2026-10-30');assert.equal(await rec.locator('input[placeholder^="Ej. Comisiones"]').inputValue(),'Control sintético');
 assert.deepEqual((await state(page)).finance,original.finance);assert.equal((await page.evaluate(()=>window.auditToasts)).some(t=>t.tone==='success'),false);
 await page.evaluate(()=>{Storage.prototype.setItem=window.auditSet;window.auditToasts=[];});await rec.getByRole('button',{name:'Confirmar conciliación',exact:true}).click();
 const saved=await state(page);assert.equal(saved.finance.reconciliations.length,1);assert.equal(saved.finance.accounts[0].balance,67550.88);assert.equal(saved.finance.transactions.filter(t=>t.origin==='adjustment').length,1);assert.equal(saved.finance.transactions.length,original.finance.transactions.length+1);assert.ok((await page.evaluate(()=>window.auditToasts)).some(t=>t.tone==='success'&&t.message.includes('en este dispositivo')));assert.equal(await page.getByRole('heading',{name:'Conciliar saldo de cuenta',exact:true}).count(),0);
 await page.reload();assert.equal((await state(page)).finance.reconciliations.length,1);await context.close();
});
await check('Futuro USD: acuerdo con pago parcial, hitos, cronograma y colchón',async()=>{
 const{context,page}=await open('full',1440,false,false);
 await page.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('lifeos-state-v1'));const{createFinancingAgreement,addAgreementPayment}=await import('/src/lib/financeAgreements.ts');const a=createFinancingAgreement(s,{title:'Cámara USD',creditorName:'Prueba',currency:'USD',initialRemainingBalance:1200,originalPrincipal:1200,initialReferenceDate:'2026-10-01',schedule:{totalInstallments:3,installmentAmount:400,firstDueDate:'2026-11-10',dueDay:10,frequency:'monthly'}});addAgreementPayment(s,{agreementId:a.id,amount:100,accountId:'b',date:'2026-10-20'});localStorage.setItem('lifeos-state-v1',JSON.stringify(s));});
 await page.reload();await page.locator('.today-shell').waitFor();await page.getByRole('button',{name:'Finanzas',exact:true}).click();await tab(page,'Futuro');const before=(await state(page)).finance;const sec=page.getByRole('heading',{name:'Saldo proyectado',exact:true}).locator('..').locator('..').locator('..').locator('..');
 await sec.getByRole('button',{name:'USD',exact:true}).click();let text=await sec.innerText();assert.match(text,/US\$ 1[.]945,67/);assert.match(text,/Cámara USD/);assert.doesNotMatch(text,/electricidad|Alquiler|colchón previsto|debajo de la reserva/);
 await page.getByRole('button').filter({hasText:'Pagos y cobros por fecha'}).click();const rows=await page.locator('table').last().innerText();assert.match(rows,/Cámara USD/);assert.match(rows,/US\$ 300/);assert.doesNotMatch(rows,/Alquiler|electricidad|US\$ 8[.]765/);
 await sec.getByRole('button',{name:'UYU',exact:true}).click();text=await sec.innerText();assert.match(text,/electricidad/);assert.doesNotMatch(text,/Cámara USD/);
 await page.getByRole('button',{name:'60 días',exact:true}).click();assert.match(await sec.innerText(),/60d/);assert.deepEqual((await state(page)).finance,before);
 await page.screenshot({path:path.join(out,'future-desktop.png')});await context.close();
});
await check('Análisis: navegación histórica consecutiva y lectura de compras',async()=>{
 const{context,page}=await open('full',375,true,false);
 await page.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('lifeos-state-v1'));const{addTransaction}=await import('/src/lib/financeFlows.ts');for(const[id,date,amount]of[['aug','2026-08-20',500],['sep','2026-09-20',1500],['dec','2025-12-20',100],['jan','2026-01-20',300]])addTransaction(s,{id,type:'gasto',category:'Comida',date,amount,accountId:'a'});localStorage.setItem('lifeos-state-v1',JSON.stringify(s));});
 await page.reload();await page.locator('.today-shell').waitFor();await page.getByRole('button',{name:'Ir a Finanzas',exact:true}).click();await tab(page,'Análisis');const before=(await state(page)).finance;
 const workspace=page.locator('.finance-workspace');await page.locator('button[title="Mes anterior"]').click();assert.match(await workspace.innerText(),/200% más que el mes anterior/);await page.locator('button[title="Mes anterior"]').click();assert.match(await workspace.innerText(),/Sin pagos el mes anterior/);await page.locator('button[title="Mes anterior"]').click();assert.match(await workspace.innerText(),/Sin pagos en el mes seleccionado/);
 for(let i=0;i<6;i++)await page.locator('button[title="Mes anterior"]').click();assert.match(await workspace.innerText(),/Enero de 2026/);assert.match(await workspace.innerText(),/200% más que el mes anterior/);await page.locator('button[title="Mes anterior"]').click();assert.match(await workspace.innerText(),/Diciembre de 2025/);
 await context.clock.setFixedTime(new Date('2026-11-01T12:00:00-03:00'));await page.locator('button[title="Mes siguiente"]').click();assert.match(await workspace.innerText(),/Enero de 2026/);assert.match(await workspace.innerText(),/200% más que el mes anterior/);assert.deepEqual((await state(page)).finance,before);await page.screenshot({path:path.join(out,'analysis-mobile.png')});await context.close();
});
await check('formulario privado: valor ausente hasta revelado voluntario; cancelar conserva registros',async()=>{
 const {context,page}=await open('full',390,true,true);const before=(await state(page)).finance;
 await page.locator('article').first().getByRole('button',{name:'Editar',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Editar Movimiento',exact:true});
 const amount=dialog.locator('#finance-tx-amount');assert.equal(await amount.inputValue(),'');assert.doesNotMatch(await dialog.evaluate(e=>e.outerHTML),/1234[.]56|1[.]234,56/);
 await amount.focus();await page.keyboard.press('Enter');assert.equal(await amount.inputValue(),'1234.56');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.deepEqual((await state(page)).finance,before);
 await page.getByRole('button',{name:'Ir a Hoy',exact:true}).click();assert.doesNotMatch(await page.locator('.today-shell').evaluate(e=>e.innerText),secret);
 await context.close();
});
await check('referencias monetarias en nombres, notas, categorías y títulos; fechas preservadas',async()=>{
 const {context,page}=await open('full',390,false,true);
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('lifeos-state-v1'));s.finance.accounts[0].name='Cuenta 2026 · $U 9876.54';s.finance.categories[0].name='Alimentos $U 4321.09';s.finance.transactions.find(t=>t.id==='e1').note='Referencia $U 6543.21';localStorage.setItem('lifeos-state-v1',JSON.stringify(s));});
 await page.reload();await page.locator('.today-shell').waitFor();await page.getByRole('button',{name:'Ir a Finanzas',exact:true}).click();
 const refs=/9876|9[.]876|4321|4[.]321|6543|6[.]543/;
 for(const name of ['Movimientos','Cuentas','Futuro','Análisis']){await tab(page,name);assert.doesNotMatch(await financialDom(page),refs,name);}
 await tab(page,'Movimientos');assert.match(await financialDom(page),/20-oct[.]/);await page.getByRole('button',{name:'Categorías',exact:true}).click();assert.doesNotMatch(await financialDom(page),refs);
 await context.close();
});
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('RESULT '+passed+' comprobaciones; 0 errores de página; 0 solicitudes externas');
}finally{fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed,checks,errors,external},null,2));await browser.close();server.kill();}
