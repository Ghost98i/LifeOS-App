import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from '../lib/storage';
import { calcDetailedPRs, detectSessionPRs, getSessionExercisePRs } from '../lib/gymMetrics';
import { buildGymSessionPresentation } from '../lib/gymIdlePresentation';
import type { GymSession } from '../types';
import { ConfigView } from './ConfigView';
import { PrivacySecuritySection } from './PrivacySecuritySection';
import { IAView } from './IAView';
import { GimnasioView } from './GimnasioView';
import { GymActivityCalendar } from './GymActivityCalendar';
import { WorkoutSummaryModal } from './WorkoutSummaryModal';

test('Block 8: ConfigView y PrivacySecuritySection eliminan sobretexto y ContextualHelp redundantes conservando avisos obligatorios', () => {
  const state = defaultState();

  const accountHtml = renderToStaticMarkup(
    <ConfigView
      state={state}
      onUpdateState={() => true}
      onExportJSON={() => {}}
      onImportJSON={() => {}}
      onResetData={() => {}}
      cloudConfigured={true}
      cloudUser={{ uid: 'u1', name: 'Test User', email: 'test@example.com', photoURL: '' }}
      onCloudSignOut={() => {}}
      initialTab="cuenta"
    />
  );

  assert.doesNotMatch(accountHtml, /Tu cuenta de Google y el estado de sincronización/);
  assert.doesNotMatch(accountHtml, /Cerrar sesión detiene la sincronización en este navegador/);
  assert.doesNotMatch(accountHtml, /Ayuda: Sincronización con Google/);
  assert.doesNotMatch(accountHtml, /Ayuda: Protección de extremo a extremo/);
  assert.doesNotMatch(accountHtml, /Cifrado de la sincronización y recuperación de acceso/);
  assert.match(accountHtml, /no quedan cifrados por esta función/);
  assert.match(accountHtml, /Eliminar cuenta y datos en la nube/);

  const backupsHtml = renderToStaticMarkup(
    <ConfigView
      state={state}
      onUpdateState={() => true}
      onExportJSON={() => {}}
      onImportJSON={() => {}}
      onResetData={() => {}}
      initialTab="copias"
    />
  );

  assert.doesNotMatch(backupsHtml, /Ayuda: Copias de respaldo/);
  assert.match(backupsHtml, /Archivo JSON local; no queda cifrado por la sincronización\./);
  assert.match(backupsHtml, /Reemplaza los datos actuales por los valores iniciales\./);

  const prefsHtml = renderToStaticMarkup(
    <ConfigView
      state={state}
      onUpdateState={() => true}
      onExportJSON={() => {}}
      onImportJSON={() => {}}
      onResetData={() => {}}
      initialTab="preferencias"
    />
  );

  assert.doesNotMatch(prefsHtml, /Datos personales utilizados para estimaciones corporales/);
  assert.doesNotMatch(prefsHtml, /Elegí qué módulos mostrar en la barra lateral/);
  assert.match(prefsHtml, /Ocultar un módulo no borra sus datos\./);

  const diagHtml = renderToStaticMarkup(
    <ConfigView
      state={state}
      onUpdateState={() => true}
      onExportJSON={() => {}}
      onImportJSON={() => {}}
      onResetData={() => {}}
      initialTab="diagnostico"
    />
  );

  assert.doesNotMatch(diagHtml, /Saldos y almacenamiento/);

  const privacyHtml = renderToStaticMarkup(
    <PrivacySecuritySection state={state} storageUserId="u1" cloudConnected={true} />
  );
  assert.doesNotMatch(privacyHtml, /Ayuda: Protección de extremo a extremo/);
  assert.doesNotMatch(privacyHtml, /Cifrado de la sincronización y recuperación de acceso/);
  assert.match(privacyHtml, /Qué protege el cifrado y cómo recuperar el acceso/);
  assert.match(privacyHtml, /no quedan cifrados por esta función/);
});

test('Block 8: IAView quita el subtitle redundante del PageHeader y conserva el aviso honesto de privacidad', () => {
  const state = defaultState();
  const html = renderToStaticMarkup(
    <IAView state={state} onUpdateState={() => true} />
  );

  assert.doesNotMatch(html, /Usá una IA externa para investigar y traé los resultados para revisarlos acá/);
  assert.match(html, /Celestian no le envía tus datos/);
});

test('Block 8: GimnasioView elimina ContextualHelp y bajotextos redundantes en Rutinas y Progreso', () => {
  const state = defaultState();
  const today = todayISO();
  state.gym.routineTemplates = [
    {
      id: 'r1',
      name: 'Torso A',
      days: ['lunes'],
      exercises: [
        { id: 'e1', name: 'Press banca', muscleGroup: 'Pecho', sets: [{ id: 's1', weight: 70, reps: 8, completed: false }] },
      ],
    },
  ];
  state.gym.sessions = [
    {
      id: 'sess-1',
      date: today,
      weekLabel: 'Torso A',
      status: 'completed',
      startedAt: '18:00',
      finishedAt: '18:50',
      exercises: [
        {
          id: 'e1',
          name: 'Press banca',
          muscleGroup: 'Pecho',
          sets: [{ id: 's1', weight: 80, reps: 8, completed: true }],
        },
      ],
    },
  ];

  const routinesHtml = renderToStaticMarkup(
    <GimnasioView state={state} onUpdateState={() => true} initialTab="rutinas" />
  );
  assert.doesNotMatch(routinesHtml, /Ayuda: Cómo funcionan las rutinas/);
  assert.doesNotMatch(routinesHtml, /Planes guardados · las sesiones ejecutadas están en Historial/);

  const progressHtml = renderToStaticMarkup(
    <GimnasioView state={state} onUpdateState={() => true} initialTab="progresion" />
  );
  assert.doesNotMatch(progressHtml, /Ayuda: Cómo se evalúa la evolución por ejercicio/);
  assert.match(progressHtml, /Ayuda: Cómo se calcula la composición corporal/);
});

test('Block 8: GymActivityCalendar con 1 sesión oculta "1 sesión registrada" y muestra ficha enriquecida', () => {
  const today = todayISO();
  const session: GymSession = {
    id: 'sess-today-1',
    date: today,
    weekLabel: 'Torso Fuerza',
    status: 'completed',
    startedAt: '18:00',
    finishedAt: '18:55',
    exercises: [
      {
        id: 'ex-1',
        name: 'Press banca',
        muscleGroup: 'Pecho',
        sets: [
          { id: 's1', weight: 80, reps: 8, completed: true },
          { id: 's2', weight: 80, reps: 8, completed: true },
        ],
      },
      {
        id: 'ex-2',
        name: 'Remo con barra',
        muscleGroup: 'Espalda',
        sets: [
          { id: 's3', weight: 60, reps: 10, completed: true },
        ],
      },
    ],
  };

  const html = renderToStaticMarkup(
    <GymActivityCalendar sessions={[session]} restDates={[]} onOpenSession={() => {}} />
  );

  assert.doesNotMatch(html, /1 sesión registrada/);
  assert.doesNotMatch(html, /Ayuda: cómo se cuenta la actividad|<summary/);
  assert.match(html, /data-activity-single-session="sess-today-1"/);
  assert.match(html, /Torso Fuerza/);
  assert.match(html, /18:00/);
  assert.match(html, /55 min/);
  assert.match(html, /1\.880 kg|1880 kg/);
  assert.match(html, /Press banca/);
  assert.match(html, /Remo con barra/);
  assert.match(html, /Ver sesión completa/);
  assert.match(html, /data-open-calendar-session="sess-today-1"/);
  // Primera sesión sin historial previo: no celebra PRs falsos
  assert.doesNotMatch(html, /gym-activity-pr-badge/);
});

test('Block 8: GymActivityCalendar cuenta ejercicios únicos con PR y 1RM Estimado usa "kg ×"', () => {
  const today = todayISO();
  const priorSession: GymSession = {
    id: 'sess-prior',
    date: '2026-10-01',
    weekLabel: 'Torso',
    status: 'completed',
    exercises: [
      {
        id: 'ex-1',
        name: 'Curl martillo',
        sets: [{ id: 's-old', weight: 15, reps: 10, completed: true }],
      },
    ],
  };
  const todaySession: GymSession = {
    id: 'sess-pr',
    date: today,
    weekLabel: 'Torso',
    status: 'completed',
    startedAt: '18:00',
    finishedAt: '18:40',
    exercises: [
      {
        id: 'ex-1',
        name: 'Curl martillo',
        sets: [
          { id: 's-new-1', weight: 17.5, reps: 12, completed: true },
          { id: 's-new-2', weight: 17.5, reps: 12, completed: true },
        ],
      },
    ],
  };

  const prs = detectSessionPRs(todaySession, calcDetailedPRs([priorSession, todaySession], todaySession.id, today));
  const e1rmPr = prs.find((pr) => pr.typeLabel === '1RM Estimado');
  assert.ok(e1rmPr, 'Debe detectar PR de 1RM Estimado');
  assert.match(e1rmPr.label, /\(17\.5 kg × 12\)/);
  assert.doesNotMatch(e1rmPr.label, /17\.5k ×/);
  assert.ok(prs.length > 1, 'El mismo ejercicio rompe varias subcategorías de PR');

  const html = renderToStaticMarkup(
    <GymActivityCalendar sessions={[priorSession, todaySession]} restDates={[]} onOpenSession={() => {}} />
  );
  assert.match(html, />1 PR</, 'El badge debe contar ejercicios únicos con PR, no subcategorías');
  assert.doesNotMatch(html, new RegExp(`>${prs.length} PRs<`));

  const state = defaultState();
  state.gym.sessions = [todaySession];
  const trainHtml = renderToStaticMarkup(
    <GimnasioView state={state} onUpdateState={() => true} initialTab="entrenar" />
  );
  assert.match(trainHtml, /Sesión de hoy completada/);
  assert.doesNotMatch(trainHtml, /Sin rutina asignada para hoy\./);
});

test('Block 8: GymActivityCalendar con 2 sesiones en el mismo día muestra "2 sesiones registradas" y lista ambas', () => {
  const today = todayISO();
  const sessions: GymSession[] = [
    {
      id: 'sess-am',
      date: today,
      weekLabel: 'Fuerza mañana',
      status: 'completed',
      startedAt: '08:30',
      finishedAt: '09:15',
      exercises: [
        { id: 'ex-1', name: 'Sentadilla', sets: [{ id: 's1', weight: 100, reps: 5, completed: true }] },
      ],
    },
    {
      id: 'sess-pm',
      date: today,
      weekLabel: 'Accesorios tarde',
      status: 'completed',
      startedAt: '19:00',
      finishedAt: '19:30',
      exercises: [
        { id: 'ex-2', name: 'Curl bíceps', sets: [{ id: 's2', weight: 15, reps: 12, completed: true }] },
      ],
    },
  ];

  const html = renderToStaticMarkup(
    <GymActivityCalendar sessions={sessions} restDates={[]} onOpenSession={() => {}} />
  );

  assert.match(html, /2 sesiones registradas/);
  assert.match(html, /Fuerza mañana/);
  assert.match(html, /Accesorios tarde/);
  assert.match(html, /data-open-calendar-session="sess-am"/);
  assert.match(html, /data-open-calendar-session="sess-pm"/);
  assert.doesNotMatch(html, /data-activity-single-session/);
});

test('Block 9: WorkoutSummaryModal agrupa 1 fila por ejercicio y coincide 1:1 con buildGymSessionPresentation y GymActivityCalendar', () => {
  const today = todayISO();
  const priorSession: GymSession = {
    id: 'sess-b9-prior',
    date: '2026-10-01',
    weekLabel: 'Torso',
    status: 'completed',
    exercises: [
      { id: 'ex-1', name: 'Curl martillo', equipment: 'mancuerna', sets: [{ id: 'p1', weight: 15, reps: 10, completed: true }] },
      { id: 'ex-2', name: 'Press banca', equipment: 'barra', sets: [{ id: 'p2', weight: 80, reps: 8, completed: true }] },
    ],
  };
  const todaySession: GymSession = {
    id: 'sess-b9-today',
    date: today,
    weekLabel: 'Torso',
    status: 'completed',
    startedAt: '18:00',
    finishedAt: '18:45',
    exercises: [
      {
        id: 'ex-1',
        name: 'Curl martillo',
        equipment: 'mancuerna',
        sets: [
          { id: 'c1', weight: 7.5, reps: 12, completed: true },
          { id: 'c2', weight: 17.5, reps: 12, completed: true },
        ],
      },
      {
        id: 'ex-2',
        name: 'Press banca',
        equipment: 'barra',
        sets: [{ id: 'c3', weight: 80, reps: 8, completed: true }], // empate -> no es PR
      },
    ],
  };

  const allSessions = [priorSession, todaySession];
  const grouped = getSessionExercisePRs(todaySession, allSessions);
  const flatRecords = grouped.flatMap((entry) => entry.records);
  const presentation = buildGymSessionPresentation(todaySession, allSessions);

  // Mismo número de ejercicios con PR en el motor y en buildGymSessionPresentation
  assert.equal(grouped.length, 1);
  assert.ok(flatRecords.length > 1, 'El ejercicio rompió múltiples categorías');
  assert.equal(presentation.prExerciseCount, 1);

  // GymActivityCalendar muestra el mismo 1 PR
  const calendarHtml = renderToStaticMarkup(
    <GymActivityCalendar sessions={allSessions} restDates={[]} onOpenSession={() => {}} />
  );
  assert.match(calendarHtml, />1 PR</);

  // WorkoutSummaryModal muestra 1 fila por ejercicio con mejor serie y badges discretos
  const modalHtml = renderToStaticMarkup(
    <WorkoutSummaryModal session={todaySession} newPRs={flatRecords} onClose={() => {}} />
  );
  assert.match(modalHtml, /¡1 nuevo PR!/);
  assert.equal((modalHtml.match(/data-pr-exercise-row=/g) || []).length, 1);
  assert.match(modalHtml, /Curl martillo/);
  assert.match(modalHtml, /17\.5 kg × 12/);
  assert.match(modalHtml, />Peso</);
  assert.match(modalHtml, />1RM</);
  assert.match(modalHtml, />Volumen</);
  assert.match(modalHtml, />Reps</);
  assert.doesNotMatch(modalHtml, /Press banca/);

  // Con 0 PRs (ej. primera sesión), el modal oculta el bloque dorado de celebración
  const zeroPrModalHtml = renderToStaticMarkup(
    <WorkoutSummaryModal session={priorSession} newPRs={[]} onClose={() => {}} />
  );
  assert.doesNotMatch(zeroPrModalHtml, /gym-pr-celebration/);
  assert.doesNotMatch(zeroPrModalHtml, /nuevo PR|nuevos PRs/);
});
