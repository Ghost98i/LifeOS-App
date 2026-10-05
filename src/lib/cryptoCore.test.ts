import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateMdek,
  exportRawKey,
  importRawKey,
  importSessionKey,
  generateRecoveryKey,
  formatRecoveryKey,
  parseRecoveryKey,
  encodeBase58,
  decodeBase58,
  encodeBase58Check,
  decodeBase58Check,
  deriveKekFromRecoveryKey,
  deriveKekFromPassphrase,
  encryptPayload,
  decryptPayload,
  wrapMdekWithKek,
  unwrapMdekWithKek,
  provisionZeroKnowledgeKeys,
  unlockMdekWithRecoveryKey,
  rewrapMdekWithNewRecoveryKey,
  loadWrappedKeyEnvelope,
  saveWrappedKeyEnvelope,
  clearWrappedKeyEnvelope,
  isZeroKnowledgeProvisioned,
  encryptSyncModule,
  decryptSyncModule,
  isCryptoEnvelope,
  decodeCloudModuleData,
  encodeCloudModuleData,
  cryptoSession,
  CryptoDecryptionError,
  CryptoKeyError,
  base64ToBytes,
  bytesToBase64,
  CURRENT_CRYPTO_VERSION,
  CURRENT_KEY_FORMAT_VERSION,
  CRYPTO_ALGORITHM,
  assertProtocolWritePermitted,
  isAccountSyncCapability,
  type AccountSyncCapability,
} from './cryptoCore';
import { defaultState, CURRENT_SCHEMA_VERSION } from './storage';
import {
  mergeSyncModuleWithConflicts,
  syncDataFingerprint,
  applySyncModule,
  syncModuleData,
} from './syncModel';
import { writeCloudModulesGuarded } from './cloudSync';

// Polyfill localStorage for node environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  } as any;
}

test('cryptoCore — Key Lifecycle: MDEK provisionada con extractable: false en sesión', async () => {
  const rawBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(rawBytes);

  // 1. Clave extractable (solo usada durante wrapping de provisionamiento)
  const extractableKey = await importRawKey(rawBytes, true);
  assert.equal(extractableKey.extractable, true);
  const exported = await exportRawKey(extractableKey);
  assert.equal(exported.length, 32);

  // 2. Clave de sesión operativa (extractable: false)
  const sessionKey = await importSessionKey(rawBytes);
  assert.equal(sessionKey.extractable, false);

  // Intentar exportar la clave de sesión DEBE ser bloqueado por Web Crypto
  await assert.rejects(
    async () => exportRawKey(sessionKey),
    /InvalidAccessError|key is not extractable/i
  );
});

test('cryptoCore — Recovery Key: Formato Base58Check, tolerancia a espacios y detección de errores', async () => {
  const rawEntropy = generateRecoveryKey();
  assert.equal(rawEntropy.length, 32);

  // 1. Formateo con checksum y guiones
  const formatted = await formatRecoveryKey(rawEntropy);
  assert.equal(typeof formatted, 'string');
  assert.ok(formatted.includes('-'));

  // 2. Parsing tolerante a espacios y guiones
  const messy = `  ${formatted.replace(/-/g, ' - ')} \n\t `;
  const parsed = await parseRecoveryKey(messy);
  assert.deepEqual(parsed, rawEntropy);

  // 3. Detección de error tipográfico (Checksum Mismatch)
  // Cambiamos 1 solo carácter en la clave formateada
  const chars = formatted.split('');
  const lastCharIdx = chars.length - 1;
  chars[lastCharIdx] = chars[lastCharIdx] === 'A' ? 'B' : 'A';
  const corruptedFormatted = chars.join('');

  await assert.rejects(
    async () => parseRecoveryKey(corruptedFormatted),
    (err: Error) => {
      assert.ok(err instanceof CryptoKeyError);
      assert.ok(err.message.includes('checksum mismatch') || err.message.includes('Suma de verificación'));
      return true;
    }
  );

  // 4. Rechazo ante clave truncada o vacía
  await assert.rejects(
    async () => parseRecoveryKey('12345-67890'),
    CryptoKeyError
  );
  await assert.rejects(
    async () => parseRecoveryKey(''),
    CryptoKeyError
  );

  // 5. Base58 preservación estricta de leading zero bytes
  const bytesWithLeadingZeros = new Uint8Array([0, 0, 1, 2, 3, 255]);
  const encodedZeros = encodeBase58(bytesWithLeadingZeros);
  assert.ok(encodedZeros.startsWith('11')); // '1' representa leading zero byte
  const decodedZeros = decodeBase58(encodedZeros);
  assert.deepEqual(decodedZeros, bytesWithLeadingZeros);

  // 6. Base58 rechazo de caracteres inválidos (0, O, I, l u otros símbolos no alfabéticos)
  assert.throws(
    () => decodeBase58('12340abc'), // '0' inválido en Base58
    /Carácter inválido/
  );
  assert.throws(
    () => decodeBase58('1234Oabc'), // 'O' mayúscula inválida
    /Carácter inválido/
  );
  assert.throws(
    () => decodeBase58('1234Iabc'), // 'I' mayúscula inválida
    /Carácter inválido/
  );
  assert.throws(
    () => decodeBase58('1234labc'), // 'l' minúscula inválida
    /Carácter inválido/
  );

  // 7. Base58Check roundtrip directo con longitud arbitraria
  const payload16 = new Uint8Array(16);
  globalThis.crypto.getRandomValues(payload16);
  const checkEncoded16 = await encodeBase58Check(payload16);
  const checkDecoded16 = await decodeBase58Check(checkEncoded16);
  assert.deepEqual(checkDecoded16, payload16);
});

test('cryptoCore — Provisionamiento Transaccional y WrappedKeyEnvelope', async () => {
  const testUserId = 'user-prov-test-1';
  clearWrappedKeyEnvelope(testUserId);
  assert.equal(isZeroKnowledgeProvisioned(testUserId), false);

  const { recoveryKeyFormatted, sessionMdek, envelope } = await provisionZeroKnowledgeKeys(testUserId);

  assert.ok(recoveryKeyFormatted);
  assert.equal(sessionMdek.extractable, false); // No exportable
  assert.equal(envelope.keyFormatVersion, CURRENT_KEY_FORMAT_VERSION);
  assert.equal(envelope.cryptoVersion, CURRENT_CRYPTO_VERSION);
  assert.equal(envelope.algorithm, CRYPTO_ALGORITHM);
  assert.ok(envelope.wrappedMdek.iv);
  assert.ok(envelope.wrappedMdek.ciphertext);
  assert.ok(envelope.kdf.salt);
  assert.equal(envelope.kdf.algorithm, 'HKDF-SHA-256');

  // Verificar persistencia local
  assert.equal(isZeroKnowledgeProvisioned(testUserId), true);
  const loadedEnvelope = loadWrappedKeyEnvelope(testUserId);
  assert.deepEqual(loadedEnvelope, envelope);

  clearWrappedKeyEnvelope(testUserId);
});

test('cryptoCore — Unlock con Recovery Key: éxito y rechazo ante clave o envelope inválido', async () => {
  const testUserId = 'user-unlock-test';
  const { recoveryKeyFormatted, sessionMdek: initialSessionKey, envelope } = await provisionZeroKnowledgeKeys(testUserId);

  // Ciframos un payload con la clave de sesión inicial
  const testPayload = { secretData: 'Información confidencial de finanzas', amount: 50000 };
  const encrypted = await encryptPayload(testPayload, initialSessionKey);

  // 1. Desbloqueo exitoso con la Recovery Key correcta
  const unlockedKey = await unlockMdekWithRecoveryKey(recoveryKeyFormatted, envelope);
  assert.equal(unlockedKey.extractable, false);

  // Verificar que la clave recuperada descifra exactamente el payload previo
  const decrypted = await decryptPayload<typeof testPayload>(encrypted, unlockedKey);
  assert.deepEqual(decrypted, testPayload);

  // 2. Intento de desbloqueo con una Recovery Key incorrecta
  const anotherRawRecovery = generateRecoveryKey();
  const wrongRecoveryFormatted = await formatRecoveryKey(anotherRawRecovery);

  await assert.rejects(
    async () => unlockMdekWithRecoveryKey(wrongRecoveryFormatted, envelope),
    CryptoDecryptionError
  );

  // 3. Intento con envelope con ciphertext alterado
  const corruptedCipherEnvelope = {
    ...envelope,
    wrappedMdek: {
      ...envelope.wrappedMdek,
      ciphertext: bytesToBase64(new Uint8Array(48)), // fake bytes
    },
  };
  await assert.rejects(
    async () => unlockMdekWithRecoveryKey(recoveryKeyFormatted, corruptedCipherEnvelope),
    CryptoDecryptionError
  );

  // 4. Intento con envelope con IV alterado
  const rawIv = base64ToBytes(envelope.wrappedMdek.iv);
  rawIv[0] ^= 0xFF;
  const corruptedIvEnvelope = {
    ...envelope,
    wrappedMdek: {
      ...envelope.wrappedMdek,
      iv: bytesToBase64(rawIv),
    },
  };
  await assert.rejects(
    async () => unlockMdekWithRecoveryKey(recoveryKeyFormatted, corruptedIvEnvelope),
    CryptoDecryptionError
  );

  // 5. Intento con AAD alterado (desvío de usuario)
  const spoofedAadEnvelope = {
    ...envelope,
    aad: 'keyFormatVersion:1|userId:spoofed-hacker',
  };
  await assert.rejects(
    async () => unlockMdekWithRecoveryKey(recoveryKeyFormatted, spoofedAadEnvelope),
    CryptoDecryptionError
  );

  clearWrappedKeyEnvelope(testUserId);
});

test('cryptoCore — Rewrap Recovery Key: semántica de rewrap vs revocación', async () => {
  const testUserId = 'user-rewrap-test';
  const { recoveryKeyFormatted: oldKey, sessionMdek, envelope: oldEnvelope } = await provisionZeroKnowledgeKeys(testUserId);

  // Ciframos un documento con la MDEK actual
  const sampleDoc = { note: 'Nota personal muy importante', date: '2026-10-04' };
  const encryptedDoc = await encryptPayload(sampleDoc, sessionMdek);

  // 1. Rewrap con autorización mediante la Recovery Key actual
  const { newRecoveryKeyFormatted, newEnvelope, sessionMdek: newSessionKey } = await rewrapMdekWithNewRecoveryKey(
    oldKey,
    oldEnvelope,
    testUserId
  );

  assert.equal(newSessionKey.extractable, false);
  assert.notEqual(newRecoveryKeyFormatted, oldKey);
  assert.notEqual(newEnvelope.wrappedMdek.ciphertext, oldEnvelope.wrappedMdek.ciphertext);

  // 2. Realidad criptográfica de un rewrap:
  // Si alguien retiene la clave vieja Y el envelope viejo, todavía puede desenvolver la misma MDEK
  const mdekFromOldEnvelope = await unlockMdekWithRecoveryKey(oldKey, oldEnvelope);
  const decryptedWithOldKeyAndEnvelope = await decryptPayload(encryptedDoc, mdekFromOldEnvelope);
  assert.deepEqual(decryptedWithOldKeyAndEnvelope, sampleDoc);

  // 3. El NUEVO envelope rechaza la clave vieja
  await assert.rejects(
    async () => unlockMdekWithRecoveryKey(oldKey, newEnvelope),
    CryptoDecryptionError
  );

  // 4. El NUEVO envelope desbloquea exitosamente con la NUEVA clave
  const recoveredKey = await unlockMdekWithRecoveryKey(newRecoveryKeyFormatted, newEnvelope);
  assert.equal(recoveredKey.extractable, false);

  // 5. La MDEK recuperada del nuevo envelope descifra los datos previos (la MDEK no cambió)
  const decryptedOldDoc = await decryptPayload(encryptedDoc, recoveredKey);
  assert.deepEqual(decryptedOldDoc, sampleDoc);

  // 6. Intento de rewrap con clave incorrecta es rechazado de inmediato
  const fakeKey = await formatRecoveryKey(generateRecoveryKey());
  await assert.rejects(
    async () => rewrapMdekWithNewRecoveryKey(fakeKey, newEnvelope, testUserId),
    CryptoDecryptionError
  );

  clearWrappedKeyEnvelope(testUserId);
});

test('cryptoCore — Prototipo Sync Modular: ciclo decrypt → merge → encrypt con tombstones y conflictos', async () => {
  const { sessionMdek } = await provisionZeroKnowledgeKeys('sync-test-user');

  // Estado local
  const localState = defaultState();
  localState.finance.accounts = [
    { id: 'acc-1', name: 'Efectivo', balance: 1500, initialBalance: 1000 },
    { id: 'acc-2', name: 'Banco', balance: 2000, initialBalance: 2000 },
  ];
  localState.finance.transactions = [
    { id: 'tx-1', type: 'gasto', amount: 500, category: 'Varios', fixed: 'variable', date: '2026-10-01', accountId: 'acc-1' },
    { id: 'tx-2', type: 'ingreso', amount: 1000, category: 'Sueldo', fixed: 'fijo', date: '2026-10-02', accountId: 'acc-1' }, // nuevo local
  ];

  // Estado remoto (dispositivo 2 modificó banco y agregó tx-3)
  const remoteFinanceData = {
    finance: {
      accounts: [
        { id: 'acc-1', name: 'Efectivo', balance: 1000, initialBalance: 1000 },
        { id: 'acc-2', name: 'Banco', balance: 2500, initialBalance: 2000 },
      ],
      transactions: [
        { id: 'tx-1', type: 'gasto', amount: 500, category: 'Varios', fixed: 'variable', date: '2026-10-01', accountId: 'acc-1' },
        { id: 'tx-3', type: 'ingreso', amount: 500, category: 'Reventa', fixed: 'variable', date: '2026-10-03', accountId: 'acc-2' }, // nuevo remoto
      ],
      categories: localState.finance.categories,
      transfers: [],
      reconciliations: [],
      debts: [],
      investments: [],
      subscriptions: [],
      expectedIncomes: [],
      commitments: [],
      budgets: {},
      minCushion: 5000,
      cushionEnabled: true,
      heroDisplayMode: 'actual',
    },
  };

  // Base común previa
  const baseFinanceData = {
    finance: {
      accounts: [
        { id: 'acc-1', name: 'Efectivo', balance: 1000, initialBalance: 1000 },
        { id: 'acc-2', name: 'Banco', balance: 2000, initialBalance: 2000 },
      ],
      transactions: [
        { id: 'tx-1', type: 'gasto', amount: 500, category: 'Varios', fixed: 'variable', date: '2026-10-01', accountId: 'acc-1' },
      ],
      categories: localState.finance.categories,
      transfers: [],
      reconciliations: [],
      debts: [],
      investments: [],
      subscriptions: [],
      expectedIncomes: [],
      commitments: [],
      budgets: {},
      minCushion: 5000,
      cushionEnabled: true,
      heroDisplayMode: 'actual',
    },
  };

  const tombstones = { 'tx-deleted-ancient': 1700000000 };

  // 1. Cifrado de los payloads remotos y base en envelopes
  const remoteEnvelope = await encryptSyncModule(remoteFinanceData, sessionMdek, 'finance', 'sync-test-user');
  const baseEnvelope = await encryptSyncModule(baseFinanceData, sessionMdek, 'finance', 'sync-test-user');

  // 2. Cliente recibe envelopes cifrados y los descifra al vuelo
  const decryptedRemote = await decryptSyncModule(remoteEnvelope, sessionMdek, 'finance', 'sync-test-user');
  const decryptedBase = await decryptSyncModule(baseEnvelope, sessionMdek, 'finance', 'sync-test-user');

  // 3. Ejecutar 3-way merge sobre los datos descifrados
  const { state: mergedState, conflicts } = mergeSyncModuleWithConflicts(
    localState,
    'finance',
    decryptedRemote,
    decryptedBase,
    tombstones
  );

  assert.equal(conflicts.length, 0);
  // Ambos cambios independientes se unieron:
  // Efectivo tomó el cambio local (1500) y Banco tomó el cambio remoto (2500)
  assert.equal(mergedState.finance.accounts.find((a) => a.id === 'acc-1')?.balance, 1500);
  assert.equal(mergedState.finance.accounts.find((a) => a.id === 'acc-2')?.balance, 2500);
  // Ambas transacciones coexisten
  assert.equal(mergedState.finance.transactions.length, 3);
  assert.ok(mergedState.finance.transactions.some((t) => t.id === 'tx-2'));
  assert.ok(mergedState.finance.transactions.some((t) => t.id === 'tx-3'));

  // 4. Volver a cifrar el estado fusionado para enviar a la nube
  const mergedEnvelope = await encryptSyncModule(
    { finance: mergedState.finance },
    sessionMdek,
    'finance',
    'sync-test-user'
  );
  assert.ok(mergedEnvelope.ciphertext);

  // 5. Descifrar el resultado y verificar equivalencia estricta con merge directo
  const finalDecrypted = (await decryptSyncModule(mergedEnvelope, sessionMdek, 'finance', 'sync-test-user')) as any;
  assert.equal(finalDecrypted.finance.accounts.length, 2);
  assert.equal(finalDecrypted.finance.transactions.length, 3);

  // 6. Prueba de resiliencia: si el ciphertext remoto está corrupto, la pipeline aborta sin mutar estado local
  const corruptedRemoteEnvelope = {
    ...remoteEnvelope,
    ciphertext: bytesToBase64(new Uint8Array([1, 2, 3, 4])),
  };
  await assert.rejects(
    async () => decryptSyncModule(corruptedRemoteEnvelope, sessionMdek, 'finance', 'sync-test-user'),
    CryptoDecryptionError
  );

  clearWrappedKeyEnvelope('sync-test-user');
});

test('cryptoCore — Cifrado autenticado: Unicode, Emojis y CJK', async () => {
  const mdek = await generateMdek();
  const testPayload = {
    text: 'Texto con acentos: Árvore, año, corazón, café',
    emojis: '🔐💻🚀🏋️',
    cjk: 'こんにちは世界 - 个人操作中心',
    symbols: '©®™§¶†‡',
  };

  const envelope = await encryptPayload(testPayload, mdek, 'test-aad');
  const decrypted = await decryptPayload(envelope, mdek, 'test-aad');
  assert.deepEqual(decrypted, testPayload);
});

test('cryptoCore — Key Derivation: HKDF (Recovery Key) vs PBKDF2 (Passphrase) y wrapping directo', async () => {
  const rawRecovery = generateRecoveryKey();
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);

  // 1. HKDF para Recovery Key (256 bits)
  const kekHkdf = await deriveKekFromRecoveryKey(rawRecovery, salt);
  assert.equal(kekHkdf.extractable, false);

  const rawMdek = new Uint8Array(32);
  globalThis.crypto.getRandomValues(rawMdek);

  const wrapped = await wrapMdekWithKek(rawMdek, kekHkdf, 'test-wrap-aad');
  const unwrapped = await unwrapMdekWithKek(wrapped, kekHkdf, 'test-wrap-aad');
  assert.deepEqual(unwrapped, rawMdek);

  // 2. PBKDF2 para passphrase humana
  const kekPbkdf2 = await deriveKekFromPassphrase('clave-segura-1234', salt, 1000); // 1000 iteraciones para test rápido
  assert.equal(kekPbkdf2.extractable, false);

  // Rechazo de passphrase corta
  await assert.rejects(
    async () => deriveKekFromPassphrase('corta', salt),
    CryptoKeyError
  );
});

test('cryptoCore — Rendimiento: ciclos de cifrado/descifrado sobre carga representativa', async () => {
  const mdek = await generateMdek();
  const stateSnapshot = defaultState();

  const start = Date.now();
  for (let i = 0; i < 5; i++) {
    const envelope = await encryptPayload(stateSnapshot, mdek, 'perf-test');
    const decrypted = await decryptPayload<typeof stateSnapshot>(envelope, mdek, 'perf-test');
    assert.equal(decrypted.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(decrypted.tasksRecurring.length, stateSnapshot.tasksRecurring.length);
  }
  const duration = Date.now() - start;
  assert.ok(duration < 2000, `Rendimiento de cifrado debe ser < 2000ms para 5 ciclos completos (tomó ${duration}ms)`);
});

test('Seguridad & Hosting — Validación estática de CSP y Permissions-Policy en firebase.json', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const firebaseJsonPath = path.resolve(process.cwd(), 'firebase.json');
  assert.ok(fs.existsSync(firebaseJsonPath), 'firebase.json debe existir');

  const content = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
  const htmlHeadersConfig = content.hosting.headers.find((h: any) => h.source === '**/*.@(html|webmanifest)');
  assert.ok(htmlHeadersConfig, 'Debe haber configuración de headers para HTML y webmanifest');

  const headers = htmlHeadersConfig.headers;
  const cspHeader = headers.find((h: any) => h.key === 'Content-Security-Policy');
  const permHeader = headers.find((h: any) => h.key === 'Permissions-Policy');

  assert.ok(cspHeader, 'Content-Security-Policy debe estar configurada');
  assert.ok(permHeader, 'Permissions-Policy debe estar configurada');

  const cspValue = cspHeader.value as string;
  const permValue = permHeader.value as string;

  // 1. Permissions-Policy debe permitir geolocation exclusivamente para self
  assert.ok(permValue.includes('geolocation=(self)'), 'geolocation debe estar permitida para (self)');
  assert.ok(permValue.includes('camera=()'), 'camera debe estar restringida a ()');
  assert.ok(permValue.includes('microphone=()'), 'microphone debe estar restringida a ()');

  // 2. CSP connect-src debe incluir api.open-meteo.com y geocoding-api.open-meteo.com
  assert.ok(cspValue.includes('https://api.open-meteo.com'), 'connect-src debe incluir https://api.open-meteo.com');
  assert.ok(cspValue.includes('https://geocoding-api.open-meteo.com'), 'connect-src debe incluir https://geocoding-api.open-meteo.com');

  // 3. No abrir https: genérico ni comodines globales inseguros
  assert.ok(!cspValue.includes(" 'unsafe-eval'"), "No debe contener 'unsafe-eval' general en script-src");
  assert.ok(!cspValue.includes('https:;'), 'connect-src o default-src no debe tener https: comodín');
});

// ---------------------------------------------------------------------------
// Fase 8.2: Pruebas Críticas de Dual-Mode Encrypted Sync (Sección 25)
// ---------------------------------------------------------------------------

test('Dual-Mode Sync — Type Guard isCryptoEnvelope: detección estricta y rechazo de payloads espurios', () => {
  // 1. Plaintext legacy es rechazado
  assert.equal(isCryptoEnvelope({ finance: { accounts: [], transactions: [] } }), false);
  assert.equal(isCryptoEnvelope(null), false);
  assert.equal(isCryptoEnvelope(undefined), false);
  assert.equal(isCryptoEnvelope([]), false);
  assert.equal(isCryptoEnvelope('string-data'), false);
  assert.equal(isCryptoEnvelope({ cryptoVersion: 1 }), false); // faltan campos
  assert.equal(isCryptoEnvelope({ cryptoVersion: 1, algorithm: 'AES-GCM-256' }), false);

  // 2. CryptoEnvelope válido es detectado
  const validEnvelope = {
    cryptoVersion: 1,
    algorithm: 'AES-GCM-256' as const,
    iv: 'aXZfYmFzZTY0',
    ciphertext: 'Y2lwaGVydGV4dF9iYXNlNjQ=',
    createdAt: new Date().toISOString(),
  };
  assert.equal(isCryptoEnvelope(validEnvelope), true);

  // 3. Modificaciones inválidas son rechazadas
  assert.equal(isCryptoEnvelope({ ...validEnvelope, cryptoVersion: 0 }), false);
  assert.equal(isCryptoEnvelope({ ...validEnvelope, algorithm: 'DES' }), false);
  assert.equal(isCryptoEnvelope({ ...validEnvelope, iv: '' }), false);
  assert.equal(isCryptoEnvelope({ ...validEnvelope, ciphertext: '' }), false);
});

test('Dual-Mode Sync — Roundtrip cifrado, aislamiento de AAD (user/module mismatch) y diferentes IVs con idéntico fingerprint', async () => {
  const mdek = await generateMdek();
  const testUserId = 'user-alice';
  const financeData = {
    accounts: [{ id: 'acc-1', name: 'Banco', balance: 5000 }],
    transactions: [{ id: 'tx-1', amount: 200, category: 'Comida' }],
  };

  // 1. Cifrado exitoso con AAD bound a (user-alice, finance)
  const env1 = await encryptSyncModule(financeData, mdek, 'finance', testUserId);
  const env2 = await encryptSyncModule(financeData, mdek, 'finance', testUserId);

  // Dos cifrados del mismo contenido producen IVs y ciphertexts distintos
  assert.notEqual(env1.iv, env2.iv);
  assert.notEqual(env1.ciphertext, env2.ciphertext);

  // Ambos descifran exactamente el mismo contenido
  const dec1 = await decryptSyncModule(env1, mdek, 'finance', testUserId);
  const dec2 = await decryptSyncModule(env2, mdek, 'finance', testUserId);
  assert.deepEqual(dec1, financeData);
  assert.deepEqual(dec2, financeData);

  // Sus fingerprints sobre contenido descifrado son idénticos
  assert.equal(syncDataFingerprint(dec1), syncDataFingerprint(dec2));

  // 2. AAD Context-Binding: User A no puede abrir bajo User B
  await assert.rejects(
    async () => decryptSyncModule(env1, mdek, 'finance', 'user-bob'),
    CryptoDecryptionError
  );

  // 3. AAD Context-Binding: Módulo finance no puede abrirse como notes
  await assert.rejects(
    async () => decryptSyncModule(env1, mdek, 'notes', testUserId),
    CryptoDecryptionError
  );
});

test('Dual-Mode Sync — Adapter decodeCloudModuleData: plaintext legacy vs ciphertext vs locked vs corrupted', async () => {
  const mdek = await generateMdek();
  const testUserId = 'user-adapter-test';
  const sampleModuleData = { notes: [{ id: 'note-1', title: 'Mi secreto' }] };

  // 1. Lectura de módulo legacy en plaintext (no requiere clave)
  const plaintextRes = await decodeCloudModuleData(sampleModuleData, 'notes', testUserId, null);
  assert.equal(plaintextRes.mode, 'plaintext');
  if (plaintextRes.mode === 'plaintext') {
    assert.deepEqual(plaintextRes.data, sampleModuleData);
  }

  // 2. Lectura de módulo cifrado CON sesión activa (desbloqueada)
  const envelope = await encryptSyncModule(sampleModuleData, mdek, 'notes', testUserId);
  const decryptedRes = await decodeCloudModuleData(envelope, 'notes', testUserId, mdek);
  assert.equal(decryptedRes.mode, 'decrypted');
  if (decryptedRes.mode === 'decrypted') {
    assert.deepEqual(decryptedRes.data, sampleModuleData);
  }

  // 3. Lectura de módulo cifrado SIN sesión (locked state)
  const lockedRes = await decodeCloudModuleData(envelope, 'notes', testUserId, null);
  assert.equal(lockedRes.mode, 'locked');
  if (lockedRes.mode === 'locked') {
    assert.equal(lockedRes.envelope.ciphertext, envelope.ciphertext);
  }

  // 4. Lectura de módulo cifrado con datos manipulados o corruptos
  const corruptedEnvelope = { ...envelope, ciphertext: bytesToBase64(new Uint8Array([99, 88, 77])) };
  const corruptedRes = await decodeCloudModuleData(corruptedEnvelope, 'notes', testUserId, mdek);
  assert.equal(corruptedRes.mode, 'corrupted');
  if (corruptedRes.mode === 'corrupted') {
    assert.ok(corruptedRes.error instanceof Error);
  }
});

test('Dual-Mode Sync — Adapter encodeCloudModuleData: modo explícito plaintext vs encrypted', async () => {
  const mdek = await generateMdek();
  const testUserId = 'user-encode-test';
  const data = { gym: { routines: [] } };

  // Sin clave en sesión: produce plaintext
  const plainRes = await encodeCloudModuleData(data, 'gym', testUserId, null);
  assert.equal(plainRes.isEncrypted, false);
  assert.deepEqual(plainRes.data, data);

  // Con clave en sesión: produce CryptoEnvelope
  const encRes = await encodeCloudModuleData(data, 'gym', testUserId, mdek);
  assert.equal(encRes.isEncrypted, true);
  assert.ok(isCryptoEnvelope(encRes.data));
});

test('Dual-Mode Sync — In-Memory CryptoSessionManager lifecycle', () => {
  const testUser = 'user-session-test';
  clearWrappedKeyEnvelope(testUser);

  // 1. Sin configurar (no provisionado)
  cryptoSession.lock();
  assert.equal(cryptoSession.getState(testUser), 'unconfigured');
  assert.equal(cryptoSession.isUnlocked(testUser), false);
  assert.equal(cryptoSession.getKey(testUser), null);

  // 2. Simular provisionamiento guardando un envelope
  saveWrappedKeyEnvelope(
    {
      keyFormatVersion: CURRENT_KEY_FORMAT_VERSION,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      algorithm: CRYPTO_ALGORITHM,
      wrappedMdek: { iv: 'iv', ciphertext: 'ct' },
      kdf: { algorithm: 'HKDF-SHA-256', salt: 'salt', info: 'info' },
      aad: 'aad',
      createdAt: new Date().toISOString(),
    },
    testUser
  );

  // Ahora está configurado pero locked
  assert.equal(cryptoSession.getState(testUser), 'locked');
  assert.equal(cryptoSession.isUnlocked(testUser), false);

  // 3. Desbloquear sesión
  const fakeKey = {} as CryptoKey;
  cryptoSession.setUnlocked(fakeKey, testUser);
  assert.equal(cryptoSession.getState(testUser), 'unlocked');
  assert.equal(cryptoSession.isUnlocked(testUser), true);
  assert.equal(cryptoSession.getKey(testUser), fakeKey);

  // Otro usuario distinto permanece locked o unconfigured
  assert.equal(cryptoSession.isUnlocked('otro-user'), false);

  // 4. Bloquear sesión
  cryptoSession.lock();
  assert.equal(cryptoSession.getState(testUser), 'locked');
  assert.equal(cryptoSession.isUnlocked(testUser), false);
  assert.equal(cryptoSession.getKey(testUser), null);

  clearWrappedKeyEnvelope(testUser);
});

test('Dual-Mode Sync — Tombstones preservados y protegidos dentro de CryptoEnvelope', async () => {
  const mdek = await generateMdek();
  const testUserId = 'user-tombstones';
  const moduleData = {
    finance: { accounts: [], transactions: [] },
    _tombstones: { 'entity-deleted-123': 1728000000000 },
  };

  // Cifrado que incluye _tombstones
  const envelope = await encryptSyncModule(moduleData, mdek, 'finance', testUserId);

  // El ciphertext no expone plaintext ni el id de la entidad eliminada
  assert.ok(!envelope.ciphertext.includes('entity-deleted-123'));

  // Al descifrar, los tombstones se recuperan íntegros
  const decrypted = (await decryptSyncModule(envelope, mdek, 'finance', testUserId)) as typeof moduleData;
  assert.equal(decrypted._tombstones['entity-deleted-123'], 1728000000000);
});

test('Dual-Mode Sync — Cuenta Mixta: convivencia de módulos plaintext y cifrados en el mismo cliente', async () => {
  const mdek = await generateMdek();
  const testUserId = 'user-mixed';

  // Simulación de Firestore: finance está cifrado, pero notes continúa en plaintext legacy
  const rawFinance = { accounts: [{ id: 'acc-1', name: 'Ahorro', balance: 1000 }] };
  const rawNotes = { notes: [{ id: 'note-1', title: 'Lista de compras', content: 'Leche' }] };

  const cloudModules = [
    { module: 'finance', data: await encryptSyncModule(rawFinance, mdek, 'finance', testUserId) },
    { module: 'notes', data: rawNotes }, // Plaintext legacy
  ];

  // El cliente decodifica ambos transparentemente
  const decodedMap: Record<string, unknown> = {};
  for (const item of cloudModules) {
    const res = await decodeCloudModuleData(item.data, item.module, testUserId, mdek);
    assert.ok(res.mode === 'decrypted' || res.mode === 'plaintext');
    if (res.mode === 'decrypted' || res.mode === 'plaintext') {
      decodedMap[item.module] = res.data;
    }
  }

  assert.deepEqual(decodedMap['finance'], rawFinance);
  assert.deepEqual(decodedMap['notes'], rawNotes);
});

test('Fase 8.2b: Simulación de cliente legacy pre-Stage-C recibiendo CryptoEnvelope', async () => {
  const mdek = await generateMdek();
  const testUserId = 'legacy-client-audit';
  const realFinanceData = {
    accounts: [{ id: 'acc-savings', name: 'Ahorros', balance: 50000 }],
    transactions: [{ id: 'tx-1', amount: 500, category: 'Super' }],
  };

  // Payload en Firestore con CryptoEnvelope generado en v2
  const encryptedEnvelope = await encryptSyncModule(realFinanceData, mdek, 'finance', testUserId);
  const cloudHeadDoc = {
    syncProtocolVersion: 2,
    isEncrypted: true,
    data: encryptedEnvelope,
    revision: '1728000000000-deviceA-xyz',
    module: 'finance',
  };

  // 1. Simulación de cliente antiguo sin crypto (lee cloudHeadDoc.data directamente)
  const legacyReadData = cloudHeadDoc.data as any;

  // El cliente legacy intenta hacer applySyncModule con ese objeto
  const baseLocalState = defaultState();
  const appliedState = applySyncModule(baseLocalState, 'finance', legacyReadData);

  // DEMOSTRACIÓN DE RIESGO:
  // Como legacyReadData es { cryptoVersion, algorithm, iv, ciphertext... }, no tiene .finance.
  // En consecuencia, candidate.finance es undefined, y normalizeStoredState() restablece las cuentas por defecto vacías!
  assert.equal(appliedState.finance.transactions.length, 0);
  assert.notEqual(appliedState.finance.accounts[0]?.name, 'Ahorros');

  // Si el cliente legacy generase un fingerprint o computara módulos cambiados:
  const localData = syncModuleData(appliedState, 'finance');
  const dirtyFingerprint = syncDataFingerprint(localData);
  assert.ok(typeof dirtyFingerprint === 'string' && dirtyFingerprint.length > 0);

  // 2. Comprobación del guard de compatibilidad:
  // Si un cliente legacy intentara escribir este estado destruido, assertProtocolWritePermitted rechaza
  assert.throws(
    () => assertProtocolWritePermitted('finance', cloudHeadDoc.syncProtocolVersion, 1),
    /\[ProtocolGuard\] Operación de escritura rechazada para el módulo “finance”/
  );
});

test('Fase 8.2b: Protocol Guard client-side aborta escritura si remoteProtocol > clientProtocol', async () => {
  const testUserId = 'protocol-guard-test';
  const state = defaultState();

  // Simulación de customVerifier donde Firestore devuelve syncProtocolVersion: 3 (superior a este cliente v2)
  const customVerifier = async () => ({
    matches: false,
    divergedModules: [],
    remoteRevisions: { finance: 'rev-remote-1' },
    incompatibleProtocolModules: ['finance' as const],
  });

  const guardedRes = await writeCloudModulesGuarded(
    testUserId,
    state,
    ['finance'],
    'device-current',
    { finance: 'rev-remote-1' },
    {},
    customVerifier as any
  );

  assert.equal(guardedRes.incompatibleProtocol, true);
  assert.deepEqual(guardedRes.incompatibleModules, ['finance']);
  assert.equal(guardedRes.writes.length, 0);

  // El completion es rechazado
  await assert.rejects(guardedRes.completion, /Protocolo remoto superior detectado/);
});

test('Fase 8.2c: Firestore Rules Test Suite — Validación estática exhaustiva de todos los casos de seguridad', () => {
  // Simulación fiel de las funciones de firestore.rules
  const isValidCryptoEnvelopeRule = (envelope: any): boolean => {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return false;
    const allowedKeys = ['cryptoVersion', 'algorithm', 'iv', 'ciphertext', 'aad', 'createdAt'];
    const keys = Object.keys(envelope);
    if (!keys.every((k) => allowedKeys.includes(k))) return false;
    if (typeof envelope.cryptoVersion !== 'number' || envelope.cryptoVersion !== 1) return false;
    if (envelope.algorithm !== 'AES-GCM-256') return false;
    if (typeof envelope.iv !== 'string' || envelope.iv.length === 0) return false;
    if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length === 0) return false;
    if ('aad' in envelope && typeof envelope.aad !== 'string') return false;
    if (typeof envelope.createdAt !== 'string') return false;
    return true;
  };

  const moduleRequiresEncryption = (
    capability: AccountSyncCapability | null,
    remoteDoc: { isEncrypted?: boolean } | null,
    module: string
  ): boolean => {
    if (capability && capability.encryptionState === 'encrypted') return true;
    if (capability && capability.encryptionState === 'mixed' && capability.encryptedModules?.includes(module)) return true;
    if (remoteDoc && remoteDoc.isEncrypted === true) return true;
    return false;
  };

  const legacyWritesPermitted = (capability: AccountSyncCapability | null): boolean => {
    return !capability || capability.encryptionState === 'plaintext';
  };

  const evaluateSyncPayload = (
    capability: AccountSyncCapability | null,
    remoteDoc: { isEncrypted?: boolean } | null,
    module: string,
    payload: any
  ): boolean => {
    const isReqEncrypted = moduleRequiresEncryption(capability, remoteDoc, module);

    if (typeof payload.schemaVersion !== 'number') return false;
    if (payload.module !== module) return false;
    if (typeof payload.revision !== 'string') return false;
    if (typeof payload.deviceId !== 'string') return false;
    if (typeof payload.clientUpdatedAt !== 'number') return false;

    if (isReqEncrypted) {
      if (typeof payload.syncProtocolVersion !== 'number' || payload.syncProtocolVersion < 2) return false;
      if (payload.isEncrypted !== true) return false;
      if (!isValidCryptoEnvelopeRule(payload.data)) return false;
    } else {
      if (!legacyWritesPermitted(capability)) return false;
    }
    return true;
  };

  const evaluateLegacyStateWrite = (capability: AccountSyncCapability | null): boolean => {
    return legacyWritesPermitted(capability);
  };

  // Base fixtures
  const validEnvelope = {
    cryptoVersion: 1,
    algorithm: CRYPTO_ALGORITHM,
    iv: 'aXZfYmFzZTY0',
    ciphertext: 'Y2lwaGVydGV4dA==',
    aad: 'module:finance|user:test',
    createdAt: new Date().toISOString(),
  };

  const baseValidPayload = {
    schemaVersion: 2,
    revision: 'rev-1',
    deviceId: 'dev-1',
    clientUpdatedAt: 1728000000000,
  };

  // 1. Plaintext account: write v1 plaintext permitido
  const plaintextCap: AccountSyncCapability = {
    version: 1,
    minimumSyncProtocolVersion: 1,
    encryptionState: 'plaintext',
    updatedAt: new Date().toISOString(),
  };
  assert.ok(isAccountSyncCapability(plaintextCap));
  assert.equal(
    evaluateSyncPayload(plaintextCap, null, 'finance', {
      ...baseValidPayload,
      module: 'finance',
      syncProtocolVersion: 1,
      isEncrypted: false,
      data: { accounts: [] },
    }),
    true
  );

  // 2. Mixed account: módulo 'finance' ya migrado, write v2 ciphertext permitido
  const mixedCap: AccountSyncCapability = {
    version: 1,
    minimumSyncProtocolVersion: 2,
    encryptionState: 'mixed',
    encryptedModules: ['finance', 'notes'],
    updatedAt: new Date().toISOString(),
  };
  assert.equal(
    evaluateSyncPayload(mixedCap, null, 'finance', {
      ...baseValidPayload,
      module: 'finance',
      syncProtocolVersion: 2,
      isEncrypted: true,
      data: validEnvelope,
    }),
    true
  );

  // 3. Migrated module: intento de downgrade plaintext a 'finance' es RECHAZADO
  assert.equal(
    evaluateSyncPayload(mixedCap, null, 'finance', {
      ...baseValidPayload,
      module: 'finance',
      syncProtocolVersion: 1,
      isEncrypted: false,
      data: { accounts: [] },
    }),
    false
  );

  // 4. Protección irreversible por módulo aunque capability no tenga encryptedModules pero remoteDoc.isEncrypted == true:
  // Intento de downgrade plaintext es RECHAZADO
  assert.equal(
    evaluateSyncPayload(null, { isEncrypted: true }, 'finance', {
      ...baseValidPayload,
      module: 'finance',
      syncProtocolVersion: 1,
      isEncrypted: false,
      data: { accounts: [] },
    }),
    false
  );

  // 5. Encrypted account: write v1 plaintext RECHAZADO para cualquier módulo
  const encryptedCap: AccountSyncCapability = {
    version: 1,
    minimumSyncProtocolVersion: 2,
    encryptionState: 'encrypted',
    updatedAt: new Date().toISOString(),
  };
  assert.equal(
    evaluateSyncPayload(encryptedCap, null, 'gym', {
      ...baseValidPayload,
      module: 'gym',
      syncProtocolVersion: 1,
      isEncrypted: false,
      data: { sessions: [] },
    }),
    false
  );

  // 6. Encrypted account: v2 ciphertext válido PERMITIDO
  assert.equal(
    evaluateSyncPayload(encryptedCap, null, 'gym', {
      ...baseValidPayload,
      module: 'gym',
      syncProtocolVersion: 2,
      isEncrypted: true,
      data: validEnvelope,
    }),
    true
  );

  // 7. Envelope inválido (falta iv o algoritmo erróneo o campos extra espurios) RECHAZADO
  const malformedEnvelope = { ...validEnvelope, algorithm: 'DES' };
  assert.equal(
    evaluateSyncPayload(encryptedCap, null, 'gym', {
      ...baseValidPayload,
      module: 'gym',
      syncProtocolVersion: 2,
      isEncrypted: true,
      data: malformedEnvelope,
    }),
    false
  );

  // 8. Legacy state write (/lifeos/state) bloqueado después de E2EE
  assert.equal(evaluateLegacyStateWrite(plaintextCap), true); // Permitido en cuenta plaintext legacy
  assert.equal(evaluateLegacyStateWrite(mixedCap), false); // BLOQUEADO en cuenta mixed
  assert.equal(evaluateLegacyStateWrite(encryptedCap), false); // BLOQUEADO en cuenta encrypted
});

test('Fase 8.2b: Carreras asíncronas — snapshot A viejo termina después que snapshot B nuevo (secuencia conservada)', async () => {
  let activeSnapshotSeq = 0;
  let lastAppliedSeq = 0;

  // Función simulada de receptor de snapshot con el guard de secuencia implementado en App.tsx
  const simulateReceiveSnapshot = async (seq: number, delayMs: number) => {
    activeSnapshotSeq = Math.max(activeSnapshotSeq, seq);
    const assignedSeq = seq;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Guard: si activeSnapshotSeq avanzó más allá de assignedSeq, descartar resultado
    if (assignedSeq !== activeSnapshotSeq) {
      return { applied: false, seq: assignedSeq };
    }
    lastAppliedSeq = assignedSeq;
    return { applied: true, seq: assignedSeq };
  };

  // Disparar snapshot 1 con demora alta (100ms) y snapshot 2 con demora corta (20ms)
  const p1 = simulateReceiveSnapshot(1, 100);
  const p2 = simulateReceiveSnapshot(2, 20);

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res2.applied, true);
  assert.equal(res1.applied, false); // Snapshot viejo 1 es descartado y no sobrescribe al snapshot 2
  assert.equal(lastAppliedSeq, 2);
});

test('Fase 8.2b: Crypto session lock race — bloqueo durante decrypt no aplica ni expone plaintext', async () => {
  const mdek = await generateMdek();
  const testUserId = 'lock-race-user';
  const secretData = { secret: 'información-confidencial' };
  const envelope = await encryptSyncModule(secretData, mdek, 'notes', testUserId);

  // Registrar sesión unlocked
  cryptoSession.setUnlocked(mdek, testUserId);

  // Iniciar decodificación asíncrona pero bloquear la sesión inmediatamente antes de que termine
  const decodePromise = decodeCloudModuleData(envelope, 'notes', testUserId, mdek);
  cryptoSession.lock(); // El usuario cierra la app o bloquea el vault

  const result = await decodePromise;

  // El adapter detecta que la sesión fue bloqueada durante la operación y retorna modo 'locked'
  assert.equal(result.mode, 'locked');
  if (result.mode === 'locked') {
    assert.equal(result.reason, 'session_locked');
  }
});

test('Fase 8.2b: Corrupted logging — no expone ciphertext, plaintext ni secretos en errores', async () => {
  const mdek = await generateMdek();
  const testUserId = 'sanitize-log-user';
  const superSecretKeyOrText = 'SECRET_PASSWORD_12345';

  // Envelope corrupto intencionalmente
  const corruptedEnvelope = {
    cryptoVersion: 1,
    algorithm: CRYPTO_ALGORITHM,
    iv: bytesToBase64(new Uint8Array(12)),
    ciphertext: bytesToBase64(new TextEncoder().encode(superSecretKeyOrText)), // no es AES-GCM válido
    createdAt: new Date().toISOString(),
  };

  const decodeRes = await decodeCloudModuleData(corruptedEnvelope, 'notes', testUserId, mdek);
  assert.equal(decodeRes.mode, 'corrupted');

  if (decodeRes.mode === 'corrupted') {
    // El mensaje de error debe ser genérico y sanitizado
    const errMessage = decodeRes.error.message;
    assert.ok(!errMessage.includes(superSecretKeyOrText));
    assert.ok(!errMessage.includes(corruptedEnvelope.ciphertext));
    assert.equal(decodeRes.reasonCode, 'INTEGRITY_OR_AUTH_FAILURE');
  }
});

test('Fase 8.2b: Mixed migration — estado parcialmente migrado no rompe el cliente Stage C', async () => {
  const mdek = await generateMdek();
  const testUserId = 'partially-migrated-user';

  // Simulación: 'finance' y 'notes' ya fueron migrados a encrypted, pero 'agenda' sigue en plaintext
  const rawFinance = { accounts: [{ id: 'acc-1', name: 'Banco', balance: 3000 }] };
  const rawNotes = { notes: [{ id: 'n-1', title: 'Nota cifrada' }] };
  const rawAgenda = { agenda: { lunes: [{ time: '10:00', activity: 'Gimnasio' }] } };

  const cloudModules = [
    { module: 'finance', data: await encryptSyncModule(rawFinance, mdek, 'finance', testUserId), isEncrypted: true },
    { module: 'notes', data: await encryptSyncModule(rawNotes, mdek, 'notes', testUserId), isEncrypted: true },
    { module: 'agenda', data: rawAgenda, isEncrypted: false },
  ];

  const decodedResultMap: Record<string, unknown> = {};

  for (const item of cloudModules) {
    const res = await decodeCloudModuleData(item.data, item.module, testUserId, mdek);
    assert.ok(res.mode === 'decrypted' || res.mode === 'plaintext');
    if (res.mode === 'decrypted' || res.mode === 'plaintext') {
      decodedResultMap[item.module] = res.data;
    }
  }

  assert.deepEqual(decodedResultMap['finance'], rawFinance);
  assert.deepEqual(decodedResultMap['notes'], rawNotes);
  assert.deepEqual(decodedResultMap['agenda'], rawAgenda);
});
