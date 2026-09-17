import type { LifeOSState, ViewType } from '../types';
import type { AppIconName } from '../components/AppIcon';
import { fmtMoney } from './storage';

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
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es');
}

function matches(query: string, ...values: unknown[]): boolean {
  return values.some((value) => normalize(value).includes(query));
}

export function searchLifeOS(state: LifeOSState, rawQuery: string): SearchResult[] {
  const query = normalize(rawQuery.trim());
  if (query.length < 2) return [];
  const results: SearchResult[] = [];
  const add = (result: SearchResult) => { if (results.length < 60) results.push(result); };

  // Tareas y Prioridades
  state.todayExtras.forEach((item) => matches(query, item.text) && add({ id: `task-${item.id}`, icon: '✓', iconName: 'check', title: item.text, subtitle: `Tarea · ${item.date}`, view: 'dashboard', category: 'tasks' }));
  state.dailyPriorities.forEach((item) => matches(query, item.text) && add({ id: `priority-${item.id}`, icon: '🎯', iconName: 'check', title: item.text, subtitle: `Prioridad · ${item.date}`, view: 'dashboard', category: 'tasks' }));
  state.tasksRecurring.forEach((item) => matches(query, item.name, item.freq, ...(item.days || [])) && add({ id: `routine-${item.id}`, icon: '🔁', iconName: 'repeat', title: item.name, subtitle: 'Rutina', view: 'agenda', category: 'calendar' }));
  Object.entries(state.agenda).forEach(([day, blocks]) => blocks.forEach((item) => matches(query, item.activity, item.time, day) && add({ id: `agenda-${item.id}`, icon: '📅', iconName: 'calendar', title: item.activity, subtitle: `${day} · ${item.time}`, view: 'agenda', category: 'calendar' })));

  // Transacciones y Finanzas
  state.finance.transactions.forEach((item) => matches(query, item.category, item.note, item.amount, item.type) && add({
    id: `tx-${item.id}`,
    icon: item.type === 'ingreso' ? '↗' : '↘',
    iconName: 'wallet',
    title: item.note || item.category,
    subtitle: `${item.type === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${fmtMoney(item.amount)} · ${item.category} · ${item.date}`,
    view: 'finanzas',
    focusId: 'qa-focus-tx',
    category: 'finance',
    badge: `${item.type === 'ingreso' ? '+' : '-'}${fmtMoney(item.amount)}`,
  }));
  state.finance.accounts.forEach((item) => matches(query, item.name, item.balance) && add({ id: `account-${item.id}`, icon: '💳', iconName: 'wallet', title: item.name, subtitle: `Cuenta · Saldo: ${fmtMoney(item.balance)}`, view: 'finanzas', category: 'finance' }));
  state.finance.transfers.forEach((item) => matches(query, item.note, item.amount) && add({ id: `transfer-${item.id}`, icon: '⇄', iconName: 'repeat', title: item.note || 'Transferencia', subtitle: `${fmtMoney(item.amount)} · ${item.date}`, view: 'finanzas', category: 'finance' }));
  state.finance.subscriptions.forEach((item) => matches(query, item.name, item.amount, 'suscripcion') && add({ id: `subscription-${item.id}`, icon: '🔔', iconName: 'clock', title: item.name, subtitle: `Suscripción · ${fmtMoney(item.amount)}/mes`, view: 'finanzas', category: 'finance' }));
  state.finance.debts.forEach((item) => matches(query, item.name, item.amount, 'deuda') && add({ id: `debt-${item.id}`, icon: '🧾', iconName: 'wallet', title: item.name, subtitle: `Deuda · ${fmtMoney(item.amount)}`, view: 'finanzas', category: 'finance' }));
  state.finance.investments.forEach((item) => matches(query, item.name, item.amount, 'inversion') && add({ id: `investment-${item.id}`, icon: '📈', iconName: 'trendingUp', title: item.name, subtitle: `Inversión · ${fmtMoney(item.amount)}`, view: 'finanzas', category: 'finance' }));

  // Reventa
  state.resale.inventory.forEach((item) => matches(query, item.item, item.note) && add({ id: `resale-${item.id}`, icon: '📦', iconName: 'repeat', title: item.item, subtitle: `Reventa · ${item.status}`, view: 'reventa', focusId: 'qa-focus-reventa', category: 'resale' }));
  state.resale.opportunities.forEach((item) => matches(query, item.item, item.nota) && add({ id: `resale-op-${item.id}`, icon: '🔁', iconName: 'sparkles', title: item.item, subtitle: 'Oportunidad de reventa', view: 'ia', category: 'resale' }));

  // Empleo / Trabajo
  state.jobs.applications.forEach((item) => matches(query, item.empresa, item.puesto, item.notas, item.nextAction, item.reclutador) && add({ id: `job-${item.id}`, icon: '💼', iconName: 'briefcase', title: `${item.empresa} · ${item.puesto}`, subtitle: `Postulación · Estado: ${item.estado}${item.nextAction ? ` · ${item.nextAction}` : ''}`, view: 'trabajo', focusId: 'qa-focus-trabajo', category: 'jobs' }));
  state.jobs.opportunities.forEach((item) => matches(query, item.empresa, item.puesto, item.nota) && add({ id: `job-op-${item.id}`, icon: '✨', iconName: 'sparkles', title: `${item.empresa} · ${item.puesto || 'Oportunidad'}`, subtitle: 'Oportunidad laboral', view: 'ia', category: 'jobs' }));

  // Estudios
  state.study.subjects.forEach((item) => matches(query, item.name) && add({ id: `subject-${item.id}`, icon: '📚', iconName: 'book', title: item.name, subtitle: 'Materia', view: 'estudios', focusId: 'qa-focus-estudio', category: 'study' }));
  state.study.exams.forEach((item) => { const subject = state.study.subjects.find((candidate) => candidate.id === item.subjectId); if (matches(query, subject?.name, item.status, item.date, 'examen')) add({ id: `exam-${item.id}`, icon: '🧪', iconName: 'book', title: subject?.name || 'Examen', subtitle: `${item.status} · ${item.date}`, view: 'estudios', category: 'study' }); });
  state.study.studyLog.forEach((item) => { const subject = state.study.subjects.find((candidate) => candidate.id === item.subjectId); if (matches(query, subject?.name, item.minutes, item.date, 'estudio')) add({ id: `study-${item.id}`, icon: '⏱️', iconName: 'clock', title: subject?.name || 'Estudio', subtitle: `${item.minutes} min · ${item.date}`, view: 'estudios', focusId: 'qa-focus-estudio', category: 'study' }); });

  // Gimnasio & Ejercicios
  // 1. Ejercicios individuales catalogados (sesiones + plantillas)
  const exerciseCatalog = new Map<string, { name: string; muscleGroup?: string; lastDate?: string }>();
  state.gym.routineTemplates.forEach((tpl) => {
    tpl.exercises.forEach((ex) => {
      const key = ex.name.trim().toLowerCase();
      if (key && !exerciseCatalog.has(key)) {
        exerciseCatalog.set(key, { name: ex.name, muscleGroup: ex.muscleGroup });
      }
    });
  });
  state.gym.sessions.forEach((session) => {
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
    if (matches(query, ex.name, ex.muscleGroup, 'ejercicio')) {
      add({
        id: `exercise-${ex.name.toLowerCase()}`,
        icon: '🏋️',
        iconName: 'dumbbell',
        title: ex.name,
        subtitle: `Ejercicio · ${ex.muscleGroup || 'General'}${ex.lastDate ? ` · Último: ${ex.lastDate}` : ''}`,
        view: 'gimnasio',
        category: 'gym',
      });
    }
  });

  // 2. Sesiones y Plantillas de Gym
  state.gym.sessions.forEach((item) => matches(query, item.date, ...item.exercises.flatMap((exercise) => [exercise.name, exercise.muscleGroup, ...exercise.sets.flatMap((set) => [set.weight, set.reps])])) && add({ id: `gym-${item.id}`, icon: '🏋️', iconName: 'dumbbell', title: item.exercises.map((exercise) => exercise.name).join(', ') || 'Entrenamiento', subtitle: `Sesión · ${item.date}`, view: 'gimnasio', category: 'gym' }));
  state.gym.routineTemplates.forEach((item) => matches(query, item.name, ...item.exercises.map((exercise) => exercise.name)) && add({ id: `template-${item.id}`, icon: '📋', iconName: 'list', title: item.name, subtitle: 'Plantilla de rutina', view: 'gimnasio', category: 'gym' }));
  state.gym.weight.forEach((item) => matches(query, item.kg, item.date, 'peso') && add({ id: `weight-${item.date}`, icon: '⚖️', iconName: 'scale', title: `${item.kg} kg`, subtitle: `Registro de peso · ${item.date}`, view: 'gimnasio', focusId: 'qa-focus-peso', category: 'gym' }));

  // Eventos de Calendario
  state.calendarEvents.forEach((item) => matches(query, item.name, item.type, item.date) && add({ id: `event-${item.id}`, icon: '📅', iconName: 'calendarDays', title: item.name, subtitle: `Evento (${item.type}) · ${item.date}`, view: 'calendario', category: 'calendar' }));

  // Notas
  state.notes.postits.forEach((item) => matches(query, item.text, item.date) && add({ id: `note-${item.id}`, icon: '📝', iconName: 'note', title: item.text.slice(0, 60), subtitle: `Nota · ${item.date}`, view: 'notas', category: 'notes' }));
  state.notes.shopping.forEach((item) => matches(query, item.text) && add({ id: `shopping-${item.id}`, icon: '🛒', iconName: 'check', title: item.text, subtitle: `Lista de compras · ${item.done ? 'Comprado' : 'Pendiente'}`, view: 'notas', category: 'notes' }));
  state.notes.links.forEach((item) => matches(query, item.name, item.url) && add({ id: `link-${item.id}`, icon: '🔗', iconName: 'sparkles', title: item.name, subtitle: `Enlace · ${item.url}`, view: 'notas', category: 'notes' }));

  // Ideas & Metas
  state.ideas.forEach((item) => matches(query, item.text) && add({ id: `idea-${item.id}`, icon: '💡', iconName: 'sparkles', title: item.text, subtitle: 'Idea', view: 'ia', category: 'other' }));
  state.goals.forEach((item) => matches(query, item.name, item.current, item.target, 'meta') && add({ id: `goal-${item.id}`, icon: '🎯', iconName: 'trophy', title: item.name, subtitle: `${item.current} de ${item.target}`, view: 'dashboard', category: 'other' }));
  (state.projects || []).forEach((item) => matches(query, item.name, item.objective, item.nextStep, item.blockers, 'proyecto') && add({ id: `project-${item.id}`, icon: '🚀', iconName: 'target', title: item.name, subtitle: `Proyecto (${item.status}) · Próximo: ${item.nextStep || 'Sin definir'}`, view: 'notas', category: 'other' }));
  (state.inbox || []).forEach((item) => matches(query, item.text, 'inbox', 'bandeja') && add({ id: `inbox-${item.id}`, icon: '📥', iconName: 'bell', title: item.text, subtitle: `Bandeja de entrada`, view: 'dashboard', category: 'tasks' }));
  state.streaming.sessions.forEach((item) => matches(query, item.date, item.hours, 'stream') && add({ id: `stream-${item.id}`, icon: '🎙️', iconName: 'flame', title: `${item.hours} h de stream`, subtitle: item.date, view: 'dashboard', category: 'other' }));

  return results;
}
