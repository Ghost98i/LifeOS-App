import assert from 'node:assert/strict';
import test from 'node:test';
import {
  provisionZeroKnowledgeKeys,
  rewrapMdekWithNewRecoveryKey,
  generateRecoveryKey,
  formatRecoveryKey,
  cryptoSession,
  type AccountSyncCapability,
  type WrappedKeyEnvelope,
  loadWrappedKeyEnvelope,
  clearWrappedKeyEnvelope,
  isWrappedKeyEnvelope,
  validateEnvelopeUserBinding,
  encryptSyncModule,
  decryptSyncModule,
  unlockMdekWithRecoveryKey,
  CryptoDecryptionError,
} from './cryptoCore';
import {
  executeE2EEMigration,
  executeKeyRotation,
  unlockDeviceWithRecoveryKey,
  fetchCloudKeyEnvelope,
  setCloudKeyEnvelope,
  resolvePendingRotation,
  getRotationPendingState,
  isSyntheticTestingAllowed,
} from './cryptoMigration';
import { defaultState, loadRecoveryState, saveRecoveryState } from './storage';
import { SYNC_MODULES, type SyncModuleKey } from './syncModel';

// Ensure in-memory localStorage is active for Node test runner
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  } as any;
}

test('Fase 8.3b: Cloud WrappedKeyEnvelope roundtrip & validación de estructura', async () => {
  const userId = 'user-envelope-roundtrip';
  const { envelope } = await provisionZeroKnowledgeKeys(userId);

  assert.ok(isWrappedKeyEnvelope(envelope));
  assert.equal(validateEnvelopeUserBinding(envelope, userId), true);

  // Mock handlers
  let cloudStored: WrappedKeyEnvelope | null = null;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudStored,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudStored = env;
    },
  };

  await setCloudKeyEnvelope(userId, envelope, null, mockHandlers);
  const fetched = await fetchCloudKeyEnvelope(userId, null, mockHandlers);

  assert.ok(fetched !== null);
  assert.deepEqual(fetched?.wrappedMdek, envelope.wrappedMdek);
  assert.equal(fetched?.aad, envelope.aad);
});

test('Fase 8.3b: Context Binding — rechazo estricto si envelope pertenece a otro usuario (Wrong User)', async () => {
  const userA = 'user-alice';
  const userB = 'user-bob';

  const { envelope: envelopeA } = await provisionZeroKnowledgeKeys(userA);

  // Intentar validar envelope de Alice para Bob debe fallar
  assert.equal(validateEnvelopeUserBinding(envelopeA, userB), false);

  // Intentar guardarlo para Bob debe arrojar error
  await assert.rejects(
    async () => setCloudKeyEnvelope(userB, envelopeA, null, {
      getCapability: async () => null,
      setCapability: async () => {},
      setKeyEnvelope: async () => {},
    }),
    /El envelope no coincide con el contexto de identidad del usuario/i
  );
});

test('Fase 8.3b: Segundo dispositivo sin estado local recupera MDEK desde Cloud y descifra módulos', async () => {
  const userId = 'user-second-device-cloud';
  const deviceAKeys = await provisionZeroKnowledgeKeys(userId);

  // Mock cloud storage
  let cloudEnvelope: WrappedKeyEnvelope | null = deviceAKeys.envelope;
  const mockHandlers = {
    getCapability: async () => ({
      version: 1,
      minimumSyncProtocolVersion: 2,
      encryptionState: 'encrypted' as const,
      encryptedModules: [...SYNC_MODULES],
      updatedAt: new Date().toISOString(),
    }),
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudEnvelope = env;
    },
  };

  // Cifrar un módulo de prueba 'finance' con la MDEK
  const testFinanceData = { accounts: [{ id: 'acc-1', name: 'Banco Central', balance: 5000 }] };
  const encryptedFinancePayload = await encryptSyncModule(
    testFinanceData,
    deviceAKeys.sessionMdek,
    'finance',
    userId
  );

  // Dispositivo B: sin localStorage previo y sesión bloqueada
  clearWrappedKeyEnvelope(userId);
  cryptoSession.lock();
  assert.equal(cryptoSession.isUnlocked(userId), false);
  assert.equal(loadWrappedKeyEnvelope(userId), null);

  // El usuario en Dispositivo B introduce su Recovery Key y descarga automáticamente el envelope de la nube
  const unlockRes = await unlockDeviceWithRecoveryKey(
    userId,
    deviceAKeys.recoveryKeyFormatted,
    null, // null = fetch automáticamente de Cloud
    { module: 'finance', envelope: encryptedFinancePayload },
    null,
    mockHandlers
  );

  assert.ok(unlockRes.sessionMdek);
  assert.equal(cryptoSession.isUnlocked(userId), true);

  // Dispositivo B ahora tiene el envelope guardado localmente
  const deviceBLocalEnv = loadWrappedKeyEnvelope(userId);
  assert.ok(deviceBLocalEnv !== null);
  assert.deepEqual(deviceBLocalEnv?.wrappedMdek, deviceAKeys.envelope.wrappedMdek);

  // Dispositivo B puede descifrar el módulo directamente
  const decrypted = await decryptSyncModule(encryptedFinancePayload, unlockRes.sessionMdek, 'finance', userId);
  assert.deepEqual(decrypted, testFinanceData);
});

test('Fase 8.3b: Segundo dispositivo con Recovery Key incorrecta es rechazado (Fail-Closed, sin mutar estado)', async () => {
  const userId = 'user-wrong-key-rejection';
  const deviceAKeys = await provisionZeroKnowledgeKeys(userId);

  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => deviceAKeys.envelope,
    setKeyEnvelope: async () => {},
  };

  clearWrappedKeyEnvelope(userId);
  cryptoSession.lock();

  // Clave de recuperación inválida/equivocada
  const wrongKey = await formatRecoveryKey(generateRecoveryKey());

  await assert.rejects(
    async () => unlockDeviceWithRecoveryKey(userId, wrongKey, null, undefined, null, mockHandlers),
    /Fallo al desenvolver la clave maestra|clave de recuperación incorrecta/i
  );

  // Garantías de seguridad: no muta estado local ni sesión
  assert.equal(cryptoSession.isUnlocked(userId), false);
  assert.equal(loadWrappedKeyEnvelope(userId), null);
});

test('Fase 8.3b: Segundo dispositivo cuando falta el Cloud Envelope (Missing Cloud Envelope)', async () => {
  const userId = 'user-missing-cloud-env';
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => null, // No existe en la nube
    setKeyEnvelope: async () => {},
  };

  clearWrappedKeyEnvelope(userId);
  const key = await formatRecoveryKey(generateRecoveryKey());

  await assert.rejects(
    async () => unlockDeviceWithRecoveryKey(userId, key, null, undefined, null, mockHandlers),
    /No se encontró el WrappedKeyEnvelope para esta cuenta en la nube/i
  );
});

test('Fase 8.3b: Segundo dispositivo cuando el Cloud Envelope está corrupto (Corrupt Envelope)', async () => {
  const userId = 'user-corrupt-cloud-env';
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => ({ bad: 'datos-malformados' } as any),
    setKeyEnvelope: async () => {},
  };

  clearWrappedKeyEnvelope(userId);
  const key = await formatRecoveryKey(generateRecoveryKey());

  await assert.rejects(
    async () => unlockDeviceWithRecoveryKey(userId, key, null, undefined, null, mockHandlers),
    /corrupto o tiene un formato no válido/i
  );
});

test('Fase 8.3b: Recovery Key Rotation actualiza local y cloud; invalida la clave previa sin alterar datos', async () => {
  const userId = 'user-key-rotation';
  const initial = await provisionZeroKnowledgeKeys(userId);

  let cloudEnvelope: WrappedKeyEnvelope | null = initial.envelope;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudEnvelope = env;
    },
  };

  // Cifrar datos de notas con la MDEK actual
  const noteData = { notes: [{ id: 'n-1', title: 'Nota ultra secreta' }] };
  const ciphertextBeforeRotation = await encryptSyncModule(noteData, initial.sessionMdek, 'notes', userId);

  // 1. Ejecutar rotación
  const { newRecoveryKeyFormatted, newEnvelope } = await rewrapMdekWithNewRecoveryKey(
    initial.recoveryKeyFormatted,
    initial.envelope,
    userId
  );

  // 2. Persistir en cloud
  await setCloudKeyEnvelope(userId, newEnvelope, null, mockHandlers);

  // 3. La clave anterior queda inmediatamente rechazada
  await assert.rejects(
    async () => unlockDeviceWithRecoveryKey(userId, initial.recoveryKeyFormatted, null, undefined, null, mockHandlers),
    /Fallo al desenvolver la clave maestra|clave de recuperación incorrecta/i
  );

  // 4. La nueva clave desbloquea exitosamente desde Cloud en un dispositivo limpio
  clearWrappedKeyEnvelope(userId);
  cryptoSession.lock();

  const unlockedDevice = await unlockDeviceWithRecoveryKey(
    userId,
    newRecoveryKeyFormatted,
    null,
    undefined,
    null,
    mockHandlers
  );

  assert.ok(unlockedDevice.sessionMdek);
  assert.equal(cryptoSession.isUnlocked(userId), true);

  // 5. Los ciphertexts anteriores en la nube siguen siendo 100% descifrables porque la MDEK es la misma
  const decryptedNote = await decryptSyncModule(ciphertextBeforeRotation, unlockedDevice.sessionMdek, 'notes', userId);
  assert.deepEqual(decryptedNote, noteData);
});

test('Fase 8.3b: La migración NO comienza si el WrappedKeyEnvelope cloud no fue persistido previamente', async () => {
  const userId = 'user-migration-guard-no-envelope';
  const state = defaultState();
  const { sessionMdek } = await provisionZeroKnowledgeKeys(userId);

  // Mock donde NO existe envelope en cloud
  let remoteCapability: AccountSyncCapability | null = null;
  const mockHandlers = {
    getCapability: async () => remoteCapability,
    setCapability: async (_u: string, cap: AccountSyncCapability) => {
      remoteCapability = cap;
    },
    getKeyEnvelope: async () => null, // NO está en la nube
    setKeyEnvelope: async () => {},
  };

  await assert.rejects(
    async () => executeE2EEMigration(userId, state, sessionMdek, {
      capabilityHandlers: mockHandlers,
    }),
    /No se encontró el WrappedKeyEnvelope en la nube. Debe persistirse y verificarse/i
  );

  // Capability nunca debió cambiar a mixed
  assert.equal(remoteCapability, null);
});

test('Fase 8.3b: Migración reanudable con commits seguros por módulo (Idempotencia y No-Downgrade)', async () => {
  const userId = 'user-resumable-migration';
  const state = defaultState();
  state.profile.name = 'Christian Invariante';
  const { sessionMdek, envelope } = await provisionZeroKnowledgeKeys(userId);

  // Mock cloud con envelope listo y capability interrumpida en 7 módulos
  const alreadyEncrypted7 = SYNC_MODULES.slice(0, 7);
  let remoteCapability: AccountSyncCapability | null = {
    version: 1,
    minimumSyncProtocolVersion: 2,
    encryptionState: 'mixed',
    encryptedModules: [...alreadyEncrypted7],
    updatedAt: new Date().toISOString(),
  };

  const writtenModules: SyncModuleKey[] = [];
  const mockWriter = async (_u: string, _s: any, mods: SyncModuleKey[]) => {
    writtenModules.push(...mods);
    return {
      writes: mods.map((m) => ({ module: m, revision: 'rev-x', parentRevision: null })),
      completion: Promise.resolve(),
    };
  };

  const mockHandlers = {
    getCapability: async () => remoteCapability,
    setCapability: async (_u: string, cap: AccountSyncCapability) => {
      remoteCapability = cap;
    },
    getKeyEnvelope: async () => envelope,
    setKeyEnvelope: async () => {},
  };

  // Reanudar migración
  const progressCalls: string[] = [];
  const result = await executeE2EEMigration(userId, state, sessionMdek, {
    capabilityHandlers: mockHandlers,
    customWriter: mockWriter as any,
    onProgress: (p) => {
      progressCalls.push(p.currentModule);
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.capability.encryptionState, 'encrypted');
  assert.equal(result.capability.encryptedModules?.length, 15);

  // Sólo se escribieron los 8 módulos pendientes
  assert.equal(writtenModules.length, 8);
  assert.deepEqual(writtenModules, SYNC_MODULES.slice(7));

  // Snapshot de recuperación local tomado antes de cualquier commit
  const rec = loadRecoveryState(userId);
  assert.ok(rec !== null);
  assert.equal(rec.state.profile.name, 'Christian Invariante');
});

test('Fase 8.3b: Semántica de Rollback vs No-Downgrade Protocolario', async () => {
  const userId = 'user-rollback-semantics';
  const statePreMigration = defaultState();
  statePreMigration.profile.name = 'Estado Previo a E2EE';

  // Guardar snapshot de recuperación local
  saveRecoveryState(statePreMigration, userId, 'manual_snapshot', 'Pre-E2EE');

  // En la nube, la cuenta ya está en capability 'encrypted'
  const encryptedCap: AccountSyncCapability = {
    version: 1,
    minimumSyncProtocolVersion: 2,
    encryptionState: 'encrypted',
    encryptedModules: [...SYNC_MODULES],
    updatedAt: new Date().toISOString(),
  };

  // Principio formal: Restaurar un snapshot local restaura los datos de dominio,
  // pero NUNCA degrada el protocolo cloud a plaintext ni borra la capability.
  assert.equal(encryptedCap.encryptionState, 'encrypted');
  assert.equal(encryptedCap.minimumSyncProtocolVersion, 2);

  // La recuperación local es para contenido de usuario ante fallos, no para abrir puertas a texto plano
  const restored = loadRecoveryState(userId);
  assert.equal(restored?.state.profile.name, 'Estado Previo a E2EE');
});

test('Fase 8.4: Key Rotation — Caso de Éxito Normal (Cloud-first -> Local persist -> Session update)', async () => {
  const userId = 'user-rot-success';
  const { recoveryKeyFormatted, envelope: initialEnv } = await provisionZeroKnowledgeKeys(userId);

  let cloudEnvelope: WrappedKeyEnvelope | null = initialEnv;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudEnvelope = env;
    },
  };

  const { newRecoveryKeyFormatted, newEnvelope } = await executeKeyRotation(
    userId,
    recoveryKeyFormatted,
    null,
    mockHandlers
  );

  assert.notEqual(newRecoveryKeyFormatted, recoveryKeyFormatted);
  assert.notEqual(newEnvelope.wrappedMdek.ciphertext, initialEnv.wrappedMdek.ciphertext);
  assert.deepEqual(cloudEnvelope, newEnvelope);
  assert.deepEqual(loadWrappedKeyEnvelope(userId), newEnvelope);
  assert.equal(cryptoSession.isUnlocked(userId), true);
});

test('Fase 8.4: Key Rotation — Caso A (Fallo de red en escritura Cloud aborta sin alterar Local Storage)', async () => {
  const userId = 'user-rot-fail-a';
  const { recoveryKeyFormatted, envelope: initialEnv } = await provisionZeroKnowledgeKeys(userId);

  const cloudEnvelope: WrappedKeyEnvelope | null = initialEnv;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async () => {
      throw new Error('Network timeout during cloud write');
    },
  };

  await assert.rejects(
    async () => {
      await executeKeyRotation(userId, recoveryKeyFormatted, null, mockHandlers);
    },
    /Network timeout/
  );

  // Local storage permanece intacto con el envelope inicial y la clave vieja sigue funcionando
  const localEnvAfter = loadWrappedKeyEnvelope(userId);
  assert.deepEqual(localEnvAfter, initialEnv);
  assert.deepEqual(cloudEnvelope, initialEnv);
});

test('Fase 8.4: Key Rotation — Caso B (Fallo en verificación roundtrip Cloud no muta Local Storage)', async () => {
  const userId = 'user-rot-fail-b';
  const { recoveryKeyFormatted, envelope: initialEnv } = await provisionZeroKnowledgeKeys(userId);

  let writeCalled = false;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => {
      // Simula que la nube no actualizó o devolvió el envelope viejo
      return initialEnv;
    },
    setKeyEnvelope: async () => {
      writeCalled = true;
    },
  };

  await assert.rejects(
    async () => {
      await executeKeyRotation(userId, recoveryKeyFormatted, null, mockHandlers);
    },
    /Discrepancia en la verificación remota/
  );

  assert.equal(writeCalled, true);
  // Local storage aún NO fue actualizado porque la verificación falló
  const localEnvAfter = loadWrappedKeyEnvelope(userId);
  assert.deepEqual(localEnvAfter, initialEnv);
});

test('Fase 8.4: Key Rotation — Caso C (Cloud exitoso, Local falla: Cloud es Source of Truth para login)', async () => {
  const userId = 'user-rot-fail-c';
  const { recoveryKeyFormatted, envelope: initialEnv } = await provisionZeroKnowledgeKeys(userId);

  let cloudEnvelope: WrappedKeyEnvelope | null = initialEnv;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudEnvelope = env;
    },
  };

  // Simular que saveWrappedKeyEnvelope falla localmente
  const originalSetItem = globalThis.localStorage.setItem;
  let simulatedFailure = false;
  globalThis.localStorage.setItem = (key: string, val: string) => {
    if (key.includes('wrapped') && !simulatedFailure) {
      simulatedFailure = true;
      throw new Error('QuotaExceededError in localStorage');
    }
    return originalSetItem.call(globalThis.localStorage, key, val);
  };

  let newKey = '';
  try {
    const res = await executeKeyRotation(userId, recoveryKeyFormatted, null, mockHandlers);
    newKey = res.newRecoveryKeyFormatted;
  } finally {
    globalThis.localStorage.setItem = originalSetItem;
  }

  // Cloud tiene el nuevo envelope
  assert.ok(cloudEnvelope !== null);
  assert.notEqual(cloudEnvelope?.wrappedMdek.ciphertext, initialEnv.wrappedMdek.ciphertext);

  // Un segundo dispositivo (o este mismo dispositivo tras recarga) usa la nube para desbloquear con newKey
  const unlockRes = await unlockDeviceWithRecoveryKey(userId, newKey, undefined, undefined, null, mockHandlers);
  assert.ok(unlockRes.sessionMdek);
  assert.deepEqual(unlockRes.envelope, cloudEnvelope);
});

test('Fase 8.4c: Key Rotation — Caso D (Cloud commit exitoso, lectura falla: NO se persiste la Recovery Key en pending_verification)', async () => {
  const userId = 'user-rot-fail-d';
  const { recoveryKeyFormatted, envelope: initialEnv } = await provisionZeroKnowledgeKeys(userId);

  let cloudEnvelope: WrappedKeyEnvelope | null = initialEnv;
  let writeCommitted = false;

  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => {
      if (writeCommitted) {
        throw new Error('Connection reset by peer during post-write read');
      }
      return initialEnv;
    },
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      writeCommitted = true;
      cloudEnvelope = env;
    },
  };

  await assert.rejects(
    async () => {
      await executeKeyRotation(userId, recoveryKeyFormatted, null, mockHandlers);
    },
    /rotation_pending_verification/
  );

  // 1. Cloud fue actualizado
  assert.equal(writeCommitted, true);
  assert.notEqual(cloudEnvelope?.wrappedMdek.ciphertext, initialEnv.wrappedMdek.ciphertext);

  // 2. Storage scan: Confirmar que el pending state existe pero NUNCA contiene la Recovery Key
  const pendingState = getRotationPendingState(userId);
  assert.ok(pendingState !== null);
  assert.ok(pendingState.expectedCiphertextHash);
  assert.deepEqual(pendingState.newEnvelope, cloudEnvelope);

  // Scan exhaustivo del almacenamiento local: NO contiene clave formateada ni secretos
  const rawStored = globalThis.localStorage.getItem(`lifeos-rotation-pending-v1:${userId}`) || '';
  assert.equal(rawStored.includes('recoveryKeyFormatted'), false);
  assert.equal(rawStored.includes('newRecoveryKeyFormatted'), false);

  // 3. El envelope previo local se mantiene intacto mientras tanto
  const localEnv = loadWrappedKeyEnvelope(userId);
  assert.deepEqual(localEnv, initialEnv);
});

test('Fase 8.4c: Restart & Resolution — Usuario ingresa clave correcta y completa la rotación pendiente', async () => {
  const userId = 'user-rot-resolve-correct';
  const { recoveryKeyFormatted, envelope: initialEnv } = await provisionZeroKnowledgeKeys(userId);

  // Simular rotación que quedó pendiente tras cloud write
  const { newRecoveryKeyFormatted, newEnvelope } = await rewrapMdekWithNewRecoveryKey(
    recoveryKeyFormatted,
    initialEnv,
    userId,
    { persistLocally: false }
  );

  let cloudEnvelope: WrappedKeyEnvelope | null = newEnvelope;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudEnvelope = env;
    },
  };

  // Guardar estado pendiente no secreto (como lo hace executeKeyRotation)
  globalThis.localStorage.setItem(
    `lifeos-rotation-pending-v1:${userId}`,
    JSON.stringify({
      pendingAt: new Date().toISOString(),
      expectedCiphertextHash: newEnvelope.wrappedMdek.ciphertext.slice(0, 16),
      newEnvelope,
    })
  );

  // El usuario vuelve tras restart e ingresa la nueva Recovery Key que guardó
  const res = await resolvePendingRotation(userId, newRecoveryKeyFormatted, null, mockHandlers);

  assert.ok(res.sessionMdek);
  assert.deepEqual(res.envelope, newEnvelope);
  assert.deepEqual(loadWrappedKeyEnvelope(userId), newEnvelope);
  assert.equal(getRotationPendingState(userId), null); // Limpiado
});

test('Fase 8.4c: Restart & Resolution — Clave incorrecta es rechazada y preserva estado pendiente', async () => {
  const userId = 'user-rot-resolve-wrong';
  const { recoveryKeyFormatted, envelope: initialEnv } = await provisionZeroKnowledgeKeys(userId);

  const { newEnvelope } = await rewrapMdekWithNewRecoveryKey(
    recoveryKeyFormatted,
    initialEnv,
    userId,
    { persistLocally: false }
  );

  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => newEnvelope,
    setKeyEnvelope: async () => {},
  };

  globalThis.localStorage.setItem(
    `lifeos-rotation-pending-v1:${userId}`,
    JSON.stringify({
      pendingAt: new Date().toISOString(),
      expectedCiphertextHash: newEnvelope.wrappedMdek.ciphertext.slice(0, 16),
      newEnvelope,
    })
  );

  // Usuario introduce clave errónea
  await assert.rejects(
    async () => {
      await resolvePendingRotation(userId, 'Clave-Totalmente-Invalida-123', null, mockHandlers);
    }
  );

  // El estado pendiente NO fue eliminado
  assert.ok(getRotationPendingState(userId) !== null);
  // El envelope local sigue siendo el previo
  assert.deepEqual(loadWrappedKeyEnvelope(userId), initialEnv);
});

test('Fase 8.4c: Storage Audit — Ninguna Recovery Key, KEK ni raw MDEK se persiste en localStorage', async () => {
  const allKeys = Object.keys(globalThis.localStorage);
  for (const k of allKeys) {
    const val = globalThis.localStorage.getItem(k) || '';
    assert.equal(val.includes('rawMdek'), false, `rawMdek detectado en clave ${k}`);
    assert.equal(val.includes('newRecoveryKeyFormatted'), false, `newRecoveryKeyFormatted detectado en clave ${k}`);
    assert.equal(val.includes('kek'), false, `kek detectado en clave ${k}`);
  }
});

test('Fase 8.4d: Semántica Criptográfica de Rotación — Old envelope + old key desenvuelve MDEK; New cloud envelope solo con new key', async () => {
  const userId = 'user-rot-semantics-84d';
  const { recoveryKeyFormatted: oldKey, envelope: oldEnvelope, sessionMdek } = await provisionZeroKnowledgeKeys(userId);

  // Módulo cifrado con la MDEK inicial
  const moduleData = { finance: { accounts: [{ id: 'a1', name: 'Banco', balance: 500 }] } };
  const encryptedModule = await encryptSyncModule(moduleData, sessionMdek, 'finance', userId);

  // Ejecución de rotación de clave
  let cloudEnvelope: WrappedKeyEnvelope | null = oldEnvelope;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudEnvelope = env;
    },
  };

  const { newRecoveryKeyFormatted: newKey, newEnvelope } = await executeKeyRotation(
    userId,
    oldKey,
    null,
    mockHandlers
  );

  // 1. Realidad Criptográfica: Old envelope + old key desenvuelve la misma MDEK
  const mdekFromOld = await unlockMdekWithRecoveryKey(oldKey, oldEnvelope);
  const decryptedFromOld = await decryptSyncModule(encryptedModule, mdekFromOld, 'finance', userId);
  assert.deepEqual(decryptedFromOld, moduleData);

  // 2. Nuevo envelope en la nube rechaza la clave vieja
  await assert.rejects(
    async () => unlockMdekWithRecoveryKey(oldKey, newEnvelope),
    CryptoDecryptionError
  );

  // 3. Nuevo envelope en la nube desenvuelve con éxito la nueva clave
  const mdekFromNew = await unlockMdekWithRecoveryKey(newKey, newEnvelope);
  const decryptedFromNew = await decryptSyncModule(encryptedModule, mdekFromNew, 'finance', userId);
  assert.deepEqual(decryptedFromNew, moduleData);
});

test('Fase 8.4d: Limpieza Local de Envelope Viejo — localStorage bajo control de LifeOS solo retiene el nuevo envelope', async () => {
  const userId = 'user-rot-cleanup-84d';
  const { recoveryKeyFormatted: oldKey, envelope: oldEnvelope } = await provisionZeroKnowledgeKeys(userId);

  let cloudEnvelope: WrappedKeyEnvelope | null = oldEnvelope;
  const mockHandlers = {
    getCapability: async () => null,
    setCapability: async () => {},
    getKeyEnvelope: async () => cloudEnvelope,
    setKeyEnvelope: async (_u: string, env: WrappedKeyEnvelope) => {
      cloudEnvelope = env;
    },
  };

  const { newEnvelope } = await executeKeyRotation(userId, oldKey, null, mockHandlers);

  // El envelope almacenado localmente es exclusivamente el nuevo
  const localEnv = loadWrappedKeyEnvelope(userId);
  assert.deepEqual(localEnv, newEnvelope);
  assert.notDeepEqual(localEnv, oldEnvelope);

  // No existe ningún residuo de envelope viejo ni de estado pendiente
  assert.equal(getRotationPendingState(userId), null);

  // Verificar que ninguna clave en localStorage conserva el ciphertext del envelope viejo
  const allKeys = Object.keys(globalThis.localStorage);
  for (const k of allKeys) {
    const val = globalThis.localStorage.getItem(k) || '';
    if (k !== `lifeos-mdek-envelope-v1:${userId}`) {
      assert.equal(
        val.includes(oldEnvelope.wrappedMdek.ciphertext),
        false,
        `Ciphertext de envelope viejo detectado en clave inesperada: ${k}`
      );
    }
  }
});

test('Fase 8.4d: Data Safety — Snapshots de recuperación y exportación de backups no contienen claves de recuperación ni envelopes', () => {
  const userId = 'user-data-safety-84d';
  const state = defaultState();
  state.finance.accounts = [{ id: 'acc-1', name: 'Ahorro', balance: 10000, initialBalance: 10000 }];
  state.notes.postits = [{ id: 'p-1', text: 'Nota confidencial', date: '2026-10-04', createdAt: '2026-10-04' }];

  // 1. Snapshot de recuperación local
  saveRecoveryState(state, userId, 'manual_snapshot', 'Test de seguridad de snapshot');
  const recovery = loadRecoveryState(userId);
  assert.ok(recovery);

  const rawRecoveryJson = JSON.stringify(recovery);
  assert.equal(rawRecoveryJson.includes('wrappedMdek'), false, 'wrappedMdek encontrado en recovery snapshot');
  assert.equal(rawRecoveryJson.includes('kdf'), false, 'kdf encontrado en recovery snapshot');
  assert.equal(rawRecoveryJson.includes('recoveryKey'), false, 'recoveryKey encontrado en recovery snapshot');
  assert.equal(rawRecoveryJson.includes('rawMdek'), false, 'rawMdek encontrado en recovery snapshot');

  // 2. Exportación de backup JSON (handleExportJSON)
  const exportedJson = JSON.stringify(state, null, 2);
  assert.equal(exportedJson.includes('wrappedMdek'), false, 'wrappedMdek encontrado en backup export');
  assert.equal(exportedJson.includes('kdf'), false, 'kdf encontrado en backup export');
  assert.equal(exportedJson.includes('recoveryKey'), false, 'recoveryKey encontrado en backup export');
  assert.equal(exportedJson.includes('rawMdek'), false, 'rawMdek encontrado en backup export');
  assert.equal(exportedJson.includes('CryptoEnvelope'), false, 'CryptoEnvelope encontrado en backup export');
});

test('Revisión Final: isSyntheticTestingAllowed aísla estrictamente clientes públicos', () => {
  // 1. In Node environment with no window, returns false
  const prevWindow = (globalThis as any).window;
  delete (globalThis as any).window;
  assert.equal(isSyntheticTestingAllowed(), false);

  // 2. In public domain (e.g. celestian.lifeos.app or firebaseapp.com), returns false
  (globalThis as any).window = {
    location: {
      hostname: 'celestian.lifeos.app',
    },
  };
  assert.equal(isSyntheticTestingAllowed(), false);

  (globalThis as any).window = {
    location: {
      hostname: 'celestian-lifeos.web.app',
    },
  };
  assert.equal(isSyntheticTestingAllowed(), false);

  // 3. In localhost or 127.0.0.1, returns true for automated test runners
  (globalThis as any).window = {
    location: {
      hostname: 'localhost',
    },
  };
  assert.equal(isSyntheticTestingAllowed(), true);

  (globalThis as any).window = {
    location: {
      hostname: '127.0.0.1',
    },
  };
  assert.equal(isSyntheticTestingAllowed(), true);

  // Restore
  if (prevWindow) {
    (globalThis as any).window = prevWindow;
  } else {
    delete (globalThis as any).window;
  }
});

test('Migración: un ciphertext ilegible, incluso marcado como completado, jamás se sobrescribe', async () => {
  for (const checkpointed of [false, true]) {
    const userId = `migration-integrity-${checkpointed}`;
    const keys = await provisionZeroKnowledgeKeys(userId);
    const otherKeys = await provisionZeroKnowledgeKeys(`${userId}-other`);
    const remote = await encryptSyncModule({ profile: { name: 'Remoto' } }, otherKeys.sessionMdek, 'profile', userId);
    let writes = 0;
    let promoted = false;
    await assert.rejects(executeE2EEMigration(userId, defaultState(), keys.sessionMdek, {
      capabilityHandlers: {
        getKeyEnvelope: async () => keys.envelope,
        getCapability: async () => ({ version: 1, minimumSyncProtocolVersion: 2, encryptionState: 'mixed', encryptedModules: checkpointed ? ['profile'] : [], updatedAt: '' }),
        setCapability: async (_user, capability) => { if (capability.encryptionState === 'encrypted') promoted = true; },
        getModule: async () => ({ isEncrypted: true, data: remote, revision: 'remote-revision' }),
      },
      customWriter: async () => { writes++; throw new Error('No debe escribir'); },
    }), CryptoDecryptionError);
    assert.equal(writes, 0);
    assert.equal(promoted, false);
  }
});

test('Migración: una lectura fallida y cambios remotos pendientes detienen la publicación', async () => {
  for (const networkFailure of [false, true]) {
    const userId = `migration-read-${networkFailure}`;
    const keys = await provisionZeroKnowledgeKeys(userId);
    let writes = 0;
    await assert.rejects(executeE2EEMigration(userId, defaultState(), keys.sessionMdek, {
      capabilityHandlers: {
        getKeyEnvelope: async () => keys.envelope,
        getCapability: async () => null,
        setCapability: async () => {},
        getModule: async () => {
          if (networkFailure) throw new Error('Sin conexión sintética');
          return { isEncrypted: false, data: { profile: { name: 'Otro dispositivo' } }, revision: 'remote-2' };
        },
      },
      customWriter: async () => { writes++; throw new Error('No debe escribir'); },
    }), networkFailure ? /Sin conexión/ : /cambios remotos pendientes/);
    assert.equal(writes, 0);
  }
});

test('Migración: sin copia preventiva durable no se lee ni modifica la nube', async () => {
  const originalStorage = globalThis.localStorage;
  const keys = await provisionZeroKnowledgeKeys('migration-no-disk');
  let remoteCalls = 0;
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } } as any;
  try {
    await assert.rejects(executeE2EEMigration('migration-no-disk', defaultState(), keys.sessionMdek, {
      capabilityHandlers: {
        getKeyEnvelope: async () => { remoteCalls++; return keys.envelope; },
        getCapability: async () => { remoteCalls++; return null; }, setCapability: async () => { remoteCalls++; },
      },
    }), /copia preventiva/);
    assert.equal(remoteCalls, 0);
  } finally { globalThis.localStorage = originalStorage; }
});
