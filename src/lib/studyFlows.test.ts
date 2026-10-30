import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStudyDuration,
  getNextPomodoroPhase,
  startStudySession,
  recordStudySession,
  updateStudyLog,
  deleteStudyLog,
  advanceStudyPhase,
  pauseStudySession,
  resumeStudySession,
  assessStudySession,
} from './studyFlows';
import type { LifeOSState, StudyActiveSession } from '../types';

test('formatStudyDuration: formats minutes into readable human Spanish durations', () => {
  assert.equal(formatStudyDuration(0), '0 min');
  assert.equal(formatStudyDuration(-5), '0 min');
  assert.equal(formatStudyDuration(25), '25 min');
  assert.equal(formatStudyDuration(59), '59 min');
  assert.equal(formatStudyDuration(60), '1 h');
  assert.equal(formatStudyDuration(120), '2 h');
  assert.equal(formatStudyDuration(276), '4 h 36 min');
  assert.equal(formatStudyDuration(90), '1 h 30 min');
});

test('getNextPomodoroPhase: properly cycles through focus, short breaks, and long break', () => {
  // Cycle 1: focus -> short break
  const step1 = getNextPomodoroPhase('focus', 1, 4);
  assert.deepEqual(step1, { nextPhase: 'short_break', nextCycle: 1 });

  // Short break 1 -> focus cycle 2
  const step2 = getNextPomodoroPhase('short_break', 1, 4);
  assert.deepEqual(step2, { nextPhase: 'focus', nextCycle: 2 });

  // Cycle 2: focus -> short break
  const step3 = getNextPomodoroPhase('focus', 2, 4);
  assert.deepEqual(step3, { nextPhase: 'short_break', nextCycle: 2 });

  // Short break 2 -> focus cycle 3
  const step4 = getNextPomodoroPhase('short_break', 2, 4);
  assert.deepEqual(step4, { nextPhase: 'focus', nextCycle: 3 });

  // Cycle 3: focus -> short break
  const step5 = getNextPomodoroPhase('focus', 3, 4);
  assert.deepEqual(step5, { nextPhase: 'short_break', nextCycle: 3 });

  // Short break 3 -> focus cycle 4
  const step6 = getNextPomodoroPhase('short_break', 3, 4);
  assert.deepEqual(step6, { nextPhase: 'focus', nextCycle: 4 });

  // Cycle 4: focus -> LONG break
  const step7 = getNextPomodoroPhase('focus', 4, 4);
  assert.deepEqual(step7, { nextPhase: 'long_break', nextCycle: 4 });

  // Long break 4 -> resets to focus cycle 1
  const step8 = getNextPomodoroPhase('long_break', 4, 4);
  assert.deepEqual(step8, { nextPhase: 'focus', nextCycle: 1 });
});

test('startStudySession: supports Pomodoro configuration and defaults', () => {
  const session = startStudySession(25, 'sub-1', 'Matemáticas', 1000000, {
    phase: 'focus',
    cycle: 1,
    totalCycles: 4,
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
  });

  assert.equal(session.plannedMinutes, 25);
  assert.equal(session.targetSubjectId, 'sub-1');
  assert.equal(session.targetSubjectName, 'Matemáticas');
  assert.equal(session.phase, 'focus');
  assert.equal(session.cycle, 1);
  assert.equal(session.totalCycles, 4);
  assert.equal(session.endsAt, 1000000 + 25 * 60 * 1000);
});

test('recordStudySession: NEVER logs break time to studyLog', () => {
  const state: LifeOSState = {
    study: {
      subjects: [],
      exams: [],
      studyLog: [],
    },
  } as unknown as LifeOSState;

  const breakSession: StudyActiveSession = {
    id: 'break-sess-1',
    plannedMinutes: 5,
    startedAt: 1000,
    status: 'running',
    remainingSeconds: 0,
    lastTickAt: 1000,
    phase: 'short_break',
  };

  const res = recordStudySession(state, breakSession, 5);
  assert.equal(res.success, false);
  assert.equal(state.study?.studyLog.length, 0);
  assert.match(res.error || '', /descanso/i);
});

test('recordStudySession: logs valid focus sessions accurately and idempotently', () => {
  const state: LifeOSState = {
    study: {
      subjects: [{ id: 's1', name: 'Historia' }],
      exams: [],
      studyLog: [],
    },
  } as unknown as LifeOSState;

  const focusSession: StudyActiveSession = {
    id: 'focus-sess-1',
    plannedMinutes: 25,
    startedAt: 1000,
    status: 'running',
    remainingSeconds: 0,
    lastTickAt: 1000,
    targetSubjectId: 's1',
    phase: 'focus',
  };

  const res = recordStudySession(state, focusSession, 25, '2026-10-23', 5000);
  assert.equal(res.success, true);
  assert.equal(state.study?.studyLog.length, 1);
  assert.equal(state.study?.studyLog[0].minutes, 25);
  assert.equal(state.study?.studyLog[0].subjectId, 's1');
  assert.equal(state.study?.studyLog[0].subjectName, 'Historia');

  // Second recording of the same session is prevented
  const resDuplicate = recordStudySession(state, focusSession, 25);
  assert.equal(resDuplicate.success, false);
  assert.equal(state.study?.studyLog.length, 1);
});

test('updateStudyLog and deleteStudyLog: allow correcting and removing history safely', () => {
  const state: LifeOSState = {
    study: {
      subjects: [
        { id: 's1', name: 'Historia' },
        { id: 's2', name: 'Biología' },
      ],
      exams: [],
      studyLog: [
        {
          id: 'log-1',
          date: '2026-10-20',
          minutes: 30,
          subjectId: 's1',
          subjectName: 'Historia',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    },
  } as unknown as LifeOSState;

  // Update minutes and change subject
  const upRes = updateStudyLog(state, 'log-1', { minutes: 45, subjectId: 's2' });
  assert.equal(upRes.success, true);
  assert.equal(state.study?.studyLog[0].minutes, 45);
  assert.equal(state.study?.studyLog[0].subjectId, 's2');
  assert.equal(state.study?.studyLog[0].subjectName, 'Biología');

  // Delete log
  const delRes = deleteStudyLog(state, 'log-1');
  assert.equal(delRes.success, true);
  assert.equal(state.study?.studyLog.length, 0);
});

test('Pomodoro: pause excludes rest, completion is atomic and idempotent across cycles', () => {
  const state = { study: { subjects: [{ id: 's1', name: 'Historia' }], exams: [], studyLog: [], activeSession: null } } as unknown as LifeOSState;
  const startedAt = 100_000;
  const focus = startStudySession(25, 's1', 'Historia', startedAt, { phase: 'focus', cycle: 1, totalCycles: 4 });
  state.study.activeSession = focus;
  const paused = pauseStudySession(focus, startedAt + 10 * 60_000);
  assert.equal(assessStudySession(paused, startedAt + 60 * 60_000).effectiveMinutes, 10);
  const resumed = resumeStudySession(paused, startedAt + 60 * 60_000);
  assert.equal(assessStudySession(resumed, startedAt + 65 * 60_000).effectiveMinutes, 15);
  state.study.activeSession = { ...resumed, lastTickAt: resumed.endsAt! - 30_000 };
  const endedAt = resumed.endsAt!;
  assert.equal(advanceStudyPhase(state, focus.id, 5, { phase: 'short_break', cycle: 1, totalCycles: 4 }, endedAt), true);
  assert.equal(state.study.studyLog.length, 1);
  assert.equal(state.study.studyLog[0].sessionId, focus.id);
  assert.equal(state.study.studyLog[0].minutes, 25);
  assert.equal(state.study.activeSession?.targetSubjectId, 's1');
  assert.equal(advanceStudyPhase(state, focus.id, 5, { phase: 'short_break', cycle: 1 }, endedAt), false);
  assert.equal(state.study.studyLog.length, 1);
  const rest = state.study.activeSession!;
  state.study.activeSession = { ...rest, lastTickAt: rest.endsAt! - 30_000 };
  assert.equal(advanceStudyPhase(state, rest.id, 25, { phase: 'focus', cycle: 2, totalCycles: 4 }, rest.endsAt!), true);
  assert.equal(state.study.studyLog.length, 1);
  assert.equal(state.study.activeSession?.cycle, 2);
});

test('study history rejects invalid date and unknown subject without partial mutation', () => {
  const state = { study: { subjects: [], exams: [], studyLog: [{ id: 'legacy', date: '2025-04-01', minutes: 30, subjectId: 'old', subjectName: 'Archivada' }] } } as unknown as LifeOSState;
  const before = structuredClone(state.study.studyLog[0]);
  assert.equal(updateStudyLog(state, 'legacy', { minutes: 45, date: '2027-02-29' }).success, false);
  assert.deepEqual(state.study.studyLog[0], before);
  assert.equal(updateStudyLog(state, 'legacy', { subjectId: 'missing' }).success, false);
  assert.deepEqual(state.study.studyLog[0], before);
  assert.equal(updateStudyLog(state, 'legacy', { minutes: 45, subjectId: 'old' }).success, true);
  assert.equal(state.study.studyLog[0].subjectName, 'Archivada');
});
