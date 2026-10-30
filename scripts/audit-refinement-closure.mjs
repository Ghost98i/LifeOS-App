import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const output = 'artifacts/cierre-tandas-1-2';
const original = JSON.parse((await fs.readFile(`${output}/initial-hashes.json`, 'utf8')).replace(/^\uFEFF/, ''));
const changed = [];
const allowed = new Set(['src/lib/cryptoCore.test.ts', 'src/components/CommercialInventorySandbox.tsx']);
for (const entry of original) {
  const hash = crypto.createHash('sha256').update(await fs.readFile(entry.Path)).digest('hex').toUpperCase();
  if (hash !== entry.Hash) {
    const file = path.relative(process.cwd(), entry.Path).replaceAll('\\', '/');
    assert.ok(allowed.has(file), `Unexpected change: ${file}`);
    changed.push(file);
  }
}
const before = await fs.readFile(`${output}/CommercialInventorySandbox.before.tsx`, 'utf8');
const after = await fs.readFile('src/components/CommercialInventorySandbox.tsx', 'utf8');
assert.equal(after, before.replace('Agregá tu primera compra al inventario.', 'Agregá un artículo o insumo con su cantidad y costo de compra.'));
await fs.writeFile(`${output}/preservation.json`, JSON.stringify({ changed, presentationChangeOnly: true, hostingRulesDomainAndPreviousChangesPreserved: true }, null, 2));
console.log('Preserved all initial sources/contracts except Hosting test and one inventory sentence.');
