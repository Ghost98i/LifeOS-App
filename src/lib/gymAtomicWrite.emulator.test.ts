import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, terminate } from 'firebase/firestore';
import { CloudRevisionConflict, getFirestoreDb, writeCloudModulesGuarded } from './cloudSync';
import { mergeSyncModuleWithConflicts, syncModuleData } from './syncModel';
import { defaultState } from './storage';

test('Firestore Emulator: concurrent Gym writes preserve the winner and let the loser reconcile', async (context) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    context.skip('Requires Firestore and Auth emulators');
    return;
  }
  const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const [authHost, authPort] = process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':');
  const db = getFirestoreDb();
  const app = getApp();
  try {
    connectFirestoreEmulator(db, firestoreHost, Number(firestorePort));
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authHost}:${authPort}`, { disableWarnings: true });
    const credential = await signInAnonymously(auth);
    const userId = credential.user.uid;

    const phone = defaultState();
    phone.gym.sessions.push({ id: 'phone-workout', date: '2026-10-20', status: 'completed', startedAt: '08:00', finishedAt: '09:00', exercises: [
      { id: 'press', name: 'Press', sets: [{ id: 'press-set', weight: 80, reps: 8, completed: true }] },
    ] });
    const pc = defaultState();
    pc.gym.sessions.push({ id: 'pc-workout', date: '2026-10-21', status: 'completed', startedAt: '08:00', finishedAt: '09:00', exercises: [
      { id: 'squat', name: 'Sentadilla', sets: [{ id: 'squat-set', weight: 100, reps: 5, completed: true }] },
    ] });

    const first = await writeCloudModulesGuarded(userId, phone, ['gym'], 'phone', {});
    const second = await writeCloudModulesGuarded(userId, pc, ['gym'], 'pc', {});
    const [firstOutcome, secondOutcome] = await Promise.allSettled([first.completion, second.completion]);
    const outcomes = [firstOutcome, secondOutcome];
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    const rejection = outcomes.find(outcome => outcome.status === 'rejected');
    assert.ok(rejection?.status === 'rejected' && rejection.reason instanceof CloudRevisionConflict);
    const phoneWon = firstOutcome.status === 'fulfilled';
    const winnerWrite = phoneWon ? first : second;
    const winnerState = phoneWon ? phone : pc;
    const loserState = phoneWon ? pc : phone;

    const reference = doc(db, 'users', userId, 'lifeosModules', 'gym');
    const winner = await getDoc(reference);
    assert.equal(winner.data()?.revision, winnerWrite.writes[0].revision);
    assert.equal(winner.data()?.data?.gym?.sessions?.[0]?.id, winnerState.gym.sessions[0].id);

    const reconciled = mergeSyncModuleWithConflicts(loserState, 'gym', syncModuleData(winnerState, 'gym'), syncModuleData(defaultState(), 'gym'));
    assert.equal(reconciled.conflicts.length, 0);
    assert.deepEqual(reconciled.state.gym.sessions.map((session) => session.id).sort(), ['pc-workout', 'phone-workout']);
    const retry = await writeCloudModulesGuarded(userId, reconciled.state, ['gym'], 'loser-retry', { gym: winnerWrite.writes[0].revision });
    await retry.completion;
    const finalHead = await getDoc(reference);
    assert.deepEqual(finalHead.data()?.data?.gym?.sessions?.map((session: { id: string }) => session.id).sort(), ['pc-workout', 'phone-workout']);
  } finally {
    try {
      await terminate(db);
    } finally {
      await deleteApp(app);
    }
  }
});
