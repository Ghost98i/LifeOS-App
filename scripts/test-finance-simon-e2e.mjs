// Run inside demo-lifeos Firestore/Auth emulators. Uses two isolated browser profiles.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Local emulators required');
const port = 5223;
const origin = `http://127.0.0.1:${port}`;
const output = path.resolve('artifacts/finance-integrity');
mkdirSync(output, { recursive: true });
const trace = [];
const syncEvents = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  windowsHide: true, stdio: 'pipe', env: { ...process.env, VITE_FIREBASE_PROJECT_ID: 'demo-lifeos', VITE_FIREBASE_EMULATORS: '1', VITE_FINANCE_SYNC_TRACE: '1' },
});
let serverOutput = '';
server.stdout.on('data', value => { serverOutput += value; });
server.stderr.on('data', value => { serverOutput += value; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, serverOutput);
  try { browser = await chromium.launch({ headless: true }); }
  catch { browser = await chromium.launch({ headless: true, channel: 'chrome' }); }
  const contexts = await Promise.all([0, 1].map(async () => {
    const context = await browser.newContext({ timezoneId: 'America/Montevideo', viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', permissions: ['local-network-access'] });
    await context.route('**/*', route => {
      const hostname = new URL(route.request().url()).hostname;
      return ['127.0.0.1', 'localhost'].includes(hostname) ? route.continue() : route.abort();
    });
    await context.route(`${origin}/finance-test-harness`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic finance test</title>' }));
    return context;
  }));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  for (const [client, page] of pages.entries()) {
    page.on('requestfailed', request => console.log('Solicitud local fallida:', new URL(request.url()).origin + new URL(request.url()).pathname, request.failure()?.errorText));
    page.on('console', message => {
      if (message.text().startsWith('[FinanceSyncTrace] ')) syncEvents.push({ client: client + 1, ...JSON.parse(message.text().slice('[FinanceSyncTrace] '.length)) });
      if (message.type() === 'error') console.log('Navegador:', message.text());
    });
  }
  await Promise.all(pages.map(page => page.goto(`${origin}/finance-test-harness`)));
  const credentials = { email: `finance-${Date.now()}@synthetic.example`, password: 'Synthetic-finance-test-2026!' };
  const setup = await pages[0].evaluate(async credentials => {
    const cloud = await import('/src/lib/cloudSync.ts');
    const storage = await import('/src/lib/storage.ts');
    const model = await import('/src/lib/syncModel.ts');
    const crypto = await import('/src/lib/cryptoCore.ts');
    cloud.getFirestoreDb();
    const auth = await import('/node_modules/.vite/deps/firebase_auth.js');
    if (auth.getAuth().app.options.projectId !== 'demo-lifeos' || !auth.getAuth().emulatorConfig) throw new Error('Auth debe usar demo-lifeos y el emulador local');
    const { user } = await auth.createUserWithEmailAndPassword(auth.getAuth(), credentials.email, credentials.password);
    const key = await crypto.generateMdek();
    crypto.cryptoSession.setUnlocked(key, user.uid);
    const seed = storage.defaultState();
    seed.settings.onboardingCompleted = true;
    seed.settings.hiddenTabs = [];
    seed.settings.privacyMode = false;
    seed.finance.accounts = [{ id: 'simon-synthetic', name: 'Cuenta sintética', initialBalance: 1000, balance: 1000, currency: 'UYU' }];
    seed.finance.categories = [{ id: 'food', name: 'Comida', active: true }];
    const write = await cloud.writeCloudModulesGuarded(user.uid, seed, [...model.SYNC_MODULES], 'synthetic-seed', {});
    await write.completion;
    return { uid: user.uid, rawKey: Array.from(await crypto.exportRawKey(key)), seed, revisions: Object.fromEntries(write.writes.map(item => [item.module, item.revision])) };
  }, credentials);
  const observerKey = await crypto.subtle.importKey('raw', new Uint8Array(setup.rawKey), 'AES-GCM', false, ['decrypt']);
  const fromRestValue = value => {
    if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, fromRestValue(item)]));
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromRestValue);
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    return value.stringValue ?? value.timestampValue;
  };
  async function serverFinance() {
    // REST from Node observes the committed emulator document without a browser
    // SDK's latency-compensated local pending writes.
    const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-lifeos/databases/(default)/documents/users/${setup.uid}/lifeosModules/finance`, { headers: { Authorization: 'Bearer owner' } });
    assert.ok(response.ok);
    const document = await response.json();
    const head = fromRestValue({ mapValue: { fields: document.fields } });
    const envelope = head.data;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(envelope.iv, 'base64'), additionalData: new TextEncoder().encode(envelope.aad) }, observerKey, Buffer.from(envelope.ciphertext, 'base64'));
    return { head, finance: JSON.parse(new TextDecoder().decode(plain)).finance };
  }
  console.log('Cuenta sintética y módulos cifrados preparados');
  await pages[1].evaluate(async credentials => {
    const cloud = await import('/src/lib/cloudSync.ts');
    cloud.getFirestoreDb();
    const auth = await import('/node_modules/.vite/deps/firebase_auth.js');
    if (auth.getAuth().app.options.projectId !== 'demo-lifeos' || !auth.getAuth().emulatorConfig) throw new Error('Auth debe usar demo-lifeos y el emulador local');
    await auth.signInWithEmailAndPassword(auth.getAuth(), credentials.email, credentials.password);
  }, credentials);
  for (const page of pages) {
    await page.evaluate(async setup => {
      const storage = await import('/src/lib/storage.ts');
      const cloud = await import('/src/lib/cloudSync.ts');
      const model = await import('/src/lib/syncModel.ts');
      storage.saveStoredState(setup.seed, setup.uid);
      cloud.markLastCloudUserId(setup.uid);
      cloud.markCloudPaired(setup.uid);
      cloud.saveCloudRevisions(setup.uid, setup.revisions);
      cloud.saveCloudBaselines(setup.uid, Object.fromEntries(model.SYNC_MODULES.map(module => [module, model.syncModuleFingerprint(setup.seed, module)])));
      cloud.saveCloudBaselineData(setup.uid, Object.fromEntries(model.SYNC_MODULES.map(module => [module, model.syncModuleData(setup.seed, module)])));
    }, setup);
    await page.addInitScript(({ uid, rawKey }) => {
      window.__financeKeyReady = import('/src/lib/cryptoCore.ts').then(async crypto => {
        crypto.cryptoSession.setUnlocked(await crypto.importRawKey(new Uint8Array(rawKey)), uid);
      });
    }, { uid: setup.uid, rawKey: setup.rawKey });
    await page.goto(`${origin}/?view=finanzas`);
    await page.evaluate(() => window.__financeKeyReady);
  }
  async function checkpoint(stage, count, remoteCount = count, blocked = false) {
    console.log(`Verificando ${stage}`);
    let committed;
    let snapshots;
    let settled = false;
    const startedAt = Date.now();
    const deadline = startedAt + 20000;
    do {
      committed = await serverFinance();
      snapshots = await Promise.all(pages.map(page => page.evaluate(async uid => {
        const cloud = await import('/src/lib/cloudSync.ts');
        const ledger = await import('/src/lib/financeLedger.ts');
        const state = JSON.parse(localStorage.getItem(`lifeos-state-v1:${uid}`));
        return {
          transactions: state.finance.transactions, balance: state.finance.accounts[0].balance,
          derivedBalance: ledger.reconstructAccountBalance(state.finance.accounts[0], state.finance.transactions, state.finance.transfers, state.finance.reconciliations).balance,
          localRevision: cloud.loadCloudRevisions(uid).finance,
          baselineIds: cloud.loadCloudBaselineData(uid).finance?.finance?.transactions?.map(tx => tx.id),
          baselineFingerprint: cloud.loadCloudBaselines(uid).finance,
          baselineDataFingerprint: (await import('/src/lib/syncModel.ts')).syncDataFingerprint(cloud.loadCloudBaselineData(uid).finance),
          recoveryIds: Object.fromEntries(['local', 'remote', 'base'].map(kind => [kind, cloud.loadSyncRecoverySnapshot(uid, kind)?.finance.transactions.map(tx => tx.id)])),
          syncStatus: Array.from(document.querySelectorAll('button')).map(button => button.getAttribute('aria-label')).find(label => label?.startsWith('Sincronización:')),
        };
      }, setup.uid)));
      const needsReview = count > 1 && /conservado|recarga-después/.test(stage);
      const reviewCommitted = !needsReview || committed.finance.transactions.at(-1)?.reviewStatus === 'reviewed';
      settled = committed.finance.transactions.length === remoteCount && committed.finance.accounts[0].balance === 1000 - remoteCount * 200 && reviewCommitted
        && snapshots.every(snapshot => snapshot.transactions.length === count && (blocked || snapshot.localRevision === committed.head.revision
          && snapshot.syncStatus === 'Sincronización: Sincronizado'
          && snapshot.baselineFingerprint === snapshot.baselineDataFingerprint
          && isDeepStrictEqual([...snapshot.baselineIds].sort(), committed.finance.transactions.map(tx => tx.id).sort())
          && isDeepStrictEqual(snapshot.transactions, committed.finance.transactions)));
      if (settled) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    writeFileSync(path.join(output, 'simon-latest-check.json'), JSON.stringify({ stage, committed, snapshots }, null, 2));
    assert.ok(settled, `No hubo convergencia en ${stage}; ver simon-latest-check.json`);
    assert.equal(committed.finance.transactions.length, remoteCount);
    assert.equal(committed.finance.accounts[0].balance, 1000 - remoteCount * 200);
    const result = [];
    for (const [index, page] of pages.entries()) {
      const snapshot = snapshots[index];
      snapshot.remoteRevision = committed.head.revision;
      snapshot.remote = committed.finance;
      assert.equal(snapshot.balance, 1000 - count * 200);
      assert.equal(snapshot.derivedBalance, snapshot.balance);
      assert.equal(new Set(snapshot.transactions.map(tx => tx.id)).size, count);
      assert.ok(snapshot.transactions.every(tx => tx.note === '' && tx.amount === 200 && tx.category === 'food'));
      assert.equal(snapshot.remote.accounts[0].balance, 1000 - remoteCount * 200);
      if (!blocked) assert.deepEqual(snapshot.transactions, snapshot.remote.transactions);
      const hero = page.locator('section').filter({ hasText: /Saldo real/ }).first();
      assert.ok((await hero.innerText()).replaceAll('.', '').includes(String(snapshot.balance)));
      result.push({ client: index + 1, ...snapshot });
    }
    trace.push({ stage, elapsedMs: Date.now() - startedAt, clients: result });
    writeFileSync(path.join(output, 'simon-trace.json'), JSON.stringify(trace, null, 2));
    return result;
  }
  await checkpoint('inicial', 0);
  let obsoleteHead;
  for (let count = 1; count <= 3; count++) {
    const page = pages[(count - 1) % 2];
    await page.getByRole('button', { name: 'Nuevo movimiento', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Registrar gasto' }).click();
    await page.locator('#finance-tx-amount').fill('200');
    await page.getByRole('button', { name: 'Guardar Gasto', exact: true }).click();
    const registered = await checkpoint(`gasto-${count}-registrado-y-sincronizado`, count);
    await page.reload();
    await checkpoint(`gasto-${count}-recarga-antes-de-revisar`, count);
    if (count > 1) {
      await page.getByRole('button', { name: count === 2 ? 'Conservar ambos' : 'Conservar los 3 movimientos', exact: true }).click();
      const newId = registered[0].transactions.at(-1).id;
      await page.waitForFunction(({ uid, id }) => JSON.parse(localStorage.getItem(`lifeos-state-v1:${uid}`)).finance.transactions.find(tx => tx.id === id)?.reviewStatus === 'reviewed', { uid: setup.uid, id: newId });
    } else {
      assert.equal(await page.getByRole('button', { name: /^Conservar (ambos|los \d+ movimientos)$/ }).count(), 0, 'El primer gasto no tiene otro con el que coincidir');
    }
    await checkpoint(`gasto-${count}-conservado-y-sincronizado`, count);
    await page.reload();
    await checkpoint(`gasto-${count}-recarga-después-de-revisar`, count);
    if (count === 2) obsoleteHead = (await serverFinance()).head;
  }
  // Current writer rejects a stale parent before changing Firestore.
  const guarded = await pages[1].evaluate(async ({ uid, head }) => {
    const cloud = await import('/src/lib/cloudSync.ts');
    const storage = await import('/src/lib/storage.ts');
    const state = storage.loadStoredState(uid).state;
    const attempt = await cloud.writeCloudModulesGuarded(uid, state, ['finance'], 'obsolete-guarded', { finance: head.revision });
    try { await attempt.completion; return false; } catch (error) { return error instanceof cloud.CloudRevisionConflict; }
  }, { uid: setup.uid, head: obsoleteHead });
  assert.equal(guarded, true);
  await checkpoint('cliente-obsoleto-con-guard-rechazado', 3);
  // The server must reject an authenticated old writer even without a client guard.
  const staleToken = await pages[1].evaluate(async () => {
    const auth = await import('/node_modules/.vite/deps/firebase_auth.js');
    return auth.getAuth().currentUser.getIdToken();
  });
  const toRestValue = value => {
    if (value === null) return { nullValue: null };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(toRestValue) } };
    if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toRestValue(item)])) } };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    return { stringValue: value };
  };
  const oldWrite = { ...obsoleteHead, revision: `synthetic-stale-${Date.now()}` };
  const fields = Object.fromEntries(Object.entries(oldWrite).map(([key, value]) => [key, toRestValue(value)]));
  fields.updatedAt = { timestampValue: new Date().toISOString() };
  const staleResponse = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-lifeos/databases/(default)/documents/users/${setup.uid}/lifeosModules/finance`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${staleToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  assert.equal(staleResponse.status, 403, 'Las Rules deben rechazar el escritor antiguo con revisión padre obsoleta');
  await checkpoint('escritor-directo-rechazado-por-rules-servidor-y-clientes-conservan-400', 3);
  await pages[0].reload();
  await checkpoint('recarga-tras-rechazo-no-restaura-instantánea-vieja', 3);
  await pages[0].screenshot({ path: path.join(output, 'simon-rules-protected.png'), fullPage: true });
  // Updated client: independently saved offline and online operations must both
  // survive the changed server revision once the first browser reconnects.
  await contexts[0].setOffline(true);
  const addBlankExpense = async page => {
    await page.getByRole('button', { name: 'Nuevo movimiento', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Registrar gasto' }).click();
    await page.locator('#finance-tx-amount').fill('200');
    await page.getByRole('button', { name: 'Guardar Gasto', exact: true }).click();
  };
  await addBlankExpense(pages[0]);
  await pages[0].getByRole('button', { name: 'Sincronización: Sin conexión', exact: true }).waitFor();
  const pendingLocal = await pages[0].evaluate(uid => JSON.parse(localStorage.getItem(`lifeos-state-v1:${uid}`)).finance, setup.uid);
  assert.equal(pendingLocal.transactions.length, 4);
  assert.equal(pendingLocal.accounts[0].balance, 200);
  const remoteBeforeReconnect = await serverFinance();
  assert.equal(remoteBeforeReconnect.finance.transactions.length, 3);
  assert.equal(remoteBeforeReconnect.finance.accounts[0].balance, 400);
  trace.push({ stage: 'gasto-offline-persistido-no-finge-sincronizado', local: pendingLocal, serverBalance: 400, serverRevision: remoteBeforeReconnect.head.revision });
  await addBlankExpense(pages[1]);
  const deadline = Date.now() + 20000;
  let otherOnline;
  do {
    otherOnline = await serverFinance();
    if (otherOnline.finance.transactions.length === 4) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(otherOnline.finance.transactions.length, 4);
  assert.equal(otherOnline.finance.transactions.some(tx => tx.id === pendingLocal.transactions.at(-1).id), false);
  let releaseReads;
  if (process.argv.includes('--repeat-head')) {
    const publicationGate = new Promise(resolve => { releaseReads = resolve; });
    await contexts[0].route('**/documents:batchGet', async route => { await publicationGate; await route.continue(); });
  }
  await contexts[0].setOffline(false);
  if (releaseReads) {
    try {
      const waitForEvent = async predicate => {
        const limit = Date.now() + 20000;
        while (!syncEvents.some(predicate) && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 25));
        assert.ok(syncEvents.some(predicate), 'Debe observarse el interleaving controlado en la aplicación');
      };
      await waitForEvent(event => event.client === 1 && event.event === 'merged' && event.mergedIds.length === 5);
      const repeatedRevision = await pages[1].evaluate(async uid => {
        const cloud = await import('/src/lib/cloudSync.ts');
        const storage = await import('/src/lib/storage.ts');
        const fresh = await cloud.fetchFreshCloudModules(uid);
        const result = await cloud.writeCloudModulesGuarded(uid, storage.loadStoredState(uid).state, ['finance'], 'synthetic-repeat-head', fresh.remoteRevisions);
        await result.completion;
        return result.writes[0].revision;
      }, setup.uid);
      await waitForEvent(event => event.client === 1 && event.remoteRevision === repeatedRevision && (event.event === 'merged' || event.event === 'blocked'));
      assert.ok(!syncEvents.some(event => event.client === 1 && event.event === 'blocked'), 'Repetir un head confirmado no convierte el gasto nuevo local en una eliminación');
    } finally { releaseReads(); }
  }
  const converged = await checkpoint('reconexión-fusiona-ambos-gastos-independientes', 5);
  assert.ok(converged[0].transactions.some(tx => tx.id === pendingLocal.transactions.at(-1).id));
  await pages[0].getByRole('button', { name: 'Sincronización: Sincronizado', exact: true }).waitFor();
  await Promise.all(pages.map(page => page.reload()));
  await checkpoint('recarga-final-conserva-los-cinco-movimientos', 5);
  const mergedPublications = syncEvents.filter(event => event.client === 1 && event.event === 'publish-start' && event.localIds.length === 5);
  assert.ok(mergedPublications.length > 0);
  assert.ok(mergedPublications.every(event => event.expectedRevision === event.revision), 'El padre de la unión es un head confirmado, nunca una preparación offline');
  console.log(JSON.stringify({ passed: true, checkpoints: trace.length, balances: [800, 600, 400], staleGuardedRejected: true, directOldWriterRejectedByServer: true, offlinePendingPreserved: true, finalIndependentMovements: 5, finalBalance: 0 }));
} finally {
  writeFileSync(path.join(output, 'simon-sync-events.json'), JSON.stringify(syncEvents, null, 2));
  if (browser) await browser.close();
  server.kill();
}
