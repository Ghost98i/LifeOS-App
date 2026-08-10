import type { LifeOSState, ViewType } from '../types';
import { fmtMoney } from './storage';

export interface SearchResult {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  view: ViewType;
}

function matches(query: string, ...values: unknown[]): boolean {
  return values.some((value) => String(value ?? '').toLocaleLowerCase('es').includes(query));
}

export function searchLifeOS(state: LifeOSState, rawQuery: string): SearchResult[] {
  const query = rawQuery.trim().toLocaleLowerCase('es');
  if (query.length < 2) return [];
  const results: SearchResult[] = [];
  const add = (result: SearchResult) => { if (results.length < 40) results.push(result); };

  state.todayExtras.forEach((item) => matches(query, item.text) && add({ id: `task-${item.id}`, icon: '✓', title: item.text, subtitle: `Tarea · ${item.date}`, view: 'dashboard' }));
  state.dailyPriorities.forEach((item) => matches(query, item.text) && add({ id: `priority-${item.id}`, icon: '🎯', title: item.text, subtitle: `Prioridad · ${item.date}`, view: 'dashboard' }));
  state.finance.transactions.forEach((item) => matches(query, item.category, item.note, item.amount) && add({ id: `tx-${item.id}`, icon: item.type === 'ingreso' ? '↗' : '↘', title: item.note || item.category, subtitle: `${item.type} · ${fmtMoney(item.amount)} · ${item.date}`, view: 'finanzas' }));
  state.finance.accounts.forEach((item) => matches(query, item.name) && add({ id: `account-${item.id}`, icon: '💳', title: item.name, subtitle: `Cuenta · ${fmtMoney(item.balance)}`, view: 'finanzas' }));
  state.finance.transfers.forEach((item) => matches(query, item.note, item.amount) && add({ id: `transfer-${item.id}`, icon: '⇄', title: item.note || 'Transferencia', subtitle: `${fmtMoney(item.amount)} · ${item.date}`, view: 'finanzas' }));
  state.resale.inventory.forEach((item) => matches(query, item.item, item.note) && add({ id: `resale-${item.id}`, icon: '📦', title: item.item, subtitle: `Reventa · ${item.status}`, view: 'reventa' }));
  state.resale.opportunities.forEach((item) => matches(query, item.item, item.nota) && add({ id: `resale-op-${item.id}`, icon: '🔁', title: item.item, subtitle: 'Oportunidad de reventa', view: 'ia' }));
  state.jobs.applications.forEach((item) => matches(query, item.empresa, item.puesto, item.notas, item.nextAction) && add({ id: `job-${item.id}`, icon: '💼', title: `${item.empresa} · ${item.puesto}`, subtitle: item.estado, view: 'trabajo' }));
  state.jobs.opportunities.forEach((item) => matches(query, item.empresa, item.puesto, item.nota) && add({ id: `job-op-${item.id}`, icon: '✨', title: `${item.empresa} · ${item.puesto || 'Oportunidad'}`, subtitle: 'Oportunidad laboral', view: 'ia' }));
  state.study.subjects.forEach((item) => matches(query, item.name) && add({ id: `subject-${item.id}`, icon: '📚', title: item.name, subtitle: 'Materia', view: 'estudios' }));
  state.calendarEvents.forEach((item) => matches(query, item.name, item.type) && add({ id: `event-${item.id}`, icon: '📅', title: item.name, subtitle: `${item.type} · ${item.date}`, view: 'calendario' }));
  state.notes.postits.forEach((item) => matches(query, item.text) && add({ id: `note-${item.id}`, icon: '📝', title: item.text, subtitle: `Nota · ${item.date}`, view: 'notas' }));
  state.notes.shopping.forEach((item) => matches(query, item.text) && add({ id: `shopping-${item.id}`, icon: '🛒', title: item.text, subtitle: 'Compras', view: 'notas' }));
  state.notes.links.forEach((item) => matches(query, item.name, item.url) && add({ id: `link-${item.id}`, icon: '🔗', title: item.name, subtitle: item.url, view: 'notas' }));
  state.ideas.forEach((item) => matches(query, item.text) && add({ id: `idea-${item.id}`, icon: '💡', title: item.text, subtitle: 'Idea', view: 'ia' }));
  return results;
}
