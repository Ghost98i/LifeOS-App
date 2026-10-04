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
  clearWrappedKeyEnvelope,
  isZeroKnowledgeProvisioned,
  encryptSyncModule,
  decryptSyncModule,
  CryptoDecryptionError,
  CryptoKeyError,
  base64ToBytes,
  bytesToBase64,
  CURRENT_CRYPTO_VERSION,
  CURRENT_KEY_FORMAT_VERSION,
  CRYPTO_ALGORITHM,
} from './cryptoCore';
import { defaultState, CURRENT_SCHEMA_VERSION } from './storage';
import { mergeSyncModuleWithConflicts } from './syncModel';

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

test('cryptoCore — Rewrap Recovery Key: clave antigua invalidada y datos previos intactos', async () => {
  const testUserId = 'user-rewrap-test';
  const { recoveryKeyFormatted: oldKey, sessionMdek, envelope } = await provisionZeroKnowledgeKeys(testUserId);

  // Ciframos un documento con la MDEK actual
  const sampleDoc = { note: 'Nota personal muy importante', date: '2026-10-04' };
  const encryptedDoc = await encryptPayload(sampleDoc, sessionMdek);

  // 1. Rewrap con autorización mediante la Recovery Key actual
  const { newRecoveryKeyFormatted, newEnvelope, sessionMdek: newSessionKey } = await rewrapMdekWithNewRecoveryKey(
    oldKey,
    envelope,
    testUserId
  );

  assert.equal(newSessionKey.extractable, false);
  assert.notEqual(newRecoveryKeyFormatted, oldKey);
  assert.notEqual(newEnvelope.wrappedMdek.ciphertext, envelope.wrappedMdek.ciphertext);

  // 2. La clave de recuperación ANTIGUA ya NO desbloquea el nuevo envelope
  await assert.rejects(
    async () => unlockMdekWithRecoveryKey(oldKey, newEnvelope),
    CryptoDecryptionError
  );

  // 3. La NUEVA clave de recuperación desbloquea exitosamente el nuevo envelope
  const recoveredKey = await unlockMdekWithRecoveryKey(newRecoveryKeyFormatted, newEnvelope);
  assert.equal(recoveredKey.extractable, false);

  // 4. La MDEK recuperada descifra perfectamente el documento cifrado ANTES del rewrap
  // (Demuestra que rewrap MDEK NO requiere re-cifrar los datos existentes)
  const decryptedOldDoc = await decryptPayload(encryptedDoc, recoveredKey);
  assert.deepEqual(decryptedOldDoc, sampleDoc);

  // 5. Intento de rewrap con clave incorrecta es rechazado de inmediato
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
