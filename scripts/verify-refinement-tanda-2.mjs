import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase = process.argv[2] || 'after';
const dir = `artifacts/refinamiento-tanda-2/${phase}`;
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Users/Christian/AppData/Local/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext();
// Isolated browser fixtures. The remote capability service returns unknown, while
// local keys, session state, financial commands and all components are real.
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (!['127.0.0.1','localhost'].includes(url.hostname)) return route.abort();
  if (url.pathname === '/src/lib/cryptoMigration.ts') {
    const response = await route.fetch(); let source = await response.text();
    for (const name of ['fetchAccountCapability','fetchCloudKeyEnvelope']) {
      const start = source.indexOf(`async function ${name}(`); assert.ok(start >= 0);
      const body = source.indexOf('{', start);
      source = source.slice(0, body+1) + (name === 'fetchAccountCapability' ? ' return window.fixtureCapability ?? null; ' : ' return window.fixtureRemoteEnvelope ?? null; ') + source.slice(body+1);
    }
    return route.fulfill({ response, body: source });
  }
  if (url.pathname === '/src/lib/cryptoPurge.ts') {
    const response = await route.fetch(); let source = await response.text();
    const start = source.indexOf('async function inventoryCloudPlaintext('); assert.ok(start>=0);
    const body = source.indexOf('{', start);
    return route.fulfill({ response, body: source.slice(0,body+1)+' return null; '+source.slice(body+1) });
  }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
const results=[];
const screens=[['finanzas','movimientos'],['finanzas','cuentas'],['finanzas','analisis'],['finanzas','proyeccion'],['config','account']];
const selectedScreens=process.argv[3] === 'config' ? [['config','account']] : screens;
const goto = async (view, tab, state, theme) => {
  await page.goto(`http://127.0.0.1:5242/artifacts/refinamiento-tanda-2/browser.html?view=${view}&tab=${tab}&state=${state}&theme=${theme}`);
  await page.locator('h1').waitFor(); await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(view === 'finanzas' && ['analisis','proyeccion'].includes(tab) ? 1700 : 100);
};
if (!['flows','shell'].includes(process.argv[3])) for(const [width,height] of [[1920,1080],[2560,1440],[768,1024],[390,844]]) for(const theme of ['light','dark']) for(const [view,tab] of selectedScreens) for(const state of ['empty','filled','error']) {
  await page.setViewportSize({width,height});
  await goto(view,tab,state,theme);
  const name=`${view}-${tab}-${state}-${theme}-${width}`;
  await page.screenshot({path:`${dir}/${name}.png`, fullPage:true});
  results.push({name, overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
}
if (results.length) {
 let combined=results;
 if(process.argv[3]==='config') {
  const prior=JSON.parse(await fs.readFile(`${dir}/results.json`,'utf8'));
  const byName=new Map(prior.results.map(item=>[item.name,item]));
  results.forEach(item=>byName.set(item.name,item));combined=[...byName.values()];
 }
 await fs.writeFile(`${dir}/results.json`,JSON.stringify({results:combined,errors},null,2));
}
if (phase === 'after' && !['matrix','config'].includes(process.argv[3])) {
 const checks=[];
 if (process.argv[3] !== 'shell') for (const [width,height] of [[1920,1080],[2560,1440],[768,1024],[390,844]]) for (const theme of ['light','dark']) {
  await page.setViewportSize({width,height});
  await goto('finanzas','movimientos','filled',theme);
  const original = await page.evaluate(()=>JSON.stringify(window.fixtureState.finance));
  const startBalance=await page.evaluate(()=>window.fixtureState.finance.accounts.filter(a=>a.currency==='UYU').reduce((s,a)=>s+a.balance,0));
  assert.equal(startBalance,106000);
  for(const name of ['Cuentas','Análisis','Futuro','Movimientos']) {
   await page.getByRole('button',{name:new RegExp(`^${name}(?:\\s|$)`)}).first().click();
   assert.equal(await page.evaluate(()=>JSON.stringify(window.fixtureState.finance)),original);
  }
  await page.getByRole('button',{name:'Nuevo movimiento',exact:true}).click();
  await page.getByRole('menuitem',{name:'Registrar gasto',exact:true}).click();
  await page.locator('#finance-tx-amount').fill('125');
  await page.locator('#finance-tx-account').selectOption('bank');
  await page.locator('#finance-tx-category').selectOption({index:1});
  await page.evaluate(()=>{window.failSave=true;});
  await page.getByRole('button',{name:'Guardar Gasto',exact:true}).click();
  assert.equal(await page.locator('#finance-tx-amount').inputValue(),'125');
  assert.equal(await page.evaluate(()=>window.fixtureState.finance.transactions.length),12);
  await page.screenshot({path:`${dir}/expense-retained-${theme}-${width}.png`,fullPage:true});
  await page.evaluate(()=>{window.failSave=false;});
  await page.getByRole('button',{name:'Guardar Gasto',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.fixtureState.finance.transactions.length),13);
  await page.getByRole('button',{name:'Nuevo movimiento',exact:true}).click();
  await page.getByRole('menuitem',{name:'Registrar ingreso',exact:true}).click();
  await page.locator('#finance-tx-amount').fill('500');
  await page.locator('#finance-tx-account').selectOption('bank');
  await page.locator('#finance-tx-category').selectOption({index:1});
  await page.getByRole('button',{name:'Guardar Ingreso',exact:true}).click();
  const balances=()=>page.evaluate(()=>window.fixtureState.finance.accounts.filter(a=>a.currency==='UYU').reduce((s,a)=>s+a.balance,0));
  assert.equal(await balances(),106375);
  await page.getByRole('button',{name:'Nuevo movimiento',exact:true}).click();
  await page.getByRole('menuitem',{name:/Transferir/}).click();
  await page.locator('#finance-transfer-from').selectOption('bank');
  await page.locator('#finance-transfer-to').selectOption('cash');
  await page.locator('#finance-transfer-amount').fill('1000');
  await page.screenshot({path:`${dir}/transfer-${theme}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Confirmar transferencia',exact:true}).click();
  assert.equal(await balances(),106375);
  assert.equal(await page.evaluate(()=>window.fixtureState.finance.transfers.length),1);
  await page.getByRole('button',{name:/^Cuentas(?:\s|$)/}).first().click();
  await page.getByRole('button',{name:'Conciliar',exact:true}).first().click();
  const reconcile=page.locator('.fixed').filter({has:page.getByRole('heading',{name:'Conciliar saldo de cuenta',exact:true})});
  const accountSelect=reconcile.locator('form select').first();
  await accountSelect.selectOption('cash');
  await reconcile.getByPlaceholder('0,00',{exact:true}).fill('6010');
  await page.screenshot({path:`${dir}/reconcile-${theme}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Confirmar conciliación',exact:true}).click();
  assert.equal(await balances(),106385);
  const coreMetrics=await page.evaluate(async()=>{
   const {calcIncomeMonth,calcSpentMonth}=await import('/src/lib/calculations.ts');
   return {income:calcIncomeMonth(window.fixtureState,0,'UYU'),spent:calcSpentMonth(window.fixtureState,0,'UYU')};
  });
  assert.deepEqual(coreMetrics,{income:45500,spent:30125});
  await page.getByRole('button',{name:'Análisis',exact:true}).click();
  await page.getByRole('button',{name:'Modificar límite global',exact:true}).click();
  await page.getByPlaceholder('Límite',{exact:true}).fill('45000');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  assert.equal(await page.evaluate(()=>Object.values(window.fixtureState.finance.monthlyBudgets)[0].globalLimit),45000);
  assert.equal(await balances(),106385);
  await page.getByText('Más detalles del mes',{exact:false}).first().click();
  await page.getByText('Parte fija del gasto',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Ayuda: Ingresos menos gastos',exact:true}).click();
  await page.screenshot({path:`${dir}/analytics-help-${theme}-${width}.png`,fullPage:true});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/^Futuro(?:\s|$)/}).first().click();
  const beforeHorizon=await page.evaluate(()=>JSON.stringify(window.fixtureState.finance));
  for (const horizon of [30,60,90]) {
   await page.getByRole('button',{name:new RegExp(`^${horizon} días`)}).click();
   await page.waitForTimeout(1700);
   await page.screenshot({path:`${dir}/projection-${horizon}-${theme}-${width}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>JSON.stringify(window.fixtureState.finance)),beforeHorizon);
  }
  await page.getByRole('button',{name:'Pagar',exact:true}).first().click();
  const pay=page.getByRole('dialog',{name:'Registrar pago de Compromiso',exact:true});
  await pay.locator('input[type=date]').fill(await page.evaluate(()=>window.fixtureState.finance.commitments[0].nextDueDate));
  await page.screenshot({path:`${dir}/pay-commitment-${theme}-${width}.png`,fullPage:true});
  await pay.getByRole('button',{name:/Confirmar|Registrar/}).last().click();
  assert.equal(await page.evaluate(()=>window.fixtureState.finance.transactions.at(-1).amount),15000);
  await page.getByRole('button',{name:'Confirmar cobro',exact:true}).first().click();
  const collect=page.getByRole('dialog',{name:'Confirmar cobro de previsión',exact:true});
  const createReceipt=collect.locator('input[name=confirmAction][value=new]');
  if (await createReceipt.count()) await createReceipt.check();
  await collect.locator('input[type=date]').fill(await page.evaluate(()=>window.fixtureState.finance.expectedIncomes[0].startDate));
  await page.screenshot({path:`${dir}/collect-income-${theme}-${width}.png`,fullPage:true});
  await collect.getByRole('button',{name:/Confirmar|Registrar|Crear/}).last().click();
  assert.equal(await page.evaluate(()=>window.fixtureState.finance.transactions.at(-1).amount),45000);
  checks.push({width,theme,balanceAfterReconcile:106385,...coreMetrics,transactionsAfterOperations:await page.evaluate(()=>window.fixtureState.finance.transactions.length)});
  // Security and backup boundaries: real handlers, synthetic account/key, no remote writes.
  await goto('config','account','error',theme);
  assert.equal(await page.getByText(/Al día/).count(),0);
  await page.getByText('Error al sincronizar',{exact:true}).waitFor();
  await page.getByText('Cifrado en la nube sin verificar',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Sincronizar ahora',exact:true}).click();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),['sync','sign-out']);
  await page.getByRole('button',{name:'Desbloquear con clave',exact:true}).click();
  const unlock=page.locator('.fixed').filter({has:page.getByRole('heading',{name:'Desbloquear Dispositivo',exact:true})});
  await unlock.locator('textarea').fill('clave inválida de prueba');
  await unlock.getByRole('button',{name:/Desbloquear/}).last().click();
  assert.equal(await page.evaluate(async()=>{const {cryptoSession}=await import('/src/lib/cryptoCore.ts');return cryptoSession.isUnlocked('synthetic-tanda-2');}),false);
  await page.screenshot({path:`${dir}/security-invalid-key-${theme}-${width}.png`,fullPage:true});
  await unlock.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.locator('#config-diagnostics > summary').click();
  await page.getByText('Almacenamiento y detalles técnicos',{exact:true}).click();
  await page.getByRole('button',{name:'Diagnosticar',exact:true}).click();
  await page.screenshot({path:`${dir}/diagnostics-${theme}-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Restaurar copia de emergencia',exact:true}).click();
  const restore=page.getByRole('dialog',{name:'Restaurar copia de emergencia',exact:true});
  await page.screenshot({path:`${dir}/restore-confirmation-${theme}-${width}.png`,fullPage:true});
  await restore.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Reiniciar datos',exact:true}).click();
  const reset=page.getByRole('dialog',{name:'Reiniciar datos',exact:true});
  await page.screenshot({path:`${dir}/reset-confirmation-${theme}-${width}.png`,fullPage:true});
  await reset.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),['sync','sign-out']);
  const imported=await page.evaluate(()=>JSON.stringify({state:window.fixtureState}));
  await page.locator('input[type=file]').setInputFiles({name:'copia-sintetica.json',mimeType:'application/json',buffer:Buffer.from(imported)});
  const preview=page.getByRole('dialog',{name:'Revisar copia antes de importar',exact:true});
  await preview.waitFor();
  await page.screenshot({path:`${dir}/import-preview-${theme}-${width}.png`,fullPage:true});
  await preview.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),['sync','sign-out']);
  await page.getByRole('button',{name:'Descargar copia',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),['sync','sign-out','export']);
  await page.getByLabel('Nombre o apodo',{exact:true}).fill('Perfil actualizado');
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.fixtureState.profile.name),'Perfil actualizado');
  // Verified cloud coverage and local unlocking are independent states.
  for (const [cap,local] of [['encrypted','unlocked'],['encrypted','locked'],['encrypted','none'],['mixed','locked'],['unknown','unlocked']]) {
   await page.goto(`http://127.0.0.1:5242/artifacts/refinamiento-tanda-2/browser.html?view=config&state=filled&theme=${theme}&cap=${cap}&local=${local}`);
   await page.getByRole('heading',{name:'Privacidad y seguridad',exact:true}).waitFor();
   await page.waitForTimeout(200);
   if(cap==='unknown') assert.equal(await page.getByText('Protección activada',{exact:true}).count(),0);
   if(cap==='encrypted') await page.getByText('Protección activada',{exact:true}).waitFor();
   assert.equal(await page.evaluate(async()=>{const {cryptoSession}=await import('/src/lib/cryptoCore.ts');return cryptoSession.isUnlocked('synthetic-tanda-2');}),local==='unlocked');
   await page.screenshot({path:`${dir}/security-${cap}-${local}-${theme}-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:'Renovar clave de recuperación',exact:true}).click();
  const renewal=page.locator('.fixed').filter({has:page.getByRole('heading',{name:'Renovar clave de recuperación',exact:true})});
  await renewal.locator('textarea').fill('clave inválida de prueba');
  await renewal.getByRole('button',{name:'Generar Nueva Clave',exact:true}).click();
  await page.screenshot({path:`${dir}/renewal-invalid-key-${theme}-${width}.png`,fullPage:true});
  await renewal.getByRole('button',{name:'Cancelar',exact:true}).click();
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Olvidar este dispositivo',exact:true}).click();
  assert.equal(await page.evaluate(async()=>{const {cryptoSession}=await import('/src/lib/cryptoCore.ts');return cryptoSession.isUnlocked('synthetic-tanda-2');}),true);
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Olvidar este dispositivo',exact:true}).click();
  await page.waitForFunction(async()=>{const {cryptoSession}=await import('/src/lib/cryptoCore.ts');return !cryptoSession.isUnlocked('synthetic-tanda-2');});
  await page.screenshot({path:`${dir}/forgotten-device-${theme}-${width}.png`,fullPage:true});
 }
 if(checks.length) await fs.writeFile(`${dir}/flow-checks.json`,JSON.stringify({checks,errors},null,2));
 console.log(`${checks.length} synthetic financial and security scenarios passed`);
 if(process.argv[3] !== 'flows') {
  await goto('finanzas','movimientos','filled','light');
  const syntheticState=await page.evaluate(()=>window.fixtureState);
  const shellChecks=[];
  for(const [width,height] of [[1920,1080],[2560,1440],[768,1024],[390,844]]) for(const theme of ['light','dark']) {
   const shell=await browser.newContext({viewport:{width,height}});
   await shell.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
   await shell.addInitScript(({state,dark})=>{state.settings.darkMode=dark;localStorage.setItem('lifeos-state-v1',JSON.stringify(state));},{state:syntheticState,dark:theme==='dark'});
   const shellPage=await shell.newPage();
   shellPage.on('pageerror',e=>errors.push(e.message));
   for(const [view,heading] of [['finanzas','Finanzas'],['config','Configuración']]) {
    await shellPage.goto(`http://127.0.0.1:5242/?view=${view}`);
    await shellPage.getByRole('heading',{name:heading,exact:true,level:1}).waitFor();
    await shellPage.evaluate(()=>document.fonts.ready);
    const measured=await shellPage.locator(view==='finanzas'?'.finance-refinement':'.config-refinement').evaluate(root=>({
     font:getComputedStyle(root.querySelector('h1')).fontFamily,
     overflow:document.documentElement.scrollWidth>innerWidth,
     tiny:[...root.querySelectorAll('span,p,label,button,input,select')].filter(el=>el.getClientRects().length && el.textContent?.trim()).filter(el=>parseFloat(getComputedStyle(el).fontSize)<14).map(el=>el.textContent.slice(0,60)),
    }));
    assert.ok(measured.font.includes('Instrument Sans'));
    assert.equal(measured.overflow,false);
    assert.deepEqual(measured.tiny,[]);
    shellChecks.push({width,theme,view,...measured});
    await shellPage.screenshot({path:`${dir}/app-shell-${view}-${theme}-${width}.png`,fullPage:true});
   }
   await shell.close();
  }
  await fs.writeFile(`${dir}/shell-checks.json`,JSON.stringify(shellChecks,null,2));
 }
}
await browser.close();
assert.deepEqual(errors,[]);
console.log(`${phase}: ${results.length} captures, ${results.filter(r=>r.overflow).length} overflow cases`);
