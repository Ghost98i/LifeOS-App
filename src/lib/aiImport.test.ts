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

// ---------------------------------------------------------------------------
// FASE 1B: DEDUPLICACIÓN DE IMPORTACIONES DE IA
// ---------------------------------------------------------------------------

test('Fase 1B: Deduplicación exacta de ideas sin destruir registros diferentes', () => {
  const state = defaultState();

  // Paso 1: Importar idea
  const payload1 = {
    empleo: [],
    reventa: [],
    ideas: ['Comprar y revender hardware usado'],
  };
  const added1 = applyAIImport(state, payload1, '2026-08-10');
  assert.equal(added1, 1);
  assert.equal(state.ideas.length, 1);
  assert.equal(state.ideas[0].text, 'Comprar y revender hardware usado');

  // Paso 2: Importar exactamente la misma idea (con variaciones de espacios y mayúsculas)
  const payloadDuplicate = {
    empleo: [],
    reventa: [],
    ideas: ['   comprar  y   revender HARDWARE usado  '],
  };
  const addedDuplicate = applyAIImport(state, payloadDuplicate, '2026-08-11');
  assert.equal(addedDuplicate, 0, 'No debe insertar una segunda copia idéntica');
  assert.equal(state.ideas.length, 1, 'Debe conservar el registro existente sin duplicarlo');
  assert.equal(state.ideas[0].text, 'Comprar y revender hardware usado', 'No debe alterar el texto original');

  // Paso 3: Importar una idea similar pero no idéntica (NO deduplicación agresiva)
  const payloadSimilar = {
    empleo: [],
    reventa: [],
    ideas: ['Comprar hardware usado para reventa en Uruguay'],
  };
  const addedSimilar = applyAIImport(state, payloadSimilar, '2026-08-12');
  assert.equal(addedSimilar, 1, 'Debe aceptar una idea legítimamente diferente');
  assert.equal(state.ideas.length, 2, 'Deben coexistir ambas ideas');
});

test('Fase 1B: Deduplicación exacta de oportunidades laborales', () => {
  const state = defaultState();

  const opp = { empresa: 'Mercado Libre', puesto: 'Frontend Dev', rating: 5, link: '', nota: '' };
  const added1 = applyAIImport(state, { empleo: [opp], reventa: [], ideas: [] });
  assert.equal(added1, 1);
  assert.equal(state.jobs.opportunities.length, 1);

  // Duplicado exacto (mismo empresa y puesto) -> rechazado
  const oppDup = { empresa: ' mercado libre ', puesto: ' frontend dev ', rating: 4, link: 'other', nota: '' };
  const addedDup = applyAIImport(state, { empleo: [oppDup], reventa: [], ideas: [] });
  assert.equal(addedDup, 0, 'Oportunidad duplicada debe ser omitida');
  assert.equal(state.jobs.opportunities.length, 1);

  // Misma empresa pero puesto diferente -> aceptado
  const oppDifferentRole = { empresa: 'Mercado Libre', puesto: 'Backend Engineer', rating: 5, link: '', nota: '' };
  const addedDiff = applyAIImport(state, { empleo: [oppDifferentRole], reventa: [], ideas: [] });
  assert.equal(addedDiff, 1, 'Puesto distinto en la misma empresa debe ser aceptado');
  assert.equal(state.jobs.opportunities.length, 2);
});

// ---------------------------------------------------------------------------
// FASE 1C: VALIDACIÓN ESTRICTA DE TIPOS NUMÉRICOS
// ---------------------------------------------------------------------------

test('Fase 1C: Acepta números válidos (number, string numérico entero y decimal)', () => {
  const preview = parseAIImport(JSON.stringify({
    reventa: [
      { item: 'Teclado', buyPrice: 100, marketPrice: 200 },
      { item: 'Mouse', buyPrice: '100', marketPrice: '150' },
      { item: 'Auriculares', buyPrice: '100.50', marketPrice: '180.75' },
    ],
  }));

  assert.equal(preview.payload.reventa.length, 3);
  assert.equal(preview.payload.reventa[0].buyPrice, 100);
  assert.equal(preview.payload.reventa[1].buyPrice, 100);
  assert.equal(preview.payload.reventa[2].buyPrice, 100.5);
  assert.equal(preview.payload.reventa[2].marketPrice, 180.75);
});

test('Fase 1C: Rechaza "abc", cadenas no numéricas y cadenas vacías sin convertir a 0', () => {
  // String no numérico "abc"
  assert.throws(
    () => parseAIImport(JSON.stringify({ reventa: [{ item: 'GPU', buyPrice: 'abc', marketPrice: 500 }] })),
    /contiene un valor no numérico: "abc"/
  );

  // String vacío ""
  assert.throws(
    () => parseAIImport(JSON.stringify({ reventa: [{ item: 'GPU', buyPrice: '', marketPrice: 500 }] })),
    /está vacío/
  );

  // null
  assert.throws(
    () => parseAIImport(JSON.stringify({ reventa: [{ item: 'GPU', buyPrice: null, marketPrice: 500 }] })),
    /es obligatorio/
  );

  // Número negativo
  assert.throws(
    () => parseAIImport(JSON.stringify({ reventa: [{ item: 'GPU', buyPrice: -50, marketPrice: 500 }] })),
    /no puede ser negativo/
  );
});

