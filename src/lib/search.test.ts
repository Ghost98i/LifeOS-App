import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, uid } from './storage';
import { searchLifeOS } from './search';

test('el buscador encuentra datos de módulos diferentes', () => {
  const state = defaultState();
  state.notes.postits.push({ id: uid(), text: 'Comprar cable HDMI', date: '2026-08-10' });
  state.jobs.applications.push({ id: uid(), empresa: 'Empresa de prueba', puesto: 'Soporte', estado: 'pendiente', fecha: '2026-08-10' });
  assert.equal(searchLifeOS(state, 'HDMI')[0].view, 'notas');
  assert.equal(searchLifeOS(state, 'Empresa de prueba')[0].view, 'trabajo');
});

test('el buscador ignora tildes y cubre agenda, rutinas y suscripciones', () => {
  const state = defaultState();
  state.agenda.lunes.push({ id: uid(), time: '09:00', activity: 'Médico' });
  state.tasksRecurring.push({ id: uid(), name: 'Meditación', freq: 'daily' });
  state.finance.subscriptions.push({ id: uid(), name: 'Música Premium', amount: 10 });
  assert.equal(searchLifeOS(state, 'medico')[0].view, 'agenda');
  assert.equal(searchLifeOS(state, 'meditacion')[0].view, 'agenda');
  assert.equal(searchLifeOS(state, 'musica premium')[0].view, 'finanzas');
});

test('ranking de relevancia prioriza coincidencia exacta y por título sobre campos secundarios', () => {
  const state = defaultState();
  // 1. Nota con "Redes" en contenido secundario pero título diferente
  state.notes.postits.push({
    id: uid(),
    title: 'Apuntes de Informática',
    text: 'Contenido sobre redes y servidores',
    date: '2026-10-04',
  });
  // 2. Materia con título exacto "Redes"
  state.study.subjects.push({
    id: uid(),
    name: 'Redes',
  });
  // 3. Tarea cuyo título comienza con "Redes de computadoras"
  state.todayExtras.push({
    id: uid(),
    text: 'Redes de computadoras TP1',
    date: '2026-10-04',
    done: false,
    priority: 'media',
  });

  const results = searchLifeOS(state, 'Redes');
  assert.ok(results.length >= 3);
  // Match exacto en título debe ser el primer resultado
  assert.equal(results[0].title, 'Redes');
  assert.equal(results[0].view, 'estudios');
  // Match que empieza por la query debe ir segundo
  assert.equal(results[1].title, 'Redes de computadoras TP1');
  assert.equal(results[1].view, 'dashboard');
  // Match secundario en contenido debe ir después
  assert.equal(results[2].title, 'Apuntes de Informática');
});

test('module visibility filtra los resultados cuando el módulo está desactivado', () => {
  const state = defaultState();
  state.finance.transactions.push({
    id: uid(),
    amount: 1500,
    category: 'Comida',
    type: 'gasto',
    note: 'Supermercado Disco',
    date: '2026-10-04',
    fixed: 'variable',
    origin: 'manual',
    accountId: 'acc-1',
  });
  state.todayExtras.push({
    id: uid(),
    text: 'Ir al supermercado Disco',
    date: '2026-10-04',
    done: false,
    priority: 'media',
  });

  // Con finanzas activo: ambos aparecen
  let res = searchLifeOS(state, 'Disco');
  assert.equal(res.length, 2);
  assert.ok(res.some((r) => r.view === 'finanzas'));
  assert.ok(res.some((r) => r.view === 'dashboard'));

  // Desactivar módulo 'finanzas'
  state.settings.hiddenTabs = ['finanzas'];
  res = searchLifeOS(state, 'Disco');
  // Finanzas ya no debe aparecer en los resultados
  assert.equal(res.length, 1);
  assert.equal(res.some((r) => r.view === 'finanzas'), false);
  assert.equal(res[0].view, 'dashboard');

  // Reactivar módulo 'finanzas' restaura los resultados sin pérdida de datos
  state.settings.hiddenTabs = [];
  res = searchLifeOS(state, 'Disco');
  assert.equal(res.length, 2);
  assert.ok(res.some((r) => r.view === 'finanzas'));
});

test('stream guard / privacyMode oculta montos sensibles en subtitle y badge', () => {
  const state = defaultState();
  state.finance.transactions.push({
    id: uid(),
    amount: 3500,
    category: 'Varios',
    type: 'gasto',
    note: 'Honorarios médico',
    date: '2026-10-04',
    fixed: 'variable',
    origin: 'manual',
    accountId: 'acc-1',
  });
  state.finance.accounts.push({
    id: uid(),
    name: 'Caja de Ahorro',
    balance: 50000,
  });

  // Modo normal: muestra cifras reales
  state.settings.privacyMode = false;
  let res = searchLifeOS(state, 'Honorarios');
  assert.ok(res[0].subtitle.includes('$U 3.500'));
  assert.equal(res[0].badge, '-$U 3.500');

  let resAcc = searchLifeOS(state, 'Caja de Ahorro');
  assert.ok(resAcc[0].subtitle.includes('$U 50.000'));

  // Modo privacidad (Stream Guard): oculta cifras
  state.settings.privacyMode = true;
  res = searchLifeOS(state, 'Honorarios');
  assert.ok(!res[0].subtitle.includes('3.500'));
  assert.ok(res[0].subtitle.includes('$U ••••'));
  assert.equal(res[0].badge, '-••••');
  assert.equal(res[0].isSensitive, true);

  resAcc = searchLifeOS(state, 'Caja de Ahorro');
  assert.ok(!resAcc[0].subtitle.includes('50.000'));
  assert.ok(resAcc[0].subtitle.includes('$U ••••'));
  assert.equal(resAcc[0].isSensitive, true);
});

test('política de límite global evalúa todos los módulos y prioriza por score antes de limitar', () => {
  const state = defaultState();
  // Agregamos muchas tareas con match secundario
  for (let i = 0; i < 70; i++) {
    state.todayExtras.push({
      id: uid(),
      text: `Otra cosa irrelevante número ${i}`,
      date: '2026-10-04',
      done: false,
      priority: 'media',
    });
  }
  // En el último módulo (IA/ideas o notas), agregamos un match exacto
  state.notes.postits.push({
    id: uid(),
    title: 'Objetivo Principal',
    text: 'Detalles de la nota',
    date: '2026-10-04',
  });

  const res = searchLifeOS(state, 'Objetivo Principal');
  assert.equal(res.length, 1);
  assert.equal(res[0].title, 'Objetivo Principal');
  assert.equal(res[0].view, 'notas');
});
