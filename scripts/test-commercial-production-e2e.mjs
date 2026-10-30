import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const url = `http://127.0.0.1:${process.env.TEST_PORT || '5239'}/`;
const project = 'demo-lifeos';
const email = `commercial-product-${Date.now()}@demo.invalid`;
const password = 'only-emulator-12345';
const evidence = process.env.LIFEOS_COMMERCIAL_EVIDENCE || 'artifacts/commercial-production';
await fs.mkdir(evidence, { recursive: true });
// Emulator REST administrative context, never a production endpoint.
async function capability(enabled) {
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents/systemCapabilities/commercial`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { enabled: { booleanValue: enabled }, commercialProtocolVersion: { integerValue: '1' }, minimumSyncProtocolVersion: { integerValue: '3' } } }),
  });
  assert.equal(response.ok, true, await response.text());
}

function getExecutablePath() {
  if (process.env.CHROME_PATH && fsSync.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = [
    'C:\\Users\\Christian\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fsSync.existsSync(c)) return c;
  }
  return undefined;
}

const executablePath = getExecutablePath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // This test never opens a personal browser profile or allows a production request.
  await context.route('**/*', route => {
    const hostname = new URL(route.request().url()).hostname;
    return ['127.0.0.1', 'localhost'].includes(hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(url);
  const setup = await page.evaluate(async ({ email, password }) => {
    const cloud = await import('/src/lib/cloudSync.ts');
    const storage = await import('/src/lib/storage.ts');
    const crypto = await import('/src/lib/cryptoCore.ts');
    cloud.getFirestoreDb();
    const auth = await import('/node_modules/.vite/deps/firebase_auth.js');
    const credential = await auth.createUserWithEmailAndPassword(auth.getAuth(), email, password);
    const uid = credential.user.uid;
    const state = storage.defaultState(); state.settings.onboardingCompleted = true;
    state.settings.hiddenTabs = []; state.settings.userName = 'Prueba comercial';
    storage.saveStoredState(state, uid);
    cloud.markLastCloudUserId(uid);
    const key = await crypto.generateMdek();
    const rawKey = Array.from(await crypto.exportRawKey(key));
    return { uid, rawKey };
  }, { email, password });
  await page.reload();
  await page.evaluate(async ({ uid, rawKey }) => {
    const crypto = await import('/src/lib/cryptoCore.ts');
    crypto.cryptoSession.setUnlocked(await crypto.importRawKey(new Uint8Array(rawKey)), uid);
  }, setup);
  await capability(false);
  await page.getByRole('button', { name: 'Mi negocio', exact: true }).first().click();
  await page.getByRole('alert').filter({ hasText: 'temporalmente no disponible' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Agregar artículo o insumo' }).isDisabled(), true);
  assert.equal(await page.locator('fieldset[aria-label="Operaciones comerciales"]').evaluate(el => el.disabled), true);
  await capability(true);
  await page.getByRole('button', { name: 'Habilitar operaciones en esta sesión' }).click();
  await page.waitForFunction(() => document.querySelector('fieldset[aria-label="Operaciones comerciales"]')?.disabled === false);
  assert.equal(await page.getByRole('button', { name: 'Agregar artículo o insumo' }).isDisabled(), false);
  assert.equal(await page.locator('fieldset[aria-label="Operaciones comerciales"]').evaluate(el => el.disabled), false);
  await page.screenshot({ path: `${evidence}/00-main-commercial-screen.png`, fullPage: true });
  await page.getByText('Agregá un artículo o insumo con su cantidad y costo de compra.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Agregar artículo o insumo' }).click();
  await page.getByLabel('Artículo o insumo', { exact: true }).fill('Producto E2E');
  await page.getByLabel('Cantidad que ingresa', { exact: true }).fill('10');
  await page.getByLabel('Costo total ($U)', { exact: true }).fill('100');
  await page.evaluate(() => {
    window.__commercialOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('lifeos-state-v1:')) throw new Error('Synthetic disk failure');
      return window.__commercialOriginalSetItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
  assert.equal(await page.getByLabel('Artículo o insumo', { exact: true }).inputValue(), 'Producto E2E');
  await page.evaluate(() => { Storage.prototype.setItem = window.__commercialOriginalSetItem; delete window.__commercialOriginalSetItem; });
  await page.getByRole('button', { name: 'Guardar entrada', exact: true }).click();
  await page.screenshot({ path: `${evidence}/01-purchase.png`, fullPage: true });

  const local = await page.evaluate(uid => JSON.parse(localStorage.getItem(`lifeos-state-v1:${uid}`)), setup.uid);
  assert.equal(local.resale.commercial.business.purchases.length, 1);
  assert.equal(local.finance.transactions.length, 0);
  const money = async (button, amount) => {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.getByLabel('Importe ($U)', { exact: true }).fill(amount);
    await page.getByLabel('Cuenta financiera', { exact: true }).selectOption({ index: 1 });
    await page.getByLabel('Categoría financiera', { exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Guardar movimiento', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar movimiento', exact: true }).waitFor({ state: 'hidden' });
  };
  await money('Pagar $U 100', '30');
  await page.getByRole('button', { name: 'Vender artículo', exact: true }).click();
  await page.getByLabel('Unidades a vender', { exact: true }).fill('2');
  await page.getByLabel('Precio por unidad ($U)', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Confirmar venta directa', exact: true }).click();
  await money('Cobrar $U 60', '40');
  await page.getByRole('main').getByText('Sincronizado', { exact: true }).waitFor({ timeout: 20000 });
  const verify = async (target) => target.evaluate(async uid => {
    const storage = await import('/src/lib/storage.ts');
    const cloud = await import('/src/lib/cloudSync.ts');
    const fresh = await cloud.fetchFreshCloudModules(uid);
    if (fresh.lockedModules.length || fresh.corruptedModules.length) throw new Error('Remote data could not be decrypted');
    const data = { ...fresh.moduleData.resale, ...fresh.moduleData.finance };
    for (const module of ['resale', 'finance']) {
      const response = await fetch(`http://127.0.0.1:8080/v1/projects/demo-lifeos/databases/(default)/documents/users/${uid}/lifeosModules/${module}`, { headers: { Authorization: 'Bearer owner' } });
      const payload = await response.json();
      if (payload.fields?.isEncrypted?.booleanValue !== true) throw new Error(module + ' was not encrypted');
      if (JSON.stringify(payload).includes('Producto E2E')) throw new Error('Plaintext leaked');
      data[module + 'Revision'] = fresh.remoteRevisions[module];
    }
    const local = storage.loadStoredState(uid).state;
    return { data, local };
  }, setup.uid);
  const first = await verify(page);
  assert.equal(first.data.resale.commercial.business.moneyEvents.length, 2);
  assert.equal(first.data.finance.transactions.length, 2);
  assert.equal(first.data.finance.accounts[0].balance, 10);
  await page.screenshot({ path: `${evidence}/02-partial-money.png`, fullPage: true });
  // Independent browser storage and Auth session; use the same synthetic E2EE key.
  const second = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await second.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await second.route('**/src/main.tsx*', async route => {
    const response = await route.fetch();
    const bootstrap = `
      const cloudTest = await import('/src/lib/cloudSync.ts'); cloudTest.getFirestoreDb();
      const authTest = await import('/node_modules/.vite/deps/firebase_auth.js');
      const cryptoTest = await import('/src/lib/cryptoCore.ts');
      cryptoTest.cryptoSession.setUnlocked(await cryptoTest.importRawKey(new Uint8Array(${JSON.stringify(setup.rawKey)})), ${JSON.stringify(setup.uid)});
      await authTest.signInWithEmailAndPassword(authTest.getAuth(), ${JSON.stringify(email)}, ${JSON.stringify(password)});
    `;
    await route.fulfill({ response, body: bootstrap + await response.text() });
  });
  const pageB = await second.newPage();
  pageB.on('console', msg => { if (msg.type() === 'error') errors.push('B console: ' + msg.text()); });
  pageB.on('pageerror', error => errors.push('B: ' + error.message));
  await pageB.goto(url);
  await pageB.waitForFunction(uid => JSON.parse(localStorage.getItem(`lifeos-state-v1:${uid}`) || '{}').resale?.commercial, setup.uid, { timeout: 15000 });
  if (await pageB.getByRole('button', { name: 'Seleccionar todos', exact: true }).isVisible()) {
    await pageB.getByRole('button', { name: 'Seleccionar todos', exact: true }).click();
    await pageB.getByRole('button', { name: /Comenzar|Continuar|Empezar/ }).click();
  }
  await pageB.getByRole('button', { name: 'Mi negocio', exact: true }).first().click();
  await pageB.getByText('Producto E2E', { exact: true }).first().waitFor();
  const recovered = await verify(pageB);
  assert.deepEqual(recovered.local.resale.commercial, first.data.resale.commercial);
  assert.equal(recovered.local.finance.transactions.length, 2);
  await pageB.screenshot({ path: `${evidence}/03-second-client.png`, fullPage: true });
  await second.close();
  await page.getByText(/Historial comercial \(1\)/).click();
  await page.getByRole('button', { name: 'Registrar devolución', exact: true }).click();
  await page.getByLabel('Estado del artículo devuelto').selectOption('restock');
  await page.getByRole('button', { name: 'Confirmar devolución', exact: true }).click();
  await money('Reembolsar $U 10', '10');
  await page.getByRole('main').getByText('Sincronizado', { exact: true }).waitFor({ timeout: 20000 });
  const returned = await verify(page);
  assert.equal(returned.data.finance.transactions.length, 3);
  assert.equal(returned.data.finance.accounts[0].balance, 0);
  assert.equal(returned.data.resale.commercial.business.refundSources.length, 1);
  await page.screenshot({ path: `${evidence}/04-refund.png`, fullPage: true });
  await page.getByRole('button', { name: 'Corregir registro', exact: true }).click();
  await page.getByLabel(/Confirmo que estas unidades nunca se entregaron/).check();
  await page.getByRole('button', { name: 'Confirmar corrección', exact: true }).click();
  await money('Reembolsar $U 30', '30');
  await page.getByRole('main').getByText('Sincronizado', { exact: true }).waitFor({ timeout: 20000 });
  const annulled = await verify(page);
  assert.equal(annulled.data.resale.commercial.business.saleCorrections.length, 2);
  assert.equal(annulled.data.finance.accounts[0].balance, -30);
  assert.equal(annulled.data.finance.transactions.length, 4);
  await page.screenshot({ path: `${evidence}/05-sale-correction.png`, fullPage: true });
  // Inspect the actual authenticated commercial workspace on mobile in both themes.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${evidence}/06-commercial-mobile-light.png` });
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('button', { name: /^Modo Claro/ }).click();
  await page.getByRole('button', { name: 'Cerrar navegación', exact: true }).click();
  await page.getByRole('main').getByText('Sincronizado', { exact: true }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: `${evidence}/07-commercial-mobile-dark.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const guarantees = await page.evaluate(async uid => {
    const cloud = await import('/src/lib/cloudSync.ts');
    const storage = await import('/src/lib/storage.ts');
    const fresh = await cloud.fetchFreshCloudModules(uid);
    const state = storage.loadStoredState(uid).state;
    const original = JSON.stringify(state);
    const first = await cloud.writeCloudModulesGuarded(uid, state, ['resale', 'finance'], 'retry-a', fresh.remoteRevisions);
    await first.completion;
    const retry = await cloud.writeCloudModulesGuarded(uid, state, ['resale', 'finance'], 'retry-b', fresh.remoteRevisions);
    let staleRejected = false;
    try { await retry.completion; } catch (error) { staleRejected = error instanceof cloud.ResaleRevisionConflict; }
    const after = await cloud.fetchFreshCloudModules(uid);
    const broken = structuredClone(state); broken.finance.transactions.pop();
    let invalidRejected = false;
    try { const result = await cloud.writeCloudModulesGuarded(uid, broken, ['resale', 'finance'], 'broken', after.remoteRevisions); await result.completion; }
    catch { invalidRejected = true; }
    const final = await cloud.fetchFreshCloudModules(uid);
    return { staleRejected, invalidRejected, unchanged: JSON.stringify(state) === original,
      revisionsUnchanged: JSON.stringify(after.remoteRevisions) === JSON.stringify(final.remoteRevisions),
      transactionCount: final.moduleData.finance.finance.transactions.length };
  }, setup.uid);
  assert.deepEqual(guarantees, { staleRejected: true, invalidRejected: true, unchanged: true, revisionsUnchanged: true, transactionCount: 4 });
  await capability(false);
  const disabled = await page.evaluate(async uid => {
    const cloud = await import('/src/lib/cloudSync.ts'); const storage = await import('/src/lib/storage.ts');
    const state = storage.loadStoredState(uid).state; const before = JSON.stringify(state);
    try { await cloud.writeCloudModulesGuarded(uid, state, ['resale', 'finance'], 'disabled', (await cloud.fetchFreshCloudModules(uid)).remoteRevisions); return false; }
    catch (error) { return error instanceof cloud.CommercialWriteCapabilityUnavailable && JSON.stringify(storage.loadStoredState(uid).state) === before; }
  }, setup.uid);
  assert.equal(disabled, true);
  // Consolidated refinement check: visit the five modules without changing
  // financial/commercial data. Reuse earlier visual evidence; capture only the
  // corrected empty inventory separately in the closure browser check.
  const dataBeforeNavigation = await page.evaluate(uid => {
    const state = JSON.parse(localStorage.getItem(`lifeos-state-v1:${uid}`));
    return JSON.stringify({ finance: state.finance, commercial: state.resale.commercial });
  }, setup.uid);
  const integrationChecks = [];
  for (const width of [1920, 375]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1080 });
    if (await page.evaluate(() => document.documentElement.classList.contains('dark')) !== (theme === 'dark')) {
      let mode = page.getByRole('button', { name: /^Modo (Claro|Oscuro)/ });
      if (!await mode.isVisible()) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      mode = page.getByRole('button', { name: /^Modo (Claro|Oscuro)/ });
      await mode.click();
      const close = page.getByRole('button', { name: 'Cerrar navegación', exact: true });
      if (await close.isVisible()) await close.click();
    }
    for (const [name, title, scope] of [
      ['Agenda', 'Agenda y rutinas', 'product-refinement'], ['Trabajo', 'Trabajo y empleo', 'product-refinement'],
      ['Mi negocio', 'Mi negocio', 'product-refinement'], ['Finanzas', 'Finanzas', 'finance-refinement'],
      ['Configuración', 'Configuración', 'config-refinement'],
    ]) {
      const nav = page.getByRole('button', { name, exact: true }).first();
      if (!await nav.isVisible()) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      await page.getByRole('button', { name, exact: true }).first().click();
      await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator(`.${scope}`).count(), 1, `${name}: estilo propio`);
      for (const other of ['product-refinement', 'finance-refinement', 'config-refinement'].filter(value => value !== scope)) {
        assert.equal(await page.locator(`.${other}`).count(), 0, `${name}: sin estilos de otra tanda`);
      }
      const metrics = await page.locator(`.${scope}`).evaluate(element => ({
        font: getComputedStyle(element).fontFamily,
        accent: getComputedStyle(element).getPropertyValue('--blue').trim().toUpperCase(),
        overflow: document.documentElement.scrollWidth > innerWidth,
        dark: document.documentElement.classList.contains('dark'),
      }));
      assert.match(metrics.font, /Instrument Sans/);
      assert.equal(metrics.accent, '#4F46E5');
      assert.equal(metrics.overflow, false, `${name}/${width}/${theme}`);
      assert.equal(metrics.dark, theme === 'dark');
      integrationChecks.push({ module: name, width, theme, ...metrics });
    }
  }
  assert.equal(await page.evaluate(uid => {
    const state = JSON.parse(localStorage.getItem(`lifeos-state-v1:${uid}`));
    return JSON.stringify({ finance: state.finance, commercial: state.resale.commercial });
  }, setup.uid), dataBeforeNavigation);
  assert.deepEqual(errors.filter(error => !error.includes('Synthetic disk failure')), []);
  await fs.writeFile(`${evidence}/result.json`, JSON.stringify({ expectedStorageFailure: errors.some(error => error.includes('Synthetic disk failure')), errors: errors.filter(error => !error.includes('Synthetic disk failure')), purchase: true, partialPayment: true,
    partialReceipt: true, encryptedPublication: true, secondClient: true, returnAndRefund: true, saleCancellationByCorrection: true, localSaveFailureRetainsForm: true, mobileBothThemes: true, guarantees, capabilityShutdown: disabled, integrationChecks }, null, 2));
  console.log('PASS: authenticated App UI, production publisher, partial money, encrypted recovery, return and refund.');
} catch (error) { console.error('UI errors:', errors); for (const ctx of browser.contexts()) for (const pg of ctx.pages()) console.error((await pg.locator('body').innerText().catch(() => '')).slice(-5000)); throw error; } finally { await browser.close(); }

