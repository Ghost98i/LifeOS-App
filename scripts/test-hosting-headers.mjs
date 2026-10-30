import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// Exercise Firebase's real matcher and SPA rewrites, not a test HTTP server.
// Run under: firebase emulators:exec --project demo-lifeos --only hosting "node scripts/test-hosting-headers.mjs"
const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;
const asset = readdirSync(`${hosting.public}/assets`).find(name => name.endsWith('.js'));
assert.ok(asset, 'Build the Hosting candidate before checking HTTP headers.');
const origin = 'http://127.0.0.1:5000';
const expectedCsp = hosting.headers.flatMap(entry => entry.headers)
  .find(header => header.key === 'Content-Security-Policy').value;
const results = [];
const spaRoutes = ['/', '/agenda', '/trabajo', '/reventa', '/finanzas', '/config', '/config/recuperacion', '/finanzas?closure-check=1', '/ruta-profunda/inexistente'];
for (const resource of [...spaRoutes, '/index.html', '/creditos.html', '/manifest.webmanifest', '/sw.js', '/registerSW.js', '/sw.js.map', '/assets-like/app.js', `/assets/${asset}`]) {
  const response = await fetch(new URL(resource, origin));
  assert.equal(response.status, 200, resource);
  const mime = response.headers.get('content-type');
  // All matching rules must keep the security headers, including cache overrides.
  assert.equal(response.headers.get('content-security-policy'), expectedCsp, resource);
  assert.equal(response.headers.get('x-frame-options'), 'DENY', resource);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', resource);
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', resource);
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), payment=(), geolocation=(self)', resource);
  if (resource.startsWith('/assets/')) {
    assert.match(response.headers.get('cache-control'), /max-age=31536000.*immutable/, resource);
    assert.match(mime, /javascript/, resource);
  } else if (resource === '/sw.js' || resource === '/registerSW.js') {
    assert.equal(response.headers.get('cache-control'), 'no-cache', resource);
    if (existsSync(`${hosting.public}${resource}`)) assert.match(mime, /javascript/, resource);
    else {
      // Some builds register the worker inline and omit registerSW.js. Its URL
      // still matches the cache exception, then falls through to the SPA rewrite.
      assert.match(mime, /text\/html/, resource);
      assert.match(await response.text(), /<div id="root">/, resource);
    }
  } else {
    assert.equal(response.headers.get('cache-control'), 'no-cache, no-store, must-revalidate', resource);
    if (spaRoutes.includes(resource) || ['/sw.js.map', '/assets-like/app.js'].includes(resource)) {
      assert.match(mime, /text\/html/, resource);
      assert.match(await response.text(), /<div id="root">/, resource);
    }
  }
  results.push({ resource, passed: true });
}
console.log(JSON.stringify({ passed: results.length, results }, null, 2));
