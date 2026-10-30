import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const out = 'artifacts/consolidacion-tres-tandas-20261029';
const manifest = JSON.parse(await fs.readFile(`${out}/candidate.json`, 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
for (const input of manifest.inputs) assert.equal(sha(await fs.readFile(input.path)), input.sha256, input.path);
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  env: { ...process.env, LIFEOS_BUILD_ID: manifest.buildId, VITE_FIREBASE_PROJECT_ID: 'lifeosanywhere', VITE_FIREBASE_EMULATORS: '0', VITE_COMMERCIAL_PILOT: '0', VITE_COMMERCIAL_PILOT_SYNC: '0' },
});
await fs.writeFile(`${out}/reproducible-build.log`, (result.stdout || '') + (result.stderr || ''));
assert.equal(result.status, 0);
for (const input of manifest.inputs) assert.equal(sha(await fs.readFile(input.path)), input.sha256, input.path);
for (const output of manifest.outputFiles) assert.equal(sha(await fs.readFile(path.join('dist', output.path))), output.sha256, output.path);
assert.equal((await fs.readdir('dist/assets')).length, manifest.outputFiles.filter(f => f.path.startsWith('assets/')).length);
await fs.writeFile(`${out}/reproducible-build.json`, JSON.stringify({ sourceFingerprint: manifest.sourceFingerprint, identicalFiles: manifest.outputFiles.length, passed: true }, null, 2));
console.log(`PASS: second production build has ${manifest.outputFiles.length} byte-identical files; source hashes unchanged.`);
