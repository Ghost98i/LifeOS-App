import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAIImport, applyJobOpportunity, buyResaleOpportunity, parseAIImport } from './aiImport';
import { defaultState } from './storage';

test('parsea respuestas rodeadas por bloques de código y normaliza valores', () => {
  const preview = parseAIImport(`\`\`\`json
  {"empleo":[{"empresa":" Antel ","puesto":"Soporte","rating":9}],"ideas":[" Revisar CV "]}
  \`\`\``);

  assert.equal(preview.total, 2);
  assert.equal(preview.payload.empleo[0].empresa, 'Antel');
  assert.equal(preview.payload.empleo[0].rating, 5);
  assert.deepEqual(preview.payload.ideas, ['Revisar CV']);
});

test('rechaza estructuras que no respetan el contrato', () => {
  assert.throws(() => parseAIImport('{"empleo":{}}'), /debe contener una lista/);
  assert.throws(() => parseAIImport('{"ideas":[]}'), /no contiene elementos/);
});

test('importa y conecta oportunidades sin perder link ni nota', () => {
  const state = defaultState();
  const preview = parseAIImport(JSON.stringify({
    empleo: [{ empresa: 'Empresa', puesto: 'Junior', rating: 4, link: 'https://example.com', nota: 'Remoto' }],
    reventa: [{ item: 'Monitor', buyPrice: 4000, marketPrice: 5500, nota: 'Con caja' }],
    ideas: ['Actualizar portfolio'],
  }));

  assert.equal(applyAIImport(state, preview.payload, '2026-08-09'), 3);
  assert.equal(applyJobOpportunity(state, state.jobs.opportunities[0].id, '2026-08-10'), true);
  assert.equal(buyResaleOpportunity(state, state.resale.opportunities[0].id, '2026-08-10'), true);

  assert.equal(state.jobs.applications[0].link, 'https://example.com');
  assert.equal(state.jobs.applications[0].notas, 'Remoto');
  assert.equal(state.jobs.applications[0].nextActionDate, '2026-08-17');
  assert.equal(state.resale.inventory[0].note, 'Con caja');
});
