import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = 'artifacts/optimization-2026-10-29';
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
function summarize(phase) {
  const data = JSON.parse(readFileSync(path.join(root, `${phase}.json`), 'utf8'));
  const buildLog = readFileSync(path.join(root, `build-${phase}.log`), 'utf8');
  const cache = buildLog.match(/precache\s+(\d+) entries \(([\d.]+) KiB\)/);
  const entry = data.build.index.match(/<script[^>]+src="\/assets\/([^"]+)"/)[1];
  const main = data.build.files.find(file => file.name === entry);
  const runs = [...data.runs];
  if (phase === 'after' && existsSync(path.join(root, 'desktop-probe.json'))) {
    const probe = JSON.parse(readFileSync(path.join(root, 'desktop-probe.json'), 'utf8'));
    if (probe.build.index !== data.build.index || JSON.stringify(probe.conditions) !== JSON.stringify(data.conditions)) throw new Error('No se pueden combinar mediciones de builds o condiciones diferentes');
    runs.push(...probe.runs);
  }
  // Budget the requested files, separately from CDP's received bytes: speculative
  // requests can be cancelled and their transfer varies between runs.
  const fileBudget = name => {
    if (name === '/') return gzipSync(data.build.index).length;
    if (name.startsWith('/assets/')) {
      const file = data.build.files.find(file => file.name === name.slice('/assets/'.length));
      return /\.(js|css|svg|json|wasm)$/.test(name) ? file.gzip : file.bytes;
    }
    const raw = readFileSync(path.join('public', name));
    return /\.(js|css|svg|json|wasm)$/.test(name) ? gzipSync(raw).length : raw.length;
  };
  return {
    mainRaw: main.bytes, mainGzip: main.gzip,
    precacheManifestEntries: Number(cache[1]), precacheKiB: Number(cache[2]),
    requestedFileBudget: [...new Set(data.runs[0].initial.resources.map(resource => resource.name))].reduce((sum, name) => sum + fileBudget(name), 0),
    widths: Object.fromEntries([375, 768, 1920].map(width => {
      const samples = runs.filter(run => run.width === width);
      return [width, {
        trials: samples.length,
        heroReadyMs: median(samples.map(run => run.heroReadyMs)),
        interfaceReadyMs: median(samples.map(run => run.interactiveMs)),
        lcpMs: median(samples.map(run => run.initial.lcp.time)),
        notesColdMs: median(samples.map(run => run.navigation.Notas)),
        notesColdRangeMs: [Math.min(...samples.map(run => run.navigation.Notas)), Math.max(...samples.map(run => run.navigation.Notas))],
        notesWarmMs: median(samples.map(run => run.warmNotesMs)),
        notesSearchMs: median(samples.map(run => run.noteSearchMs)),
        notesNodes: samples[0].noteCards.nodes,
        navigation: Object.fromEntries(Object.keys(samples[0].navigation).map(view => [view, median(samples.map(run => run.navigation[view]))])),
        receivedBytes: samples.map(run => run.initial.resources.reduce((sum, resource) => sum + resource.encoded, 0)),
        keyboard: samples[0].keyboard,
      }];
    })),
  };
}
const result = { before: summarize('before'), after: summarize('after') };
writeFileSync(path.join(root, 'comparison.json'), JSON.stringify(result, null, 2));
const rows = ['| Ancho | Hero antes → después | Notas primera visita | Notas ya cargadas | Buscar una nota |', '| --- | --- | --- | --- | --- |'];
for (const width of [375, 768, 1920]) {
  const before = result.before.widths[width], after = result.after.widths[width];
  const pair = key => `${before[key].toFixed(0)} → ${after[key].toFixed(0)} ms`;
  rows.push(`| ${width} | ${pair('heroReadyMs')} | ${pair('notesColdMs')} | ${pair('notesWarmMs')} | ${pair('notesSearchMs')} |`);
}
writeFileSync(path.join(root, 'comparison.md'), rows.join('\n') + '\n');
console.log(rows.join('\n'));
console.log(JSON.stringify({ before: { mainRaw: result.before.mainRaw, mainGzip: result.before.mainGzip, precacheKiB: result.before.precacheKiB, requestedFileBudget: result.before.requestedFileBudget }, after: { mainRaw: result.after.mainRaw, mainGzip: result.after.mainGzip, precacheKiB: result.after.precacheKiB, requestedFileBudget: result.after.requestedFileBudget } }, null, 2));
