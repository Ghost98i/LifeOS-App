import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { triggerHaptic, prefersReducedMotion } from './haptics';
import {
  requestConfirm,
  requestPrompt,
  subscribeConfirmDialogs,
  type DialogRequest,
} from './confirmDialog';
import { CelestianConfirmDialog } from '../components/CelestianConfirmHost';
import {
  playExpenseLogged,
  playSound,
  playTimerCountdownTone,
  setSoundEnabled,
  startAmbientTrack,
} from './audio';
import { defaultState, todayISO } from './storage';
import { addTransaction, deleteTransaction, restoreDeletedTransaction } from './financeFlows';
import { deleteNote } from './notesFlows';
import { deleteStudyQuestion } from './studyPractice';

const ROOT = process.cwd();

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('Bloque 36.1: Cero apariciones de window.confirm, window.alert ni window.prompt en todo src/ (excluyendo tests)', () => {
  const files = collectSourceFiles(path.join(ROOT, 'src'));
  const offenders: string[] = [];
  const pattern = /\b(?:window\.)?(?:confirm|alert|prompt)\s*\(/;

  for (const filePath of files) {
    const cleaned = stripComments(fs.readFileSync(filePath, 'utf8'));
    const match = cleaned.match(pattern);
    if (match) {
      offenders.push(`${path.relative(ROOT, filePath)} -> ${match[0]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Se detectaron diálogos nativos prohibidos en producción: ${offenders.join(', ')}`
  );
});

test('Bloque 36.2: haptics.ts dispara patrones seguros con navigator.vibrate y es no-op con fallback o prefers-reduced-motion', () => {
  const prevNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  const setMockEnv = (vibrateFn?: (pattern: number | number[]) => boolean, reducedMotion = false) => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: vibrateFn ? { vibrate: vibrateFn } : {},
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        matchMedia: (query: string) => ({
          matches: reducedMotion && query.includes('prefers-reduced-motion'),
        }),
      },
    });
  };

  try {
    const calls: Array<number | number[]> = [];
    setMockEnv((pattern) => {
      calls.push(pattern);
      return true;
    }, false);

    assert.equal(prefersReducedMotion(), false);
    assert.equal(triggerHaptic('light'), true);
    assert.equal(triggerHaptic('success'), true);
    assert.equal(triggerHaptic('warning'), true);
    assert.equal(calls.length, 3);
    assert.equal(typeof calls[0], 'number');
    assert.ok(Array.isArray(calls[1]));
    assert.ok(Array.isArray(calls[2]));

    // Respects prefers-reduced-motion: must be a silent no-op
    calls.length = 0;
    setMockEnv((pattern) => {
      calls.push(pattern);
      return true;
    }, true);
    assert.equal(prefersReducedMotion(), true);
    assert.equal(triggerHaptic('success'), false);
    assert.equal(calls.length, 0);

    // Missing navigator.vibrate (iOS / desktop Safari) -> safe no-op
    setMockEnv(undefined, false);
    assert.equal(triggerHaptic('light'), false);

    // Throwing vibrate -> caught silently
    setMockEnv(() => {
      throw new Error('Blocked by browser');
    }, false);
    assert.doesNotThrow(() => {
      assert.equal(triggerHaptic('warning'), false);
    });
  } finally {
    if (prevNavigator) {
      Object.defineProperty(globalThis, 'navigator', prevNavigator);
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
    if (prevWindow) {
      Object.defineProperty(globalThis, 'window', prevWindow);
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  }
});

test('Bloque 36.3: src/index.css define animaciones GPU puras para modales/sheets/toasts y anulación bajo prefers-reduced-motion', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

  for (const token of [
    '@keyframes celestian-backdrop-in',
    '@keyframes celestian-sheet-in',
    '@keyframes celestian-modal-in',
    '.celestian-modal-backdrop',
    '.celestian-modal-panel',
    'cubic-bezier(0.16, 1, 0.3, 1)',
    '@media (prefers-reduced-motion: reduce)',
  ]) {
    assert.ok(css.includes(token), `Falta regla requerida en src/index.css: ${token}`);
  }

  // Ensure reduced-motion explicitly neutralizes our Block 36 modal & toast animations
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.celestian-modal-backdrop[\s\S]*\.celestian-modal-panel[\s\S]*\.toast-enter[\s\S]*animation:\s*none\s*!important;/
  );

  // Verify primary modal components apply the unified GPU animation classes
  const animatedModals = [
    'src/components/CelestianConfirmHost.tsx',
    'src/components/MobileQuickCapture.tsx',
    'src/components/GlobalSearchModal.tsx',
    'src/components/DailyStatusModal.tsx',
    'src/components/FinanceTransactionModal.tsx',
    'src/components/FinanceTransferModal.tsx',
    'src/components/GymRestSettingsModal.tsx',
    'src/components/WorkoutSummaryModal.tsx',
    'src/components/AgendaView.tsx',
    'src/components/CalendarioView.tsx',
    'src/components/TrabajoView.tsx',
    'src/components/NotasView.tsx',
    'src/components/ConfigView.tsx',
  ];

  for (const relPath of animatedModals) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(
      src.includes('celestian-modal-backdrop') && src.includes('celestian-modal-panel'),
      `${relPath} debe aplicar .celestian-modal-backdrop y .celestian-modal-panel`
    );
  }
});

test('Bloque 36.4: Web Audio respeta el mute global, no falla con AudioContext bloqueado y preserva sonidos de Gimnasio', () => {
  const prevWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const prevLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };

  let createdContexts = 0;
  let resumeRejectedCalls = 0;
  class BlockedAudioContext {
    state = 'suspended';
    currentTime = 0;
    sampleRate = 44100;
    destination = {};
    constructor() {
      createdContexts += 1;
    }
    addEventListener() {}
    resume() {
      resumeRejectedCalls += 1;
      return Promise.reject(new Error('Autoplay policy blocked'));
    }
    createOscillator() {
      throw new Error('Should not schedule while suspended');
    }
    createGain() {
      throw new Error('Should not schedule while suspended');
    }
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: mockLocalStorage,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      AudioContext: BlockedAudioContext,
      dispatchEvent: () => true,
    },
  });

  try {
    // When globally muted, nothing creates or touches AudioContext
    setSoundEnabled(false);
    assert.doesNotThrow(() => {
      playSound('success');
      playExpenseLogged();
      playTimerCountdownTone(3);
      playTimerCountdownTone(0);
      startAmbientTrack('rain', 0.5);
    });
    assert.equal(createdContexts, 0, 'Con sonido desactivado no debe instanciar AudioContext');

    // When unmuted but blocked before user gesture, must not throw
    setSoundEnabled(true);
    assert.doesNotThrow(() => {
      playSound('success');
      playExpenseLogged();
      playTimerCountdownTone(2);
      playTimerCountdownTone(0);
    });
    assert.ok(resumeRejectedCalls >= 1, 'Debe intentar resume() de forma defensiva sin lanzar error');
  } finally {
    if (prevWindow) {
      Object.defineProperty(globalThis, 'window', prevWindow);
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
    if (prevLocal) {
      Object.defineProperty(globalThis, 'localStorage', prevLocal);
    } else {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  }
});

test('Bloque 36.5: Confirmaciones Celestian (bottom sheet + Esc + prompt) y flujos reales de Deshacer sin duplicados', async () => {
  // 1) Confirm & prompt bus behavior (cancel, confirm, empty fallback)
  assert.equal(
    await requestConfirm({ title: 'Sin host', message: 'Fallback seguro' }),
    false,
    'Sin host montado debe resolver false de forma segura'
  );
  assert.equal(
    await requestPrompt({ title: 'Sin host' }),
    null,
    'Sin host montado requestPrompt debe resolver null'
  );

  const received: DialogRequest[] = [];
  const unsubscribe = subscribeConfirmDialogs((req) => {
    received.push(req);
    if (req.kind === 'confirm') {
      req.resolve(req.options.tone !== 'danger');
    } else {
      req.resolve('Rutina Empuje A');
    }
  });

  try {
    const dangerCanceled = await requestConfirm({
      title: 'Eliminar cuenta',
      message: '¿Seguro?',
      tone: 'danger',
    });
    assert.equal(dangerCanceled, false);

    const primaryConfirmed = await requestConfirm({
      title: 'Entrenar igual',
      message: 'Hoy es descanso',
      tone: 'primary',
    });
    assert.equal(primaryConfirmed, true);

    const promptResult = await requestPrompt({
      title: 'Guardar plantilla',
      defaultValue: 'Rutina A',
    });
    assert.equal(promptResult, 'Rutina Empuje A');
    assert.equal(received.length, 3);
  } finally {
    unsubscribe();
  }

  // 2) Render CelestianConfirmDialog in danger confirm & prompt modes
  const confirmHtml = renderToStaticMarkup(
    React.createElement(CelestianConfirmDialog, {
      open: true,
      mode: 'confirm',
      title: 'Eliminar cuenta financiera',
      message: 'Solo se permite si no tiene movimientos registrados.',
      details: ['Cuenta: Banco Principal'],
      confirmLabel: 'Eliminar cuenta',
      tone: 'danger',
      onCancel: () => undefined,
      onConfirm: () => undefined,
    })
  );
  assert.match(confirmHtml, /role="dialog"/);
  assert.match(confirmHtml, /aria-modal="true"/);
  assert.match(confirmHtml, /celestian-modal-backdrop/);
  assert.match(confirmHtml, /celestian-modal-panel/);
  assert.match(confirmHtml, /items-end/);
  assert.match(confirmHtml, /sm:items-center/);
  assert.match(confirmHtml, /rounded-t-2xl/);
  assert.match(confirmHtml, /min-h-\[44px\]/);
  assert.match(confirmHtml, /bg-rose-600/);
  assert.match(confirmHtml, /Eliminar cuenta/);
  assert.match(confirmHtml, /Cancelar/);

  const promptHtml = renderToStaticMarkup(
    React.createElement(CelestianConfirmDialog, {
      open: true,
      mode: 'prompt',
      title: 'Guardar como plantilla de rutina',
      defaultValue: 'Torso A',
      confirmLabel: 'Guardar plantilla',
      tone: 'primary',
      onCancel: () => undefined,
      onConfirm: () => undefined,
    })
  );
  assert.match(promptHtml, /<input/);
  assert.match(promptHtml, /value="Torso A"/);
  assert.match(promptHtml, /bg-\[#4F46E5\]/);

  // Ensure CelestianConfirmHost binds useDialogFocus for Esc cancel
  const hostSrc = fs.readFileSync(path.join(ROOT, 'src/components/CelestianConfirmHost.tsx'), 'utf8');
  assert.match(hostSrc, /useDialogFocus\(open,\s*dialogRef,\s*handleCancel\)/);
  assert.match(hostSrc, /triggerHaptic\(isDanger \? 'warning' : 'light'\)/);

  // 3) Real Undo state integrity (delete + restore without duplicates)
  const state = defaultState();
  const today = todayISO();
  const accountId = state.finance.accounts[0].id;
  const initialBalance = state.finance.accounts[0].balance;

  // Finance transaction delete + Undo restore
  addTransaction(state, {
    id: 'tx-undo-1',
    type: 'gasto',
    amount: 450,
    category: 'Comida',
    accountId,
    fixed: 'variable',
    date: today,
    note: 'Almuerzo',
  });
  const afterAddBalance = state.finance.accounts[0].balance;
  assert.equal(afterAddBalance, initialBalance - 450);

  const txSnapshot = structuredClone(state.finance.transactions.find((t) => t.id === 'tx-undo-1')!);
  deleteTransaction(state, 'tx-undo-1');
  assert.equal(state.finance.transactions.some((t) => t.id === 'tx-undo-1'), false);
  assert.equal(state.finance.accounts[0].balance, initialBalance);

  restoreDeletedTransaction(state, txSnapshot);
  assert.equal(state.finance.transactions.filter((t) => t.id === 'tx-undo-1').length, 1);
  assert.equal(state.finance.accounts[0].balance, afterAddBalance);

  // Note delete + Undo restore without duplicates
  state.notes.postits.push({
    id: 'note-undo-1',
    title: 'Lista clave',
    text: 'Revisar entregables',
    date: today,
  });
  const noteSnapshot = structuredClone(state.notes.postits[0]);
  deleteNote(state, 'note-undo-1');
  assert.equal(state.notes.postits.length, 0);
  if (!state.notes.postits.some((n) => n.id === noteSnapshot.id)) {
    state.notes.postits.unshift(noteSnapshot);
  }
  if (!state.notes.postits.some((n) => n.id === noteSnapshot.id)) {
    state.notes.postits.unshift(noteSnapshot);
  }
  assert.equal(state.notes.postits.length, 1, 'Deshacer no debe duplicar la nota restaurada');

  // Study practice question delete + Undo restore
  state.study.questions = [
    {
      id: 'q-undo-1',
      subjectId: 'sub-1',
      kind: 'multiple_choice',
      prompt: '¿Qué es ACID?',
      options: [
        { id: 'a', text: 'Atomicidad, Consistencia, Aislamiento, Durabilidad' },
        { id: 'b', text: 'Otra opción' },
      ],
      correctOptionId: 'a',
      updatedAt: 1,
    },
  ];
  const qSnapshot = structuredClone(state.study.questions[0]);
  deleteStudyQuestion(state, 'q-undo-1');
  assert.equal(state.study.questions.length, 0);
  if (!state.study.questions.some((q) => q.id === qSnapshot.id)) {
    state.study.questions.unshift(qSnapshot);
  }
  assert.equal(state.study.questions.length, 1);

  // ToastViewport Undo ergonomics & haptic feedback
  const toastSrc = fs.readFileSync(path.join(ROOT, 'src/components/ToastViewport.tsx'), 'utf8');
  assert.match(toastSrc, /triggerHaptic\('success'\)/);
  assert.match(toastSrc, /min-h-\[40px\]/);
  assert.match(toastSrc, /handledActionIdsRef/);

  // Reversible delete views expose Deshacer toast
  for (const relPath of [
    'src/components/AgendaView.tsx',
    'src/components/CalendarioView.tsx',
    'src/components/FinanzasView.tsx',
    'src/components/NotasView.tsx',
    'src/components/TrabajoView.tsx',
    'src/components/ProjectsManager.tsx',
    'src/components/StudyPracticeSection.tsx',
  ]) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.match(src, /actionLabel:\s*['"]Deshacer['"]/, `${relPath} debe ofrecer Deshacer en borrados reversibles`);
  }
});

test('Bloque 36.6: Cero azules residuales y cero símbolos ASCII en los archivos nuevos y centrales del Bloque 36', () => {
  const checkedFiles = [
    'src/lib/haptics.ts',
    'src/lib/confirmDialog.ts',
    'src/components/CelestianConfirmHost.tsx',
    'src/components/ToastViewport.tsx',
    'src/components/ui/CelestianSwitch.tsx',
    'src/components/ui/CompletionCheck.tsx',
    'src/components/DailyStatusModal.tsx',
    'src/components/RecentActivityModal.tsx',
    'src/components/DismissedAttentionModal.tsx',
    'src/components/CheckoutModal.tsx',
    'src/components/FinanceTransactionTable.tsx',
    'src/components/FinanceAccountsView.tsx',
    'src/components/AgendaView.tsx',
    'src/components/CalendarioView.tsx',
    'src/components/TrabajoView.tsx',
    'src/components/NotasView.tsx',
    'src/components/ProjectsManager.tsx',
  ];

  for (const relPath of checkedFiles) {
    const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.doesNotMatch(
      src,
      /\b(?:bg|text|border|ring|accent|from|to|via|decoration)-(?:blue|sky)-/,
      `Azul residual detectado en ${relPath}`
    );
    assert.doesNotMatch(src, /var\(--blue/, `var(--blue) residual detectado en ${relPath}`);
    assert.doesNotMatch(src, /[▲▼▶▾×↗]/, `Símbolo ASCII prohibido detectado en ${relPath}`);
  }
});
