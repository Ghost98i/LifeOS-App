// Standalone verifier, copied into the durable release package. Read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const args = process.argv.slice(2);
const packageArg = args.indexOf('--package');
const root = packageArg >= 0 ? path.resolve(args[packageArg + 1]) : path.dirname(fileURLToPath(import.meta.url));
const index = JSON.parse(await fs.readFile(path.join(root, 'release-index.json'), 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
if (args.includes('--backup')) {
  const expected = JSON.parse(await fs.readFile(path.join(root, 'backup-checksums.json'), 'utf8'));
  for (const [name, file] of Object.entries(expected)) {
    const hash = crypto.createHash('sha256');
    for await (const chunk of createReadStream(path.join(root, name))) hash.update(chunk);
    assert.equal(hash.digest('hex'), file.sha256, name);
  }
}
for (const file of index.sealedFiles) assert.equal(sha(await fs.readFile(path.join(root, file.path))), file.sha256, file.path);
const candidate = JSON.parse(await fs.readFile(path.join(root, index.candidate, 'candidate-manifest.json'), 'utf8'));
const rollback = JSON.parse(await fs.readFile(path.join(root, index.rollback, 'production-manifest.json'), 'utf8'));
const target = args.includes('--rollback') ? index.rollback : index.candidate;
const files = args.includes('--rollback') ? rollback.localRollback.files : candidate.outputFiles;
async function list(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await list(full)); else { assert.ok(entry.isFile()); result.push(full); }
  }
  return result;
}
const dist = path.join(root, target, 'dist');
for (const file of files) assert.equal(sha(await fs.readFile(path.join(dist, file.path))), file.sha256, file.path);
assert.equal((await list(dist)).length, files.length, 'Unexpected deployable file');
const config = JSON.parse(await fs.readFile(path.join(root, target, 'firebase.json'), 'utf8'));
assert.deepEqual(Object.keys(config), ['hosting']); assert.equal(config.hosting.public, 'dist');
assert.equal(JSON.parse(await fs.readFile(path.join(root, target, '.firebaserc'), 'utf8')).projects.default, 'lifeosanywhere');
const sourceArg = args.indexOf('--source');
if (sourceArg >= 0) for (const input of candidate.inputs) assert.equal(sha(await fs.readFile(path.join(args[sourceArg + 1], input.path))), input.sha256, input.path);
if (args.includes('--check-production')) {
  const require = createRequire(import.meta.url);
  const cliRoot = process.env.FIREBASE_TOOLS_ROOT || path.join(process.env.APPDATA || '', 'npm/node_modules/firebase-tools');
  const { Client } = require(path.join(cliRoot, 'lib/apiv2.js'));
  const auth = require(path.join(cliRoot, 'lib/auth.js'));
  const { requireAuth } = require(path.join(cliRoot, 'lib/requireAuth.js'));
  const options = { project: 'lifeosanywhere', projectRoot: process.cwd(), nonInteractive: true };
  const account = auth.selectAccount(undefined, process.cwd()); if (account) auth.setActiveAccount(options, account);
  await requireAuth(options);
  const client = new Client({ urlPrefix: 'https://firebasehosting.googleapis.com', apiVersion: 'v1beta1', auth: true });
  const live = (await client.get('/sites/lifeosanywhere/releases?pageSize=1')).body.releases[0];
  assert.equal(live.version.name, rollback.currentVersion, 'Production changed: refresh the baseline and recovery package before publishing');
  const old = (await client.get(`/${rollback.currentVersion}`)).body; assert.equal(old.status, 'FINALIZED');
  const rules = new Client({ urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1', auth: true });
  const release = (await rules.get('/projects/lifeosanywhere/releases/cloud.firestore')).body;
  assert.equal(release.rulesetName, rollback.productionRules.ruleset, 'Rules changed: recheck compatibility');
}
if (args.includes('--live')) {
  const base = 'https://lifeosanywhere.web.app';
  for (const file of files) {
    const response = await fetch(`${base}/${file.path}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, file.path);
    assert.equal(sha(Buffer.from(await response.arrayBuffer())), file.sha256, `Live mismatch: ${file.path}`);
  }
  for (const route of ['/', '/agenda', '/finanzas', '/estudios', '/notas', '/ia', '/config/recuperacion', '/sw.js']) {
    const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(30000) }); assert.equal(response.status, 200);
    const expected = new Map();
    for (const rule of config.hosting.headers) {
      assert.ok(rule.regex, 'This sealed package uses regex matchers');
      if (new RegExp(rule.regex).test(route)) for (const header of rule.headers) expected.set(header.key.toLowerCase(), header.value);
    }
    for (const [key, value] of expected) assert.equal(response.headers.get(key), value, `${route}: ${key}`);
  }
}
console.log(JSON.stringify({ verified: true, target, files: files.length, sourceChecked: sourceArg >= 0, productionChecked: args.includes('--check-production'), liveChecked: args.includes('--live'), buildId: candidate.buildId }, null, 2));
