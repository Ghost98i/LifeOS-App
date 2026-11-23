import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActiveWorkoutView } from '../components/ActiveWorkoutView';
import { GymRestOverlay } from '../components/GymRestOverlay';
import { GymRestSettingsModal } from '../components/GymRestSettingsModal';
import { MobileNav } from '../components/MobileNav';
import { TodayRadarSection } from '../components/TodayRadarSection';
import {
  playSound,
  playTimerCountdownTone,
  setSoundEnabled,
} from './audio';
import { applyGymRestTimerAdjustment, getGymSettings, skipGymRestTimer } from './gymFlows';
import {
  consumeRestTimerCompletion,
  formatRestTimerClock,
  getRestNotificationPermission,
  getRestTimerSnapshot,
  isRestNotificationEnabled,
  isRestNotificationSupported,
  requestRestNotificationPermission,
  resetRestCycleCompletionTracker,
  sendRestCompleteNotification,
  setRestNotificationEnabled,
  triggerRestTimerCompletionAlert,
  vibrateRestComplete,
} from './gymRestTimer';
import { defaultState } from './storage';
import type { GymActiveTimer, GymSession } from '../types';

const noop = () => undefined;

function createSession(): GymSession {
  return {
    id: 'session-b15',
    date: '2026-11-23',
    weekLabel: 'Espalda / bíceps',
    status: 'active',
    startedAt: '18:00',
    exercises: [
      {
        id: 'ex-row',
        name: 'Remo en polea baja',
        muscleGroup: 'Espalda',
        equipment: 'polea',
        barWeight: 0,
        sets: [
          { id: 'set-1', weight: 55, reps: 10, completed: true },
          { id: 'set-2', weight: 55, reps: 10, completed: false },
        ],
      },
      {
        id: 'ex-curl',
        name: 'Curl de bíceps',
        muscleGroup: 'Brazos',
        equipment: 'mancuerna',
        barWeight: 0,
        sets: [
          { id: 'set-c1', weight: 14, reps: 12, completed: true },
        ],
      },
    ],
  };
}

test('Bloque 15: cálculo de tiempo restante vs exceso positivo (+MM:SS) basado en endsAt', () => {
  const base = 1_700_000_000_000;
  const timer: GymActiveTimer = {
    endsAt: base + 90_000,
    durationSeconds: 90,
    sessionId: 'session-b15',
    exerciseId: 'ex-row',
    setId: 'set-1',
    kind: 'set',
  };

  // Cuenta regresiva normal
  const activeSnap = getRestTimerSnapshot(timer, base);
  assert.ok(activeSnap);
  assert.equal(activeSnap.isOvertime, false);
  assert.equal(activeSnap.remainingSeconds, 90);
  assert.equal(activeSnap.overtimeSeconds, 0);
  assert.equal(activeSnap.formatted, '01:30');
  assert.equal(activeSnap.progressPercent, 100);

  const almostDone = getRestTimerSnapshot(timer, base + 89_500);
  assert.ok(almostDone);
  assert.equal(almostDone.isOvertime, false);
  assert.equal(almostDone.remainingSeconds, 1);
  assert.equal(almostDone.formatted, '00:01');

  // Cruce exacto 00:00
  const atZero = getRestTimerSnapshot(timer, base + 90_000);
  assert.ok(atZero);
  assert.equal(atZero.isOvertime, true);
  assert.equal(atZero.remainingSeconds, 0);
  assert.equal(atZero.overtimeSeconds, 0);
  assert.equal(atZero.formatted, '00:00');
  assert.equal(atZero.progressPercent, 100);

  // Exceso positivo (+00:01 y +01:45 sin desfasaje en segundo plano)
  const over1s = getRestTimerSnapshot(timer, base + 91_000);
  assert.ok(over1s);
  assert.equal(over1s.isOvertime, true);
  assert.equal(over1s.overtimeSeconds, 1);
  assert.equal(over1s.formatted, '+00:01');

  const over105s = getRestTimerSnapshot(timer, base + 90_000 + 105_000);
  assert.ok(over105s);
  assert.equal(over105s.isOvertime, true);
  assert.equal(over105s.overtimeSeconds, 105);
  assert.equal(over105s.formatted, '+01:45');
  assert.equal(formatRestTimerClock(-105_000), '+01:45');

  // Recuperar desde exceso con +30s inicia una cuenta regresiva limpia de 30s
  const recovered = applyGymRestTimerAdjustment(timer, 30, base + 120_000);
  assert.equal(recovered.completed, false);
  assert.ok(recovered.timer);
  assert.equal(recovered.timer.endsAt, base + 150_000);
  assert.equal(recovered.timer.durationSeconds, 30);
});

test('Bloque 15: disparo único de finalización por ciclo (sin repetir en re-renders ni al volver a la pestaña)', () => {
  resetRestCycleCompletionTracker();
  const base = 1_700_000_000_000;
  const timer: GymActiveTimer = {
    endsAt: base + 60_000,
    durationSeconds: 60,
    sessionId: 'session-b15',
    exerciseId: 'ex-row',
    setId: 'set-1',
    kind: 'set',
  };

  // Antes de llegar a endsAt nunca dispara
  assert.equal(consumeRestTimerCompletion(timer, base + 59_999), false);

  // Pausado no dispara aunque haya pasado endsAt
  assert.equal(
    consumeRestTimerCompletion({ ...timer, pausedAt: base + 30_000, remainingSecondsWhenPaused: 30 }, base + 90_000),
    false
  );

  // Al cruzar 00:00 dispara UNA sola vez
  assert.equal(consumeRestTimerCompletion(timer, base + 60_000), true);
  assert.equal(consumeRestTimerCompletion(timer, base + 60_250), false);
  assert.equal(consumeRestTimerCompletion(timer, base + 120_000), false);

  // Nuevo ciclo (nuevo endsAt) sí vuelve a disparar una vez
  const nextCycle: GymActiveTimer = { ...timer, endsAt: base + 180_000, setId: 'set-2' };
  assert.equal(consumeRestTimerCompletion(nextCycle, base + 180_000), true);
  assert.equal(consumeRestTimerCompletion(nextCycle, base + 181_000), false);
});

test('Bloque 15: seguridad SSR/Node de Web Audio (success y restComplete) y helpers de notificación sin APIs de navegador', async () => {
  resetRestCycleCompletionTracker();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalNotification = Object.getOwnPropertyDescriptor(globalThis, 'Notification');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'Notification');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });

  try {
    assert.doesNotThrow(() => playSound('success'));
    assert.doesNotThrow(() => playSound('restComplete'));
    assert.doesNotThrow(() => playTimerCountdownTone(0));
    assert.equal(isRestNotificationSupported(), false);
    assert.equal(getRestNotificationPermission(), 'unsupported');
    assert.equal(isRestNotificationEnabled(), false);
    assert.equal(await requestRestNotificationPermission(), 'unsupported');
    assert.equal(vibrateRestComplete(), false);
    assert.equal(sendRestCompleteNotification({ exerciseName: 'Remo' }), false);
    assert.equal(
      triggerRestTimerCompletionAlert(
        { endsAt: 1000, durationSeconds: 60, sessionId: 's1', setId: 'set-ssr' },
        { exerciseName: 'Remo', sessionName: 'Espalda' },
        2000
      ),
      true
    );
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    if (originalNotification) Object.defineProperty(globalThis, 'Notification', originalNotification);
    else Reflect.deleteProperty(globalThis, 'Notification');
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  }
});

test('Bloque 15: parámetros Web Audio 1:1 del HTML Lab para Doble Nota Corta (success), Tríada Ascendente (restComplete) y notificación opcional', () => {
  resetRestCycleCompletionTracker();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const originalNotification = Object.getOwnPropertyDescriptor(globalThis, 'Notification');
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const storage = new Map<string, string>();
  const oscillators: Array<{ type: string; freq: number; start: number; stop: number }> = [];
  const gainPeaks: number[] = [];
  const compressorParams: Record<string, number> = {};
  const notifications: Array<{ title: string; options?: NotificationOptions }> = [];
  const vibrations: Array<number | number[]> = [];

  class MockAudioContext {
    state = 'running';
    currentTime = 10;
    destination = {};
    addEventListener() {}
    resume() { return Promise.resolve(); }
    createDynamicsCompressor() {
      return {
        threshold: { setValueAtTime: (v: number) => { compressorParams.threshold = v; } },
        knee: { setValueAtTime: (v: number) => { compressorParams.knee = v; } },
        ratio: { setValueAtTime: (v: number) => { compressorParams.ratio = v; } },
        attack: { setValueAtTime: (v: number) => { compressorParams.attack = v; } },
        release: { setValueAtTime: (v: number) => { compressorParams.release = v; } },
        connect() {},
      };
    }
    createOscillator() {
      const record = { type: 'sine', freq: 0, start: 0, stop: 0 };
      oscillators.push(record);
      return {
        get type() { return record.type; },
        set type(v: string) { record.type = v; },
        frequency: {
          setValueAtTime: (val: number) => { record.freq = val; },
          exponentialRampToValueAtTime: () => {},
        },
        connect() {},
        start: (t: number) => { record.start = t; },
        stop: (t: number) => { record.stop = t; },
      };
    }
    createGain() {
      return {
        connect() {},
        gain: {
          setValueAtTime: (v: number) => { gainPeaks.push(v); },
          linearRampToValueAtTime: (v: number) => { gainPeaks.push(v); },
          exponentialRampToValueAtTime() {},
        },
      };
    }
  }

  class MockNotification {
    static permission: NotificationPermission = 'granted';
    static requestPermission = async () => 'granted' as NotificationPermission;
    constructor(title: string, options?: NotificationOptions) {
      notifications.push({ title, options });
    }
  }

  const target = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.assign(target, { AudioContext: MockAudioContext }),
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
    },
  });
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: MockNotification,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      vibrate: (pattern: number | number[]) => {
        vibrations.push(pattern);
        return true;
      },
    },
  });

  try {
    setSoundEnabled(true);

    // 1. Doble Nota Corta (indigo-chime -> success): E5 (659.25Hz, 0ms) -> B5 (987.77Hz, 65ms), sine + triangle
    playSound('success');
    assert.equal(oscillators.length, 4);
    assert.deepEqual(
      oscillators.map((o) => [
        o.type,
        Math.round(o.freq * 100) / 100,
        Math.round((o.start - 10) * 1000),
        Math.round((o.stop - o.start) * 1000),
      ]),
      [
        ['sine', 659.25, 0, 120],
        ['triangle', 659.25, 0, 120],
        ['sine', 987.77, 65, 140],
        ['triangle', 987.77, 65, 140],
      ]
    );
    assert.deepEqual(compressorParams, { threshold: -10, knee: 16, ratio: 4, attack: 0.003, release: 0.15 });
    assert.ok(gainPeaks.includes(0.75) && gainPeaks.includes(0.28) && gainPeaks.includes(0.34));

    // 2. Tríada Ascendente (short-triad -> restComplete): C6 (1046.5Hz, 0ms), E6 (1318.5Hz, 95ms), G6 (1567.98Hz, 190ms)
    oscillators.length = 0;
    gainPeaks.length = 0;
    playSound('restComplete');
    assert.equal(oscillators.length, 6);
    assert.deepEqual(
      oscillators.map((o) => [
        o.type,
        Math.round(o.freq * 100) / 100,
        Math.round((o.start - 10) * 1000),
        Math.round((o.stop - o.start) * 1000),
      ]),
      [
        ['sine', 1046.5, 0, 115],
        ['triangle', 1046.5, 0, 115],
        ['sine', 1318.5, 95, 115],
        ['triangle', 1318.5, 95, 115],
        ['sine', 1567.98, 190, 165],
        ['triangle', 1567.98, 190, 165],
      ]
    );
    assert.ok(gainPeaks.includes(0.28) && gainPeaks.includes(0.32) && gainPeaks.includes(0.38));

    // Ticks de cuenta regresiva 3-2-1 afinados en G5 (783.99 Hz) antes de la Tríada Ascendente
    oscillators.length = 0;
    gainPeaks.length = 0;
    playTimerCountdownTone(3);
    playTimerCountdownTone(2);
    playTimerCountdownTone(1);
    assert.equal(oscillators.length, 6);
    assert.deepEqual(
      oscillators.slice(0, 2).map((o) => [
        o.type,
        Math.round(o.freq * 100) / 100,
        Math.round((o.stop - o.start) * 1000),
      ]),
      [
        ['sine', 783.99, 70],
        ['triangle', 783.99, 70],
      ]
    );
    assert.ok(gainPeaks.includes(0.15) && gainPeaks.some((v) => Math.abs(v - 0.15 * 0.22) < 1e-6));

    // Omitir/cancelar manualmente el descanso NO dispara la Tríada Ascendente ni success
    oscillators.length = 0;
    const manualGym = defaultState().gym;
    manualGym.sessions = [createSession()];
    manualGym.activeTimer = {
      endsAt: 50_000,
      durationSeconds: 90,
      sessionId: 'session-b15',
      exerciseId: 'ex-row',
      setId: 'set-1',
      kind: 'set',
    };
    skipGymRestTimer(manualGym);
    assert.equal(manualGym.activeTimer, null);
    assert.equal(oscillators.length, 0, 'Saltar/cancelar descanso manualmente no debe disparar audio de fin');

    // 3. Alerta completa de fin de descanso: respeta toggle opcional y dispara una sola vez
    const cycleTimer: GymActiveTimer = {
      endsAt: 5000,
      durationSeconds: 90,
      sessionId: 'session-b15',
      exerciseId: 'ex-row',
      setId: 'set-1',
      kind: 'set',
    };
    setRestNotificationEnabled(true);
    oscillators.length = 0;
    const firedFirst = triggerRestTimerCompletionAlert(
      cycleTimer,
      { exerciseName: 'Remo en polea baja', sessionName: 'Espalda / bíceps' },
      5000
    );
    const firedSecond = triggerRestTimerCompletionAlert(
      cycleTimer,
      { exerciseName: 'Remo en polea baja', sessionName: 'Espalda / bíceps' },
      6000
    );
    assert.equal(firedFirst, true);
    assert.equal(firedSecond, false);
    assert.equal(oscillators.length, 6);
    assert.equal(vibrations.length, 1);
    assert.deepEqual(vibrations[0], [120, 70, 120]);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, 'Descanso terminado');
    assert.match(notifications[0].options?.body || '', /Remo en polea baja/);
    assert.ok(notifications[0].options?.tag?.includes('celestian-gym-rest'));

    // Con notificación desactivada no envía Notification pero sigue sonando y vibrando
    setRestNotificationEnabled(false);
    const cycle2: GymActiveTimer = { ...cycleTimer, endsAt: 9000, setId: 'set-2' };
    assert.equal(triggerRestTimerCompletionAlert(cycle2, { exerciseName: 'Remo' }, 9000), true);
    assert.equal(notifications.length, 1);
    assert.equal(vibrations.length, 2);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (originalNotification) Object.defineProperty(globalThis, 'Notification', originalNotification);
    else Reflect.deleteProperty(globalThis, 'Notification');
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  }
});

test('Bloque 15: ActiveWorkoutView usa CompletionCheck en chips y lista (NO en el CTA primario) con aislamiento de opacidad y sin blue-*', () => {
  const session = createSession();
  const html = renderToStaticMarkup(
    <ActiveWorkoutView
      session={session}
      exerciseIndex={0}
      setIndex={0}
      exerciseSuggestions={[]}
      onSelectExercise={noop}
      onSelectSet={noop}
      onAdjustWeight={noop}
      onAdjustReps={noop}
      onUpdateCurrentSet={noop}
      onToggleCurrentSet={noop}
      onAddSet={noop}
      onDeleteSet={noop}
      onAddExercise={noop}
      onDeleteExercise={noop}
      onUpdateEquipment={noop}
      onUpdateBarWeight={noop}
      onPropagateExercise={noop}
      onOpenCalculator={noop}
      onOpenHistory={noop}
      onOpenHistoryTab={noop}
      onOpenProgressTab={noop}
      onFinish={noop}
      onDeleteSession={noop}
      onSaveAsTemplate={noop}
      onEditSessionDate={noop}
      onEditSessionWeek={noop}
    />
  );

  assert.match(html, /data-completion-check="true"/);
  assert.match(html, /bg-\[#4F46E5\]/);
  assert.match(html, /stroke="#FFFFFF"/);
  assert.doesNotMatch(html, /\b(?:bg|text|border|ring)-blue-/);
  assert.doesNotMatch(html, /\b(?:bg|text|border|ring)-sky-/);

  // El botón CTA primario de serie NO debe contener CompletionCheck (debe ser un botón limpio con Check de Lucide)
  const ctaMatch = html.match(/<button\b[^>]*class="[^"]*c-primary-cta[^"]*"[^>]*>(?:(?!<\/button>).)*<\/button>/);
  assert.ok(ctaMatch, 'Debe renderizar el botón CTA primario');
  assert.doesNotMatch(ctaMatch[0], /data-completion-check="true"/, 'El botón CTA primario no debe contener un círculo CompletionCheck');
  assert.match(ctaMatch[0], /lucide-check/, 'El botón CTA primario debe mostrar el icono Check limpio sin círculo');

  // Aislamiento de opacidad: los botones de chips y lista de ejercicios que contienen CompletionCheck NO deben llevar opacity-*
  const checkButtons = html.match(/<button\b[^>]*>(?:(?!<\/button>).)*data-completion-check="true"(?:(?!<\/button>).)*<\/button>/g) || [];
  assert.ok(checkButtons.length >= 4, 'Debe renderizar CompletionCheck en los chips de series y en la lista de ejercicios');
  for (const btnHtml of checkButtons) {
    const openTag = btnHtml.match(/^<button\b[^>]*>/)?.[0] || '';
    assert.doesNotMatch(openTag, /\bopacity-\d+/, 'El contenedor padre de CompletionCheck nunca debe tener opacity-*');
    assert.match(openTag, /\bgroup\b/, 'El botón padre debe incluir la clase group');
    assert.match(openTag, /min-h-\[44px\]/, 'El botón padre debe conservar área táctil >= 44px');
  }
});

test('Bloque 15: GymRestOverlay usa índigo Celestian (#4F46E5) sin blue-* y ámbar (#F59E0B) en exceso positivo con acción Listo', () => {
  const activeState = defaultState();
  activeState.gym.sessions = [createSession()];
  activeState.gym.activeTimer = {
    endsAt: Date.now() + 90_000,
    durationSeconds: 90,
    sessionId: 'session-b15',
    exerciseId: 'ex-row',
    setId: 'set-1',
    kind: 'set',
  };

  const activeHtml = renderToStaticMarkup(
    <GymRestOverlay state={activeState} onUpdateState={noop} onOpenGym={noop} />
  );
  assert.match(activeHtml, /data-gym-rest-dock="true"/);
  assert.match(activeHtml, /data-rest-state="active"/);
  assert.match(activeHtml, /#4F46E5/);
  assert.match(activeHtml, /Descanso series/);
  assert.match(activeHtml, /Saltar/);
  assert.doesNotMatch(activeHtml, /\b(?:bg|text|border|ring)-blue-/);
  assert.doesNotMatch(activeHtml, /\b(?:bg|text|border|ring)-sky-/);
  assert.doesNotMatch(activeHtml, /var\(--blue/);

  // Estado de exceso positivo: permanece visible en ámbar con contador +MM:SS y botón Listo
  const overtimeState = defaultState();
  overtimeState.gym.sessions = [createSession()];
  overtimeState.gym.activeTimer = {
    endsAt: Date.now() - 105_000,
    durationSeconds: 90,
    sessionId: 'session-b15',
    exerciseId: 'ex-row',
    setId: 'set-1',
    kind: 'set',
  };

  const overtimeHtml = renderToStaticMarkup(
    <GymRestOverlay state={overtimeState} onUpdateState={noop} onOpenGym={noop} />
  );
  assert.match(overtimeHtml, /data-rest-state="overtime"/);
  assert.match(overtimeHtml, /Descanso excedido/);
  assert.match(overtimeHtml.replace(/<[^>]+>/g, ''), /\+01:4[456]/);
  assert.match(overtimeHtml, /font-sans/);
  assert.match(overtimeHtml, /tabular-nums/);
  assert.match(overtimeHtml, /#F59E0B/);
  assert.match(overtimeHtml, /Listo/);
  assert.doesNotMatch(overtimeHtml, /\b(?:bg|text|border|ring)-blue-/);
});

test('Bloque 15: GymRestSettingsModal, MobileNav y TodayRadarSection (Hoy → Gimnasio En curso) usan índigo Celestian unificado', () => {
  const settingsHtml = renderToStaticMarkup(
    <GymRestSettingsModal
      settings={getGymSettings(defaultState().gym)}
      isOpen={true}
      onClose={noop}
      onSave={noop}
    />
  );
  assert.match(settingsHtml, /Notificar al terminar el descanso/);
  assert.match(settingsHtml, /Aviso del dispositivo al llegar a 00:00/);
  assert.match(settingsHtml, /Muestra −30 s y \+30 s mientras descansás/);
  assert.match(settingsHtml, /\[appearance:textfield\]/);
  assert.match(settingsHtml, /focus-visible:outline-none/);
  assert.match(settingsHtml, /role="switch"[^>]*aria-label="Notificar al terminar el descanso"/);
  assert.doesNotMatch(settingsHtml, /\b(?:bg|text|border|ring)-blue-/);
  assert.doesNotMatch(settingsHtml, /var\(--blue/);

  const navHtml = renderToStaticMarkup(
    <MobileNav
      currentView="dashboard"
      onNavigate={noop}
      onOpenCapture={noop}
      onOpenMore={noop}
    />
  );
  assert.match(navHtml, /#4F46E5/);
  assert.doesNotMatch(navHtml, /\b(?:bg|text|border|ring)-blue-/);
  assert.doesNotMatch(navHtml, /var\(--blue/);

  const radarHtml = renderToStaticMarkup(
    <TodayRadarSection
      milestones={[]}
      pulse={{
        studyEnabled: true,
        studyMinutesToday: 0,
        studyFormatted: '0 min',
        studySessionActive: false,
        gymEnabled: true,
        gymStatus: 'active_session',
        gymLabel: 'En curso · Espalda',
        gymRoutineName: 'Espalda',
        blocksCompleted: 1,
        blocksTotal: 3,
        habitsCompleted: 1,
        habitsTotal: 2,
      }}
      enabledRadarModules={[]}
      onOpenMilestone={noop}
      onNavigate={noop}
    />
  );
  assert.match(radarHtml, /En curso · Espalda/);
  assert.match(radarHtml, /text-indigo-600 dark:text-indigo-400/);
  assert.doesNotMatch(radarHtml, /\b(?:bg|text|border|ring)-(?:blue|sky)-/);
});

test('Bloque 15: copy honesto del timer en ActiveWorkoutView (Saltar descanso / Descartar aviso / Pasar al siguiente ejercicio) y serie accesible en exceso móvil', () => {
  const session = createSession();
  const baseProps = {
    session,
    exerciseIndex: 0,
    setIndex: 1,
    exerciseSuggestions: [] as string[],
    onSelectExercise: noop,
    onSelectSet: noop,
    onAdjustWeight: noop,
    onAdjustReps: noop,
    onUpdateCurrentSet: noop,
    onToggleCurrentSet: noop,
    onAddSet: noop,
    onDeleteSet: noop,
    onAddExercise: noop,
    onDeleteExercise: noop,
    onUpdateEquipment: noop,
    onUpdateBarWeight: noop,
    onPropagateExercise: noop,
    onOpenCalculator: noop,
    onOpenHistory: noop,
    onOpenHistoryTab: noop,
    onOpenProgressTab: noop,
    onFinish: noop,
    onDeleteSession: noop,
    onSaveAsTemplate: noop,
    onEditSessionDate: noop,
    onEditSessionWeek: noop,
  };

  // 1. Cuenta regresiva con series pendientes en ejercicio actual -> "Saltar descanso"
  const countdownHtml = renderToStaticMarkup(
    <ActiveWorkoutView
      {...baseProps}
      activeTimer={{
        endsAt: Date.now() + 60_000,
        durationSeconds: 90,
        sessionId: session.id,
        exerciseId: 'ex-row',
        setId: 'set-1',
        kind: 'set',
        exerciseIndex: 0,
      }}
    />
  );
  assert.match(countdownHtml, /Saltar descanso/);
  assert.doesNotMatch(countdownHtml, /Comenzar Serie 2 Ahora/);

  // 2. Exceso (+MM:SS) con series pendientes -> "Descartar aviso" y editor de serie visible en móvil (sin is-rest-hidden-mobile)
  const overtimeHtml = renderToStaticMarkup(
    <ActiveWorkoutView
      {...baseProps}
      activeTimer={{
        endsAt: Date.now() - 25_000,
        durationSeconds: 90,
        sessionId: session.id,
        exerciseId: 'ex-row',
        setId: 'set-1',
        kind: 'set',
        exerciseIndex: 0,
      }}
    />
  );
  assert.match(overtimeHtml, /Descartar aviso/);
  assert.match(overtimeHtml, /Completar serie 2/);
  assert.doesNotMatch(overtimeHtml, /c-logging-phase[^"]*is-rest-hidden-mobile/);
  assert.match(overtimeHtml, /data-gym-rest-mobile-sticky="true"/);

  // 3. Descanso entre ejercicios -> conserva "Pasar al siguiente ejercicio →"
  const exRestHtml = renderToStaticMarkup(
    <ActiveWorkoutView
      {...baseProps}
      activeTimer={{
        endsAt: Date.now() + 120_000,
        durationSeconds: 180,
        sessionId: session.id,
        exerciseId: 'ex-row',
        setId: 'set-2',
        kind: 'exercise',
        exerciseIndex: 0,
        targetExerciseIndex: 1,
      }}
    />
  );
  assert.match(exRestHtml, /Pasar al siguiente ejercicio →/);
});
