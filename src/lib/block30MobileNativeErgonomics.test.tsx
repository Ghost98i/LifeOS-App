import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defaultState, todayISO } from './storage';
import { MobileNav } from '../components/MobileNav';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { GymRestOverlay } from '../components/GymRestOverlay';
import { StudyActiveOverlay } from '../components/StudyActiveOverlay';
import { MobileQuickCapture } from '../components/MobileQuickCapture';
import { DailyStatusModal } from '../components/DailyStatusModal';
import { DismissedAttentionModal } from '../components/DismissedAttentionModal';
import { FinanceTransactionModal } from '../components/FinanceTransactionModal';
import { FinanceTransferModal } from '../components/FinanceTransferModal';
import { GymRestSettingsModal } from '../components/GymRestSettingsModal';
import { GymPlateCalculator } from '../components/GymPlateCalculator';
import { ExerciseHistoryModal } from '../components/ExerciseHistoryModal';
import { WorkoutSummaryModal } from '../components/WorkoutSummaryModal';
import { getGymSettings } from './gymFlows';

const noop = () => {};
const noopBool = () => true;

test('Bloque 30.1: src/index.css incluye fundamentos nativos móviles (tap-highlight, touch-action, overscroll, safe-area y anti-zoom 16px < 640px)', () => {
  const css = readFileSync('src/index.css', 'utf8');

  assert.match(css, /min-height:\s*100dvh;/);
  assert.match(css, /-webkit-tap-highlight-color:\s*transparent;/);
  assert.match(css, /touch-action:\s*manipulation;/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /overscroll-behavior-y:\s*contain;/);
  assert.match(css, /@media\s*\(max-width:\s*639px\)\s*\{[\s\S]*?font-size:\s*16px(?:\s*!important)?;/);
  // Preserva campos numéricos grandes (c-load-input / text-xl / text-2xl) sin romper filas compactas
  assert.match(css, /:not\(\.c-load-input\)/);
});

test('Bloque 30.2: Navegación y overlays respetan safe-areas y áreas táctiles >= 44px sin superponerse con MobileNav', () => {
  const state = defaultState();
  const now = Date.now();
  state.gym.activeTimer = {
    endsAt: now + 90_000,
    durationSeconds: 90,
    kind: 'set',
    sessionId: 'sess-1',
    exerciseId: 'ex-1',
    setId: 'set-1',
  };
  state.study.activeSession = {
    id: 'study-1',
    phase: 'focus',
    status: 'running',
    plannedMinutes: 25,
    startedAt: now,
    endsAt: now + 25 * 60_000,
    remainingSeconds: 25 * 60,
    lastTickAt: now,
    targetSubjectName: 'Algoritmos',
  };

  const mobileNavHtml = renderToStaticMarkup(
    React.createElement(MobileNav, {
      currentView: 'dashboard',
      onNavigate: noop,
      onOpenCapture: noop,
      onOpenMore: noop,
      state,
      syncStatus: 'synced',
      privacyMode: false,
      onTogglePrivacy: noop,
    })
  );
  assert.match(mobileNavHtml, /pb-\[max\(0\.5rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(mobileNavHtml, /min-h-\[44px\] min-w-\[44px\]/);
  assert.match(mobileNavHtml, /active:scale-95/);
  assert.match(mobileNavHtml, /transition-transform/);

  const sidebarHtml = renderToStaticMarkup(
    React.createElement(Sidebar, {
      currentView: 'dashboard',
      state,
      onNavigate: noop,
      onToggleTheme: noop,
      isOpenMobile: true,
      onCloseMobile: noop,
    })
  );
  assert.match(sidebarHtml, /h-dvh/);
  assert.match(sidebarHtml, /env\(safe-area-inset-top\)/);
  assert.match(sidebarHtml, /env\(safe-area-inset-bottom\)/);
  assert.match(sidebarHtml, /overscroll-contain/);
  assert.match(sidebarHtml, /min-h-11 min-w-11/);

  const topbarHtml = renderToStaticMarkup(
    React.createElement(Topbar, {
      currentView: 'dashboard',
      state,
      onOpenMobileNav: noop,
      onQuickAction: noop,
      onSearch: noop,
      onOpenSearch: noop,
      onOpenCapture: noop,
      onTogglePrivacy: noop,
      cloudConfigured: false,
      cloudUser: null,
      syncStatus: 'unavailable',
      onCloudSignIn: noop,
      onCloudSignOut: noop,
    })
  );
  assert.match(topbarHtml, /pt-\[env\(safe-area-inset-top\)\]/);
  assert.match(topbarHtml, /min-h-\[44px\] min-w-\[44px\]/);

  const gymOverlayHtml = renderToStaticMarkup(
    React.createElement(GymRestOverlay, {
      state,
      onUpdateState: noop,
      onOpenGym: noop,
    })
  );
  assert.match(gymOverlayHtml, /bottom-\[calc\(7\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(gymOverlayHtml, /min-h-\[44px\]/);

  const studyOverlayHtml = renderToStaticMarkup(
    React.createElement(StudyActiveOverlay, {
      state,
      onUpdateState: noop,
      onOpenStudies: noop,
      currentView: 'dashboard',
      isCoexisting: true,
    })
  );
  assert.match(studyOverlayHtml, /bottom-\[calc\(7\.75rem\+env\(safe-area-inset-bottom\)\+6\.25rem\)\]/);
  assert.match(studyOverlayHtml, /min-h-\[44px\]/);

  const toastSrc = readFileSync('src/components/ToastViewport.tsx', 'utf8');
  assert.match(toastSrc, /bottom-\[calc\(7\.75rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(toastSrc, /min-h-\[44px\] min-w-\[44px\]/);
});

test('Bloque 30.3: Modales diarios usan patrón bottom sheet responsive en móvil (< 640px) y centrado en desktop (>= 640px)', () => {
  const state = defaultState();
  const sampleSession = {
    id: 'sess-summary',
    date: todayISO(),
    routineName: 'Empuje A',
    exercises: [
      {
        id: 'ex-1',
        name: 'Press banca',
        muscleGroup: 'Pecho' as const,
        equipment: 'barra' as const,
        sets: [{ id: 's-1', weight: 60, reps: 8, completed: true }],
      },
    ],
  };

  const renderedModals: Array<{ name: string; html: string }> = [
    {
      name: 'MobileQuickCapture',
      html: renderToStaticMarkup(
        React.createElement(MobileQuickCapture, {
          state,
          open: true,
          initialKind: 'tarea',
          onClose: noop,
          onUpdateState: noopBool,
        })
      ),
    },
    {
      name: 'DailyStatusModal',
      html: renderToStaticMarkup(
        React.createElement(DailyStatusModal, {
          open: true,
          onClose: noop,
          state,
          onUpdateState: noopBool,
        })
      ),
    },
    {
      name: 'DismissedAttentionModal',
      html: renderToStaticMarkup(
        React.createElement(DismissedAttentionModal, {
          open: true,
          onClose: noop,
          dismissedItems: [],
          onRestoreItem: noop,
          onRestoreAll: noop,
        })
      ),
    },
    {
      name: 'FinanceTransactionModal',
      html: renderToStaticMarkup(
        React.createElement(FinanceTransactionModal, {
          open: true,
          onClose: noop,
          onSubmit: noop,
          accounts: state.finance.accounts,
          categories: state.finance.categories,
        })
      ),
    },
    {
      name: 'FinanceTransferModal',
      html: renderToStaticMarkup(
        React.createElement(FinanceTransferModal, {
          open: true,
          onClose: noop,
          state,
          onUpdateState: noopBool,
        })
      ),
    },
    {
      name: 'GymRestSettingsModal',
      html: renderToStaticMarkup(
        React.createElement(GymRestSettingsModal, {
          settings: getGymSettings(state.gym),
          isOpen: true,
          onClose: noop,
          onSave: noopBool,
        })
      ),
    },
    {
      name: 'GymPlateCalculator',
      html: renderToStaticMarkup(
        React.createElement(GymPlateCalculator, {
          isOpen: true,
          onClose: noop,
        })
      ),
    },
    {
      name: 'ExerciseHistoryModal',
      html: renderToStaticMarkup(
        React.createElement(ExerciseHistoryModal, {
          exerciseName: 'Press banca',
          sessions: [sampleSession],
          onClose: noop,
        })
      ),
    },
    {
      name: 'WorkoutSummaryModal',
      html: renderToStaticMarkup(
        React.createElement(WorkoutSummaryModal, {
          session: sampleSession,
          allSessions: [sampleSession],
          newPRs: [],
          onClose: noop,
        })
      ),
    },
  ];

  for (const modal of renderedModals) {
    assert.match(modal.html, /items-end/, `${modal.name} debe anclarse abajo en móvil (items-end)`);
    assert.match(modal.html, /sm:items-center/, `${modal.name} debe centrarse en desktop (sm:items-center)`);
    assert.match(modal.html, /p-0/, `${modal.name} debe tener p-0 en móvil`);
    assert.match(modal.html, /sm:p-4/, `${modal.name} debe tener sm:p-4 en desktop`);
    assert.match(modal.html, /rounded-t-2xl/, `${modal.name} debe usar rounded-t-2xl`);
    assert.match(modal.html, /sm:rounded-2xl/, `${modal.name} debe usar sm:rounded-2xl`);
    assert.match(modal.html, /max-h-\[90dvh\]/, `${modal.name} debe acotar altura a max-h-[90dvh]`);
    assert.match(modal.html, /w-10 shrink-0 rounded-full[\s\S]*sm:hidden|h-1 w-10[\s\S]*sm:hidden/, `${modal.name} debe incluir tirador decorativo en sm:hidden`);
    assert.match(modal.html, /overscroll-contain/, `${modal.name} debe incluir overscroll-contain`);
    assert.match(modal.html, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/, `${modal.name} debe respetar safe-area-inset-bottom`);
  }

  // Verificar Reiniciar datos en ConfigView.tsx y modales inline en FinanzasView.tsx
  const configSrc = readFileSync('src/components/ConfigView.tsx', 'utf8');
  const resetModalIdx = configSrc.indexOf('role="dialog" aria-modal="true" aria-label="Reiniciar datos"');
  assert.ok(resetModalIdx > -1, 'ConfigView debe contener el modal Reiniciar datos');
  const resetModalEnd = configSrc.indexOf('</SurfaceCard>', resetModalIdx);
  const resetSlice = configSrc.slice(Math.max(0, resetModalIdx - 320), resetModalEnd + 20);
  assert.match(resetSlice, /items-end justify-center bg-black\/60 p-0 sm:items-center sm:p-4/);
  assert.match(resetSlice, /max-h-\[90dvh\][\s\S]*rounded-t-2xl sm:rounded-2xl/);
  assert.match(resetSlice, /w-10 shrink-0 rounded-full[\s\S]*sm:hidden/);
  assert.match(resetSlice, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);

  const finanzasSrc = readFileSync('src/components/FinanzasView.tsx', 'utf8');
  assert.match(finanzasSrc, /aria-label="Registrar Compromiso Financiero"[\s\S]{0,180}rounded-t-2xl sm:rounded-2xl/);
  assert.match(finanzasSrc, /aria-label="Registrar Ingreso Previsto"[\s\S]{0,180}rounded-t-2xl sm:rounded-2xl/);
  assert.match(finanzasSrc, /aria-label="Registrar pago de Compromiso"[\s\S]{0,180}rounded-t-2xl sm:rounded-2xl/);
});

test('Bloque 30.4: Ergonomía de teclado numérico (inputMode="decimal" / "numeric") en MobileQuickCapture, Finanzas y Gimnasio', () => {
  const filesWithDecimal = [
    'src/components/MobileQuickCapture.tsx',
    'src/components/FinanceTransactionModal.tsx',
    'src/components/FinanceTransferModal.tsx',
    'src/components/FinanzasView.tsx',
    'src/components/FinanceAccountsView.tsx',
    'src/components/FinanceFutureView.tsx',
    'src/components/FinanceAgreementsSection.tsx',
    'src/components/FinanceAnalyticsView.tsx',
    'src/components/GlobalSearchModal.tsx',
    'src/components/ActiveWorkoutView.tsx',
    'src/components/GimnasioView.tsx',
    'src/components/GymPlateCalculator.tsx',
  ];

  for (const file of filesWithDecimal) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /inputMode="decimal"/, `${file} debe declarar inputMode="decimal" en campos de montos/pesos`);
  }

  const filesWithNumeric = [
    'src/components/ActiveWorkoutView.tsx',
    'src/components/GimnasioView.tsx',
    'src/components/GymRestSettingsModal.tsx',
    'src/components/GymRestTimerBar.tsx',
    'src/components/FinanzasView.tsx',
    'src/components/FinanceFutureView.tsx',
    'src/components/FinanceAgreementsSection.tsx',
  ];

  for (const file of filesWithNumeric) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /inputMode="numeric"/, `${file} debe declarar inputMode="numeric" en campos enteros (reps/tiempos/cuotas)`);
  }

  // Verificar que ningún input type="number" en archivos clave carezca de inputMode
  const strictNumberFiles = [
    'src/components/ActiveWorkoutView.tsx',
    'src/components/GimnasioView.tsx',
    'src/components/GymRestSettingsModal.tsx',
    'src/components/GymRestTimerBar.tsx',
    'src/components/GymPlateCalculator.tsx',
    'src/components/FinanzasView.tsx',
    'src/components/FinanceAccountsView.tsx',
    'src/components/FinanceFutureView.tsx',
    'src/components/FinanceAnalyticsView.tsx',
    'src/components/GlobalSearchModal.tsx',
  ];

  for (const file of strictNumberFiles) {
    const src = readFileSync(file, 'utf8');
    const numberTagMatches = src.match(/<(?:input|PrivacyInput)\b[^>]*type="number"[^>]*>/g) || [];
    assert.ok(numberTagMatches.length > 0, `${file} debe tener al menos un campo numérico verificado`);
    for (const tag of numberTagMatches) {
      assert.match(
        tag,
        /inputMode="(?:decimal|numeric)"/,
        `Campo type="number" sin inputMode en ${file}: ${tag.slice(0, 120)}`
      );
    }
  }
});

test('Bloque 30.5: Cero azules residuales (blue-*, sky-*, var(--blue)) y cero símbolos ASCII en todos los archivos tocados', () => {
  const touchedFiles = [
    'src/components/MobileNav.tsx',
    'src/components/Sidebar.tsx',
    'src/components/Topbar.tsx',
    'src/components/GymRestOverlay.tsx',
    'src/components/StudyActiveOverlay.tsx',
    'src/components/ToastViewport.tsx',
    'src/components/MobileQuickCapture.tsx',
    'src/components/DailyStatusModal.tsx',
    'src/components/DismissedAttentionModal.tsx',
    'src/components/FinanceTransactionModal.tsx',
    'src/components/FinanceTransferModal.tsx',
    'src/components/FinanzasView.tsx',
    'src/components/FinanceAccountsView.tsx',
    'src/components/FinanceFutureView.tsx',
    'src/components/FinanceAgreementsSection.tsx',
    'src/components/FinanceAnalyticsView.tsx',
    'src/components/GymRestSettingsModal.tsx',
    'src/components/GymRestTimerBar.tsx',
    'src/components/GymPlateCalculator.tsx',
    'src/components/ExerciseHistoryModal.tsx',
    'src/components/WorkoutSummaryModal.tsx',
    'src/components/ActiveWorkoutView.tsx',
    'src/components/ConfigView.tsx',
    'src/components/GlobalSearchModal.tsx',
  ];

  for (const file of touchedFiles) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\b(?:bg|text|border|ring|accent|from|to|via|decoration)-(?:blue|sky)-/, `Azul residual detectado en ${file}`);
    assert.doesNotMatch(src, /var\(--blue/, `var(--blue) residual detectado en ${file}`);
    assert.doesNotMatch(src, /[▲▼▶▾✕↗]/, `Símbolo ASCII prohibido detectado en ${file}`);
  }
});
