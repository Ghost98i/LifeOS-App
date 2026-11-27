import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  __resetCloudSyncLoaderForTesting,
  clearOAuthRedirectPending,
  getLoadedCloudRuntime,
  getLoadedCloudSync,
  hasPendingCloudSessionHint,
  isCloudSyncConfigured,
  loadCloudSync,
  markOAuthRedirectPending,
  preloadCloudSync,
} from './cloudSyncLoader';

const ROOT = process.cwd();

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findStaticRuntimeImports(source: string): string[] {
  const cleaned = stripComments(source);
  const results: string[] = [];
  const re = /(?:^|\n)\s*import\s+(?!type\b)([\s\S]*?from\s+)?['"]([^'"]+)['"]\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    results.push(match[2]);
  }
  return results;
}

test('Bloque 35.1: App.tsx y el shell inicial no tienen imports estáticos de runtime hacia Firebase, cloudSync, crypto* ni sync*', () => {
  const shellFiles = [
    'src/main.tsx',
    'src/App.tsx',
    'src/lib/cloudSyncLoader.ts',
    'src/components/Topbar.tsx',
    'src/components/Sidebar.tsx',
    'src/components/MobileNav.tsx',
    'src/components/OnboardingView.tsx',
    'src/components/DashboardSkeleton.tsx',
  ];

  const forbiddenPattern =
    /^(firebase\/|.*\/firebase(?:\.ts)?$|.*\/cloudSync(?:\.ts)?$|.*\/cryptoCore(?:\.ts)?$|.*\/cryptoMigration(?:\.ts)?$|.*\/cryptoPurge(?:\.ts)?$|.*\/syncModel(?:\.ts)?$|.*\/syncMerge(?:\.ts)?$|.*\/deviceTrust(?:\.ts)?$)/;

  for (const relPath of shellFiles) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const runtimeImports = findStaticRuntimeImports(src);
    const forbidden = runtimeImports.filter((spec) => forbiddenPattern.test(spec));
    assert.deepEqual(
      forbidden,
      [],
      `${relPath} no debe importar estáticamente en runtime módulos de Firebase/sync/crypto (solo import type): ${forbidden.join(', ')}`
    );
  }

  // App.tsx must also defer DashboardView via lazyWithPreload
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
  assert.match(appSrc, /const\s+DashboardView\s*=\s*lazyWithPreload\(/);
  assert.match(appSrc, /from\s+['"]\.\/lib\/cloudSyncLoader['"]/);
});

test('Bloque 35.2: cloudSyncLoader.ts deduplica promesas, expone acceso síncrono tras carga y precarga segura sin rechazos no manejados', async () => {
  __resetCloudSyncLoaderForTesting();
  assert.equal(getLoadedCloudSync(), null, 'Antes de cargar, getLoadedCloudSync() debe devolver null');
  assert.equal(getLoadedCloudRuntime(), null, 'Antes de cargar, getLoadedCloudRuntime() debe devolver null');
  assert.equal(isCloudSyncConfigured(), true);

  const p1 = loadCloudSync();
  const p2 = loadCloudSync();
  assert.strictEqual(p1, p2, 'loadCloudSync() debe deduplicar llamadas concurrentes retornando la misma promesa');

  const [m1, m2] = await Promise.all([p1, p2]);
  assert.strictEqual(m1, m2, 'Ambas llamadas concurrentes deben resolver al mismo módulo cloudSync');
  assert.strictEqual(getLoadedCloudSync(), m1, 'getLoadedCloudSync() debe devolver el módulo síncronamente tras resolver');

  // preloadCloudSync() must be idempotent and never reject unhandled
  const preloaded = await preloadCloudSync();
  assert.strictEqual(preloaded, m1, 'preloadCloudSync() debe resolver al mismo módulo cloudSync');
  assert.ok(getLoadedCloudRuntime(), 'preloadCloudSync() debe dejar caliente también el runtime completo de sync/crypto');
});

test('Bloque 35.3: hasPendingCloudSessionHint() distingue primera visita/local de sesión previa o redirect OAuth en curso', () => {
  const createMemoryStorage = (): Storage => {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear() {
        map.clear();
      },
      getItem(key: string) {
        return map.has(key) ? map.get(key)! : null;
      },
      key(index: number) {
        return Array.from(map.keys())[index] ?? null;
      },
      removeItem(key: string) {
        map.delete(key);
      },
      setItem(key: string, value: string) {
        map.set(key, String(value));
      },
    };
  };

  const prevLocal = globalThis.localStorage;
  const prevSession = globalThis.sessionStorage;

  try {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true, writable: true });

    // Clean first visit / 100% local user
    assert.equal(hasPendingCloudSessionHint(), false, 'Primera visita limpia no debe disparar arranque temprano de Firebase');
    local.setItem('lifeos-state-v1', JSON.stringify({ settings: { onboardingCompleted: true } }));
    assert.equal(hasPendingCloudSessionHint(), false, 'Usuario 100% local con estado sin scope no debe disparar Firebase antes de tiempo');

    // Deleted account marker must NOT count as active cloud session
    local.setItem('lifeos-cloud-last-user-v2', '__deleted__:uid-old');
    assert.equal(hasPendingCloudSessionHint(), false, 'Marcador __deleted__: no debe activar sesión cloud previa');

    // OAuth redirect in progress via sessionStorage flag
    markOAuthRedirectPending();
    assert.equal(hasPendingCloudSessionHint(), true, 'Redirect OAuth en curso debe activar arranque post-paint inmediato');
    clearOAuthRedirectPending();
    assert.equal(hasPendingCloudSessionHint(), false);

    // Firebase Auth redirect sessionStorage key
    session.setItem('firebase:redirectUser:apiKey:[DEFAULT]', '{}');
    assert.equal(hasPendingCloudSessionHint(), true);
    session.clear();

    // Prior cloud user in localStorage
    local.setItem('lifeos-cloud-last-user-v2', 'uid-active-123');
    assert.equal(hasPendingCloudSessionHint(), true, 'Usuario con sesión cloud previa debe activar arranque post-paint');
    local.removeItem('lifeos-cloud-last-user-v2');

    // Firebase browserLocalPersistence key
    local.setItem('firebase:authUser:apiKey:[DEFAULT]', '{"uid":"uid-active-123"}');
    assert.equal(hasPendingCloudSessionHint(), true);
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: prevLocal, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: prevSession, configurable: true, writable: true });
  }
});

test('Bloque 35.4: Botones de Google en OnboardingView, Topbar, ConfigView y MobileNav disparan preloadCloudSync en hover/focus/touchStart', () => {
  const buttonComponents = [
    'src/components/OnboardingView.tsx',
    'src/components/Topbar.tsx',
    'src/components/ConfigView.tsx',
    'src/components/MobileNav.tsx',
  ];

  for (const relPath of buttonComponents) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.match(src, /from\s+['"]\.\.\/lib\/cloudSyncLoader['"]/, `${relPath} debe importar preloadCloudSync desde cloudSyncLoader`);
    assert.match(src, /onPointerEnter=/, `${relPath} debe precargar cloudSync en onPointerEnter`);
    assert.match(src, /onFocus=/, `${relPath} debe precargar cloudSync en onFocus`);
    assert.match(src, /onTouchStart=/, `${relPath} debe precargar cloudSync en onTouchStart`);
  }
});

test('Bloque 35.5: dist/index.html no precarga síncronamente Firebase y mejora el presupuesto de arranque con PWA intacto', () => {
  const distHtmlPath = path.join(ROOT, 'dist/index.html');
  const assetsDir = path.join(ROOT, 'dist/assets');
  const swPath = path.join(ROOT, 'dist/sw.js');

  if (!fs.existsSync(distHtmlPath) || !fs.existsSync(assetsDir) || !fs.existsSync(swPath)) {
    return;
  }

  const html = fs.readFileSync(distHtmlPath, 'utf8');
  assert.doesNotMatch(
    html,
    /firebase-firestore-vendor/i,
    'dist/index.html NO debe incluir modulepreload ni script hacia firebase-firestore-vendor'
  );
  assert.doesNotMatch(
    html,
    /firebase-auth-vendor/i,
    'dist/index.html NO debe incluir modulepreload ni script hacia firebase-auth-vendor'
  );
  assert.doesNotMatch(
    html,
    /cloudSync-[^"']+\.js/i,
    'dist/index.html NO debe precargar síncronamente el chunk de cloudSync'
  );

  const files = fs.readdirSync(assetsDir);
  const entryJs = files.find((f) => /^index-[^.]+\.js$/.test(f));
  const firebaseAuthChunk = files.find((f) => /^firebase-auth-vendor-[^.]+\.js$/.test(f));
  const firebaseFirestoreChunk = files.find((f) => /^firebase-firestore-vendor-[^.]+\.js$/.test(f));

  assert.ok(entryJs, 'Debe existir el chunk inicial index-*.js');
  assert.ok(firebaseAuthChunk, 'firebase-auth-vendor debe emitirse como chunk diferido');
  assert.ok(firebaseFirestoreChunk, 'firebase-firestore-vendor debe emitirse como chunk diferido');

  const jsBuf = fs.readFileSync(path.join(assetsDir, entryJs));
  const jsRawKb = jsBuf.length / 1024;
  const jsGzipKb = zlib.gzipSync(jsBuf).length / 1024;
  assert.ok(jsRawKb <= 420, `index-*.js raw (${jsRawKb.toFixed(2)} kB) debe mantenerse <= 420 kB tras diferir Firebase/Dashboard`);
  assert.ok(jsGzipKb <= 125, `index-*.js gzip (${jsGzipKb.toFixed(2)} kB) debe mantenerse <= 125 kB tras diferir Firebase/Dashboard`);

  // VitePWA precache must still include the deferred chunks for offline resilience
  const swContent = fs.readFileSync(swPath, 'utf8');
  assert.ok(swContent.includes(entryJs), 'dist/sw.js debe precachear index-*.js');
  assert.ok(swContent.includes(firebaseAuthChunk), 'dist/sw.js debe precachear firebase-auth-vendor para modo offline');
  assert.ok(swContent.includes(firebaseFirestoreChunk), 'dist/sw.js debe precachear firebase-firestore-vendor para modo offline');
});
