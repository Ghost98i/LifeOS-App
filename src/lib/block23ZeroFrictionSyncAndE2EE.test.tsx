import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import {
  SYNC_MODULES,
  decideInitialSyncAction,
  hasRealLocalUserData,
  isCleanOrOnboardingOnlyState,
  syncModuleData,
  type SyncModuleKey,
} from './syncModel';
import {
  CryptoDecryptionError,
  clearWrappedKeyEnvelope,
  cryptoSession,
  decryptSyncModule,
  encryptSyncModule,
  extractRecoveryKeyFromText,
  hasVaultPassword,
  isWrappedKeyEnvelope,
  loadWrappedKeyEnvelope,
  provisionZeroKnowledgeKeys,
  unlockMdekWithRecoveryKey,
  unlockMdekWithVaultPassword,
  validateEnvelopeUserBinding,
  type WrappedKeyEnvelope,
} from './cryptoCore';
import {
  disableE2EEProtection,
  setVaultPasswordForAccount,
  unlockDeviceWithRecoveryKey,
  unlockDeviceWithVaultPassword,
  type AccountSyncCapability,
  type CapabilityStorageHandlers,
  type DisableE2EEHandlers,
} from './cryptoMigration';
import { executeAuthorizedConflictReconciliation } from './resaleConflictResolution';
import type { ResaleConflictRecord } from './resaleConflictRecovery';
import { _resetDeviceTrustFallbackStore, isDeviceEnrolled } from './deviceTrust';
import { CloudConflictModal } from '../components/CloudConflictModal';
import { UnlockDeviceModal } from '../components/UnlockDeviceModal';
import { PrivacySecuritySection } from '../components/PrivacySecuritySection';

function installMemoryStorage() {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
  return {
    store,
    restore: () => {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else delete (globalThis as any).localStorage;
    },
  };
}

test('Bloque 23.1: Dispositivo nuevo/limpio o solo onboarding + nube con datos => descarga automática, 0 conflictos', () => {
  // Caso A: defaultState puro
  const freshLocal = defaultState();
  assert.equal(isCleanOrOnboardingOnlyState(freshLocal), true);
  assert.equal(hasRealLocalUserData(freshLocal), false);

  // Caso B: usuario completó el onboarding (nombre, pestañas ocultas, darkMode) pero no creó datos propios
  const onboardingLocal = defaultState();
  onboardingLocal.profile.name = 'Ana';
  onboardingLocal.settings.onboardingCompleted = true;
  onboardingLocal.settings.darkMode = true;
  onboardingLocal.settings.hiddenTabs = ['reventa', 'trabajo', 'ia'];
  assert.equal(isCleanOrOnboardingOnlyState(onboardingLocal), true);
  assert.equal(hasRealLocalUserData(onboardingLocal), false);

  // Nube con datos reales en múltiples módulos (incluyendo finanzas, notas, gimnasio y reventa)
  const cloudState = defaultState();
  cloudState.profile.name = 'Ana Cloud';
  cloudState.settings.onboardingCompleted = true;
  cloudState.finance.transactions.push({
    id: 'tx-cloud-1',
    date: todayISO(),
    type: 'ingreso',
    amount: 45000,
    category: 'Sueldo',
    fixed: 'fijo',
    note: 'Salario',
    currency: 'UYU',
  });
  cloudState.notes.postits.push({
    id: 'note-cloud-1',
    text: 'Nota importante de la nube',
    date: todayISO(),
    createdAt: new Date().toISOString(),
  });
  cloudState.resale.inventory.push({
    id: 'res-1',
    item: 'Auriculares',
    buyPrice: 1200,
    buyDate: todayISO(),
    sellPrice: 2200,
    status: 'comprado',
  });

  const decisionFresh = decideInitialSyncAction({
    localState: freshLocal,
    remoteState: cloudState,
    paired: false,
    knownRevisions: {},
    baselines: {},
    remoteRevisions: { finance: 'r1', notes: 'r2', resale: 'r3' },
  });
  assert.deepEqual(decisionFresh, { action: 'download_remote', cleanDeviceAutoDownload: true });

  const decisionOnboarding = decideInitialSyncAction({
    localState: onboardingLocal,
    remoteState: cloudState,
    paired: false,
    knownRevisions: {},
    baselines: {},
    remoteRevisions: { finance: 'r1', notes: 'r2', resale: 'r3' },
  });
  assert.deepEqual(decisionOnboarding, { action: 'download_remote', cleanDeviceAutoDownload: true });
});

test('Bloque 23.2: Cuenta nueva (dispositivo limpio + nube vacía) => subida directa en 1 clic sin conflictos ni E2EE obligatorio', () => {
  const newUserLocal = defaultState();
  newUserLocal.profile.name = 'Sofía';
  newUserLocal.settings.onboardingCompleted = true;

  const emptyCloud = defaultState();

  const decision = decideInitialSyncAction({
    localState: newUserLocal,
    remoteState: emptyCloud,
    paired: false,
    knownRevisions: {},
    baselines: {},
    remoteRevisions: {},
  });
  assert.deepEqual(decision, { action: 'upload_local' });

  // PrivacySecuritySection muestra Candado privado apagado por defecto y sin jerga técnica fuera del desplegable
  const html = renderToStaticMarkup(
    <PrivacySecuritySection state={newUserLocal} storageUserId="new-user-1" cloudConnected={true} />
  );
  assert.match(html, /role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /Candado privado adicional/);
  assert.match(html, /Tu cuenta ya está protegida con Google y se abre en 1 clic en cualquier dispositivo\./);
  assert.match(html, /Cómo funciona tu privacidad/);

  const beforeDetails = html.split('<details')[0] || '';
  assert.doesNotMatch(beforeDetails, /AES-256-GCM/i);
  assert.doesNotMatch(beforeDetails, /envoltura de claves/i);
  assert.doesNotMatch(beforeDetails, /metadatos de sincronización/i);

  const detailsPart = html.slice(html.indexOf('<details'));
  assert.match(detailsPart, /AES-256-GCM/);
  assert.match(detailsPart, /envoltura de claves/);
  assert.match(detailsPart, /metadatos de sincronización/);
  assert.match(detailsPart, /no quedan cifrados por esta función/);
});

test('Bloque 23.3: Cambios reales locales + nube distinta => dispara conflicto y "Usar datos de la nube" / "Conservar local" resuelven todos los módulos', async () => {
  const localState = defaultState();
  localState.profile.name = 'Local';
  localState.notes.postits.push({
    id: 'local-note',
    text: 'Trabajo offline local',
    date: todayISO(),
    createdAt: new Date().toISOString(),
  });
  localState.resale.inventory.push({
    id: 'local-item',
    item: 'Teclado local',
    buyPrice: 1000,
    buyDate: todayISO(),
    status: 'comprado',
  });

  const remoteState = defaultState();
  remoteState.profile.name = 'Nube';
  remoteState.notes.postits.push({
    id: 'remote-note',
    text: 'Trabajo en la nube',
    date: todayISO(),
    createdAt: new Date().toISOString(),
  });
  remoteState.resale.inventory.push({
    id: 'remote-item',
    item: 'Monitor nube',
    buyPrice: 5000,
    buyDate: todayISO(),
    status: 'comprado',
  });

  assert.equal(hasRealLocalUserData(localState), true);
  const decision = decideInitialSyncAction({
    localState,
    remoteState,
    paired: false,
    knownRevisions: {},
    baselines: {},
    remoteRevisions: { notes: 'rev-n', resale: 'rev-r', profile: 'rev-p' },
  });
  assert.equal(decision.action, 'conflict_unpaired');
  if (decision.action === 'conflict_unpaired') {
    assert.ok(decision.changedModules.includes('notes'));
    assert.ok(decision.changedModules.includes('resale'));
  }

  // Test resolution via "Usar datos de la nube" (all remote) and "Conservar este dispositivo" (all local)
  const modules: SyncModuleKey[] = ['resale', 'notes', 'profile'];
  const buildRecord = (): ResaleConflictRecord => ({
    id: 'conf-b23',
    status: 'pending',
    createdAt: new Date().toISOString(),
    diagnostic: 'Hay cambios distintos entre este dispositivo y la nube.',
    modules,
    local: Object.fromEntries(modules.map((m) => [m, syncModuleData(localState, m)])),
    base: {},
    baseRevisions: { resale: 'rev-r', notes: 'rev-n', profile: 'rev-p' },
    remoteVersions: [
      {
        data: Object.fromEntries(modules.map((m) => [m, syncModuleData(remoteState, m)])),
        revisions: { resale: 'rev-r', notes: 'rev-n', profile: 'rev-p' },
      },
    ],
  });

  // 1) Elegir "Usar datos de la nube"
  let backupSavedCloud = false;
  const cloudChoiceRes = await executeAuthorizedConflictReconciliation(
    buildRecord(),
    localState,
    {
      authorized: true,
      choices: { resale: 'remote', notes: 'remote', profile: 'remote' },
    },
    {
      saveConflict: () => true,
      saveBackup: () => {
        backupSavedCloud = true;
        return true;
      },
      publish: async (_state, mods) => ({
        writes: mods.map((m, idx) => ({ module: m, revision: `new-cloud-${idx}` })),
        completion: Promise.resolve(),
      }),
      currentState: () => localState,
    }
  );
  assert.equal(cloudChoiceRes.status, 'confirmed');
  assert.equal(backupSavedCloud, true);
  if (cloudChoiceRes.status === 'confirmed') {
    assert.equal(cloudChoiceRes.reconciledState.notes.postits[0]?.id, 'remote-note');
    assert.equal(cloudChoiceRes.reconciledState.resale.inventory[0]?.id, 'remote-item');
  }

  // 2) Elegir "Conservar este dispositivo"
  const publishedModules: SyncModuleKey[] = [];
  const localChoiceRes = await executeAuthorizedConflictReconciliation(
    buildRecord(),
    localState,
    {
      authorized: true,
      choices: { resale: 'local', notes: 'local', profile: 'local' },
    },
    {
      saveConflict: () => true,
      saveBackup: () => true,
      publish: async (_state, mods) => {
        publishedModules.push(...mods);
        return {
          writes: mods.map((m, idx) => ({ module: m, revision: `new-local-${idx}` })),
          completion: Promise.resolve(),
        };
      },
      currentState: () => localState,
    }
  );
  assert.equal(localChoiceRes.status, 'confirmed');
  assert.deepEqual(new Set(publishedModules), new Set(['resale', 'notes', 'profile']));
  if (localChoiceRes.status === 'confirmed') {
    assert.equal(localChoiceRes.reconciledState.notes.postits[0]?.id, 'local-note');
    assert.equal(localChoiceRes.reconciledState.resale.inventory[0]?.id, 'local-item');
  }

  // 3) Renderizado de CloudConflictModal: cero jerga técnica, cero azules, cero checkbox nativo
  const modalHtml = renderToStaticMarkup(
    <CloudConflictModal
      modules={['resale', 'tasks', 'context', 'checkout']}
      localState={localState}
      remoteState={remoteState}
      recommendedSide="cloud"
      onUseCloud={() => {}}
      onUseLocal={() => {}}
      onExportConflict={() => {}}
      onClose={() => {}}
    />
  );
  assert.match(modalHtml, /Hay cambios distintos entre este dispositivo y la nube/);
  assert.match(modalHtml, /Usar datos de la nube/);
  assert.match(modalHtml, /Conservar este dispositivo/);
  assert.match(modalHtml, /Recomendado/);
  assert.match(modalHtml, /Opciones avanzadas: revisar módulo por módulo/);
  assert.match(modalHtml, /aria-label="Cerrar"/);
  assert.doesNotMatch(modalHtml, /type="checkbox"/);
  assert.doesNotMatch(modalHtml, /var\(--blue\)|bg-blue-/);
  assert.doesNotMatch(modalHtml, /\b(resale|tasks|context|checkout)\b/);
  assert.doesNotMatch(modalHtml, /1795561029675|Local archivado|Revisiones base/);
});

test('Bloque 23.4: Activación de Candado privado con contraseña de bóveda => wrap/unwrap con contraseña Y respaldo de emergencia (Firestore-rules compatible)', async () => {
  const mem = installMemoryStorage();
  _resetDeviceTrustFallbackStore();
  const userId = 'usr-b23-vault';
  const vaultPassword = 'MiBovedaSegura!2026';

  try {
    const { recoveryKeyFormatted, sessionMdek, envelope } = await provisionZeroKnowledgeKeys(userId, {
      vaultPassword,
      pbkdf2Iterations: 100_000,
    });

    // Cumplimiento estricto de firestore.rules (isValidWrappedKeyEnvelope)
    assert.equal(isWrappedKeyEnvelope(envelope), true);
    assert.equal(validateEnvelopeUserBinding(envelope, userId), true);
    assert.equal(hasVaultPassword(envelope), true);
    assert.ok(envelope.kdf.info.length <= 256, `kdf.info length ${envelope.kdf.info.length} <= 256`);
    assert.ok(envelope.wrappedMdek.ciphertext.length <= 1024);
    assert.equal(envelope.kdf.algorithm, 'HKDF-SHA-256');
    assert.deepEqual(
      Object.keys(envelope).sort(),
      ['aad', 'algorithm', 'createdAt', 'cryptoVersion', 'kdf', 'keyFormatVersion', 'wrappedMdek']
    );

    // Cifrar un módulo real con sessionMdek
    const encryptedNotes = await encryptSyncModule(
      { notes: { postits: [{ id: 'n1', text: 'Secreto' }] } },
      sessionMdek,
      'notes',
      userId
    );

    // 1) Desbloquear en otro dispositivo con la Contraseña de bóveda
    const keyFromPassword = await unlockMdekWithVaultPassword(vaultPassword, envelope, userId);
    const decryptedByPassword = (await decryptSyncModule(encryptedNotes, keyFromPassword, 'notes', userId)) as any;
    assert.equal(decryptedByPassword.notes.postits[0].text, 'Secreto');

    // Contraseña incorrecta debe fallar
    await assert.rejects(
      () => unlockMdekWithVaultPassword('otra-clave-erronea', envelope, userId),
      CryptoDecryptionError
    );

    // 2) Desbloquear con la Clave de recuperación de emergencia (misma MDEK!)
    const keyFromRecovery = await unlockMdekWithRecoveryKey(recoveryKeyFormatted, envelope, userId);
    const decryptedByRecovery = (await decryptSyncModule(encryptedNotes, keyFromRecovery, 'notes', userId)) as any;
    assert.equal(decryptedByRecovery.notes.postits[0].text, 'Secreto');

    // 3) unlockDeviceWithVaultPassword end-to-end con handlers
    cryptoSession.lock();
    const handlers: CapabilityStorageHandlers = {
      getCapability: async () => null,
      setCapability: async () => {},
      getKeyEnvelope: async () => envelope,
      setKeyEnvelope: async () => {},
    };
    const unlocked = await unlockDeviceWithVaultPassword(
      userId,
      vaultPassword,
      null,
      { module: 'notes', envelope: encryptedNotes },
      undefined,
      handlers
    );
    assert.equal(cryptoSession.isUnlocked(userId), true);
    assert.equal(unlocked.envelope.aad, envelope.aad);

    // 4) Extracción desde archivo de respaldo .txt
    const fileContent = `CELESTIAN LIFEOS — RESPALDO DE EMERGENCIA\n\nCLAVE DE RECUPERACIÓN:\n${recoveryKeyFormatted}\n\nAVISO:\nGuardalo.`;
    const extracted = await extractRecoveryKeyFromText(fileContent);
    assert.equal(extracted, recoveryKeyFormatted);

    // 5) UnlockDeviceModal con contraseña de bóveda renderiza campo autocompletable y link discreto
    const unlockHtml = renderToStaticMarkup(
      <UnlockDeviceModal
        isOpen={true}
        onClose={() => {}}
        userId={userId}
        userEmail="ana@example.com"
        envelopeOverride={envelope}
      />
    );
    assert.match(unlockHtml, /type="password"/);
    assert.match(unlockHtml, /autoComplete="current-password"/);
    assert.match(unlockHtml, /Usar clave o archivo de recuperación/);
    assert.match(unlockHtml, /bg-\[#4F46E5\]/);
    assert.doesNotMatch(unlockHtml, /var\(--blue\)|bg-blue-/);
  } finally {
    cryptoSession.lock();
    clearWrappedKeyEnvelope(userId);
    _resetDeviceTrustFallbackStore();
    mem.restore();
  }
});

test('Bloque 23.5: Cuenta legacy con clave de recuperación => desbloquea sin romperse, agrega contraseña de bóveda y desactiva E2EE sin perder ningún módulo', async () => {
  const mem = installMemoryStorage();
  _resetDeviceTrustFallbackStore();
  const userId = 'usr-b23-legacy';

  try {
    // 1) Crear cuenta legacy (solo recovery key, sin contraseña de bóveda)
    const { recoveryKeyFormatted, sessionMdek, envelope: legacyEnvelope } = await provisionZeroKnowledgeKeys(userId);
    assert.equal(hasVaultPassword(legacyEnvelope), false);

    // Construir estado real con datos en múltiples módulos + historial de gym
    const state = defaultState();
    state.profile.name = 'Usuario Legacy';
    state.notes.postits.push({
      id: 'legacy-note-1',
      text: 'Nota legacy preservada',
      date: todayISO(),
      createdAt: new Date().toISOString(),
    });
    state.finance.transactions.push({
      id: 'legacy-tx-1',
      date: todayISO(),
      type: 'gasto',
      amount: 1250,
      category: 'Comida',
      fixed: 'variable',
      note: 'Almuerzo legacy',
      currency: 'UYU',
    });

    // Simular Firestore con los 15 módulos cifrados + 1 chunk de historial de gimnasio cifrado
    const cloudModules = new Map<string, Record<string, any>>();
    for (const mod of SYNC_MODULES) {
      const enc = await encryptSyncModule(syncModuleData(state, mod), sessionMdek, mod, userId);
      cloudModules.set(mod, {
        module: mod,
        isEncrypted: true,
        syncProtocolVersion: 2,
        revision: `enc-rev-${mod}`,
        data: enc,
      });
    }
    const chunkEnc = await encryptSyncModule(
      { sessions: [{ id: 'old-gym-1', date: '2025-01-10', weekLabel: 'Semana 1', exercises: [] }] },
      sessionMdek,
      'gym_history_chunk_0',
      userId
    );
    cloudModules.set('gym_history_chunk_0', {
      module: 'gym_history_chunk_0',
      isEncrypted: true,
      syncProtocolVersion: 2,
      revision: 'enc-rev-chunk0',
      data: chunkEnc,
    });

    let storedCloudEnvelope: WrappedKeyEnvelope | null = legacyEnvelope;
    let storedCap: AccountSyncCapability = {
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted',
      encryptedModules: [...SYNC_MODULES],
      updatedAt: new Date().toISOString(),
    };

    const capHandlers: CapabilityStorageHandlers = {
      getCapability: async () => storedCap,
      setCapability: async (_u, cap) => {
        storedCap = cap;
      },
      getKeyEnvelope: async () => storedCloudEnvelope,
      setKeyEnvelope: async (_u, env) => {
        storedCloudEnvelope = env;
      },
    };

    // 2) Desbloquear cuenta legacy en segundo dispositivo con su clave vieja
    cryptoSession.lock();
    clearWrappedKeyEnvelope(userId);
    const unlockedLegacy = await unlockDeviceWithRecoveryKey(
      userId,
      recoveryKeyFormatted,
      null,
      { module: 'notes', envelope: cloudModules.get('notes')!.data },
      undefined,
      capHandlers
    );
    assert.equal(cryptoSession.isUnlocked(userId), true);
    assert.equal(hasVaultPassword(unlockedLegacy.envelope), false);

    // 3) Agregar contraseña de bóveda a la cuenta legacy sin cambiar MDEK ni romper clave vieja
    const upgraded = await setVaultPasswordForAccount(
      userId,
      {
        newVaultPassword: 'NuevaBovedaLegacy2026!',
        currentRecoveryKey: recoveryKeyFormatted,
        pbkdf2Iterations: 100_000,
      },
      undefined,
      capHandlers
    );
    assert.equal(hasVaultPassword(upgraded.envelope), true);
    assert.equal(storedCloudEnvelope?.kdf.info, upgraded.envelope.kdf.info);

    // Confirmar que la nueva contraseña descifra los módulos ya cifrados
    const keyAfterUpgrade = await unlockMdekWithVaultPassword('NuevaBovedaLegacy2026!', upgraded.envelope, userId);
    const notesCheck = (await decryptSyncModule(cloudModules.get('notes')!.data, keyAfterUpgrade, 'notes', userId)) as any;
    assert.equal(notesCheck.notes.postits[0].text, 'Nota legacy preservada');

    // Confirmar que la clave de recuperación original también sigue funcionando
    const recoveryCheckKey = await unlockMdekWithRecoveryKey(recoveryKeyFormatted, upgraded.envelope, userId);
    const financeCheck = (await decryptSyncModule(cloudModules.get('finance')!.data, recoveryCheckKey, 'finance', userId)) as any;
    assert.equal(financeCheck.finance.transactions[0].note, 'Almuerzo legacy');

    // 4) Fallo de verificación antes de desactivar E2EE NO borra nada en la nube
    let clearedCalledOnError = false;
    const corruptedHandlers: DisableE2EEHandlers = {
      listRemoteModuleDocs: async () => [
        ...Array.from(cloudModules.entries()).map(([id, data]) => ({
          id,
          data: id === 'notes' ? { ...data, data: { ...data.data, ciphertext: 'corrupted-ciphertext' } } : data,
        })),
      ],
      clearEncryptedCloudState: async () => {
        clearedCalledOnError = true;
      },
      uploadPlaintextModule: async () => {},
      setPlaintextCapability: async () => {},
      verifyPlaintextModules: async () => [],
    };
    await assert.rejects(
      () => disableE2EEProtection(userId, keyAfterUpgrade, state, { handlers: corruptedHandlers }),
      /No se pudo verificar el módulo/
    );
    assert.equal(clearedCalledOnError, false, 'Nunca debe limpiar la nube si falla la verificación previa');

    // 5) Desactivación segura completa del candado privado: descifra, verifica, limpia y re-sube los 15 módulos + chunk en texto limpio
    const plaintextCloud = new Map<string, Record<string, any>>();
    const disableHandlers: DisableE2EEHandlers = {
      listRemoteModuleDocs: async () =>
        Array.from(cloudModules.entries()).map(([id, data]) => ({ id, data })),
      clearEncryptedCloudState: async () => {
        cloudModules.clear();
        storedCloudEnvelope = null;
      },
      uploadPlaintextModule: async (_u, docId, payload) => {
        plaintextCloud.set(docId, payload);
      },
      setPlaintextCapability: async (_u, cap) => {
        storedCap = cap;
      },
      verifyPlaintextModules: async () =>
        Array.from(plaintextCloud.entries()).map(([id, payload]) => ({
          id,
          isEncrypted: payload.isEncrypted,
          data: payload.data,
        })),
    };

    const disableRes = await disableE2EEProtection(userId, keyAfterUpgrade, defaultState(), {
      handlers: disableHandlers,
    });

    assert.equal(disableRes.success, true);
    assert.equal(disableRes.uploadedModules.length, SYNC_MODULES.length);
    assert.equal(storedCap.encryptionState, 'plaintext');
    assert.equal(storedCloudEnvelope, null);
    assert.equal(loadWrappedKeyEnvelope(userId), null);
    assert.equal(cryptoSession.isUnlocked(userId), false);
    assert.equal(await isDeviceEnrolled(userId), false);

    // Verificar que los 15 módulos + el chunk histórico se re-subieron limpios y sin perder datos
    for (const mod of SYNC_MODULES) {
      const uploaded = plaintextCloud.get(mod);
      assert.ok(uploaded, `Módulo ${mod} debe estar re-subido`);
      assert.equal(uploaded.isEncrypted, false);
      assert.equal(uploaded.syncProtocolVersion, 1);
    }
    assert.equal(plaintextCloud.get('notes')?.data?.notes?.postits?.[0]?.text, 'Nota legacy preservada');
    assert.equal(plaintextCloud.get('finance')?.data?.finance?.transactions?.[0]?.note, 'Almuerzo legacy');
    assert.equal(plaintextCloud.get('gym_history_chunk_0')?.isEncrypted, false);
    assert.equal(plaintextCloud.get('gym_history_chunk_0')?.data?.sessions?.[0]?.id, 'old-gym-1');
  } finally {
    cryptoSession.lock();
    clearWrappedKeyEnvelope(userId);
    _resetDeviceTrustFallbackStore();
    mem.restore();
  }
});
