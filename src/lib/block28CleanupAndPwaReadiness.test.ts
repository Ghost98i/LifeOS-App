import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  syncDocumentThemeColor,
} from './pwaRecovery';

const ROOT = process.cwd();

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filePath} debe ser PNG válido`);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

test('Bloque 28.1: Purga total de WeatherWidget, open-meteo y geolocalización en src/ (producción) y public/', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT, 'src/components/WeatherWidget.tsx')),
    false,
    'WeatherWidget.tsx debe estar eliminado'
  );

  const srcProdFiles = walkFiles(path.join(ROOT, 'src')).filter(
    (file) => !/\.test\.tsx?$/.test(file) && /\.(ts|tsx|css|js|mjs|json)$/.test(file)
  );
  const publicTextFiles = walkFiles(path.join(ROOT, 'public')).filter((file) =>
    /\.(html|json|svg|js|css|md|txt)$/.test(file)
  );

  for (const file of [...srcProdFiles, ...publicTextFiles]) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      /WeatherWidget|open-meteo|navigator\.geolocation|lifeos_last_weather/i,
      `${rel} no debe contener referencias a WeatherWidget, open-meteo ni geolocalización`
    );
  }
});

test('Bloque 28.2: vite.config.ts define manifest PWA completo para Lighthouse, PWABuilder y Bubblewrap (TWA)', () => {
  const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');

  // Campos base del manifest
  assert.match(viteConfig, /id:\s*'\/'/);
  assert.match(viteConfig, /name:\s*'Celestian LifeOS'/);
  assert.match(viteConfig, /short_name:\s*'Celestian'/);
  assert.match(viteConfig, /lang:\s*'es'/);
  assert.match(viteConfig, /dir:\s*'ltr'/);
  assert.match(viteConfig, /start_url:\s*'\/'/);
  assert.match(viteConfig, /scope:\s*'\/'/);
  assert.match(viteConfig, /display:\s*'standalone'/);
  assert.match(viteConfig, /display_override:\s*\['window-controls-overlay',\s*'standalone'\]/);
  assert.match(viteConfig, /categories:\s*\['productivity',\s*'lifestyle',\s*'finance'\]/);
  assert.match(viteConfig, /theme_color:\s*'#07090E'/);
  assert.match(viteConfig, /background_color:\s*'#07090E'/);

  // Descripción limpia en español sin mención a clima ni jerga técnica
  const descMatch = viteConfig.match(/description:\s*'([^']+)'/);
  assert.ok(descMatch, 'manifest debe incluir description');
  assert.doesNotMatch(descMatch[1], /clima|open-meteo|ERP|PWA|TWA/i);

  // Nunca combinar "any maskable" en una misma entrada
  assert.doesNotMatch(viteConfig, /purpose:\s*['"][^'"]*any\s+maskable[^'"]*['"]/i);
  assert.doesNotMatch(viteConfig, /purpose:\s*['"][^'"]*maskable\s+any[^'"]*['"]/i);

  // 4 entradas separadas de íconos (192x192 y 512x512 para any y maskable) y archivos PNG válidos
  const expectedIcons = [
    { src: '/lifeos-icon-192.png', size: 192, purpose: 'any' },
    { src: '/lifeos-icon-512.png', size: 512, purpose: 'any' },
    { src: '/icon-192-maskable.png', size: 192, purpose: 'maskable' },
    { src: '/icon-512-maskable.png', size: 512, purpose: 'maskable' },
  ];

  for (const icon of expectedIcons) {
    const escapedSrc = icon.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const iconRegex = new RegExp(
      `src:\\s*'${escapedSrc}'[^}]*sizes:\\s*'${icon.size}x${icon.size}'[^}]*type:\\s*'image\\/png'[^}]*purpose:\\s*'${icon.purpose}'`
    );
    assert.match(viteConfig, iconRegex, `Falta entrada válida para ${icon.src} (${icon.purpose})`);

    const diskPath = path.join(ROOT, 'public', icon.src.slice(1));
    assert.equal(fs.existsSync(diskPath), true, `Falta archivo en public: ${icon.src}`);
    const dims = readPngDimensions(diskPath);
    assert.equal(dims.width, icon.size, `${icon.src}: ancho debe ser ${icon.size}`);
    assert.equal(dims.height, icon.size, `${icon.src}: alto debe ser ${icon.size}`);
  }

  // 3 shortcuts útiles apuntando a /?view=... con ícono existente
  for (const view of ['dashboard', 'finanzas', 'gimnasio']) {
    assert.match(
      viteConfig,
      new RegExp(`url:\\s*'/\\?view=${view}'`),
      `Falta shortcut para /?view=${view}`
    );
  }
});

test('Bloque 28.3: Workbox navigateFallbackDenylist protege /.well-known/ y las 3 páginas públicas legales', () => {
  const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  const denylistBlock = viteConfig.match(/navigateFallbackDenylist:\s*\[([\s\S]*?)\]/);
  assert.ok(denylistBlock, 'Debe existir navigateFallbackDenylist en vite.config.ts');

  const regexLiterals = [...denylistBlock[1].matchAll(/\/((?:\\\/|[^/])+)\/([gimsuy]*)/g)].map(
    (m) => new RegExp(m[1], m[2])
  );
  assert.ok(regexLiterals.length >= 4, 'Debe listar al menos 4 patrones en navigateFallbackDenylist');

  for (const protectedPath of [
    '/.well-known/assetlinks.json',
    '/privacidad.html',
    '/eliminar-cuenta.html',
    '/creditos.html',
  ]) {
    assert.ok(
      regexLiterals.some((rx) => rx.test(protectedPath)),
      `navigateFallbackDenylist debe excluir ${protectedPath}`
    );
  }

  // Las rutas SPA normales NO deben ser excluidas por navigateFallbackDenylist
  for (const spaPath of ['/', '/finanzas', '/gimnasio', '/agenda']) {
    assert.ok(
      !regexLiterals.some((rx) => rx.test(spaPath)),
      `navigateFallbackDenylist no debe bloquear ruta SPA ${spaPath}`
    );
  }
});

test('Bloque 28.4: firebase.json bloquea geolocation/camera/microphone, limpia CSP, protege rutas legales y no rompe Google Auth', () => {
  const firebaseJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
  const rewrites = firebaseJson.hosting.rewrites as Array<{ source?: string; regex?: string; destination: string }>;
  const headers = firebaseJson.hosting.headers as Array<{
    regex: string;
    headers: Array<{ key: string; value: string }>;
  }>;

  // Rewrites explícitos para Digital Asset Links y páginas HTML públicas antes del fallback SPA
  const spaFallbackIndex = rewrites.findIndex((r) => r.destination === '/index.html');
  assert.ok(spaFallbackIndex > 0, 'El fallback SPA debe ir después de las rutas explícitas');
  for (const publicFile of [
    '/.well-known/assetlinks.json',
    '/privacidad.html',
    '/eliminar-cuenta.html',
    '/creditos.html',
  ]) {
    const idx = rewrites.findIndex((r) => r.source === publicFile && r.destination === publicFile);
    assert.ok(idx >= 0 && idx < spaFallbackIndex, `Rewrite explícito requerido para ${publicFile}`);
  }

  const globalHeaders = Object.fromEntries(
    headers
      .find((h) => h.regex === '.*')!
      .headers.map((entry) => [entry.key.toLowerCase(), entry.value])
  );

  assert.equal(globalHeaders['x-content-type-options'], 'nosniff');
  assert.equal(globalHeaders['referrer-policy'], 'strict-origin-when-cross-origin');

  const permPolicy = globalHeaders['permissions-policy'] || '';
  assert.match(permPolicy, /\bgeolocation=\(\)/);
  assert.match(permPolicy, /\bcamera=\(\)/);
  assert.match(permPolicy, /\bmicrophone=\(\)/);

  const csp = globalHeaders['content-security-policy'] || '';
  assert.doesNotMatch(csp, /open-meteo/i, 'CSP no debe mencionar open-meteo');
  assert.match(csp, /frame-src[^;]*accounts\.google\.com/, 'CSP debe permitir Google Auth');

  // No debe existir un COOP restrictivo (same-origin) que rompa Firebase Auth popup/redirect
  const coop = globalHeaders['cross-origin-opener-policy'];
  assert.ok(
    !coop || coop === 'same-origin-allow-popups' || coop === 'unsafe-none',
    'COOP no debe bloquear popups de Firebase Auth'
  );
});

test('Bloque 28.5: index.html cumple estándar móvil/PWA y syncDocumentThemeColor actualiza ambos meta theme-color', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  assert.match(html, /<html\s+lang="es">/);
  assert.match(html, /<title>Celestian LifeOS<\/title>/);
  assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);
  assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0,\s*viewport-fit=cover"\s*\/>/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i, 'No debe bloquear zoom por accesibilidad');
  assert.match(html, /<link\s+rel="apple-touch-icon"\s+href="\/lifeos-icon-180\.png"\s*\/>/);
  assert.match(
    html,
    /<meta\s+name="theme-color"\s+media="\(prefers-color-scheme:\s*dark\)"\s+content="#07090E"\s*\/>/
  );
  assert.match(
    html,
    /<meta\s+name="theme-color"\s+media="\(prefers-color-scheme:\s*light\)"\s+content="#F3F6FA"\s*\/>/
  );

  // Verificar sincronización dinámica cuando hay múltiples meta[name="theme-color"]
  const values = ['#07090E', '#F3F6FA'];
  const fakeMetas = values.map((_, idx) => ({
    setAttribute: (_name: string, val: string) => {
      values[idx] = val;
    },
  })) as unknown as Element[];
  const fakeDoc = {
    querySelector: () => fakeMetas[0],
    querySelectorAll: () => fakeMetas as unknown as NodeListOf<Element>,
  };

  assert.equal(syncDocumentThemeColor(false, fakeDoc), LIGHT_THEME_COLOR);
  assert.deepEqual(values, [LIGHT_THEME_COLOR, LIGHT_THEME_COLOR]);

  assert.equal(syncDocumentThemeColor(true, fakeDoc), DARK_THEME_COLOR);
  assert.deepEqual(values, [DARK_THEME_COLOR, DARK_THEME_COLOR]);
});
