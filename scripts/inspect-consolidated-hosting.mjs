// Strictly read-only production preflight. No deploy/clone/update/delete APIs.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const cliRoot = process.env.FIREBASE_TOOLS_ROOT || path.join(process.env.APPDATA || '', 'npm/node_modules/firebase-tools');
const { requireAuth } = require(path.join(cliRoot, 'lib/requireAuth.js'));
const { selectAccount, setActiveAccount } = require(path.join(cliRoot, 'lib/auth.js'));
const { Client } = require(path.join(cliRoot, 'lib/apiv2.js'));
const options = { project: 'lifeosanywhere', projectRoot: process.cwd(), nonInteractive: true };
const account = selectAccount(undefined, process.cwd());
if (account) setActiveAccount(options, account);
await requireAuth(options);
const client = new Client({ urlPrefix: 'https://firebasehosting.googleapis.com', apiVersion: 'v1beta1', auth: true });
const rulesClient = new Client({ urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1', auth: true });
const out = path.resolve('artifacts/consolidacion-tres-tandas-20261029');
await fs.mkdir(out, { recursive: true });
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const get = async resource => (await client.get(resource)).body;
const releases = await get('/sites/lifeosanywhere/releases?pageSize=10');
assert.ok(releases.releases?.length, 'No Hosting releases found');
const active = releases.releases[0];
assert.ok(active.version?.name && active.type !== 'SITE_DISABLE');
const current = await get(`/${active.version.name}`);
assert.equal(current.status, 'FINALIZED');
const site = await get('/projects/lifeosanywhere/sites/lifeosanywhere');
assert.ok(site.name.endsWith('/sites/lifeosanywhere'));
const available = releases.releases.filter(r => r.version?.status === 'FINALIZED');
const releaseInfo = available.map(r => ({ name: r.name, releaseTime: r.releaseTime, type: r.type, version: r.version.name, status: r.version.status }));
const files = [];
let token = '';
do {
  const page = await get(`/${current.name}/files?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
  files.push(...(page.files || [])); token = page.nextPageToken || '';
} while (token);
assert.ok(files.length > 0);
await fs.writeFile(`${out}/production-observation.json`, JSON.stringify({ activeVersion: current, releases: releaseInfo, files }, null, 2));
const snapshot = JSON.parse(await fs.readFile(`${out}/backup.json`, 'utf8'));
const rollback = path.join(snapshot.package, `rollback-${new Date().toISOString().replace(/[-:.]/g, '')}`);
await fs.mkdir(rollback, { recursive: false });
await fs.mkdir(path.join(rollback, 'dist'));
const downloaded = [];
const platformManaged = [];
for (let batch = 0; batch < files.length; batch += 6) {
  await Promise.all(files.slice(batch, batch + 6).map(async file => {
    assert.equal(file.status, 'ACTIVE');
    const name = file.path.replace(/^\//, '');
    assert.ok(!name.split('/').some(part => part === '..') && !name.includes('\\'));
    const response = await fetch(new URL(file.path, 'https://lifeosanywhere.web.app'), { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
    assert.equal(response.status, 200, file.path);
    const data = Buffer.from(await response.arrayBuffer());
    const gzipSha256 = sha(zlib.gzipSync(data, { level: 9 }));
    if (file.path.startsWith('/__/')) {
      // Hosting serves these reserved SDK endpoints dynamically, before static
      // files. Their public bytes cannot recover an uploaded shadow file.
      assert.ok(['/__/firebase/init.js', '/__/firebase/init.json'].includes(file.path), file.path);
      platformManaged.push({ path: file.path, uploadedShadowHash: file.hash, observedSha256: sha(data), recovery: 'Firebase-managed reserved URL; use the retained Hosting version for an exact rollback.' });
      return;
    }
    assert.equal(gzipSha256, file.hash, `Production content does not match the active version: ${file.path}`);
    const destination = path.join(rollback, 'dist', name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, data, { flag: 'wx' });
    downloaded.push({ path: name, bytes: data.length, sha256: sha(data), hostingGzipSha256: file.hash });
  }));
}
const after = (await get('/sites/lifeosanywhere/releases?pageSize=1')).releases[0];
assert.equal(after.name, active.name, 'Live release changed while capturing rollback');
const config = structuredClone(current.config);
// Firebase REST uses "glob" where firebase.json calls the same matcher "source".
for (const key of ['headers', 'rewrites', 'redirects']) for (const rule of config[key] || []) {
  if (rule.glob !== undefined) { rule.source = rule.glob; delete rule.glob; }
  if (key === 'headers') rule.headers = Object.entries(rule.headers).map(([key, value]) => ({ key, value }));
  if (key === 'rewrites' && rule.path !== undefined) { rule.destination = rule.path; delete rule.path; }
  if (key === 'redirects' && rule.location !== undefined) { rule.destination = rule.location; delete rule.location; }
}
const hostingConfig = { hosting: { public: 'dist', ...config } };
await fs.writeFile(path.join(rollback, 'firebase.json'), JSON.stringify(hostingConfig, null, 2));
await fs.writeFile(path.join(rollback, '.firebaserc'), JSON.stringify({ projects: { default: 'lifeosanywhere' } }, null, 2));
const deployedRulesRelease = (await rulesClient.get('/projects/lifeosanywhere/releases/cloud.firestore')).body;
const ruleset = (await rulesClient.get(`/${deployedRulesRelease.rulesetName}`)).body;
const rulesSource = ruleset.source.files.find(f => f.name === 'firestore.rules') || ruleset.source.files[0];
const localRules = await fs.readFile('firestore.rules');
assert.equal(sha(Buffer.from(rulesSource.content)), sha(localRules), 'Local Rules differ from production');
const result = {
  capturedAt: new Date().toISOString(), project: 'lifeosanywhere', site: site.name,
  activeRelease: releaseInfo.find(r => r.name === active.name), recentReleases: releaseInfo,
  currentVersion: current.name, currentConfig: current.config, currentFiles: files,
  localRollback: { directory: rollback, files: downloaded.sort((a, b) => a.path.localeCompare(b.path)), verifiedAgainstHostingGzipHashes: true, platformManaged },
  productionRules: { ruleset: deployedRulesRelease.rulesetName, sha256: sha(localRules), matchesLocal: true },
  readOnly: true,
};
await fs.writeFile(path.join(rollback, 'production-manifest.json'), JSON.stringify(result, null, 2));
await fs.writeFile(`${out}/production-preflight.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ currentVersion: current.name, releaseTime: active.releaseTime, recoverableReleases: releaseInfo.length, rollbackFilesVerified: downloaded.length, rulesMatchProduction: true, rollback }, null, 2));
