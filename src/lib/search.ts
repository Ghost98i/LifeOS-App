import type { LifeOSState, ViewType } from '../types';
import { fmtMoney } from './storage';

export interface SearchResult {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  view: ViewType;
  focusId?: string;
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
  const add = (result: SearchResult) => { if (results.length < 40) results.push(result); };

  state.todayExtras.forEach((item) => matches(query, item.text) && add({ id: `task-${item.id}`, icon: '✓', title: item.text, subtitle: `Tarea · ${item.date}`, view: 'dashboard' }));
  state.dailyPriorities.forEach((item) => matches(query, item.text) && add({ id: `priority-${item.id}`, icon: '🎯', title: item.text, subtitle: `Prioridad · ${item.date}`, view: 'dashboard' }));
  state.tasksRecurring.forEach((item) => matches(query, item.name, item.freq, ...(item.days || [])) && add({ id: `routine-${item.id}`, icon: '🔁', title: item.name, subtitle: 'Rutina', view: 'agenda' }));
  Object.entries(state.agenda).forEach(([day, blocks]) => blocks.forEach((item) => matches(query, item.activity, item.time, day) && add({ id: `agenda-${item.id}`, icon: '📅', title: item.activity, subtitle: `${day} · ${item.time}`, view: 'agenda' })));
  state.finance.transactions.forEach((item) => matches(query, item.category, item.note, item.amount, item.type) && add({ id: `tx-${item.id}`, icon: item.type === 'ingreso' ? '↗' : '↘', title: item.note || item.category, subtitle: `${item.type} · ${fmtMoney(item.amount)} · ${item.date}`, view: 'finanzas', focusId: 'qa-focus-tx' }));
  state.finance.accounts.forEach((item) => matches(query, item.name, item.balance) && add({ id: `account-${item.id}`, icon: '💳', title: item.name, subtitle: `Cuenta · ${fmtMoney(item.balance)}`, view: 'finanzas' }));
  state.finance.transfers.forEach((item) => matches(query, item.note, item.amount) && add({ id: `transfer-${item.id}`, icon: '⇄', title: item.note || 'Transferencia', subtitle: `${fmtMoney(item.amount)} · ${item.date}`, view: 'finanzas' }));
  state.finance.subscriptions.forEach((item) => matches(query, item.name, item.amount, 'suscripcion') && add({ id: `subscription-${item.id}`, icon: '🔔', title: item.name, subtitle: `Suscripción · ${fmtMoney(item.amount)}/mes`, view: 'finanzas' }));
  state.finance.debts.forEach((item) => matches(query, item.name, item.amount, 'deuda') && add({ id: `debt-${item.id}`, icon: '🧾', title: item.name, subtitle: `Deuda · ${fmtMoney(item.amount)}`, view: 'finanzas' }));
  state.finance.investments.forEach((item) => matches(query, item.name, item.amount, 'inversion') && add({ id: `investment-${item.id}`, icon: '📈', title: item.name, subtitle: `Inversión · ${fmtMoney(item.amount)}`, view: 'finanzas' }));
  state.resale.inventory.forEach((item) => matches(query, item.item, item.note) && add({ id: `resale-${item.id}`, icon: '📦', title: item.item, subtitle: `Reventa · ${item.status}`, view: 'reventa', focusId: 'qa-focus-reventa' }));
  state.resale.opportunities.forEach((item) => matches(query, item.item, item.nota) && add({ id: `resale-op-${item.id}`, icon: '🔁', title: item.item, subtitle: 'Oportunidad de reventa', view: 'ia' }));
  state.jobs.applications.forEach((item) => matches(query, item.empresa, item.puesto, item.notas, item.nextAction, item.reclutador) && add({ id: `job-${item.id}`, icon: '💼', title: `${item.empresa} · ${item.puesto}`, subtitle: item.estado, view: 'trabajo', focusId: 'qa-focus-trabajo' }));
  state.jobs.opportunities.forEach((item) => matches(query, item.empresa, item.puesto, item.nota) && add({ id: `job-op-${item.id}`, icon: '✨', title: `${item.empresa} · ${item.puesto || 'Oportunidad'}`, subtitle: 'Oportunidad laboral', view: 'ia' }));
  state.study.subjects.forEach((item) => matches(query, item.name) && add({ id: `subject-${item.id}`, icon: '📚', title: item.name, subtitle: 'Materia', view: 'estudios', focusId: 'qa-focus-estudio' }));
  state.study.exams.forEach((item) => { const subject = state.study.subjects.find((candidate) => candidate.id === item.subjectId); if (matches(query, subject?.name, item.status, item.date, 'examen')) add({ id: `exam-${item.id}`, icon: '🧪', title: subject?.name || 'Examen', subtitle: `${item.status} · ${item.date}`, view: 'estudios' }); });
  state.study.studyLog.forEach((item) => { const subject = state.study.subjects.find((candidate) => candidate.id === item.subjectId); if (matches(query, subject?.name, item.minutes, item.date, 'estudio')) add({ id: `study-${item.id}`, icon: '⏱️', title: subject?.name || 'Estudio', subtitle: `${item.minutes} min · ${item.date}`, view: 'estudios', focusId: 'qa-focus-estudio' }); });
  state.gym.sessions.forEach((item) => matches(query, item.date, ...item.exercises.flatMap((exercise) => [exercise.name, exercise.muscleGroup, ...exercise.sets.flatMap((set) => [set.weight, set.reps])])) && add({ id: `gym-${item.id}`, icon: '🏋️', title: item.exercises.map((exercise) => exercise.name).join(', ') || 'Entrenamiento', subtitle: `Sesión · ${item.date}`, view: 'gimnasio' }));
  state.gym.routineTemplates.forEach((item) => matches(query, item.name, ...item.exercises.map((exercise) => exercise.name)) && add({ id: `template-${item.id}`, icon: '📋', title: item.name, subtitle: 'Plantilla de rutina', view: 'gimnasio' }));
  state.gym.weight.forEach((item) => matches(query, item.kg, item.date, 'peso') && add({ id: `weight-${item.date}`, icon: '⚖️', title: `${item.kg} kg`, subtitle: `Peso · ${item.date}`, view: 'gimnasio', focusId: 'qa-focus-peso' }));
  state.calendarEvents.forEach((item) => matches(query, item.name, item.type) && add({ id: `event-${item.id}`, icon: '📅', title: item.name, subtitle: `${item.type} · ${item.date}`, view: 'calendario' }));
  state.notes.postits.forEach((item) => matches(query, item.text) && add({ id: `note-${item.id}`, icon: '📝', title: item.text, subtitle: `Nota · ${item.date}`, view: 'notas' }));
  state.notes.shopping.forEach((item) => matches(query, item.text) && add({ id: `shopping-${item.id}`, icon: '🛒', title: item.text, subtitle: 'Compras', view: 'notas' }));
  state.notes.links.forEach((item) => matches(query, item.name, item.url) && add({ id: `link-${item.id}`, icon: '🔗', title: item.name, subtitle: item.url, view: 'notas' }));
  state.ideas.forEach((item) => matches(query, item.text) && add({ id: `idea-${item.id}`, icon: '💡', title: item.text, subtitle: 'Idea', view: 'ia' }));
  state.goals.forEach((item) => matches(query, item.name, item.current, item.target, 'meta') && add({ id: `goal-${item.id}`, icon: '🎯', title: item.name, subtitle: `${item.current} de ${item.target}`, view: 'dashboard' }));
  state.streaming.sessions.forEach((item) => matches(query, item.date, item.hours, 'stream') && add({ id: `stream-${item.id}`, icon: '🎙️', title: `${item.hours} h de stream`, subtitle: item.date, view: 'dashboard' }));
  return results;
}
