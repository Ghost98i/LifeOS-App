// Build and seal a uniquely named Hosting candidate, without publishing.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const out = 'artifacts/consolidacion-tres-tandas-20261029';
const backup = JSON.parse(await fs.readFile(`${out}/backup.json`, 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function tree(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await tree(name));
    else { assert.ok(entry.isFile(), name); const bytes = await fs.readFile(name); result.push({ path: name, bytes: bytes.length, sha256: sha(bytes) }); }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
async function inputs() {
  const files = [...await tree('src'), ...await tree('public')];
  for (const name of ['index.html', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json', 'firebase-applet-config.json', 'firebase.json', '.firebaserc', '.env', '.env.local', '.env.production', '.env.production.local']) {
    try { const bytes = await fs.readFile(name); files.push({ path: name, bytes: bytes.length, sha256: sha(bytes) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const before = await inputs();
const fingerprint = sha(JSON.stringify(before));
const buildId = `${path.basename(backup.package).replace('consolidado-tandas-1-2-3-', '')}-t123-${fingerprint.slice(0, 12)}`;
const candidate = path.join(backup.package, `candidate-${fingerprint.slice(0, 12)}`);
await fs.mkdir(candidate, { recursive: false });
assert.equal(JSON.parse(await fs.readFile('.firebaserc', 'utf8')).projects.default, 'lifeosanywhere');
assert.equal(JSON.parse(await fs.readFile('firebase-applet-config.json', 'utf8')).projectId, 'lifeosanywhere');
const env = { ...process.env, LIFEOS_BUILD_ID: buildId, VITE_FIREBASE_PROJECT_ID: 'lifeosanywhere', VITE_FIREBASE_EMULATORS: '0', VITE_COMMERCIAL_PILOT: '0', VITE_COMMERCIAL_PILOT_SYNC: '0' };
const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { env, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
await fs.writeFile(`${out}/build.log`, (build.stdout || '') + (build.stderr || ''));
assert.equal(build.status, 0, 'Build failed; see build.log');
assert.deepEqual(await inputs(), before, 'Build inputs changed during build');
await fs.cp('dist', path.join(candidate, 'dist'), { recursive: true, errorOnExist: true, force: false });
const firebase = JSON.parse(await fs.readFile('firebase.json', 'utf8'));
// A Hosting-only config makes Rules deployment unavailable from this package.
await fs.writeFile(path.join(candidate, 'firebase.json'), JSON.stringify({ hosting: firebase.hosting }, null, 2));
await fs.writeFile(path.join(candidate, '.firebaserc'), JSON.stringify({ projects: { default: 'lifeosanywhere' } }, null, 2));
const outputFiles = (await tree(path.join(candidate, 'dist'))).map(file => ({ ...file, path: path.relative(path.join(candidate, 'dist'), file.path).replaceAll('\\', '/') }));
const allJs = outputFiles.filter(f => f.path.endsWith('.js'));
const scripts = await Promise.all(allJs.map(f => fs.readFile(path.join(candidate, 'dist', f.path), 'utf8')));
// The existing app does not render __LIFEOS_BUILD_ID__; it is tree-shaken.
// Provenance is verified by the input/output manifests, never a UI label.
for (const prefix of ['EstudiosView-', 'NotasView-', 'IAView-', 'AgendaView-', 'TrabajoView-', 'ReventaView-', 'FinanzasView-', 'ConfigView-']) assert.ok(outputFiles.some(f => path.basename(f.path).startsWith(prefix)), prefix);
assert.ok(scripts.some(s => s.includes('Mezclar sonidos')), 'Ambient player missing');
assert.ok(scripts.some(s => s.includes('Notas y herramientas')), 'Tools UI missing');
assert.ok(scripts.some(s => s.includes('Oportunidades e ideas')), 'IA UI missing');
const sw = await fs.readFile(path.join(candidate, 'dist/sw.js'), 'utf8');
const precacheMatch = sw.match(/precacheAndRoute\((\[.*?\]),\{/s);
assert.ok(precacheMatch, 'Missing precache manifest');
// Workbox serializes JS object keys without JSON quotes.
const urls = [...precacheMatch[1].matchAll(/url:"([^"]+)"/g)].map(m => m[1]);
for (const f of outputFiles.filter(f => /\.(js|css|woff2|wasm|lottie|webp)$/.test(f.path) && !/^(sw\.js|workbox-)/.test(f.path))) assert.ok(urls.includes(f.path), `Offline resource missing: ${f.path}`);
assert.equal(outputFiles.filter(f => /\.(mp3|ogg|wav|flac|aac)$/.test(f.path)).length, 0, 'Unexpected audio download');
const originalState = JSON.parse(await fs.readFile(path.join(backup.package, 'source-state.json'), 'utf8'));
for (const f of before) {
  const original = originalState.files.find(entry => entry.path === f.path);
  assert.ok(original && original.sha256 === f.sha256, `Product changed since backup: ${f.path}`);
}
const manifest = { createdAt: new Date().toISOString(), project: 'lifeosanywhere', buildId, embeddedBuildId: false, sourceFingerprint: fingerprint, inputs: before,
  outputFiles, precacheEntries: urls.length, totalBytes: outputFiles.reduce((n, f) => n + f.bytes, 0),
  buildEnvironment: { node: process.version, mode: 'production', firebaseProject: 'lifeosanywhere', emulators: false, commercialPilot: false },
  candidate, backupPackage: backup.package, productUnchangedSinceBackup: true, hostingOnly: true };
await fs.writeFile(path.join(candidate, 'candidate-manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(`${out}/candidate.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ candidate, buildId, files: outputFiles.length, precacheEntries: urls.length, sourceFingerprint: fingerprint }, null, 2));
