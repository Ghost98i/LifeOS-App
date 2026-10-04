import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultState, todayISO } from './storage';
import { todayItems, pendingTodayCount } from './calculations';
import { getSmartDailyRecommendations } from './smartPriorities';
import { addQuickIdea, addQuickNote, addQuickTransaction } from './quickCapture';
import { getTodayUnifiedOverview } from './todayOverview';
import { getDashboardLayout } from './dashboardLayout';

test('LifeOS — Fase 3.1: todayItems() respeta Module Visibility para Agenda y Trabajo', () => {
  const state = defaultState();
  const today = todayISO();

  // 1. Agregar bloques de agenda para hoy
  state.agenda.lunes = [
    { id: 'ag-block-1', time: '10:00', activity: 'Reunión de equipo' },
  ];
  state.agenda.martes = [
    { id: 'ag-block-2', time: '11:00', activity: 'Reunión semanal' },
  ];
  state.agenda.miercoles = [
    { id: 'ag-block-3', time: '12:00', activity: 'Reunión de proyecto' },
  ];
  state.agenda.jueves = [
    { id: 'ag-block-4', time: '13:00', activity: 'Reunión de diseño' },
  ];
  state.agenda.viernes = [
    { id: 'ag-block-5', time: '14:00', activity: 'Reunión de balance' },
  ];
  state.agenda.sabado = [
    { id: 'ag-block-6', time: '15:00', activity: 'Reunión de planificación' },
  ];
  state.agenda.domingo = [
    { id: 'ag-block-7', time: '16:00', activity: 'Reunión de cierre' },
  ];

  // 2. Agregar seguimientos de trabajo para hoy
  state.jobs.applications = [
    {
      id: 'job-app-1',
      empresa: 'TechCorp',
      puesto: 'Dev',
      estado: 'entrevista',
      fecha: today,
      nextAction: 'Llamar a RRHH',
      nextActionDate: today,
    },
  ];

  // Caso A: Ambos módulos activos (por defecto)
  state.settings.hiddenTabs = ['ia'];
  const itemsBothOn = todayItems(state, today, true);
  assert.equal(itemsBothOn.some((i) => i.source === 'agenda'), true, 'Debe incluir agenda cuando agenda está ON');
  assert.equal(itemsBothOn.some((i) => i.source === 'trabajo'), true, 'Debe incluir trabajo cuando trabajo está ON');

  // Caso B: Agenda OFF
  state.settings.hiddenTabs = ['ia', 'agenda'];
  const itemsAgendaOff = todayItems(state, today, true);
  assert.equal(itemsAgendaOff.some((i) => i.source === 'agenda'), false, 'NO debe incluir agenda cuando agenda está OFF');
  assert.equal(itemsAgendaOff.some((i) => i.source === 'trabajo'), true, 'Debe seguir incluyendo trabajo si está ON');

  // Caso C: Trabajo OFF
  state.settings.hiddenTabs = ['ia', 'trabajo'];
  const itemsTrabajoOff = todayItems(state, today, true);
  assert.equal(itemsTrabajoOff.some((i) => i.source === 'agenda'), true, 'Debe incluir agenda si está ON');
  assert.equal(itemsTrabajoOff.some((i) => i.source === 'trabajo'), false, 'NO debe incluir trabajo cuando trabajo está OFF');

  // Caso D: Ambos OFF
  state.settings.hiddenTabs = ['ia', 'agenda', 'trabajo'];
  const itemsBothOff = todayItems(state, today, true);
  assert.equal(itemsBothOff.some((i) => i.source === 'agenda'), false, 'NO debe incluir agenda cuando ambos están OFF');
  assert.equal(itemsBothOff.some((i) => i.source === 'trabajo'), false, 'NO debe incluir trabajo cuando ambos están OFF');

  // Caso E: pendingTodayCount() refleja la visibilidad
  const pendingCountBothOff = pendingTodayCount(state);
  const pendingCountBothOn = (() => {
    state.settings.hiddenTabs = ['ia'];
    return pendingTodayCount(state);
  })();
  assert.ok(pendingCountBothOn > pendingCountBothOff, 'El conteo de pendientes no debe inflarse con módulos desactivados');
});

test('LifeOS — Fase 3.1: Smart Priorities excluye subtareas de proyectos cuando el contexto de proyectos está inactivo', () => {
  const state = defaultState();
  const today = todayISO();

  // Agregar un proyecto con una tarea urgente de alta prioridad
  state.projects = [
    {
      id: 'proj-1',
      name: 'Lanzamiento Web',
      objective: 'Lanzar MVP',
      status: 'activo',
      nextStep: 'Deploy',
      createdAt: today,
      tasks: [
        {
          id: 'proj-task-urgente',
          text: 'Publicar landing page',
          done: false,
          priority: 'alta',
          dueDate: today,
        },
      ],
    },
  ];

  // Caso A: Notas ON (contexto de proyectos activo)
  state.settings.hiddenTabs = ['ia'];
  const recsWithNotasOn = getSmartDailyRecommendations(state, 5);
  assert.equal(
    recsWithNotasOn.some((r) => r.text.includes('Publicar landing page')),
    true,
    'Debe recomendar la subtarea de proyecto cuando Notas está ON'
  );

  // Caso B: Notas OFF (contexto de proyectos inactivo)
  state.settings.hiddenTabs = ['ia', 'notas'];
  const recsWithNotasOff = getSmartDailyRecommendations(state, 5);
  assert.equal(
    recsWithNotasOff.some((r) => r.text.includes('Publicar landing page')),
    false,
    'NO debe recomendar subtareas de proyectos cuando Notas está en hiddenTabs'
  );

  // Caso D: Tareas extra independientes (universales) siguen funcionando normalmente
  state.todayExtras = [
    {
      id: 'extra-1',
      text: 'Comprar remedios',
      date: today,
      done: false,
      priority: 'alta',
    },
  ];
  const recsWithExtra = getSmartDailyRecommendations(state, 5);
  assert.equal(
    recsWithExtra.some((r) => r.text === 'Comprar remedios'),
    true,
    'Las tareas universales (todayExtras) deben seguir recomendándose independientemente de proyectos'
  );
});

test('LifeOS — Fase 3.1: Mobile Quick Capture y QuickCapture protegen IA a nivel de interfaz y ejecución', () => {
  const state = defaultState();

  // Caso A: IA desactivada por defecto
  state.settings.hiddenTabs = ['ia'];

  // Intentar agregar idea directamente con IA desactivada debe arrojar error y NO mutar el estado
  assert.throws(
    () => {
      addQuickIdea(state, 'Crear canal de YouTube');
    },
    /El módulo IA está desactivado/,
    'Debe lanzar error al intentar crear una idea con IA desactivada'
  );
  assert.equal((state.ideas || []).length, 0, 'No debe mutar state.ideas cuando IA está desactivada');
  assert.equal(
    (state.notes?.postits || []).some((p) => p.text.includes('Crear canal de YouTube')),
    false,
    'No debe mutar state.notes.postits cuando IA está desactivada'
  );

  // Caso B: IA activada explícitamente
  state.settings.hiddenTabs = [];
  const id = addQuickIdea(state, 'Crear canal de YouTube');
  assert.ok(id, 'Debe devolver un id válido al guardar con IA activada');
  assert.equal((state.ideas || []).length, 1, 'Debe agregar la idea a state.ideas');
  assert.equal(state.ideas[0].text, 'Crear canal de YouTube');
  assert.equal(state.ideas[0].source, 'manual');

  // Caso C: Notas desactivadas protege addQuickNote
  state.settings.hiddenTabs = ['notas'];
  assert.throws(
    () => {
      addQuickNote(state, 'Nota secreta');
    },
    /El módulo Notas está desactivado/,
    'Debe lanzar error al intentar crear una nota con Notas desactivadas'
  );

  // Caso D: Finanzas desactivadas protege addQuickTransaction
  state.settings.hiddenTabs = ['finanzas'];
  assert.throws(
    () => {
      addQuickTransaction(state, { type: 'gasto', amount: 100 });
    },
    /El módulo Finanzas está desactivado/,
    'Debe lanzar error al intentar crear una transacción con Finanzas desactivadas'
  );
});

test('LifeOS — Fase 3.1: getTodayUnifiedOverview aplica guardas por módulo y evita cálculos innecesarios', () => {
  const state = defaultState();
  const today = todayISO();

  // Inyectar datos en todos los dominios
  state.agenda.lunes = [{ id: 'ag-1', time: '09:00', activity: 'Gimnasio' }];
  state.jobs.applications = [{ id: 'job-1', empresa: 'Acme', puesto: 'QA', estado: 'cv_enviado', fecha: today, nextAction: 'Seguimiento', nextActionDate: today }];
  state.gym.routineTemplates = [{ id: 'tpl-1', name: 'Piernas', days: ['lunes'], exercises: [] }];
  state.finance.accounts = [{ id: 'acc-1', name: 'Banco', balance: 50000 }];

  // Caso A: Todos los módulos activos
  state.settings.hiddenTabs = [];
  const overviewAllOn = getTodayUnifiedOverview(state, today);
  assert.ok(overviewAllOn.schedule.blocks.length >= 0);
  assert.equal(overviewAllOn.tasks.followups.length, 1);
  assert.equal(overviewAllOn.context.realLiquidity, 50000);

  // Caso B: 0 módulos opcionales activos (solo core)
  state.settings.hiddenTabs = [
    'agenda',
    'calendario',
    'finanzas',
    'gimnasio',
    'estudios',
    'trabajo',
    'reventa',
    'notas',
    'ia',
  ];
  const overviewZeroOn = getTodayUnifiedOverview(state, today);
  assert.equal(overviewZeroOn.schedule.blocks.length, 0, 'Bloques de agenda deben estar vacíos');
  assert.equal(overviewZeroOn.schedule.current, null, 'Schedule current debe ser null');
  assert.equal(overviewZeroOn.schedule.next, null, 'Schedule next debe ser null');
  assert.equal(overviewZeroOn.tasks.followups.length, 0, 'Followups de trabajo deben estar vacíos');
  assert.equal(overviewZeroOn.workout.weight, null, 'Weight de gym debe ser null');
  assert.equal(overviewZeroOn.context.realLiquidity, 0, 'Liquidez financiera debe ser 0 sin recalcular cuentas');
  assert.equal(overviewZeroOn.context.committed30d, 0, 'Compromisos a 30 días debe ser 0 sin calcular cash flow');
  assert.equal(overviewZeroOn.context.realAvailable30d, 0, 'Disponible real debe ser 0');
});

test('LifeOS — Fase 3.2: Balance y Layout Adaptativo de Hoy para todas las combinaciones de módulos', () => {
  const state = defaultState();

  // Escenario 1: 0 módulos opcionales
  state.settings.hiddenTabs = [
    'agenda',
    'calendario',
    'finanzas',
    'gimnasio',
    'estudios',
    'trabajo',
    'reventa',
    'notas',
    'ia',
  ];
  const layoutZero = getDashboardLayout(state, {
    hasActiveNotes: false,
    hasRecentActivity: false,
    hasUrgentAlerts: false,
  });
  assert.equal(layoutZero.showGymCard, false, 'Gym no debe mostrarse con 0 módulos');
  assert.equal(layoutZero.showFinanceCard, false, 'Finance no debe mostrarse con 0 módulos');
  assert.equal(layoutZero.showNotesCard, false, 'Notes no debe mostrarse con 0 módulos');
  assert.equal(layoutZero.showActivityCard, false, 'Activity no debe mostrarse sin actividad');
  assert.equal(layoutZero.showRadarCard, false, 'Radar no debe mostrarse sin alertas urgentes');
  assert.equal(layoutZero.showTimelineBar, false, 'Timeline de agenda no debe mostrarse con agenda desactivada');
  assert.equal(layoutZero.primaryModulesCount, 0, 'Columna primaria no tiene módulos opcionales');
  assert.equal(layoutZero.secondaryModulesCount, 0, 'Columna secundaria no tiene módulos opcionales');
  assert.equal(layoutZero.useBalancedSplit, true, 'Debe usar split balanceado 50/50 con 0 módulos');
  assert.equal(layoutZero.leftColSpanClass, 'lg:col-span-6', 'Columna izquierda debe ser 6/12');
  assert.equal(layoutZero.rightColSpanClass, 'lg:col-span-6', 'Columna derecha debe ser 6/12');

  // Escenario 2: Solo Finanzas
  state.settings.hiddenTabs = [
    'agenda',
    'calendario',
    'gimnasio',
    'estudios',
    'trabajo',
    'reventa',
    'notas',
    'ia',
  ];
  const layoutFinanceOnly = getDashboardLayout(state, {
    hasActiveNotes: false,
    hasRecentActivity: false,
    hasUrgentAlerts: false,
    hasFinanceData: true,
  });
  assert.equal(layoutFinanceOnly.showFinanceCard, true, 'Finance debe mostrarse');
  assert.equal(layoutFinanceOnly.showGymCard, false, 'Gym debe estar oculto');
  assert.equal(layoutFinanceOnly.showNotesCard, false, 'Notes debe estar oculto');
  assert.equal(layoutFinanceOnly.primaryModulesCount, 0);
  assert.equal(layoutFinanceOnly.secondaryModulesCount, 1);
  assert.equal(layoutFinanceOnly.useBalancedSplit, true, 'Debe balancear 50/50 cuando solo hay Finanzas');
  assert.equal(layoutFinanceOnly.leftColSpanClass, 'lg:col-span-6');
  assert.equal(layoutFinanceOnly.rightColSpanClass, 'lg:col-span-6');

  // Escenario 3: Solo Gimnasio (Asimetría vertical corregida: 3 tarjetas a la izquierda vs 2 a la derecha usa 7/5)
  state.settings.hiddenTabs = [
    'agenda',
    'calendario',
    'finanzas',
    'estudios',
    'trabajo',
    'reventa',
    'notas',
    'ia',
  ];
  const layoutGymOnly = getDashboardLayout(state, {
    hasActiveNotes: false,
    hasRecentActivity: false,
    hasUrgentAlerts: false,
  });
  assert.equal(layoutGymOnly.showGymCard, true, 'Gym debe mostrarse');
  assert.equal(layoutGymOnly.showFinanceCard, false, 'Finance debe estar oculto');
  assert.equal(layoutGymOnly.showNotesCard, false, 'Notes debe estar oculto');
  assert.equal(layoutGymOnly.primaryModulesCount, 1, 'Gym cuenta como módulo en columna primaria');
  assert.equal(layoutGymOnly.secondaryModulesCount, 0, 'Columna secundaria no tiene módulos opcionales');
  assert.equal(layoutGymOnly.useBalancedSplit, false, 'Con solo Gym activo la columna izquierda es más pesada: usa split 7/5');
  assert.equal(layoutGymOnly.leftColSpanClass, 'lg:col-span-7', 'Columna izquierda toma 7/12 para compactar Checklist y Gym');
  assert.equal(layoutGymOnly.rightColSpanClass, 'lg:col-span-5', 'Columna derecha toma 5/12 para compactar Context y Review');

  // Escenario 4: Solo Notas (Contextual: depende de que existan notas activas)
  state.settings.hiddenTabs = [
    'agenda',
    'calendario',
    'finanzas',
    'gimnasio',
    'estudios',
    'trabajo',
    'reventa',
    'ia',
  ];
  // 4a. Notas ON pero 0 notas activas -> NO debe renderizar tarjeta vacía
  const layoutNotesEmpty = getDashboardLayout(state, {
    hasActiveNotes: false,
    hasRecentActivity: false,
    hasUrgentAlerts: false,
  });
  assert.equal(layoutNotesEmpty.showNotesCard, false, 'No debe mostrar card de Notas si no hay notas activas');
  assert.equal(layoutNotesEmpty.primaryModulesCount, 0);
  assert.equal(layoutNotesEmpty.secondaryModulesCount, 0);
  assert.equal(layoutNotesEmpty.useBalancedSplit, true);

  // 4b. Notas ON con notas activas -> Muestra card y mantiene balance 50/50
  const layoutNotesWithData = getDashboardLayout(state, {
    hasActiveNotes: true,
    hasRecentActivity: false,
    hasUrgentAlerts: false,
  });
  assert.equal(layoutNotesWithData.showNotesCard, true, 'Debe mostrar card de Notas cuando hay notas');
  assert.equal(layoutNotesWithData.primaryModulesCount, 0);
  assert.equal(layoutNotesWithData.secondaryModulesCount, 1);
  assert.equal(layoutNotesWithData.useBalancedSplit, true, 'Debe mantener balance 50/50 con solo notas');
  assert.equal(layoutNotesWithData.leftColSpanClass, 'lg:col-span-6');
  assert.equal(layoutNotesWithData.rightColSpanClass, 'lg:col-span-6');

  // Escenario 5: Notas + Estudios (no debe forzar 7/5 si no hay alta densidad en secundaria)
  state.settings.hiddenTabs = [
    'agenda',
    'calendario',
    'finanzas',
    'gimnasio',
    'trabajo',
    'reventa',
    'ia',
  ];
  const layoutNotasEstudios = getDashboardLayout(state, {
    hasActiveNotes: true,
    hasRecentActivity: false,
    hasUrgentAlerts: true, // examen cercano activa Radar
  });
  assert.equal(layoutNotasEstudios.showRadarCard, true, 'Radar de decisiones debe activarse por examen');
  assert.equal(layoutNotasEstudios.showNotesCard, true, 'Notas debe mostrarse');
  assert.equal(layoutNotasEstudios.showFinanceCard, false, 'Finanzas debe permanecer inactivo');
  assert.equal(layoutNotasEstudios.showGymCard, false, 'Gimnasio debe permanecer inactivo');
  assert.equal(layoutNotasEstudios.primaryModulesCount, 0);
  assert.equal(layoutNotasEstudios.secondaryModulesCount, 1);
  assert.equal(layoutNotasEstudios.useBalancedSplit, true, 'Notas + Estudios no debe quedar en estructura rígida 7/5');
  assert.equal(layoutNotasEstudios.leftColSpanClass, 'lg:col-span-6');
  assert.equal(layoutNotasEstudios.rightColSpanClass, 'lg:col-span-6');

  // Escenario 6: Finanzas + Gimnasio
  state.settings.hiddenTabs = [
    'agenda',
    'calendario',
    'estudios',
    'trabajo',
    'reventa',
    'notas',
    'ia',
  ];
  const layoutGymFinance = getDashboardLayout(state, {
    hasActiveNotes: false,
    hasRecentActivity: false,
    hasUrgentAlerts: false,
    hasFinanceData: true,
  });
  assert.equal(layoutGymFinance.showGymCard, true, 'Gimnasio debe estar visible');
  assert.equal(layoutGymFinance.showFinanceCard, true, 'Finanzas debe estar visible');
  assert.equal(layoutGymFinance.primaryModulesCount, 1);
  assert.equal(layoutGymFinance.secondaryModulesCount, 1);
  assert.equal(layoutGymFinance.useBalancedSplit, false, 'Gym + Finanzas usa 7/5 para priorizar ejecución y tareas');
  assert.equal(layoutGymFinance.leftColSpanClass, 'lg:col-span-7');
  assert.equal(layoutGymFinance.rightColSpanClass, 'lg:col-span-5');

  // Escenario 7: Varios módulos y todos los módulos (alta densidad en columna secundaria)
  state.settings.hiddenTabs = [];
  const layoutAll = getDashboardLayout(state, {
    hasActiveNotes: true,
    hasRecentActivity: true,
    hasUrgentAlerts: true,
    hasFinanceData: true,
  });
  assert.equal(layoutAll.showGymCard, true);
  assert.equal(layoutAll.showFinanceCard, true);
  assert.equal(layoutAll.showNotesCard, true);
  assert.equal(layoutAll.showActivityCard, true);
  assert.equal(layoutAll.showRadarCard, true);
  assert.equal(layoutAll.showTimelineBar, true);
  assert.equal(layoutAll.primaryModulesCount, 1);
  assert.ok(layoutAll.secondaryModulesCount >= 2, 'Columna secundaria tiene 2 o más módulos');
  assert.equal(layoutAll.useBalancedSplit, false, 'Con alta densidad usa split 7/5');
  assert.equal(layoutAll.leftColSpanClass, 'lg:col-span-7', 'Columna izquierda toma 7/12 para checklist');
  assert.equal(layoutAll.rightColSpanClass, 'lg:col-span-5', 'Columna derecha toma 5/12 para widgets compactos');

  // Escenario 8: Verificación de hermetismo: ningún módulo desactivado vuelve a aparecer aunque haya datos históricos
  state.settings.hiddenTabs = ['gimnasio', 'finanzas', 'notas', 'agenda', 'ia'];
  const layoutGuarded = getDashboardLayout(state, {
    hasActiveNotes: true, // existen notas en memoria pero el módulo está oculto
    hasFinanceData: true, // existen cuentas pero el módulo está oculto
  });
  assert.equal(layoutGuarded.showGymCard, false, 'Gimnasio oculto nunca debe renderizarse');
  assert.equal(layoutGuarded.showFinanceCard, false, 'Finanzas oculto nunca debe renderizarse');
  assert.equal(layoutGuarded.showNotesCard, false, 'Notas oculto nunca debe renderizarse aunque haya notas');
  assert.equal(layoutGuarded.showTimelineBar, false, 'Timeline oculto nunca debe renderizarse');
  assert.equal(layoutGuarded.primaryModulesCount, 0);
  assert.equal(layoutGuarded.secondaryModulesCount, 0);
  assert.equal(layoutGuarded.useBalancedSplit, true);

  // Escenario 9: Radar de Decisiones: activo cuando hay alertas urgentes, inactivo en caso contrario
  const layoutRadarActive = getDashboardLayout(state, {
    hasUrgentAlerts: true,
  });
  assert.equal(layoutRadarActive.showRadarCard, true, 'Radar debe estar activo cuando hasUrgentAlerts es true');

  const layoutRadarInactive = getDashboardLayout(state, {
    hasUrgentAlerts: false,
  });
  assert.equal(layoutRadarInactive.showRadarCard, false, 'Radar no debe renderizarse cuando hasUrgentAlerts es false');
});

