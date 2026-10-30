import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, disableNetwork, doc, enableNetwork, getDoc, getDocFromServer, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CloudProtocolConflict, CloudRevisionConflict, ResaleProtocolConflict, ResaleRevisionConflict } from './cloudSync';
import { decodeCloudModuleData, encodeCloudModuleData, generateMdek, isCryptoEnvelope } from './cryptoCore';
import { addTransaction } from './financeFlows';
import { defaultState } from './storage';
import { mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';

test('publicado a6834e05b0a17cff: publicador exacto, rechazos, offline y recuperación contra Rules locales', async context => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) { context.skip('Requiere emulador local'); return; }
  const root = 'release/consolidado-tandas-1-2-3-20261029T210709Z/candidate-5de5252d2d00/dist';
  const manifest = JSON.parse(readFileSync('docs/releases/celestian-2026-10-29.json', 'utf8'));
  assert.equal(manifest.publishedVersion, 'sites/lifeosanywhere/versions/a6834e05b0a17cff');
  for (const file of manifest.files) assert.equal(createHash('sha256').update(readFileSync(path.join(root, file.path))).digest('hex'), file.sha256, file.path);
  const source = readFileSync(path.join(root, 'assets/index-DalLIlZe.js'), 'utf8');
  const ast = ts.createSourceFile('published.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = new Map<string, string>();
  let rejectionCode = '';
  const visit = (node: ts.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) declarations.set(node.name.text, node.getText(ast));
    if (ts.isArrowFunction(node) && node.parameters.length === 1) {
      const text = node.getText(ast);
      if (text.includes('console.error("[CloudSync] Batch commit failed:"') && (!rejectionCode || text.length < rejectionCode.length)) rejectionCode = text;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const writer = declarations.get('Na');
  assert.ok(writer?.includes('parentRevision:k') && writer.includes('Kl(m,async'));
  assert.ok(rejectionCode && rejectionCode.length < 5000);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  assert.ok(['127.0.0.1', 'localhost'].includes(host));
  const environment = await initializeTestEnvironment({ projectId: 'demo-finance-published', firestore: { host, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') } });
  try {
    const uid = 'published-synthetic';
    const db = environment.authenticatedContext(uid).firestore();
    const offlineDb = environment.authenticatedContext(uid).firestore();
    const key = await generateMdek();
    const evaluate = (code: string, globals: object) => runInNewContext(code, globals, { timeout: 1000 });
    const readable = evaluate(`${declarations.get('no')}; no`, { As: 2, Ds: CloudProtocolConflict, Mc: isCryptoEnvelope });
    const classify = evaluate(`${declarations.get('Wm')}; Wm`, { As: 2 });
    const chunks = evaluate(`${declarations.get('Ic')}; Ic`, {});
    const makeWriter = (database: typeof db) => evaluate(`${writer}; Na`, {
      Wt: () => ({ db: database }), bt: { getKey: () => key }, Le: randomUUID, _e: syncModuleData,
      Fm: encodeCloudModuleData, u0: (data: unknown) => JSON.parse(JSON.stringify(data)), en: 2, As: 2,
      Wl: serverTimestamp, Ic: chunks, Wm: classify, no: readable, rr: doc, Li: getDoc,
      // Only cross the VM/SDK Object-prototype boundary; preserve every payload
      // field and the real serverTimestamp sentinel without changing semantics.
      Kl: (database: typeof db, callback: (transaction: unknown) => Promise<unknown>) => runTransaction(database, transaction => callback({
        get: (ref: Parameters<typeof transaction.get>[0]) => transaction.get(ref),
        set: (ref: Parameters<typeof transaction.set>[0], payload: object) => transaction.set(ref, { ...payload }),
      })),
      Tr: (user: string, database: typeof db) => collection(database, 'users', user, 'lifeosModules'),
      l0: (user: string, database: typeof db) => collection(database, 'users', user, 'lifeosRevisions'),
      $r: CloudRevisionConflict, Ds: CloudProtocolConflict, Ir: ResaleRevisionConflict, Vn: ResaleProtocolConflict,
      m0: () => {}, Fc: () => {},
    }) as (user: string, state: ReturnType<typeof defaultState>, modules: string[], device: string, revisions: Record<string, string>) => Promise<{ writes: Array<{ module: string; revision: string; parentRevision: string | null }>; completion: Promise<void> }>;
    const publishedWriter = makeWriter(db);
    const state = defaultState();
    state.finance.accounts = [{ id: 'cash', name: 'Sintética', balance: 1000, initialBalance: 1000 }];
    const input = { type: 'gasto' as const, amount: 200, category: 'Comida', accountId: 'cash', note: '' };
    let revisions: Record<string, string> = {};
    const create = await publishedWriter(uid, state, ['finance'], 'published', revisions);
    await create.completion;
    context.diagnostic('Publicador archivado: creación cifrada confirmada');
    revisions = { finance: create.writes[0].revision };
    const staleRevision = { ...revisions };
    for (let count = 1; count <= 3; count++) {
      addTransaction(state, { ...input, id: `published-${count}` });
      const write = await publishedWriter(uid, state, ['finance'], 'published', revisions);
      await write.completion;
      context.diagnostic(`Publicador archivado: compra ${count} confirmada`);
      revisions = { finance: write.writes[0].revision };
      const head = (await getDocFromServer(doc(db, 'users', uid, 'lifeosModules', 'finance'))).data()!;
      assert.equal(head.revision, revisions.finance);
      assert.equal(head.parentRevision, write.writes[0].parentRevision);
      const decoded = await decodeCloudModuleData(head.data, 'finance', uid, key);
      assert.equal(decoded.mode, 'decrypted');
      if (decoded.mode === 'decrypted') assert.equal((decoded.data as typeof state).finance.accounts[0].balance, 1000 - count * 200);
    }
    const stale = await publishedWriter(uid, state, ['finance'], 'stale-published', staleRevision);
    await assert.rejects(stale.completion, CloudRevisionConflict);
    context.diagnostic('Publicador archivado: padre obsoleto rechazado');
    const baseline = structuredClone(state);
    const pending = structuredClone(state);
    addTransaction(pending, { ...input, id: 'pending-offline' });
    const localBytes = JSON.stringify(pending);

    const captureRejection = (error: unknown, writes: Array<{ module: string; revision: string }>, online: boolean) => {
      let status = '';
      const queued = new Set<string>();
      const failed = new Set<string>();
      const pendingRevisions = { current: { finance: writes.map(item => item.revision) } as Record<string, string[]> };
      const queuedState = { current: null as unknown };
      const handler = evaluate(`(${rejectionCode})`, {
        X: () => true, I: { uid }, _: { current: { uid } },
        $r: CloudRevisionConflict, Ds: CloudProtocolConflict, Ir: ResaleRevisionConflict, Vn: ResaleProtocolConflict,
        le: { writes }, Ee: pendingRevisions, Re: { current: queued }, Me: { current: failed }, Ln: queuedState, H: pending,
        F: (next: string) => { status = next; }, oe: () => {}, Ke: () => { status = 'conflict'; }, Se: revisions,
        At: { current: 0 }, yt: { current: null }, It: () => {}, navigator: { onLine: online },
        window: { clearTimeout: () => {}, setTimeout: () => 1 }, console: { error: () => {} },
        si: (candidate: { code?: string }) => candidate?.code === 'permission-denied',
      }) as (error: unknown) => void;
      handler(error);
      assert.equal(JSON.stringify(pending), localBytes, 'Un rechazo no reemplaza el estado local financiero');
      return { status, queued, failed, queuedState };
    };

    await disableNetwork(offlineDb);
    // disableNetwork controls queued writes, but is not a physical transport
    // firewall for every SDK RPC. Physical offline is exercised by Playwright;
    // here the archived callback gets an explicit transport fault.
    const offlineStatus = captureRejection({ code: 'unavailable', message: 'Synthetic offline transport failure' }, [{ module: 'finance', revision: 'not-sent-offline' }], false);
    assert.equal(offlineStatus.status, 'offline');
    assert.ok(offlineStatus.queued.has('finance'));
    assert.equal(offlineStatus.queuedState.current, pending);
    context.diagnostic('Callback archivado: fallo de transporte offline simulado conserva el estado y la cola');

    // A persisted legacy batch queued offline predates a different client's new
    // movement. The exact server Rules must reject it on reconnect.
    const oldBatch = writeBatch(offlineDb);
    const encoded = await encodeCloudModuleData(syncModuleData(pending, 'finance'), 'finance', uid, key);
    const oldPayload = { schemaVersion: 2, syncProtocolVersion: 2, isEncrypted: true, module: 'finance', data: encoded.data,
      revision: 'offline-old-batch', parentRevision: revisions.finance, deviceId: 'old-offline', clientUpdatedAt: Date.now(), updatedAt: serverTimestamp() };
    oldBatch.set(doc(offlineDb, 'users', uid, 'lifeosModules', 'finance'), oldPayload);
    oldBatch.set(doc(offlineDb, 'users', uid, 'lifeosRevisions', oldPayload.revision), oldPayload);
    const queuedOutcome = oldBatch.commit().then(() => null, error => error);
    assert.notEqual(db.app.name, offlineDb.app.name, 'Los dispositivos de prueba deben tener instancias de SDK distintas');
    const beforeOnline = (await getDocFromServer(doc(db, 'users', uid, 'lifeosModules', 'finance'))).data()!;
    assert.equal(beforeOnline.revision, revisions.finance, 'El servidor debe conservar la revisión previa mientras el lote está offline');
    addTransaction(state, { ...input, id: 'other-online-client' });
    const onlineWrite = await publishedWriter(uid, state, ['finance'], 'published-online', revisions);
    await onlineWrite.completion;
    context.diagnostic('Segundo cliente online confirmado');
    revisions = { finance: onlineWrite.writes[0].revision };
    await enableNetwork(offlineDb);
    const rejection = await queuedOutcome;
    assert.equal(rejection?.code, 'permission-denied');
    context.diagnostic('Lote offline antiguo rechazado por las Rules');
    const rejectedStatus = captureRejection(rejection, [{ module: 'finance', revision: oldPayload.revision }], true);
    assert.equal(rejectedStatus.status, 'error');
    assert.ok(rejectedStatus.failed.has('finance') && rejectedStatus.queued.has('finance'));
    assert.equal((await getDocFromServer(doc(db, 'users', uid, 'lifeosRevisions', oldPayload.revision))).exists(), false);
    assert.equal((await getDocFromServer(doc(db, 'users', uid, 'lifeosModules', 'finance'))).data()!.revision, revisions.finance);

    const merged = mergeSyncModuleWithConflicts(pending, 'finance', syncModuleData(state, 'finance'), syncModuleData(baseline, 'finance'));
    assert.equal(merged.conflicts.length, 0);
    assert.equal(merged.state.finance.transactions.length, 5);
    assert.equal(merged.state.finance.accounts[0].balance, 0);
    const recovered = await publishedWriter(uid, merged.state, ['finance'], 'published-after-reconciliation', revisions);
    await recovered.completion;
    const final = (await getDocFromServer(doc(db, 'users', uid, 'lifeosModules', 'finance'))).data()!;
    const decoded = await decodeCloudModuleData(final.data, 'finance', uid, key);
    assert.equal(decoded.mode, 'decrypted');
    if (decoded.mode === 'decrypted') assert.equal((decoded.data as typeof state).finance.transactions.length, 5);
  } finally { await environment.cleanup(); }
});
