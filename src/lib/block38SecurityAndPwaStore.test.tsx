import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defaultState } from './storage';
import {
  clearShortcutFromHistory,
  parsePwaShortcut,
  resolvePwaShortcutEffect,
  stripShortcutQueryParam,
} from './pwaShortcuts';

const ROOT = process.cwd();

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  assert.equal(
    buf.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    `${filePath} debe ser un PNG válido`
  );
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function parseCspDirectives(csp: string): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const rawPart of csp.split(';')) {
    const trimmed = rawPart.trim();
    if (!trimmed) continue;
    const [directive, ...tokens] = trimmed.split(/\s+/);
    map[directive.toLowerCase()] = tokens;
  }
  return map;
}

test('Bloque 38.1: firebase.json blinda cabeceras HTTP de seguridad, CSP compatible con Auth/Firestore/Lottie y pista /.well-known/**', () => {
  const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')) as {
    hosting: {
      rewrites: Array<{ source?: string; regex?: string; destination: string }>;
      headers: Array<{ source?: string; regex?: string; headers: Array<{ key: string; value: string }> }>;
    };
  };

  const globalRule = firebaseJson.hosting.headers.find((entry) => entry.regex === '.*');
  assert.ok(globalRule, 'Debe existir regla global de cabeceras regex ".*" en firebase.json');

  const globalHeaders = Object.fromEntries(
    globalRule.headers.map((h) => [h.key.toLowerCase(), h.value])
  );

  assert.equal(globalHeaders['x-content-type-options'], 'nosniff');
  assert.equal(globalHeaders['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(globalHeaders['x-frame-options'], 'DENY');
  assert.equal(
    globalHeaders['cross-origin-opener-policy'],
    'same-origin-allow-popups',
    'COOP debe ser same-origin-allow-popups para no romper signInWithPopup de Firebase Auth'
  );
  assert.equal(
    globalHeaders['strict-transport-security'],
    'max-age=31536000; includeSubDomains'
  );

  const permissions = globalHeaders['permissions-policy'] || '';
  for (const denied of [
    'geolocation=()',
    'camera=()',
    'microphone=()',
    'payment=()',
    'usb=()',
    'interest-cohort=()',
  ]) {
    assert.ok(
      permissions.includes(denied),
      `Permissions-Policy debe denegar explícitamente ${denied}`
    );
  }

  const cspRaw = globalHeaders['content-security-policy'] || '';
  assert.ok(cspRaw.length > 0, 'Debe declararse Content-Security-Policy');
  const csp = parseCspDirectives(cspRaw);

  assert.deepEqual(csp['default-src'], ["'self'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['manifest-src'], ["'self'"]);

  // script-src & script-src-elem: sin 'unsafe-eval' de JS; permite WASM de dotLottie y scripts exactos de Google Auth
  const scriptSrc = csp['script-src'] || [];
  assert.ok(scriptSrc.includes("'self'"), 'script-src debe incluir self');
  assert.ok(
    !scriptSrc.includes("'unsafe-eval'"),
    'script-src NO debe permitir JS unsafe-eval'
  );
  assert.ok(
    scriptSrc.includes("'wasm-unsafe-eval'"),
    'script-src debe incluir wasm-unsafe-eval para compilar dotlottie-player.wasm sin abrir JS eval'
  );
  const scriptSrcElem = csp['script-src-elem'] || [];
  for (const origin of [
    "'self'",
    'https://apis.google.com/js/api.js',
    'https://apis.google.com/_/scs/abc-static/_/js/',
  ]) {
    assert.ok(scriptSrcElem.includes(origin), `script-src-elem debe incluir ${origin}`);
  }

  // style-src, img-src, font-src, worker-src
  assert.ok((csp['style-src'] || []).includes("'self'"));
  assert.ok((csp['style-src'] || []).includes("'unsafe-inline'"));
  for (const imgToken of [
    "'self'",
    'data:',
    'blob:',
    'https://lh3.googleusercontent.com',
    'https://*.googleusercontent.com',
  ]) {
    assert.ok((csp['img-src'] || []).includes(imgToken), `img-src debe incluir ${imgToken}`);
  }
  assert.ok((csp['font-src'] || []).includes("'self'"));
  assert.ok((csp['font-src'] || []).includes('data:'));
  assert.ok((csp['worker-src'] || []).includes("'self'"));
  assert.ok((csp['worker-src'] || []).includes('blob:'));

  // connect-src: endpoints exactos de Firebase/Firestore/Auth
  const connectSrc = csp['connect-src'] || [];
  for (const endpoint of [
    "'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    'https://lifeosanywhere.firebaseapp.com',
    'https://lifeosanywhere.web.app',
  ]) {
    assert.ok(connectSrc.includes(endpoint), `connect-src debe incluir ${endpoint}`);
  }

  // frame-src: Google Sign-In popup/redirect
  const frameSrc = csp['frame-src'] || [];
  for (const frameOrigin of [
    "'self'",
    'https://lifeosanywhere.firebaseapp.com',
    'https://accounts.google.com',
    'https://apis.google.com',
  ]) {
    assert.ok(frameSrc.includes(frameOrigin), `frame-src debe incluir ${frameOrigin}`);
  }

  // /.well-known/** para TWA Digital Asset Links
  const wellKnownHeaderRule = firebaseJson.hosting.headers.find(
    (entry) =>
      entry.source === '/.well-known/**' ||
      (entry.regex && entry.regex.includes('\\.well-known'))
  );
  assert.ok(wellKnownHeaderRule, 'firebase.json debe declarar cabeceras para /.well-known/**');
  const wkHeaders = Object.fromEntries(
    wellKnownHeaderRule.headers.map((h) => [h.key.toLowerCase(), h.value])
  );
  assert.match(wkHeaders['content-type'] || '', /^application\/json/i);
  assert.equal(wkHeaders['cache-control'], 'public, max-age=300');

  const spaFallbackIdx = firebaseJson.hosting.rewrites.findIndex(
    (r) => r.destination === '/index.html'
  );
  const assetLinksIdx = firebaseJson.hosting.rewrites.findIndex(
    (r) => r.source === '/.well-known/assetlinks.json' && r.destination === '/.well-known/assetlinks.json'
  );
  assert.ok(
    assetLinksIdx >= 0 && assetLinksIdx < spaFallbackIdx,
    '/.well-known/assetlinks.json debe servirse antes del catch-all hacia /index.html'
  );

  // Políticas de caché críticas intactas
  const swCacheRule = firebaseJson.hosting.headers.find(
    (entry) => entry.regex && entry.regex.includes('sw\\.js') && entry.regex.includes('manifest\\.webmanifest')
  );
  assert.ok(swCacheRule, 'Debe mantenerse regla no-cache para sw.js y manifest.webmanifest');
  assert.equal(
    swCacheRule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value,
    'no-cache'
  );

  const assetsCacheRule = firebaseJson.hosting.headers.find(
    (entry) => entry.regex && entry.regex.includes('assets')
  );
  assert.ok(assetsCacheRule, 'Debe mantenerse regla immutable para /assets/**');
  assert.match(
    assetsCacheRule.headers.find((h) => h.key.toLowerCase() === 'cache-control')?.value || '',
    /immutable/
  );
});

test('Bloque 38.2: vite.config.ts, dist/manifest.webmanifest y dist/sw.js cumplen estándar Google Play / TWA sin engordar precache', () => {
  const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /orientation:\s*'any'/);
  assert.match(viteConfig, /launch_handler:\s*\{\s*client_mode:\s*'focus-existing'/);
  assert.match(viteConfig, /globIgnores:[^\n]*screenshots/);
  assert.match(viteConfig, /\/\^\\\/\\\.well-known\\\//);

  const distManifestPath = path.join(ROOT, 'dist/manifest.webmanifest');
  const distSwPath = path.join(ROOT, 'dist/sw.js');

  assert.equal(
    fs.existsSync(distManifestPath),
    true,
    'dist/manifest.webmanifest debe existir tras npm run build'
  );
  assert.equal(fs.existsSync(distSwPath), true, 'dist/sw.js debe existir tras npm run build');

  const manifest = JSON.parse(fs.readFileSync(distManifestPath, 'utf8')) as {
    id: string;
    start_url: string;
    scope: string;
    lang: string;
    dir: string;
    display: string;
    orientation: string;
    theme_color: string;
    background_color: string;
    categories: string[];
    launch_handler?: { client_mode?: string };
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    shortcuts: Array<{ name: string; url: string; icons?: Array<{ src: string }> }>;
    screenshots: Array<{ src: string; sizes: string; type: string; form_factor: string; label: string }>;
  };

  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.lang, 'es');
  assert.equal(manifest.dir, 'ltr');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.theme_color, '#07090E');
  assert.equal(manifest.background_color, '#07090E');
  assert.deepEqual(manifest.launch_handler, { client_mode: 'focus-existing' });
  assert.deepEqual(manifest.categories, ['productivity', 'finance', 'fitness', 'lifestyle']);

  // Íconos any y maskable estrictamente separados
  assert.ok(manifest.icons.length >= 4);
  for (const icon of manifest.icons) {
    assert.ok(
      icon.purpose === 'any' || icon.purpose === 'maskable',
      `Ícono ${icon.src} debe declarar purpose separado ('any' o 'maskable'), recibido: ${icon.purpose}`
    );
  }
  assert.ok(manifest.icons.some((i) => i.purpose === 'any' && i.sizes === '512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));

  // 4 shortcuts nativos con ?shortcut=...
  const shortcutUrls = manifest.shortcuts.map((s) => s.url);
  assert.deepEqual(shortcutUrls, [
    '/?shortcut=capture',
    '/?shortcut=gimnasio',
    '/?shortcut=finanzas',
    '/?shortcut=hoy',
  ]);

  // 2 Rich Install UI screenshots reales (wide y narrow), presentes en dist/ y excluidos del precache de sw.js
  assert.equal(manifest.screenshots.length, 2);
  const wide = manifest.screenshots.find((s) => s.form_factor === 'wide');
  const narrow = manifest.screenshots.find((s) => s.form_factor === 'narrow');
  assert.ok(wide && narrow, 'manifest.screenshots debe incluir una captura wide y una narrow');
  assert.equal(wide.src, '/screenshots/desktop-hoy.png');
  assert.equal(wide.sizes, '1280x720');
  assert.equal(narrow.src, '/screenshots/mobile-hoy.png');
  assert.equal(narrow.sizes, '390x844');

  for (const shot of [wide, narrow]) {
    const rel = shot.src.replace(/^\//, '');
    const publicFile = path.join(ROOT, 'public', rel);
    const distFile = path.join(ROOT, 'dist', rel);
    assert.equal(fs.existsSync(publicFile), true, `Falta captura en public: ${rel}`);
    assert.equal(fs.existsSync(distFile), true, `Falta captura en dist: ${rel}`);
    const [expectedW, expectedH] = shot.sizes.split('x').map(Number);
    const dims = readPngDimensions(distFile);
    assert.equal(dims.width, expectedW, `${rel}: ancho esperado ${expectedW}`);
    assert.equal(dims.height, expectedH, `${rel}: alto esperado ${expectedH}`);
  }

  const swContent = fs.readFileSync(distSwPath, 'utf8');
  assert.equal(
    swContent.includes('screenshots/'),
    false,
    'dist/sw.js NO debe precachear screenshots/**'
  );
  assert.equal(
    swContent.includes('desktop-hoy.png'),
    false,
    'dist/sw.js NO debe precachear desktop-hoy.png'
  );
  assert.equal(
    swContent.includes('mobile-hoy.png'),
    false,
    'dist/sw.js NO debe precachear mobile-hoy.png'
  );
});

test('Bloque 38.3: pwaShortcuts.ts parsea de forma segura, respeta hiddenTabs/onboarding y limpia la URL', () => {
  // Parsing válido
  assert.equal(parsePwaShortcut('?shortcut=capture'), 'capture');
  assert.equal(parsePwaShortcut('?shortcut=gimnasio'), 'gimnasio');
  assert.equal(parsePwaShortcut('?shortcut=finanzas'), 'finanzas');
  assert.equal(parsePwaShortcut('?shortcut=hoy'), 'hoy');
  assert.equal(parsePwaShortcut('?foo=1&shortcut=  GIMNASIO  &bar=2'), 'gimnasio');

  // Rechazo de valores inválidos / maliciosos
  for (const bad of [
    '',
    '?',
    '?shortcut=',
    '?shortcut=config',
    '?shortcut=checkout',
    '?shortcut=__proto__',
    '?shortcut=constructor',
    '?shortcut=<script>alert(1)</script>',
    '?shortcut=javascript:alert(1)',
    '?shortcut=../admin',
    `?shortcut=${'a'.repeat(64)}`,
  ]) {
    assert.equal(parsePwaShortcut(bad), null, `Debe rechazar valor inválido: ${bad}`);
  }

  // Resolución con onboarding completado y módulos habilitados
  const state = defaultState();
  state.settings.onboardingCompleted = true;
  state.settings.hiddenTabs = ['ia'];

  assert.deepEqual(
    resolvePwaShortcutEffect('capture', state, { onboardingDone: true }),
    { kind: 'open-capture' }
  );
  assert.deepEqual(
    resolvePwaShortcutEffect('gimnasio', state, { onboardingDone: true }),
    { kind: 'navigate', view: 'gimnasio' }
  );
  assert.deepEqual(
    resolvePwaShortcutEffect('finanzas', state, { onboardingDone: true }),
    { kind: 'navigate', view: 'finanzas' }
  );
  assert.deepEqual(
    resolvePwaShortcutEffect('hoy', state, { onboardingDone: true }),
    { kind: 'navigate', view: 'dashboard' }
  );

  // Respeto estricto de hiddenTabs: si el módulo está oculto, cae limpiamente a Hoy ('dashboard')
  const hiddenState = defaultState();
  hiddenState.settings.onboardingCompleted = true;
  hiddenState.settings.hiddenTabs = ['ia', 'gimnasio', 'finanzas'];
  assert.deepEqual(
    resolvePwaShortcutEffect('gimnasio', hiddenState, { onboardingDone: true }),
    { kind: 'navigate', view: 'dashboard' }
  );
  assert.deepEqual(
    resolvePwaShortcutEffect('finanzas', hiddenState, { onboardingDone: true }),
    { kind: 'navigate', view: 'dashboard' }
  );

  // Con onboarding pendiente, no dispara navegación ni modal
  assert.deepEqual(
    resolvePwaShortcutEffect('capture', state, { onboardingDone: false }),
    { kind: 'none' }
  );
  assert.deepEqual(
    resolvePwaShortcutEffect('finanzas', state, { onboardingDone: false }),
    { kind: 'none' }
  );

  // Limpieza segura de ?shortcut=... preservando otros parámetros y hash
  assert.equal(
    stripShortcutQueryParam({ pathname: '/', search: '?shortcut=capture', hash: '' }),
    '/'
  );
  assert.equal(
    stripShortcutQueryParam({ pathname: '/', search: '?shortcut=finanzas&utm=pwa', hash: '#top' }),
    '/?utm=pwa#top'
  );
  assert.equal(
    stripShortcutQueryParam({ pathname: '/', search: '?other=1', hash: '' }),
    null
  );

  const calls: Array<{ state: unknown; url: string | URL | null | undefined }> = [];
  const fakeWindow = {
    location: { pathname: '/', search: '?shortcut=gimnasio', hash: '' },
    history: {
      state: { idx: 1 },
      replaceState(st: unknown, _unused: string, url?: string | URL | null) {
        calls.push({ state: st, url });
      },
    },
  };
  assert.equal(clearShortcutFromHistory(fakeWindow), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { state: { idx: 1 }, url: '/' });
});
