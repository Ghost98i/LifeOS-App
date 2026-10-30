import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDocFromServer, terminate } from 'firebase/firestore';
import { defaultState, loadRecoveryState, normalizeStoredState } from './storage';
import { SYNC_MODULES, syncDataFingerprint, syncModuleData, type SyncModuleKey, type SyncRevisionMap } from './syncModel';
import {
  checkCommercialAccess,
  fetchFreshCloudModules,
  getFirestoreDb,
  loadCloudRevisions,
  loadSyncRecoverySnapshot,
  ResaleRevisionConflict,
  saveSyncRecoverySnapshot,
  writeCloudModulesAsync,
  writeCloudModulesGuarded,
} from './cloudSync';
import { applyCommercialSnapshot } from './commercialProduction';
import { advanceCommercialPilot, type CommercialPilotSnapshot } from './commercialPilot';
import { addSandboxItem, emptySandboxInventory } from './commercialInventorySandbox';
import { confirmSandboxPurchaseWithPayment } from './commercialImmediateSandbox';
import { confirmSandboxMoneyEvent } from './commercialMoneySandbox';
import {
  clearWrappedKeyEnvelope,
  cryptoSession,
  isCryptoEnvelope,
  provisionZeroKnowledgeKeys,
} from './cryptoCore';
import {
  executeE2EEMigration,
  fetchAccountCapability,
  setCloudKeyEnvelope,
  unlockDeviceWithRecoveryKey,
} from './cryptoMigration';
import { loadResaleConflict, saveResaleConflict, type ResaleConflictRecord } from './resaleConflictRecovery';
import {
  buildResaleConflictReconciliationPreview,
  executeAuthorizedConflictReconciliation,
} from './resaleConflictResolution';

test('Firestore: dos clientes de la misma revisión no sobrescriben el grupo resale/finance', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    context.skip('Requiere emuladores de Firestore y Auth');
    return;
  }
  const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const [authHost, authPort] = process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':');
  const db = getFirestoreDb();
  const app = getApp();
  try {
    connectFirestoreEmulator(db, firestoreHost, Number(firestorePort));
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    const { user } = await signInAnonymously(auth);
    const userId = user.uid;
    const modules = ['resale', 'finance'] as const;

    const base = defaultState();
    const firstState = structuredClone(base);
    const secondState = structuredClone(base);
    firstState.resale.inventory.push({
      id: 'item-a', item: 'Producto A', buyPrice: 8000, buyDate: '2026-10-22',
      status: 'comprado', purchaseTxId: 'purchase-a',
    });
    firstState.finance.transactions.push({
      id: 'purchase-a', type: 'gasto', amount: 8000, category: 'Reventa', fixed: 'variable',
      date: '2026-10-22', accountId: base.finance.accounts[0].id, origin: 'resale_purchase',
    });
    secondState.resale.inventory.push({
      id: 'item-b', item: 'Producto B', buyPrice: 9000, buyDate: '2026-10-22',
      status: 'comprado', purchaseTxId: 'purchase-b',
    });
    secondState.finance.transactions.push({
      id: 'purchase-b', type: 'gasto', amount: 9000, category: 'Reventa', fixed: 'variable',
      date: '2026-10-22', accountId: base.finance.accounts[0].id, origin: 'resale_purchase',
    });
    const localBefore = [structuredClone(firstState), structuredClone(secondState)];

    const attempts = await Promise.all([
      writeCloudModulesGuarded(userId, firstState, [...modules], 'device-a', {}),
      writeCloudModulesGuarded(userId, secondState, [...modules], 'device-b', {}),
    ]);
    assert.ok(attempts.every((attempt) => attempt.writes.every((write) => write.parentRevision === null)));
    const outcomes = await Promise.allSettled(attempts.map((attempt) => attempt.completion));
    const winners = outcomes.flatMap((outcome, index) => outcome.status === 'fulfilled' ? [index] : []);
    const losers = outcomes.flatMap((outcome, index) => outcome.status === 'rejected' ? [index] : []);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    const losingOutcome = outcomes[losers[0]];
    assert.ok(losingOutcome.status === 'rejected');
    assert.ok(losingOutcome.reason instanceof ResaleRevisionConflict);
    assert.deepEqual(losingOutcome.reason.modules, [...modules]);

    const heads = await Promise.all(modules.map((module) => getDocFromServer(doc(db, 'users', userId, 'lifeosModules', module))));
    assert.ok(heads.every((head) => head.exists()));
    assert.deepEqual(heads.map((head) => head.data()?.revision), attempts[winners[0]].writes.map((write) => write.revision));
    assert.deepEqual(heads.map((head) => head.data()?.data), modules.map((module) => syncModuleData(localBefore[winners[0]], module)));
    assert.deepEqual([firstState, secondState], localBefore);
    assert.notDeepEqual(syncModuleData(localBefore[losers[0]], 'finance'), heads[1].data()?.data);
    const losingRevisions = await Promise.all(attempts[losers[0]].writes.map((write) =>
      getDocFromServer(doc(db, 'users', userId, 'lifeosRevisions', write.revision))));
    assert.ok(losingRevisions.every((revision) => !revision.exists()));

    // Verificar que crear y luego actualizar los 15 SYNC_MODULES completos no falla por el límite de 20 get()/exists() de Firestore Rules
    await auth.signOut();
    const { user: fullUser } = await signInAnonymously(auth);
    const fullUserId = fullUser.uid;
    const initialState = defaultState();
    const createAttempt = await writeCloudModulesGuarded(fullUserId, initialState, [...SYNC_MODULES], 'device-15', {});
    await createAttempt.completion;
    assert.equal(createAttempt.writes.length, SYNC_MODULES.length);

    const expectedRevisions: SyncRevisionMap = Object.fromEntries(
      createAttempt.writes.map((w) => [w.module, w.revision])
    );

    const updatedState = structuredClone(initialState);
    updatedState.profile.name = 'Actualización 15 módulos';
    updatedState.agenda.martes.push({
      id: 'blk-15',
      time: '10:00',
      activity: 'Prueba 15 módulos',
    });
    const updateAttempt = await writeCloudModulesGuarded(
      fullUserId,
      updatedState,
      [...SYNC_MODULES],
      'device-15',
      expectedRevisions
    );
    await updateAttempt.completion;
    assert.equal(updateAttempt.writes.length, SYNC_MODULES.length);
    const updatedHeads = await Promise.all(
      SYNC_MODULES.map((m) => getDocFromServer(doc(db, 'users', fullUserId, 'lifeosModules', m)))
    );
    assert.ok(updatedHeads.every((head) => head.exists()));
    assert.deepEqual(
      updatedHeads.map((head) => head.data()?.revision),
      updateAttempt.writes.map((w) => w.revision)
    );

    // =========================================================================
    // PRUEBA DE SEGURIDAD ANTE INTERRUPCIÓN DE LOTES, CONCURRENCIA, RESPALDOS Y ATOMICIDAD
    // =========================================================================
    await auth.signOut();
    const { user: reconcileUser } = await signInAnonymously(auth);
    const reconcileUid = reconcileUser.uid;

    const memStore = new Map<string, string>();
    const storageShim: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: (k) => memStore.get(k) ?? null,
      setItem: (k, v) => { memStore.set(k, v); },
    };

    // Estado remoto inicial: plantilla de 15 módulos (3 idénticos a local: resale, streaming, ideas; 12 distintos)
    const remoteTemplate = defaultState();
    remoteTemplate.settings.onboardingCompleted = true;

    const createRemote15 = await writeCloudModulesGuarded(
      reconcileUid,
      remoteTemplate,
      [...SYNC_MODULES],
      'device-init',
      {}
    );
    await createRemote15.completion;
    const initialRemoteRevisions: SyncRevisionMap = Object.fromEntries(
      createRemote15.writes.map((w) => [w.module, w.revision])
    );

    // Estado local rico: difiere en 12 módulos y coincide en 3 (resale, streaming, ideas)
    const localRich = structuredClone(remoteTemplate);
    localRich.profile.name = 'Cuenta Sintética Conciliación';
    localRich.agenda.lunes.push({ id: 'ag-1', time: '08:30', activity: 'Revisión matutina' });
    localRich.tasksRecurring.push({ id: 'tr-1', name: ' hábito sintético', freq: 'daily', days: ['lunes'] });
    localRich.dailyContext.push({
      date: '2026-10-27', sleepHours: 8, sleepQuality: 4, mood: 4, energy: 4, connection: 4, note: 'Contexto local',
    });
    localRich.finance.transactions.push({
      id: 'tx-local-1', type: 'gasto', amount: 2400, category: 'Comida', fixed: 'variable',
      date: '2026-10-27', accountId: localRich.finance.accounts[0].id, note: 'Gasto local',
    });
    localRich.gym.sessions.push({ id: 'gym-local-1', date: '2026-10-27', exercises: [] });
    localRich.study.subjects.push({ id: 'sub-local-1', name: 'Álgebra Lineal' });
    localRich.jobs.applications.push({
      id: 'job-local-1', empresa: 'Tech Corp', puesto: 'Dev', estado: 'cv_enviado', fecha: '2026-10-27',
    });
    localRich.calendarEvents.push({
      id: 'cal-local-1', name: 'Entrega', date: '2026-10-27', type: 'importante', recurring: false,
    });
    localRich.goals.push({ id: 'goal-local-1', name: 'Ahorro', initial: 0, target: 1000, current: 250 });
    localRich.notes.postits.push({ id: 'note-local-1', title: 'Idea', text: 'Nota local', date: '2026-10-27' });
    localRich.checkoutLog['2026-10-27'] = { closedAt: '2026-10-27T21:00:00.000Z', dailyNote: 'Cierre local' };

    const all15Modules: SyncModuleKey[] = ['resale', ...SYNC_MODULES.filter((m) => m !== 'resale')];
    const localModulesMap = Object.fromEntries(all15Modules.map((m) => [m, syncModuleData(localRich, m)]));
    const remoteModulesMap = Object.fromEntries(all15Modules.map((m) => [m, syncModuleData(remoteTemplate, m)]));

    const syntheticConflict: ResaleConflictRecord = {
      id: 'conflict-15-interrupted-test',
      status: 'pending',
      createdAt: '2026-10-27T19:00:00.000Z',
      diagnostic: 'Firestore rechazó la publicación.',
      modules: all15Modules,
      local: structuredClone(localModulesMap),
      base: {},
      baseRevisions: structuredClone(initialRemoteRevisions),
      remoteVersions: [
        {
          data: { resale: remoteModulesMap.resale, finance: remoteModulesMap.finance },
          revisions: structuredClone(initialRemoteRevisions),
        },
        {
          data: structuredClone(remoteModulesMap),
          revisions: structuredClone(initialRemoteRevisions),
        },
      ],
    };
    saveResaleConflict(reconcileUid, syntheticConflict, storageShim);

    const choicesAllLocal: Partial<Record<SyncModuleKey, 'local' | 'remote'>> = Object.fromEntries(
      all15Modules.map((m) => [m, 'local' as const])
    );

    // 1 y 5. Ejecutar conciliación por lotes, verificar respaldos ANTES de la primera escritura, y provocar fallo tras confirmar el Lote 1
    let batchPublishCalls = 0;
    const publishedBatchesRun1: SyncModuleKey[][] = [];
    let backupsVerifiedBeforeFirstWrite = false;

    const interruptedRun = await executeAuthorizedConflictReconciliation(
      syntheticConflict,
      localRich,
      { authorized: true, choices: choicesAllLocal },
      {
        saveConflict: (next) => saveResaleConflict(reconcileUid, next, storageShim),
        saveBackup: (localSnap, remoteSnap) => {
          const okLocal = saveSyncRecoverySnapshot(reconcileUid, 'local', localSnap, storageShim);
          const okRemote = saveSyncRecoverySnapshot(reconcileUid, 'remote', remoteSnap, storageShim);
          return okLocal && okRemote;
        },
        publish: async (stateToWrite, batchModules, batchExpectedRevisions) => {
          batchPublishCalls += 1;
          if (batchPublishCalls === 1) {
            // 5. Verificar que los respaldos completos local y remoto YA están guardados y son recuperables antes de iniciar escrituras
            const recoveredLocal = loadSyncRecoverySnapshot(reconcileUid, 'local', storageShim);
            const recoveredRemote = loadSyncRecoverySnapshot(reconcileUid, 'remote', storageShim);
            assert.ok(recoveredLocal, 'El respaldo local debe existir antes del primer lote');
            assert.ok(recoveredRemote, 'El respaldo remoto debe existir antes del primer lote');
            assert.equal(recoveredLocal.profile.name, 'Cuenta Sintética Conciliación');
            assert.equal(recoveredRemote.profile.name, '');
            assert.equal(recoveredLocal.finance.transactions.length, 1);
            assert.equal(recoveredRemote.finance.transactions.length, 0);
            backupsVerifiedBeforeFirstWrite = true;
          }
          if (batchPublishCalls === 2) {
            throw new Error('Fallo deliberado después de confirmar el primer lote, antes del segundo');
          }
          publishedBatchesRun1.push([...batchModules]);
          return writeCloudModulesGuarded(reconcileUid, stateToWrite, batchModules, 'device-reconcile', batchExpectedRevisions);
        },
        currentState: () => localRich,
      }
    );

    assert.equal(backupsVerifiedBeforeFirstWrite, true);
    assert.equal(interruptedRun.status, 'blocked');
    assert.equal(interruptedRun.record.status, 'pending');
    assert.equal(interruptedRun.confirmedWrites.length, 5);
    // 3 idénticos originales (resale, streaming, ideas) + 5 confirmados en el Lote 1 = 8 listos, 7 pendientes
    assert.equal(interruptedRun.completedModules.length, 8);
    assert.equal(interruptedRun.pendingModules.length, 7);
    assert.match(interruptedRun.reason, /Progreso parcial: se confirmaron 5 módulo\(s\) en este intento \(8\/15 listos; quedan 7 pendientes\)/);

    // 3. Confirmar que el conflicto sigue pendiente en almacenamiento y que la previsualización UI indica el progreso parcial
    const persistedAfterInterrupt = loadResaleConflict(reconcileUid, storageShim);
    assert.equal(persistedAfterInterrupt.status, 'loaded');
    assert.equal(persistedAfterInterrupt.record.status, 'pending');

    const partialPreview = buildResaleConflictReconciliationPreview(interruptedRun.record, localRich);
    assert.equal(partialPreview.reconciledCount, 8);
    assert.equal(partialPreview.pendingCount, 7);
    assert.equal(partialPreview.differingCount, 7);
    assert.equal(partialPreview.identicalCount, 8);

    const batch1Modules = publishedBatchesRun1[0];
    assert.equal(batch1Modules.length, 5);
    const batch1RevisionsInFirestore = new Map<SyncModuleKey, string>();
    for (const mod of batch1Modules) {
      const snap = await getDocFromServer(doc(db, 'users', reconcileUid, 'lifeosModules', mod));
      assert.ok(snap.exists());
      batch1RevisionsInFirestore.set(mod, snap.data()?.revision);
      assert.equal(
        syncDataFingerprint(snap.data()?.data),
        syncDataFingerprint(syncModuleData(localRich, mod)),
        `El módulo ${mod} del Lote 1 debe estar persistido en Firestore`
      );
    }

    // 4. Simular modificación concurrente de un módulo todavía pendiente (ej. 'jobs') y comprobar que su revisión se rechaza sin sobrescribirlo
    const pendingModuleToModify: SyncModuleKey = 'jobs';
    assert.ok(interruptedRun.pendingModules.includes(pendingModuleToModify));
    const concurrentState = structuredClone(remoteTemplate);
    concurrentState.jobs.applications.push({
      id: 'job-concurrent-remote',
      empresa: 'Edición Concurrente Otro Cliente',
      puesto: 'Arquitecto',
      estado: 'entrevista',
      fecha: '2026-10-27',
    });
    const concurrentWrite = await writeCloudModulesGuarded(
      reconcileUid,
      concurrentState,
      [pendingModuleToModify],
      'device-other-concurrent',
      { [pendingModuleToModify]: initialRemoteRevisions[pendingModuleToModify] }
    );
    await concurrentWrite.completion;
    const concurrentJobRevision = concurrentWrite.writes[0].revision;

    const publishedBatchesRun2: SyncModuleKey[][] = [];
    const concurrentRun = await executeAuthorizedConflictReconciliation(
      interruptedRun.record,
      localRich,
      { authorized: true, choices: choicesAllLocal },
      {
        saveConflict: (next) => saveResaleConflict(reconcileUid, next, storageShim),
        saveBackup: (localSnap, remoteSnap) => {
          const okLocal = saveSyncRecoverySnapshot(reconcileUid, 'local', localSnap, storageShim);
          const okRemote = saveSyncRecoverySnapshot(reconcileUid, 'remote', remoteSnap, storageShim);
          return okLocal && okRemote;
        },
        publish: async (stateToWrite, batchModules, batchExpectedRevisions) => {
          publishedBatchesRun2.push([...batchModules]);
          return writeCloudModulesGuarded(reconcileUid, stateToWrite, batchModules, 'device-reconcile', batchExpectedRevisions);
        },
        currentState: () => localRich,
      }
    );

    // 2 y 4. Comprobar que el reintento NO volvió a publicar ningún módulo del Lote 1 y rechazó sobrescribir 'jobs'
    for (const mod of batch1Modules) {
      assert.ok(
        !publishedBatchesRun2.flat().includes(mod),
        `El módulo ${mod} ya confirmado en el Lote 1 no debe volver a enviarse al reintentar`
      );
      const snapAfterRetry = await getDocFromServer(doc(db, 'users', reconcileUid, 'lifeosModules', mod));
      assert.equal(
        snapAfterRetry.data()?.revision,
        batch1RevisionsInFirestore.get(mod),
        `La revisión en Firestore del módulo ${mod} del Lote 1 no debe sobrescribirse`
      );
    }

    assert.equal(concurrentRun.status, 'blocked');
    assert.equal(concurrentRun.record.status, 'pending');
    assert.match(concurrentRun.reason, /jobs/);

    // Verificar en Firestore que 'jobs' conserva intacta la edición concurrente y su revisión
    const jobsSnapAfterReject = await getDocFromServer(doc(db, 'users', reconcileUid, 'lifeosModules', 'jobs'));
    assert.equal(jobsSnapAfterReject.data()?.revision, concurrentJobRevision);
    assert.equal(
      syncDataFingerprint(jobsSnapAfterReject.data()?.data),
      syncDataFingerprint(syncModuleData(concurrentState, 'jobs')),
      'El módulo pendiente modificado concurrentemente no debe ser sobrescrito'
    );

    // Verificar que el respaldo remoto guardado sigue conteniendo la versión remota original completa previa a cualquier lote
    const preservedRemoteBackup = loadSyncRecoverySnapshot(reconcileUid, 'remote', storageShim);
    assert.ok(preservedRemoteBackup);
    assert.equal(preservedRemoteBackup.profile.name, '');
    assert.equal(preservedRemoteBackup.finance.transactions.length, 0);

    // Ahora actualizar el registro con la versión remota concurrente inspeccionada de 'jobs' y completar la conciliación
    const alignedRecord: ResaleConflictRecord = {
      ...concurrentRun.record,
      baseRevisions: {
        ...concurrentRun.record.baseRevisions,
        jobs: concurrentJobRevision,
      },
      remoteVersions: [
        ...concurrentRun.record.remoteVersions,
        {
          data: { jobs: syncModuleData(concurrentState, 'jobs') },
          revisions: { jobs: concurrentJobRevision },
        },
      ],
    };

    const publishedBatchesRun3: SyncModuleKey[][] = [];
    const completedRun = await executeAuthorizedConflictReconciliation(
      alignedRecord,
      localRich,
      { authorized: true, choices: choicesAllLocal },
      {
        saveConflict: (next) => saveResaleConflict(reconcileUid, next, storageShim),
        publish: async (stateToWrite, batchModules, batchExpectedRevisions) => {
          publishedBatchesRun3.push([...batchModules]);
          return writeCloudModulesGuarded(reconcileUid, stateToWrite, batchModules, 'device-reconcile', batchExpectedRevisions);
        },
        currentState: () => localRich,
      }
    );

    assert.equal(completedRun.status, 'confirmed');
    assert.equal(completedRun.record.status, 'resolved');
    assert.equal(completedRun.pendingModules.length, 0);
    assert.equal(completedRun.completedModules.length, 15);
    // Ninguno de los módulos confirmados en el Lote 1 fue reescrito en el cierre final
    for (const mod of batch1Modules) {
      assert.ok(!publishedBatchesRun3.flat().includes(mod));
      const snapFinal = await getDocFromServer(doc(db, 'users', reconcileUid, 'lifeosModules', mod));
      assert.equal(snapFinal.data()?.revision, batch1RevisionsInFirestore.get(mod));
    }

    // 6. Confirmar que 'resale' y 'finance' permanecen atómicos cuando tienen operaciones comerciales relacionadas
    await auth.signOut();
    const { user: atomicUser } = await signInAnonymously(auth);
    const atomicUid = atomicUser.uid;

    const baseAtomic = defaultState();
    const createAtomic = await writeCloudModulesGuarded(
      atomicUid,
      baseAtomic,
      ['resale', 'finance', 'profile'],
      'device-atomic-init',
      {}
    );
    await createAtomic.completion;
    const atomicBaseRevs: SyncRevisionMap = Object.fromEntries(
      createAtomic.writes.map((w) => [w.module, w.revision])
    );

    const linkedLocal = structuredClone(baseAtomic);
    const accId = linkedLocal.finance.accounts[0].id;
    linkedLocal.finance.transactions.push({
      id: 'tx-resale-linked-1',
      type: 'gasto',
      amount: 5500,
      category: 'Reventa',
      fixed: 'variable',
      date: '2026-10-27',
      accountId: accId,
      origin: 'resale_purchase',
    });
    linkedLocal.resale.inventory.push({
      id: 'item-linked-1',
      item: 'Monitor 27"',
      buyPrice: 5500,
      buyDate: '2026-10-27',
      status: 'comprado',
      purchaseTxId: 'tx-resale-linked-1',
      purchaseAccountId: accId,
    });
    linkedLocal.profile.name = 'Atomic Resale Finance';

    const atomicConflict: ResaleConflictRecord = {
      id: 'conflict-atomic-resale-finance',
      status: 'pending',
      createdAt: '2026-10-27T19:10:00.000Z',
      diagnostic: 'Bloqueo con vínculo comercial',
      modules: ['resale', 'finance', 'profile'],
      local: {
        resale: syncModuleData(linkedLocal, 'resale'),
        finance: syncModuleData(linkedLocal, 'finance'),
        profile: syncModuleData(linkedLocal, 'profile'),
      },
      base: {},
      baseRevisions: structuredClone(atomicBaseRevs),
      remoteVersions: [
        {
          data: {
            resale: syncModuleData(baseAtomic, 'resale'),
            finance: syncModuleData(baseAtomic, 'finance'),
            profile: syncModuleData(baseAtomic, 'profile'),
          },
          revisions: structuredClone(atomicBaseRevs),
        },
      ],
    };

    // Modificar concurrentemente solo 'finance' en Firestore antes de conciliar el grupo ['resale', 'finance']
    const concurrentFinanceState = structuredClone(baseAtomic);
    concurrentFinanceState.finance.transactions.push({
      id: 'tx-other-client',
      type: 'gasto',
      amount: 900,
      category: 'Otros',
      fixed: 'variable',
      date: '2026-10-27',
      accountId: accId,
    });
    const concurrentFinWrite = await writeCloudModulesGuarded(
      atomicUid,
      concurrentFinanceState,
      ['finance'],
      'device-other',
      { finance: atomicBaseRevs.finance }
    );
    await concurrentFinWrite.completion;
    const concurrentFinRev = concurrentFinWrite.writes[0].revision;

    const atomicAttempt = await executeAuthorizedConflictReconciliation(
      atomicConflict,
      linkedLocal,
      {
        authorized: true,
        choices: { resale: 'local', finance: 'local', profile: 'local' },
      },
      {
        saveConflict: () => true,
        publish: (stateToWrite, batchModules, batchExpectedRevisions) => {
          // Confirmar que 'resale' y 'finance' viajan juntos en la misma transacción
          assert.ok(batchModules.includes('resale') && batchModules.includes('finance'));
          return writeCloudModulesGuarded(atomicUid, stateToWrite, batchModules, 'device-atomic', batchExpectedRevisions);
        },
        currentState: () => linkedLocal,
      }
    );

    assert.equal(atomicAttempt.status, 'blocked');
    assert.equal(atomicAttempt.confirmedWrites.length, 0);
    // Ni 'resale' ni 'finance' deben haberse sobrescrito en Firestore
    const resaleSnapAfterAtomicAbort = await getDocFromServer(doc(db, 'users', atomicUid, 'lifeosModules', 'resale'));
    const financeSnapAfterAtomicAbort = await getDocFromServer(doc(db, 'users', atomicUid, 'lifeosModules', 'finance'));
    assert.equal(resaleSnapAfterAtomicAbort.data()?.revision, atomicBaseRevs.resale);
    assert.equal(financeSnapAfterAtomicAbort.data()?.revision, concurrentFinRev);

    // =========================================================================
    // Migración E2EE integral de cuenta sintética con 15 módulos existentes en
    // texto plano, fallo interrumpido sin pérdida, reanudación idempotente,
    // verificación de revisiones y recuperación desde segundo dispositivo.
    // =========================================================================
    const e2eeStore = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => e2eeStore.get(k) ?? null,
        setItem: (k: string, v: string) => { e2eeStore.set(k, v); },
        removeItem: (k: string) => { e2eeStore.delete(k); },
        clear: () => { e2eeStore.clear(); },
      },
      configurable: true,
      writable: true,
    });

    await auth.signOut();
    cryptoSession.lock();
    const { user: e2eeUser } = await signInAnonymously(auth);
    const e2eeUid = e2eeUser.uid;

    const rawSyntheticState = defaultState();
    rawSyntheticState.profile.name = 'Cuenta Sintética Pre-E2EE';
    rawSyntheticState.agenda.lunes.push({ id: 'ag-e2ee-1', time: '09:00', activity: 'Bloque E2EE' });
    rawSyntheticState.tasksRecurring.push({ id: 'tr-e2ee-1', name: 'Hábito E2EE', freq: 'daily', days: ['lunes'] });
    rawSyntheticState.dailyContext.push({
      date: '2026-10-27', sleepHours: 8, sleepQuality: 4, mood: 4, energy: 4, connection: 4, note: 'Contexto E2EE',
    });
    rawSyntheticState.finance.transactions.push({
      id: 'tx-e2ee-1', type: 'ingreso', amount: 15000, category: 'Ventas',
      fixed: 'variable', date: '2026-10-27', accountId: rawSyntheticState.finance.accounts[0].id,
    });
    rawSyntheticState.gym.sessions.push({ id: 'gym-e2ee-1', date: '2026-10-27', exercises: [] });
    rawSyntheticState.study.subjects.push({ id: 'sub-e2ee-1', name: 'Criptografía Aplicada' });
    rawSyntheticState.jobs.applications.push({
      id: 'job-e2ee-1', empresa: 'SecCorp', puesto: 'Ingeniero', estado: 'cv_enviado', fecha: '2026-10-27',
    });
    rawSyntheticState.calendarEvents.push({
      id: 'cal-e2ee-1', name: 'Hito E2EE', date: '2026-10-27', type: 'importante', recurring: false,
    });
    rawSyntheticState.goals.push({ id: 'goal-e2ee-1', name: 'Reserva', initial: 0, target: 5000, current: 1500 });
    rawSyntheticState.notes.postits.push({ id: 'note-e2ee-1', title: 'Nota E2EE', text: 'Contenido íntegro', date: '2026-10-27' });
    rawSyntheticState.checkoutLog['2026-10-27'] = { closedAt: '2026-10-27T21:00:00.000Z', dailyNote: 'Cierre E2EE' };
    rawSyntheticState.resale.inventory.push({
      id: 'res-e2ee-1', item: 'Artículo existente en resale', buyPrice: 3200, buyDate: '2026-10-27', status: 'comprado',
    });
    rawSyntheticState.ideas.push({
      id: 'idea-e2ee-1', text: 'Idea cifrada', date: '2026-10-27', source: 'manual',
    });
    const syntheticState = normalizeStoredState(rawSyntheticState);

    // 1. Sembrar los 15 módulos existentes en texto plano (syncProtocolVersion: 1, isEncrypted: false)
    const initialPlaintextBatch = await writeCloudModulesAsync(
      e2eeUid,
      syntheticState,
      [...SYNC_MODULES],
      'device-pre-e2ee',
      {},
      {},
      null
    );
    await initialPlaintextBatch.completion;
    const initialPlaintextRevs = Object.fromEntries(
      initialPlaintextBatch.writes.map((w) => [w.module, w.revision])
    ) as Record<SyncModuleKey, string>;

    for (const mod of SYNC_MODULES) {
      const snap = await getDocFromServer(doc(db, 'users', e2eeUid, 'lifeosModules', mod));
      assert.equal(snap.exists(), true);
      assert.equal(snap.data()?.isEncrypted, false);
      assert.equal(snap.data()?.syncProtocolVersion, 1);
      assert.equal(snap.data()?.revision, initialPlaintextRevs[mod]);
    }

    // Limpiar revisiones locales para verificar que executeE2EEMigration recupera parentRevision desde Firestore (crucial para 'resale')
    globalThis.localStorage.removeItem(`lifeos-cloud-revisions-v2:${e2eeUid}`);

    // 2. Aprovisionar claves E2EE y guardar WrappedKeyEnvelope en Firestore
    const { recoveryKeyFormatted, envelope, sessionMdek } = await provisionZeroKnowledgeKeys(e2eeUid);
    await setCloudKeyEnvelope(e2eeUid, envelope, db);
    cryptoSession.setUnlocked(sessionMdek, e2eeUid);

    // 3. Ejecutar migración e interrumpir deliberadamente después de 7 módulos
    const firstAttemptWritten: SyncModuleKey[] = [];
    await assert.rejects(
      async () =>
        executeE2EEMigration(e2eeUid, syntheticState, sessionMdek, {
          customDb: db,
          customWriter: async (u, s, mods, devId, baseRevs, tombs, mdek) => {
            if (firstAttemptWritten.length >= 7) {
              throw new Error('Fallo sintético de red tras 7 módulos migrados');
            }
            const res = await writeCloudModulesAsync(u, s, mods, devId, baseRevs, tombs, mdek);
            await res.completion;
            firstAttemptWritten.push(...mods);
            return res;
          },
        }),
      /Fallo sintético de red tras 7 módulos migrados/
    );

    assert.equal(firstAttemptWritten.length, 7);
    assert.deepEqual(firstAttemptWritten, SYNC_MODULES.slice(0, 7));

    // Verificar respaldo preventivo local creado antes de escribir en la nube
    const localEmergencyBackup = loadRecoveryState(e2eeUid);
    assert.ok(localEmergencyBackup !== null);
    for (const mod of SYNC_MODULES) {
      assert.equal(
        syncDataFingerprint(syncModuleData(localEmergencyBackup.state, mod)),
        syncDataFingerprint(syncModuleData(syntheticState, mod)),
        `El respaldo preventivo local debe conservar intacto el módulo ${mod}`
      );
    }

    // Verificar estado 'mixed' en capability y ausencia de pérdida en los 15 módulos remotos
    const mixedCap = await fetchAccountCapability(e2eeUid, db);
    assert.ok(mixedCap !== null);
    assert.equal(mixedCap.encryptionState, 'mixed');
    assert.deepEqual(mixedCap.encryptedModules, SYNC_MODULES.slice(0, 7));

    const revisionsAfterFirst7: Record<string, string> = {};
    for (let i = 0; i < SYNC_MODULES.length; i++) {
      const mod = SYNC_MODULES[i];
      const snap = await getDocFromServer(doc(db, 'users', e2eeUid, 'lifeosModules', mod));
      assert.equal(snap.exists(), true);
      if (i < 7) {
        assert.equal(snap.data()?.isEncrypted, true, `${mod} ya debe estar cifrado`);
        assert.equal(snap.data()?.syncProtocolVersion, 2);
        revisionsAfterFirst7[mod] = snap.data()?.revision;
        assert.notEqual(revisionsAfterFirst7[mod], initialPlaintextRevs[mod]);
      } else {
        assert.equal(snap.data()?.isEncrypted, false, `${mod} debe conservar su versión en texto plano sin pérdida`);
        assert.equal(snap.data()?.revision, initialPlaintextRevs[mod]);
      }
    }

    // 4. Reanudar migración E2EE hasta completar los 15 módulos
    const secondAttemptWritten: SyncModuleKey[] = [];
    const resumeResult = await executeE2EEMigration(e2eeUid, syntheticState, sessionMdek, {
      customDb: db,
      customWriter: async (u, s, mods, devId, baseRevs, tombs, mdek) => {
        secondAttemptWritten.push(...mods);
        return writeCloudModulesAsync(u, s, mods, devId, baseRevs, tombs, mdek);
      },
    });

    assert.equal(resumeResult.success, true);
    assert.equal(resumeResult.capability.encryptionState, 'encrypted');
    assert.equal(resumeResult.capability.encryptedModules?.length, 15);
    // Idempotencia: solo los 8 módulos pendientes se escribieron en el reintento
    assert.deepEqual(secondAttemptWritten, SYNC_MODULES.slice(7));

    // Verificar que los primeros 7 no se reescribieron y los 15 están cifrados con sus revisiones sincronizadas localmente
    const persistedCloudRevs = loadCloudRevisions(e2eeUid);
    for (let i = 0; i < SYNC_MODULES.length; i++) {
      const mod = SYNC_MODULES[i];
      const snap = await getDocFromServer(doc(db, 'users', e2eeUid, 'lifeosModules', mod));
      const data = snap.data()!;
      assert.equal(data.isEncrypted, true);
      assert.equal(data.syncProtocolVersion, 2);
      assert.equal(isCryptoEnvelope(data.data), true);
      if (i < 7) {
        assert.equal(data.revision, revisionsAfterFirst7[mod], `${mod} no debió reescribirse al reanudar`);
      } else {
        assert.equal(data.parentRevision, initialPlaintextRevs[mod], `${mod} debió enlazar parentRevision con su revisión previa`);
      }
      assert.equal(persistedCloudRevs[mod], data.revision, `Revisión local de ${mod} debe coincidir con Firestore`);
      const revDoc = await getDocFromServer(doc(db, 'users', e2eeUid, 'lifeosRevisions', data.revision));
      assert.equal(revDoc.exists(), true, `Debe existir historial en lifeosRevisions para ${mod}`);
    }

    // 5. Recuperación desde un segundo dispositivo limpio usando únicamente la Recovery Key
    clearWrappedKeyEnvelope(e2eeUid);
    cryptoSession.lock();
    assert.equal(cryptoSession.isUnlocked(e2eeUid), false);

    const unlocked = await unlockDeviceWithRecoveryKey(e2eeUid, recoveryKeyFormatted, null, undefined, db);
    assert.ok(unlocked.sessionMdek);
    assert.equal(cryptoSession.isUnlocked(e2eeUid), true);

    const freshAfterE2EE = await fetchFreshCloudModules(e2eeUid);
    assert.equal(freshAfterE2EE.lockedModules.length, 0);
    assert.equal(freshAfterE2EE.corruptedModules.length, 0);
    for (const mod of SYNC_MODULES) {
      assert.equal(
        syncDataFingerprint(freshAfterE2EE.moduleData[mod]),
        syncDataFingerprint(syncModuleData(syntheticState, mod)),
        `El módulo ${mod} recuperado y descifrado debe ser 100% idéntico al original`
      );
    }

    // 6. Fase 4 — Transición de cuenta E2EE existente en syncProtocolVersion 2 a protocolo 3
    //    al registrar su primera compra y pago en Mi negocio.
    const capRes = await fetch(
      `http://${firestoreHost}:${firestorePort}/v1/projects/${app.options.projectId}/databases/(default)/documents/systemCapabilities/commercial`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            enabled: { booleanValue: true },
            commercialProtocolVersion: { integerValue: '1' },
            minimumSyncProtocolVersion: { integerValue: '3' },
          },
        }),
      }
    );
    assert.equal(capRes.ok, true);

    await checkCommercialAccess(e2eeUid);

    const accountId = syntheticState.finance.accounts[0].id;
    const categoryId = syntheticState.finance.categories.find((c) => c.active)!.id;
    const initialAccountBalance = syntheticState.finance.accounts[0].balance;
    let commercialSnapshot: CommercialPilotSnapshot = {
      currency: 'UYU',
      recipes: [],
      eventOrder: [],
      refundSources: [],
      session: { inventory: emptySandboxInventory(), sales: [], moneyEvents: [] },
    };

    const bought = confirmSandboxPurchaseWithPayment(
      commercialSnapshot.session,
      addSandboxItem(commercialSnapshot.session.inventory, 'Café Especial Fase 4', 'unit', 10, 100),
      { timing: 'later' }
    );
    assert.notEqual(bought.status, 'blocked');
    if (bought.status === 'blocked') return;
    commercialSnapshot = applyCommercialSnapshot(
      syntheticState,
      structuredClone(syntheticState.resale.commercial),
      advanceCommercialPilot(commercialSnapshot, bought.session),
      { categoryId, date: '2026-10-27' }
    );

    const paid = confirmSandboxMoneyEvent(commercialSnapshot.session, {
      id: 'pay-phase4-1',
      purpose: 'purchase_payment',
      sourceId: commercialSnapshot.session.purchases![0].id,
      amountCents: 4000,
      accountRef: accountId,
      finance: { mode: 'new' },
    });
    assert.notEqual(paid.status, 'blocked');
    if (paid.status === 'blocked') return;
    commercialSnapshot = applyCommercialSnapshot(
      syntheticState,
      structuredClone(syntheticState.resale.commercial),
      advanceCommercialPilot(commercialSnapshot, paid.session),
      { categoryId, date: '2026-10-27' }
    );

    // Publicar primera operación comercial desde una cuenta E2EE en syncProtocolVersion 2
    const commercialPublish = await writeCloudModulesGuarded(
      e2eeUid,
      syntheticState,
      ['resale', 'finance'],
      'device-phase4',
      persistedCloudRevs
    );
    await commercialPublish.completion;

    const resaleHeadAfterV3 = (await getDocFromServer(doc(db, 'users', e2eeUid, 'lifeosModules', 'resale'))).data()!;
    const financeHeadAfterV3 = (await getDocFromServer(doc(db, 'users', e2eeUid, 'lifeosModules', 'finance'))).data()!;
    const profileHeadAfterV3 = (await getDocFromServer(doc(db, 'users', e2eeUid, 'lifeosModules', 'profile'))).data()!;

    assert.equal(resaleHeadAfterV3.isEncrypted, true);
    assert.equal(resaleHeadAfterV3.syncProtocolVersion, 3);
    assert.equal(resaleHeadAfterV3.commercialProtocolVersion, 1);
    assert.equal(resaleHeadAfterV3.parentRevision, persistedCloudRevs.resale);

    assert.equal(financeHeadAfterV3.isEncrypted, true);
    assert.equal(financeHeadAfterV3.syncProtocolVersion, 3);
    assert.equal(financeHeadAfterV3.commercialProtocolVersion, 1);
    assert.equal(financeHeadAfterV3.parentRevision, persistedCloudRevs.finance);

    // Los otros 13 módulos permanecen intactos en syncProtocolVersion 2
    assert.equal(profileHeadAfterV3.syncProtocolVersion, 2);
    assert.equal(profileHeadAfterV3.commercialProtocolVersion, undefined);

    // Verificar descifrado e integridad de datos previos + nuevos en Finanzas y Mi negocio
    const freshAfterV3 = await fetchFreshCloudModules(e2eeUid);
    assert.equal(freshAfterV3.lockedModules.length, 0);
    assert.equal(freshAfterV3.corruptedModules.length, 0);
    const remoteResaleData = freshAfterV3.moduleData.resale as any;
    const remoteFinanceData = freshAfterV3.moduleData.finance as any;
    assert.equal(remoteResaleData.resale.inventory.length, 1, 'El inventario histórico previo se conserva intacto');
    assert.equal(remoteResaleData.resale.inventory[0].id, 'res-e2ee-1');
    assert.equal(remoteResaleData.resale.commercial.business.purchases.length, 1);
    assert.equal(remoteResaleData.resale.commercial.business.moneyEvents.length, 1);
    assert.equal(remoteFinanceData.finance.transactions.length, 2, 'Conserva la transacción previa + el nuevo pago comercial');
    assert.equal(remoteFinanceData.finance.transactions[1].note, 'Compra de Café Especial Fase 4');
    assert.equal(remoteFinanceData.finance.accounts[0].balance, initialAccountBalance + 15000 - 40);
  } finally {
    try {
      await terminate(db);
    } finally {
      await deleteApp(app);
    }
  }
});
