import type { LifeOSState, ViewType } from '../types';
import type { AppIconName } from '../components/AppIcon';
import { formatMoney } from './storage';
import { getCategoryName } from './financeCategories';
import { isModuleEnabled, isStreamingEnabled } from './moduleVisibility';
import { getJobApplicationType, getJobStageLabel } from './jobApplications';
import { resolveTransactionCurrency } from './calculations';
import { confirmedFinancialCurrency } from './financeCurrencyPolicy';
import { maskFinancialText } from './financialPrivacy';

export type SearchCategoryKey =
  | 'actions'
  | 'views'
  | 'notes'
  | 'finance'
  | 'calendar'
  | 'gym'
  | 'jobs'
  | 'tasks'
  | 'study'
  | 'resale'
  | 'other';

export interface SearchResult {
  id: string;
  icon: string;
  iconName?: AppIconName;
  title: string;
  subtitle: string;
  view: ViewType;
  focusId?: string;
  category?: SearchCategoryKey;
  badge?: string;
  score?: number;
  isSensitive?: boolean;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();
}

/**
 * Calculates a match score:
 * - 100: Exact match on title
 * - 75:  Title starts with query
 * - 50:  Title contains query
 * - 30:  Primary tags / fields match query
 * - 10:  Secondary content / notes match query
 * - 0:   No match
 */
function scoreMatch(
  query: string,
  title: string,
  primaryFields: unknown[] = [],
  secondaryFields: unknown[] = []
): number {
  const normTitle = normalize(title);
  if (normTitle === query) return 100;
  if (normTitle.startsWith(query)) return 75;
  if (normTitle.includes(query)) return 50;

  for (const field of primaryFields) {
    if (normalize(field).includes(query)) return 30;
  }

  for (const field of secondaryFields) {
    if (normalize(field).includes(query)) return 10;
  }

  return 0;
}

export function searchLifeOS(state: LifeOSState, rawQuery: string): SearchResult[] {
  const query = normalize(rawQuery);
  if (query.length < 2) return [];

  const candidates: SearchResult[] = [];
  const privacyMode = Boolean(state.settings?.privacyMode);
  const maskMoney = (amount: number, prefix: string = '', currency: string = 'UYU') => {
    const cur = (currency || 'UYU').toUpperCase();
    const sym = cur === 'USD' ? 'US$' : '$U';
    return privacyMode ? `${prefix}${sym} ••••` : `${prefix}${formatMoney(amount, cur)}`;
  };

  const consider = (
    result: Omit<SearchResult, 'score'>,
    primaryFields: unknown[] = [],
    secondaryFields: unknown[] = []
  ) => {
    const score = scoreMatch(query, result.title, primaryFields, secondaryFields);
    if (score > 0) {
      candidates.push({ ...result, score });
    }
  };

  // 1. Tareas y Prioridades (Siempre disponibles / Core)
  (state.todayExtras || []).forEach((item) =>
    consider(
      { id: `task-${item.id}`, icon: '✓', iconName: 'check', title: item.text, subtitle: `Tarea · ${item.date}`, view: 'dashboard', category: 'tasks' },
      [item.date]
    )
  );

  (state.dailyPriorities || []).forEach((item) =>
    consider(
      { id: `priority-${item.id}`, icon: '🎯', iconName: 'check', title: item.text, subtitle: `Prioridad · ${item.date}`, view: 'dashboard', category: 'tasks' },
      [item.date]
    )
  );

  (state.inbox || []).forEach((item) =>
    consider(
      { id: `inbox-${item.id}`, icon: '📥', iconName: 'bell', title: item.text, subtitle: 'Bandeja de entrada', view: 'dashboard', category: 'tasks' },
      ['inbox', 'bandeja']
    )
  );

  (state.goals || []).forEach((item) =>
    consider(
      { id: `goal-${item.id}`, icon: '🎯', iconName: 'trophy', title: item.name, subtitle: `${item.current} de ${item.target}`, view: 'dashboard', category: 'other' },
      ['meta'],
      [item.current, item.target]
    )
  );

  // 2. Agenda Semanal y Rutinas (Módulo 'agenda')
  if (isModuleEnabled(state, 'agenda')) {
    (state.tasksRecurring || []).forEach((item) =>
      consider(
        { id: `routine-${item.id}`, icon: '🔁', iconName: 'repeat', title: item.name, subtitle: 'Rutina', view: 'agenda', category: 'calendar' },
        [item.freq, ...(item.days || [])],
        ['rutina']
      )
    );

    Object.entries(state.agenda || {}).forEach(([day, blocks]) =>
      blocks.forEach((item) =>
        consider(
          { id: `agenda-${item.id}`, icon: '📅', iconName: 'calendar', title: item.activity, subtitle: `${day} · ${item.time}`, view: 'agenda', category: 'calendar' },
          [day, item.time]
        )
      )
    );
  }

  // 3. Transacciones y Finanzas (Módulo 'finanzas')
  if (isModuleEnabled(state, 'finanzas')) {
    const accounts = state.finance?.accounts || [];

    (state.finance?.transactions || []).forEach((item) => {
      const catName = getCategoryName(state.finance?.categories, item.category);
      const isIngreso = item.type === 'ingreso';
      const txCurrency = resolveTransactionCurrency(item, accounts);
      const formattedAmount = maskMoney(item.amount, '', txCurrency);
      const badgeSign = isIngreso ? '+' : '-';
      const badgeText = privacyMode ? `${badgeSign}••••` : `${badgeSign}${formatMoney(item.amount, txCurrency)}`;
      const subtitle = `${isIngreso ? 'Ingreso' : 'Gasto'} · ${formattedAmount} · ${catName} · ${item.date}`;
      const rawTitle = item.note || catName;
      const title = maskFinancialText(rawTitle, privacyMode);

      consider(
        {
          id: `tx-${item.id}`,
          icon: isIngreso ? '↗' : '↘',
          iconName: 'wallet',
          title,
          subtitle,
          view: 'finanzas',
          focusId: 'qa-focus-tx',
          category: 'finance',
          badge: badgeText,
          isSensitive: true,
        },
        [catName, item.category, item.type],
        privacyMode ? [item.date] : [item.date, item.amount]
      );
    });

    accounts.forEach((item) => {
      const cur = (item.currency || 'UYU').toUpperCase();
      consider(
        {
          id: `account-${item.id}`,
          icon: '💳',
          iconName: 'wallet',
          title: maskFinancialText(item.name, privacyMode),
          subtitle: `Cuenta · Saldo: ${maskMoney(item.balance, '', cur)}`,
          view: 'finanzas',
          category: 'finance',
          isSensitive: true,
        },
        ['cuenta', cur],
        privacyMode ? [] : [item.balance]
      );
    });

    (state.finance?.transfers || []).forEach((item) =>
      consider(
        {
          id: `transfer-${item.id}`,
          icon: '⇄',
          iconName: 'repeat',
          title: maskFinancialText(item.note || 'Transferencia', privacyMode),
          subtitle: `${maskMoney(item.amount)} · ${item.date}`,
          view: 'finanzas',
          category: 'finance',
          isSensitive: true,
        },
        ['transferencia', item.date],
        privacyMode ? [] : [item.amount]
      )
    );

    (state.finance?.subscriptions || []).forEach((item) =>
      consider(
        {
          id: `subscription-${item.id}`,
          icon: '🔔',
          iconName: 'clock',
          title: maskFinancialText(item.name, privacyMode),
          subtitle: `Suscripción · ${maskMoney(item.amount)}/mes`,
          view: 'finanzas',
          category: 'finance',
          isSensitive: true,
        },
        ['suscripcion', 'servicio'],
        privacyMode ? [] : [item.amount]
      )
    );

    (state.finance?.commitments || []).forEach((item) => {
      const cur = confirmedFinancialCurrency(item.currency) || 'UYU';
      consider(
        {
          id: `commitment-${item.id}`,
          icon: '💳',
          iconName: 'calendar',
          title: maskFinancialText(item.name, privacyMode),
          subtitle: `Compromiso · ${maskMoney(item.amount, '', cur)} · Vence: ${item.nextDueDate}`,
          view: 'finanzas',
          category: 'finance',
          badge: privacyMode ? '-••••' : `-${formatMoney(item.amount, cur)}`,
          isSensitive: true,
        },
        ['compromiso', 'vencimiento', item.category, item.nextDueDate],
        privacyMode ? [] : [item.amount, item.notes]
      );
    });

    (state.finance?.expectedIncomes || []).forEach((item) => {
      const cur = confirmedFinancialCurrency(item.currency) || 'UYU';
      consider(
        {
          id: `expected-income-${item.id}`,
          icon: '💰',
          iconName: 'trendingUp',
          title: maskFinancialText(item.name, privacyMode),
          subtitle: `Ingreso previsto · ${maskMoney(item.amount, '', cur)} · ${item.startDate}`,
          view: 'finanzas',
          category: 'finance',
          badge: privacyMode ? '+••••' : `+${formatMoney(item.amount, cur)}`,
          isSensitive: true,
        },
        ['ingreso previsto', 'cobro', item.category, item.startDate],
        privacyMode ? [] : [item.amount]
      );
    });

    (state.finance?.agreements || [])
      .filter((a) => a.status !== 'cancelled' && !a.deletedAt)
      .forEach((item) => {
        const cur = (item.currency || 'UYU').toUpperCase();
        consider(
          {
            id: `agreement-${item.id}`,
            icon: '📑',
            iconName: 'wallet',
            title: maskFinancialText(item.title, privacyMode),
            subtitle: `Acuerdo / Cuotas · ${item.creditorName} · ${maskMoney(item.initialRemainingBalance, '', cur)}`,
            view: 'finanzas',
            category: 'finance',
            isSensitive: true,
          },
          ['acuerdo', 'cuota', 'financiacion', item.creditorName],
          privacyMode ? [] : [item.initialRemainingBalance, item.notes]
        );
      });

    (state.finance?.debts || []).forEach((item) =>
      consider(
        {
          id: `debt-${item.id}`,
          icon: '🧾',
          iconName: 'wallet',
          title: maskFinancialText(item.name, privacyMode),
          subtitle: `Deuda · ${maskMoney(item.amount)}`,
          view: 'finanzas',
          category: 'finance',
          isSensitive: true,
        },
        ['deuda', 'compromiso'],
        privacyMode ? [] : [item.amount]
      )
    );

    (state.finance?.investments || []).forEach((item) =>
      consider(
        {
          id: `investment-${item.id}`,
          icon: '📈',
          iconName: 'trendingUp',
          title: maskFinancialText(item.name, privacyMode),
          subtitle: `Inversión · ${maskMoney(item.amount)}`,
          view: 'finanzas',
          category: 'finance',
          isSensitive: true,
        },
        ['inversion'],
        privacyMode ? [] : [item.amount]
      )
    );
  }

  // 4. Reventa (Módulo 'reventa')
  if (isModuleEnabled(state, 'reventa')) {
    (state.resale?.inventory || []).forEach((item) =>
      consider(
        {
          id: `resale-${item.id}`,
          icon: '📦',
          iconName: 'repeat',
          title: item.item,
          subtitle: `Reventa · ${item.status}`,
          view: 'reventa',
          focusId: 'qa-focus-reventa',
          category: 'resale',
        },
        [item.status, 'reventa'],
        [item.note]
      )
    );

    (state.resale?.opportunities || []).forEach((item) =>
      consider(
        {
          id: `resale-op-${item.id}`,
          icon: '🔁',
          iconName: 'sparkles',
          title: item.item,
          subtitle: 'Oportunidad de reventa',
          view: 'reventa',
          focusId: 'qa-focus-reventa',
          category: 'resale',
        },
        ['oportunidad', 'reventa'],
        [item.nota]
      )
    );
  }

  // 5. Trabajo & Empleo (Módulo 'trabajo')
  if (isModuleEnabled(state, 'trabajo')) {
    (state.jobs?.applications || []).forEach((item) => {
      const type = getJobApplicationType(item);
      const typeLabel = type === 'concurso' ? 'Concurso público' : 'Empleo convencional';
      consider(
        {
          id: `job-${item.id}`,
          icon: '💼',
          iconName: 'briefcase',
          title: `${typeLabel} · ${item.empresa} · ${item.puesto}`,
          subtitle: `Estado: ${getJobStageLabel(type, item.estado)}${item.nextAction ? ` · ${item.nextAction}` : ''}`,
          view: 'trabajo',
          focusId: 'qa-focus-trabajo',
          category: 'jobs',
        },
        [item.empresa, item.puesto, item.estado, typeLabel, type === 'concurso' ? 'concurso llamado público' : 'empleo trabajo'],
        [item.notas, item.nextAction, item.reclutador]
      );
    });

    (state.jobs?.opportunities || []).forEach((item) =>
      consider(
        {
          id: `job-op-${item.id}`,
          icon: '✨',
          iconName: 'sparkles',
          title: `${item.empresa} · ${item.puesto || 'Oportunidad'}`,
          subtitle: 'Oportunidad laboral',
          view: 'trabajo',
          focusId: 'qa-focus-trabajo',
          category: 'jobs',
        },
        [item.empresa, item.puesto || 'Oportunidad', 'empleo', 'trabajo'],
        [item.nota]
      )
    );
  }

  // 6. Estudios (Módulo 'estudios')
  if (isModuleEnabled(state, 'estudios')) {
    (state.study?.subjects || []).forEach((item) =>
      consider(
        {
          id: `subject-${item.id}`,
          icon: '📚',
          iconName: 'book',
          title: item.name,
          subtitle: 'Materia',
          view: 'estudios',
          focusId: 'qa-focus-estudio',
          category: 'study',
        },
        ['materia', 'facultad']
      )
    );

    (state.study?.exams || []).forEach((item) => {
      const subject = item.subjectId ? state.study?.subjects?.find((candidate) => candidate.id === item.subjectId) : null;
      const title = item.title?.trim()
        ? (subject ? `${item.title.trim()} · ${subject.name}` : item.title.trim())
        : (subject?.name || 'Examen');
      const timeStr = item.time ? ` · ${item.time}` : '';
      const gradeStr = item.grade ? ` · Nota: ${item.grade}` : '';
      consider(
        {
          id: `exam-${item.id}`,
          icon: '🧪',
          iconName: 'book',
          title,
          subtitle: `${item.status}${gradeStr} · ${item.date}${timeStr}`,
          view: 'estudios',
          category: 'study',
        },
        ['examen', item.title, subject?.name, item.status, item.grade],
        [item.date]
      );
    });

    (state.study?.studyLog || []).forEach((item) => {
      const subject = state.study?.subjects?.find((candidate) => candidate.id === item.subjectId);
      consider(
        {
          id: `study-${item.id}`,
          icon: '⏱️',
          iconName: 'clock',
          title: subject?.name || 'Estudio',
          subtitle: `${item.minutes} min · ${item.date}`,
          view: 'estudios',
          focusId: 'qa-focus-estudio',
          category: 'study',
        },
        ['estudio', subject?.name],
        [item.minutes, item.date]
      );
    });
  }

  // 7. Gimnasio & Ejercicios (Módulo 'gimnasio')
  if (isModuleEnabled(state, 'gimnasio')) {
    const exerciseCatalog = new Map<string, { name: string; muscleGroup?: string; lastDate?: string }>();
    (state.gym?.routineTemplates || []).forEach((tpl) => {
      tpl.exercises.forEach((ex) => {
        const key = ex.name.trim().toLowerCase();
        if (key && !exerciseCatalog.has(key)) {
          exerciseCatalog.set(key, { name: ex.name, muscleGroup: ex.muscleGroup });
        }
      });
    });

    (state.gym?.sessions || []).forEach((session) => {
      session.exercises.forEach((ex) => {
        const key = ex.name.trim().toLowerCase();
        if (key) {
          const existing = exerciseCatalog.get(key);
          if (!existing) {
            exerciseCatalog.set(key, { name: ex.name, muscleGroup: ex.muscleGroup, lastDate: session.date });
          } else if (!existing.lastDate || session.date > existing.lastDate) {
            existing.lastDate = session.date;
          }
        }
      });
    });

    exerciseCatalog.forEach((ex) => {
      consider(
        {
          id: `exercise-${ex.name.toLowerCase()}`,
          icon: '🏋️',
          iconName: 'dumbbell',
          title: ex.name,
          subtitle: `Ejercicio · ${ex.muscleGroup || 'General'}${ex.lastDate ? ` · Último: ${ex.lastDate}` : ''}`,
          view: 'gimnasio',
          category: 'gym',
        },
        [ex.muscleGroup, 'ejercicio', 'gym']
      );
    });

    (state.gym?.sessions || []).forEach((item) => {
      const exerciseNames = item.exercises.map((e) => e.name).join(', ') || 'Entrenamiento';
      consider(
        {
          id: `gym-${item.id}`,
          icon: '🏋️',
          iconName: 'dumbbell',
          title: exerciseNames,
          subtitle: `Sesión · ${item.date}`,
          view: 'gimnasio',
          category: 'gym',
        },
        ['sesion', 'gym', 'entrenamiento'],
        [item.date, ...item.exercises.map((e) => e.muscleGroup)]
      );
    });

    (state.gym?.routineTemplates || []).forEach((item) =>
      consider(
        {
          id: `template-${item.id}`,
          icon: '📋',
          iconName: 'list',
          title: item.name,
          subtitle: 'Plantilla de rutina',
          view: 'gimnasio',
          category: 'gym',
        },
        ['plantilla', 'rutina', ...item.exercises.map((e) => e.name)]
      )
    );

    (state.gym?.weight || []).forEach((item) =>
      consider(
        {
          id: `weight-${item.date}`,
          icon: '⚖️',
          iconName: 'scale',
          title: `${item.kg} kg`,
          subtitle: `Registro de peso · ${item.date}`,
          view: 'gimnasio',
          focusId: 'qa-focus-peso',
          category: 'gym',
        },
        ['peso', 'balanza', item.date]
      )
    );
  }

  // 8. Eventos de Calendario (Módulo 'calendario')
  if (isModuleEnabled(state, 'calendario')) {
    (state.calendarEvents || []).forEach((item) =>
      consider(
        {
          id: `event-${item.id}`,
          icon: '📅',
          iconName: 'calendarDays',
          title: item.name,
          subtitle: `Evento (${item.type}) · ${item.date}`,
          view: 'calendario',
          category: 'calendar',
        },
        [item.type, item.date, 'evento']
      )
    );
  }

  // 9. Notas (Módulo 'notas')
  if (isModuleEnabled(state, 'notas')) {
    (state.notes?.postits || []).forEach((item) => {
      const title = item.title?.trim();
      const firstLine = item.text.trim().split('\n')[0]?.trim() || '';
      const displayTitle = title || firstLine.slice(0, 60) || 'Nota sin título';
      const displaySubtitle = title ? item.text.slice(0, 60) : `Nota · ${item.date}`;
      const tagsString = (item.tags || []).join(' ');

      consider(
        {
          id: `note-${item.id}`,
          icon: '📝',
          iconName: 'note',
          title: displayTitle,
          subtitle: `${item.pinned ? '📌 ' : ''}${displaySubtitle}`,
          view: 'notas',
          focusId: `note-${item.id}`,
          category: 'notes',
          badge: item.archived ? 'Archivada' : item.pinned ? 'Fijada' : undefined,
        },
        [tagsString, 'nota'],
        [item.text, item.date]
      );
    });

    (state.notes?.shopping || []).forEach((item) =>
      consider(
        {
          id: `shopping-${item.id}`,
          icon: '🛒',
          iconName: 'check',
          title: item.text,
          subtitle: `Lista de compras · ${item.done ? 'Comprado' : 'Pendiente'}`,
          view: 'notas',
          category: 'notes',
        },
        ['compras', 'supermercado', item.done ? 'comprado' : 'pendiente']
      )
    );

    (state.notes?.links || []).forEach((item) =>
      consider(
        {
          id: `link-${item.id}`,
          icon: '🔗',
          iconName: 'sparkles',
          title: item.name,
          subtitle: `Enlace · ${item.url}`,
          view: 'notas',
          category: 'notes',
        },
        ['enlace', 'link'],
        [item.url]
      )
    );

    (state.notes?.possessions || []).forEach((item) =>
      consider(
        {
          id: `possession-${item.id}`,
          icon: '🎁',
          iconName: 'note',
          title: item.name,
          subtitle: `Mis cosas (${item.category})${item.location ? ` · 📍 ${item.location}` : ''}`,
          view: 'notas',
          category: 'notes',
        },
        ['objeto', 'regalo', 'cosas', item.category, item.location],
        [item.note]
      )
    );

    (state.projects || []).forEach((item) =>
      consider(
        {
          id: `project-${item.id}`,
          icon: '🚀',
          iconName: 'target',
          title: item.name,
          subtitle: `Proyecto (${item.status}) · Próximo: ${item.nextStep || 'Sin definir'}`,
          view: 'notas',
          category: 'other',
        },
        ['proyecto', item.status],
        [item.objective, item.nextStep, item.blockers]
      )
    );
  }

  // 10. IA & Streaming
  if (isModuleEnabled(state, 'ia')) {
    (state.ideas || []).forEach((item) =>
      consider(
        { id: `idea-${item.id}`, icon: '💡', iconName: 'ai', title: item.text, subtitle: 'Idea', view: 'ia', category: 'other' },
        ['idea']
      )
    );
  }

  if (isStreamingEnabled(state)) {
    (state.streaming?.sessions || []).forEach((item) =>
      consider(
        { id: `stream-${item.id}`, icon: '🎙️', iconName: 'flame', title: `${item.hours} h de stream`, subtitle: item.date, view: 'dashboard', category: 'other' },
        ['stream', 'streaming', item.date]
      )
    );
  }

  // Sorting by relevance score descending, preserving stable presentation
  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Cap at 60 items globally after sorting
  return candidates.slice(0, 60);
}
