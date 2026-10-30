import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeStudyModule } from './syncMerge';
import { syncModuleData } from './syncModel';
import { defaultState } from './storage';
import { Study, Subject, Exam } from '../types';

test('Sincronización: dos dispositivos agregan registros de estudio diferentes sin pérdida', () => {
  const baseline: Study = {
    subjects: [{ id: 'sub-1', name: 'Álgebra', createdAt: 1000, updatedAt: 1000 }],
    exams: [],
    studyLog: [{ id: 'log-1', subjectId: 'sub-1', date: '2026-10-10', minutes: 60, createdAt: 1000, updatedAt: 1000 }],
  };

  // Dispositivo A registra 45 min hoy
  const local: Study = {
    ...baseline,
    studyLog: [
      ...baseline.studyLog,
      { id: 'log-local-2', subjectId: 'sub-1', date: '2026-10-19', minutes: 45, createdAt: 2000, updatedAt: 2000 },
    ],
  };

  // Dispositivo B registra 30 min hoy
  const remote: Study = {
    ...baseline,
    studyLog: [
      ...baseline.studyLog,
      { id: 'log-remote-3', subjectId: 'sub-1', date: '2026-10-19', minutes: 30, createdAt: 2100, updatedAt: 2100 },
    ],
  };

  const merged = mergeStudyModule(local, remote, baseline, {});

  // La unión debe conservar ambos registros nuevos más el base sin duplicados
  assert.equal(merged.studyLog.length, 3);
  assert.ok(merged.studyLog.some((l) => l.id === 'log-1'));
  assert.ok(merged.studyLog.some((l) => l.id === 'log-local-2'));
  assert.ok(merged.studyLog.some((l) => l.id === 'log-remote-3'));
});

test('Sincronización: edición concurrente de examen utiliza updatedAt para LWW determinista', () => {
  const baseExam: Exam = { id: 'exam-1', subjectId: 'sub-1', date: '2026-10-20', status: 'pendiente', updatedAt: 1000 };
  const baseline: Study = {
    subjects: [{ id: 'sub-1', name: 'Física', updatedAt: 1000 }],
    exams: [baseExam],
    studyLog: [],
  };

  // Dispositivo Local aprueba el examen a las 14:00 (timestamp 14000)
  const local: Study = {
    ...baseline,
    exams: [{ ...baseExam, status: 'aprobado', updatedAt: 14000 }],
  };

  // Dispositivo Remoto lo modifica antes, a las 12:00 (timestamp 12000)
  const remote: Study = {
    ...baseline,
    exams: [{ ...baseExam, status: 'desaprobado', updatedAt: 12000 }],
  };

  const merged = mergeStudyModule(local, remote, baseline, {});
  assert.equal(merged.exams.length, 1);
  assert.equal(merged.exams[0].status, 'aprobado', 'El cambio local con mayor timestamp debe prevalecer');

  // Caso inverso: Remoto tiene timestamp mayor (15000)
  const remoteNewer: Study = {
    ...baseline,
    exams: [{ ...baseExam, status: 'desaprobado', updatedAt: 15000 }],
  };
  const mergedRemoteWins = mergeStudyModule(local, remoteNewer, baseline, {});
  assert.equal(mergedRemoteWins.exams[0].status, 'desaprobado', 'El cambio remoto con mayor timestamp debe prevalecer');
});

test('Sincronización: relojes locales desajustados (clock skew) y resolución LWW determinista con detección de conflicto', () => {
  const baseExam: Exam = { id: 'exam-skew', subjectId: 'sub-1', date: '2026-10-22', status: 'pendiente', updatedAt: 5000 };
  const baseline: Study = {
    subjects: [{ id: 'sub-1', name: 'Arquitectura', updatedAt: 5000 }],
    exams: [baseExam],
    studyLog: [],
  };

  // Escenario de reloj desfasado:
  // Dispositivo Local realiza edición a las 12:00 del tiempo real,
  // pero su reloj de sistema está atrasado 2 horas (atribuye updatedAt: 10000).
  const local: Study = {
    ...baseline,
    exams: [{ ...baseExam, status: 'aprobado', updatedAt: 10000 }],
  };

  // Dispositivo Remoto realizó edición previa a las 11:00 del tiempo real,
  // con reloj sincronizado (atribuye updatedAt: 11000).
  const remote: Study = {
    ...baseline,
    exams: [{ ...baseExam, status: 'desaprobado', updatedAt: 11000 }],
  };

  const conflicts: any[] = [];
  const merged = mergeStudyModule(local, remote, baseline, {}, (c) => conflicts.push(c));

  // 1. Resolución determinista por LWW: el reloj con mayor timestamp numérico (11000) gana.
  // Demuestra el límite del LWW puro: un reloj atrasado físicamente pierde frente a un timestamp mayor.
  assert.equal(merged.exams.length, 1);
  assert.equal(merged.exams[0].status, 'desaprobado', 'Remote con 11000 gana determinísticamente sobre local 10000');

  // 2. Transparencia: se emite un conflicto estructurado para que el usuario o el sistema
  // audite la colisión concurrente, en vez de asumir ausencia total de pérdida de datos.
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].module, 'study');
  assert.equal(conflicts[0].entityId, 'exam-skew');
});

test('Sincronización: eliminación con tombstone en un dispositivo no resucita la entidad', () => {
  const subToDelete: Subject = { id: 'sub-empty', name: 'Sin cursar', updatedAt: 1000 };
  const baseline: Study = {
    subjects: [subToDelete],
    exams: [],
    studyLog: [],
  };

  // Local elimina la materia
  const local: Study = {
    subjects: [],
    exams: [],
    studyLog: [],
  };

  // Remoto no tocó la materia
  const remote: Study = { ...baseline };

  const tombstones = { 'sub-empty': 2000 };
  const merged = mergeStudyModule(local, remote, baseline, tombstones);
  assert.equal(merged.subjects.length, 0, 'La materia eliminada y tombstoneada no debe resucitar');
});

test('Sincronización: activeSession es estrictamente local y se excluye del payload cloud', () => {
  const state = defaultState();
  state.study.activeSession = {
    id: 'active-session-1',
    plannedMinutes: 25,
    startedAt: Date.now(),
    status: 'running',
    remainingSeconds: 1500,
    lastTickAt: Date.now(),
  };

  const payload = syncModuleData(state, 'study') as { study: Study };
  assert.ok(payload.study);
  assert.equal(payload.study.activeSession, undefined, 'activeSession no debe viajar en el payload de sincronización cloud');
});

test('Sincronización: mergeStudyModule conserva la sesión activa del dispositivo local', () => {
  const local: Study = {
    subjects: [],
    exams: [],
    studyLog: [],
    activeSession: {
      id: 'local-session-1',
      plannedMinutes: 45,
      startedAt: 1000,
      status: 'running',
      remainingSeconds: 2700,
      lastTickAt: 1000,
    },
  };

  const remote: Study = {
    subjects: [],
    exams: [],
    studyLog: [],
  };

  const merged = mergeStudyModule(local, remote, undefined, {});
  assert.ok(merged.activeSession);
  assert.equal(merged.activeSession.id, 'local-session-1');
  assert.equal(merged.activeSession.plannedMinutes, 45);
});

test('Sincronización Fase 1A: merge de evaluaciones preserva nuevos campos (title, time, grade, subjectId null)', () => {
  const baseExam: Exam = {
    id: 'exam-mod',
    title: 'Parcial 1',
    subjectId: 'sub-1',
    date: '2026-10-25',
    time: '10:00',
    status: 'pendiente',
    grade: null,
    updatedAt: 1000,
  };

  const baseline: Study = {
    subjects: [{ id: 'sub-1', name: 'Arquitectura', updatedAt: 1000 }],
    exams: [baseExam],
    studyLog: [],
  };

  // Local actualiza la hora y agrega calificación aprobada a las 14:00 (updatedAt: 14000)
  const local: Study = {
    ...baseline,
    exams: [
      {
        ...baseExam,
        time: '11:00',
        status: 'aprobado',
        grade: '10/10',
        updatedAt: 14000,
      },
    ],
  };

  // Remoto lo modificó antes a las 12:00 (updatedAt: 12000)
  const remote: Study = {
    ...baseline,
    exams: [
      {
        ...baseExam,
        title: 'Primer Parcial Teórico',
        updatedAt: 12000,
      },
    ],
  };

  const merged = mergeStudyModule(local, remote, baseline, {});
  assert.equal(merged.exams.length, 1);
  assert.equal(merged.exams[0].time, '11:00', 'Debe prevalecer la hora del cambio más reciente');
  assert.equal(merged.exams[0].status, 'aprobado');
  assert.equal(merged.exams[0].grade, '10/10');
});

test('Sincronización Fase 1A: compatibilidad con exámenes legados sin title ni time', () => {
  const legacyRemoteExam: Exam = {
    id: 'exam-leg',
    subjectId: 'sub-leg',
    date: '2026-11-01',
    status: 'pendiente',
    updatedAt: 2000,
  };

  const local: Study = {
    subjects: [{ id: 'sub-leg', name: 'Historia' }],
    exams: [],
    studyLog: [],
  };

  const remote: Study = {
    subjects: [{ id: 'sub-leg', name: 'Historia' }],
    exams: [legacyRemoteExam],
    studyLog: [],
  };

  const merged = mergeStudyModule(local, remote, undefined, {});
  assert.equal(merged.exams.length, 1);
  assert.equal(merged.exams[0].id, 'exam-leg');
  assert.equal(merged.exams[0].title, undefined);
  assert.equal(merged.exams[0].time, undefined);
  assert.equal(merged.exams[0].status, 'pendiente');
});
