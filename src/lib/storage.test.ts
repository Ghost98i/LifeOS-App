import assert from 'node:assert/strict';
import test from 'node:test';
import { CURRENT_SCHEMA_VERSION, localISODate, normalizeStoredState, parseBackupJSON } from './storage';

test('localISODate respeta el día local cerca del cambio de fecha UTC', () => {
  const previousTimezone = process.env.TZ;
  try {
    process.env.TZ = 'America/Montevideo';
    assert.equal(localISODate(new Date('2026-10-22T02:30:00.000Z')), '2026-10-21');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('migra un estado antiguo conservando datos y agregando defaults', () => {
  const migrated = normalizeStoredState({
    finance: { transactions: [], categories: ['Comida'], accounts: [] },
  });

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(migrated.finance.categories.some((c) => c.name === 'Reventa'));
  assert.deepEqual(migrated.jobs.applications, []);
  assert.deepEqual(migrated.finance.transfers, []);
  assert.deepEqual(migrated.dailyPriorities, []);
  assert.deepEqual(migrated.dailyContext, []);
  assert.equal(migrated.profile.bodyCompositionSex, null);

  const invalidFormula = normalizeStoredState({ profile: { bodyCompositionSex: 'unknown' } });
  assert.equal(invalidFormula.profile.bodyCompositionSex, null);
});

test('agrega Mis cosas a backups anteriores sin perder notas', () => {
  const migrated = normalizeStoredState({ notes: { postits: [{ id: 'p1', text: 'Importante', date: '2026-09-01' }] } });
  assert.equal(migrated.notes.postits[0].text, 'Importante');
  assert.deepEqual(migrated.notes.possessions, []);
  const normalized = normalizeStoredState({ notes: { possessions: [{ id: 'gift', name: 'Campera', category: '', receivedAt: 123 }] } });
  assert.equal(normalized.notes.possessions[0].category, 'Otros');
  assert.equal(normalized.notes.possessions[0].receivedAt, null);
});

test('rechaza archivos JSON que no pertenecen a LifeOS', () => {
  assert.throws(() => parseBackupJSON('{"hello":"world"}'), /no parece pertenecer/);
});

test('normaliza streaming heredado garantizando arrays de checklist y pipeline', () => {
  const migrated = normalizeStoredState({
    streaming: { sessions: [{ id: 's1', date: '2026-09-17', hours: 2 }], monthlyGoal: 10 },
  });
  assert.equal(migrated.streaming.monthlyGoal, 10);
  assert.equal(migrated.streaming.sessions.length, 1);
  assert.deepEqual(migrated.streaming.preStreamChecklist, []);
  assert.deepEqual(migrated.streaming.contentPipeline, []);
});

test('Finanzas 1.3C — Persistencia del cronograma: serialización, recarga y conservación íntegra de cuotas fijas', () => {
  const rawState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    finance: {
      transactions: [],
      categories: [],
      accounts: [{ id: 'acc-1', name: 'Banco', balance: 50000, currency: 'UYU' }],
      agreements: [
        {
          id: 'agr-comercial-1',
          title: 'Heladera James Inverter',
          creditorName: 'Barraca Europa',
          currency: 'UYU',
          initialRemainingBalance: 12000,
          initialReferenceDate: '2026-11-01',
          originalPrincipal: 12000,
          status: 'active',
          schedule: {
            totalInstallments: 6,
            installmentAmount: 2000,
            firstDueDate: '2026-11-15',
            dueDay: 15,
            frequency: 'monthly',
          },
        },
      ],
    },
  };

  // 1. Simulación de ciclo de vida completo: guardado en JSON y recarga desde storage
  const serialized = JSON.stringify(rawState);
  const parsed = JSON.parse(serialized);
  const reloaded = normalizeStoredState(parsed);

  assert.equal(reloaded.finance.agreements.length, 1);
  const agr = reloaded.finance.agreements[0];
  assert.equal(agr.id, 'agr-comercial-1');
  assert.equal(agr.title, 'Heladera James Inverter');
  assert.equal(agr.initialRemainingBalance, 12000);
  assert.ok(agr.schedule, 'El cronograma debe sobrevivir íntegro a la normalización tras guardar');
  assert.equal(agr.schedule.totalInstallments, 6);
  assert.equal(agr.schedule.installmentAmount, 2000);
  assert.equal(agr.schedule.firstDueDate, '2026-11-15');
  assert.equal(agr.schedule.dueDay, 15);
  assert.equal(agr.schedule.frequency, 'monthly');

  // 2. Comprobación a través de importación de backup JSON
  const backupRestored = parseBackupJSON(serialized);
  const backupAgr = backupRestored.finance.agreements[0];
  assert.ok(backupAgr.schedule, 'El cronograma debe sobrevivir al recorrido de parseBackupJSON');
  assert.equal(backupAgr.schedule.totalInstallments, 6);
  assert.equal(backupAgr.schedule.installmentAmount, 2000);
});

test('Finanzas 1.3C — Persistencia y compatibilidad: acuerdos flexibles, backups antiguos y tolerancia ante datos inválidos', () => {
  // A. Acuerdo flexible de 1.3B (sin cronograma) no debe inventar calendario ni mutar
  const stateFlex = normalizeStoredState({
    finance: {
      agreements: [
        {
          id: 'agr-flex-1',
          title: 'Préstamo Hermano',
          creditorName: 'Hermano',
          currency: 'UYU',
          initialRemainingBalance: 35000,
          initialReferenceDate: '2026-10-01',
          originalPrincipal: 40000,
          priorPaidAmount: 5000,
          status: 'active',
          schedule: null,
        },
      ],
    },
  });

  assert.equal(stateFlex.finance.agreements.length, 1);
  const flexAgr = stateFlex.finance.agreements[0];
  assert.equal(flexAgr.schedule, null, 'Un acuerdo flexible debe mantener schedule === null sin inventar datos');
  assert.equal(flexAgr.initialRemainingBalance, 35000);
  assert.equal(flexAgr.priorPaidAmount, 5000);

  // B. Backup legacy antiguo sin propiedad agreements
  const stateLegacy = normalizeStoredState({
    schemaVersion: 1,
    finance: { transactions: [], accounts: [] },
  });
  assert.deepEqual(stateLegacy.finance.agreements, [], 'Backups antiguos inicializan agreements vacío sin error');

  // C. Schedule con datos incompletos o corruptos no inventa valores ni rompe el acuerdo
  const stateCorruptSchedule = normalizeStoredState({
    finance: {
      agreements: [
        {
          id: 'agr-corrupt',
          title: 'Acuerdo con cuota rota',
          creditorName: 'Desconocido',
          initialRemainingBalance: 5000,
          schedule: {
            totalInstallments: -2, // Inválido
            installmentAmount: 0,  // Inválido
            firstDueDate: 'fecha-invalida',
          },
        },
      ],
    },
  });

  assert.equal(stateCorruptSchedule.finance.agreements.length, 1);
  assert.equal(stateCorruptSchedule.finance.agreements[0].schedule, null, 'Cronograma corrupto se degrada limpiamente a null');
  assert.equal(stateCorruptSchedule.finance.agreements[0].initialRemainingBalance, 5000, 'Conserva los datos históricos del acuerdo');
});

test('Finanzas 1.3C-D1 — Normalización y persistencia de acquisition en FinancingAgreement', () => {
  // A. Acuerdo con adquisición financiada válida
  const stateValid = normalizeStoredState({
    finance: {
      agreements: [
        {
          id: 'agr-acq-1',
          title: 'Heladera James Inverter',
          creditorName: 'Barraca Europa',
          currency: 'UYU',
          initialRemainingBalance: 12000,
          initialReferenceDate: '2026-10-01',
          originalPrincipal: 12000,
          schedule: {
            totalInstallments: 6,
            installmentAmount: 2000,
            firstDueDate: '2026-11-10',
          },
          acquisition: {
            acquisitionDate: '2026-10-01',
            category: 'Hogar',
            totalPurchaseAmount: 12000,
          },
        },
      ],
    },
  });

  const agr = stateValid.finance.agreements[0];
  assert.ok(agr.acquisition, 'El objeto acquisition debe preservarse');
  assert.equal(agr.acquisition?.acquisitionDate, '2026-10-01');
  assert.equal(agr.acquisition?.category, 'Hogar');
  assert.equal(agr.acquisition?.totalPurchaseAmount, 12000);

  // B. Acuerdo sin acquisition (personal / flexible) preserva acquisition como null
  const stateNoAcq = normalizeStoredState({
    finance: {
      agreements: [
        {
          id: 'agr-flex-no-acq',
          title: 'Préstamo sin adquisición',
          creditorName: 'Amigo',
          initialRemainingBalance: 5000,
        },
      ],
    },
  });
  assert.equal(stateNoAcq.finance.agreements[0].acquisition, null, 'Acuerdos sin acquisition normalizan a null');

  // C. Objeto acquisition corrupto o inválido (fecha rota o importe no numérico) degrada a null
  const stateCorruptAcq = normalizeStoredState({
    finance: {
      agreements: [
        {
          id: 'agr-corrupt-acq',
          title: 'Compra rota',
          creditorName: 'Comercio',
          initialRemainingBalance: 3000,
          acquisition: {
            acquisitionDate: 'fecha-falsa',
            category: '   ',
            totalPurchaseAmount: -500,
          },
        },
      ],
    },
  });
  assert.equal(stateCorruptAcq.finance.agreements[0].acquisition, null, 'Acquisition con datos inválidos se degrada limpiamente a null');
});
