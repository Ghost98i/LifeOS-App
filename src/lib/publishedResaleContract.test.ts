import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// This is the archived public asset observed on 2026-10-23, not a claimed source commit.
// The archive is ignored by Git. Keep the test explicitly skipped where it is unavailable.
const bundlePath = resolve(process.cwd(), 'release/published-observation-20261023/assets_index-ExwrnwAV.js');
const observedSha256 = '9587d33cf2ca848461ee384e882598700f65233554808a7f647e4ad2bc1cbb10';

function observedBundle(t: { skip: (reason: string) => void }): string | null {
  if (!existsSync(bundlePath)) {
    t.skip('El artefacto publicado archivado no está disponible en este entorno.');
    return null;
  }
  const source = readFileSync(bundlePath, 'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'), observedSha256);
  return source;
}

function bundledFunction(source: string, start: string, end: string, name: string, context: object): unknown {
  const from = source.indexOf(start);
  const until = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && until > from, `No se encontró ${name} en el bundle observado.`);
  return runInNewContext(`${source.slice(from, until)}; ${name}`, context, { timeout: 1000 });
}

test('bundle publicado observado: guard distingue revisión y protocolo superior, pero no marcador comercial', async (t) => {
  const source = observedBundle(t);
  if (!source) return;
  let remote: { revision: string; syncProtocolVersion: number; commercialProtocolVersion?: number } | null =
    { revision: 'legacy-r1', syncProtocolVersion: 1 };
  let failRead = false;
  const guard = bundledFunction(source, 'async function wc(', 'async function jc(', 'wc', {
    Ve: true, bs: 2,
    ct: () => ({ db: {} }),
    rn: (...parts: string[]) => parts.at(-1),
    Fa: async () => {
      if (failRead) throw new Error('Lectura remota fallida');
      return { exists: () => remote !== null, data: () => remote };
    },
  }) as (user: string, modules: string[], revisions: Record<string, string>) => Promise<{
    matches: boolean; divergedModules: string[]; incompatibleProtocolModules: string[];
  }>;
  const check = () => guard('alice', ['resale'], { resale: 'legacy-r1' });
  assert.equal((await check()).matches, true);
  remote = { revision: 'new-r2', syncProtocolVersion: 1 };
  assert.deepEqual(Array.from((await check()).divergedModules), ['resale']);
  remote = { revision: 'legacy-r1', syncProtocolVersion: 3, commercialProtocolVersion: 1 };
  assert.deepEqual(Array.from((await check()).incompatibleProtocolModules), ['resale']);
  remote = { revision: 'legacy-r1', syncProtocolVersion: 2, commercialProtocolVersion: 1 };
  assert.equal((await check()).matches, true, 'El guard antiguo no examina el marcador comercial.');
  failRead = true;
  assert.equal((await check()).matches, true, 'El guard antiguo omite fallos de lectura remota.');
});

test('bundle publicado observado: su mezcla de Reventa no transporta commercial', (t) => {
  const source = observedBundle(t);
  if (!source) return;
  const merge = bundledFunction(source, 'function ji(', 'function Ni(', 'ji', {
    ye: (left: unknown[], right: unknown[]) => [...left, ...right],
  }) as (local: object, remote: object, base: object) => Record<string, unknown>;
  const local = { opportunities: [], inventory: [], commercial: { items: [{ id: 'local-item' }] } };
  const remote = { opportunities: [], inventory: [], commercial: { items: [{ id: 'remote-item' }] } };
  const result = merge(local, remote, { opportunities: [], inventory: [] });
  assert.deepEqual(Object.keys(result).sort(), ['inventory', 'opportunities']);
  assert.equal(Object.hasOwn(result, 'commercial'), false);
});

test('bundle publicado observado: lote y rechazo mantienen el contrato anterior', (t) => {
  const source = observedBundle(t);
  if (!source) return;
  const writer = source.slice(source.indexOf('async function vc('), source.indexOf('function yc('));
  assert.match(writer, /syncProtocolVersion:F\?bs:1/);
  assert.match(writer, /parentRevision:w/);
  assert.match(writer, /d\.commit\(\)/);
  assert.doesNotMatch(writer, /commercialProtocolVersion/);
  const rejectedCommit = source.slice(source.indexOf('Z.completion.then(()=>{U.current=0'),
    source.indexOf('}).catch(Z=>{if(console.error("[CloudSync] Guarded write failed:'));
  assert.match(rejectedCommit, /Batch commit failed/);
  assert.match(rejectedCommit, /C\(navigator\.onLine\?"error":"offline"\)/);
  assert.match(rejectedCommit, /U\.current<5/);
  assert.doesNotMatch(rejectedCommit, /resale-conflict-v1/);
});
