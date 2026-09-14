import {
  LifeOSState,
  Transaction,
  AgendaBlock,
  TaskRecurring,
  TodayExtra,
  Goal,
  CalendarEvent,
  ResaleOpportunity,
  EffortLevel,
} from '../types';
import {
  todayISO,
  sameMonth,
  monthLabel,
  daysBetween,
  withinCurrentWeek,
  dayKeyFromDate,
  isoWeekMonday,
  clamp,
} from './storage';

export function calcAccountsTotal(state: LifeOSState): number {
  return state.finance.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
}

export function defaultAccountId(state: LifeOSState): string | null {
  return state.finance.accounts.length ? state.finance.accounts[0].id : null;
}

export function adjustAccountBalance(state: LifeOSState, accountId: string | null | undefined, delta: number): void {
  if (!accountId) return;
  const acc = state.finance.accounts.find((a) => a.id === accountId);
  if (acc) {
    acc.balance = Number(acc.balance || 0) + delta;
  }
}

export function calcInvestmentsTotal(state: LifeOSState): number {
  return state.finance.investments.reduce((s, i) => s + Number(i.amount || 0), 0);
}

export function calcDebtsTotal(state: LifeOSState): number {
  return state.finance.debts.reduce((s, d) => s + Number(d.amount || 0), 0);
}

export function calcNetWorth(state: LifeOSState): number {
  return calcAccountsTotal(state) + calcInvestmentsTotal(state) - calcDebtsTotal(state);
}

export function calcSubscriptionsTotal(state: LifeOSState): number {
  return state.finance.subscriptions.reduce((s, x) => s + Number(x.amount || 0), 0);
}

export interface CashFlowCommitment {
  id: string;
  label: string;
  amount: number;
  dueDate: string | null;
  kind: 'subscription' | 'debt';
}

function nextMonthlyDate(day: number, fromIso: string): string {
  const from = new Date(`${fromIso}T12:00:00`);
  const build = (year: number, month: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const date = new Date(year, month, Math.min(Math.max(1, day), lastDay), 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const current = build(from.getFullYear(), from.getMonth());
  return current >= fromIso ? current : build(from.getFullYear(), from.getMonth() + 1);
}

export function cashFlow30Days(state: LifeOSState, fromIso = todayISO()) {
  const horizon = new Date(`${fromIso}T12:00:00`);
  horizon.setDate(horizon.getDate() + 30);
  const horizonIso = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`;
  const commitments: CashFlowCommitment[] = state.finance.subscriptions.map((subscription) => ({
    id: `subscription-${subscription.id}`,
    label: subscription.name,
    amount: Number(subscription.amount || 0),
    dueDate: subscription.dueDay ? nextMonthlyDate(subscription.dueDay, fromIso) : null,
    kind: 'subscription' as const,
  }));
  state.finance.debts.forEach((debt) => {
    const amount = Number(debt.monthlyPayment || 0);
    if (amount <= 0) return;
    if (debt.dueDate && (debt.dueDate < fromIso || debt.dueDate > horizonIso)) return;
    commitments.push({ id: `debt-${debt.id}`, label: debt.name, amount, dueDate: debt.dueDate || null, kind: 'debt' });
  });
  commitments.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const committed = commitments.reduce((sum, item) => sum + item.amount, 0);
  const currentBalance = calcAccountsTotal(state);
  return { currentBalance, committed, projectedBalance: currentBalance - committed, commitments, horizonIso };
}

export function resaleGananciaTotal(state: LifeOSState): number {
  return state.resale.inventory
    .filter((i) => i.status === 'vendido')
    .reduce((s, i) => {
      const breakdown = Number(i.shippingCost || 0) + Number(i.platformFees || 0) + Number(i.taxes || 0);
      return s + Number(i.sellPrice || 0) - Number(i.buyPrice || 0) - (breakdown > 0 ? breakdown : Number(i.fees || 0));
    }, 0);
}

function isOperationalTransaction(transaction: Transaction): boolean {
  return transaction.origin !== 'adjustment';
}

export function txInMonth(state: LifeOSState, offset = 0): Transaction[] {
  const ref = monthLabel(offset);
  return state.finance.transactions.filter((t) => sameMonth(t.date, ref));
}

export function calcSpentMonth(state: LifeOSState, offset = 0): number {
  return txInMonth(state, offset)
    .filter((t) => t.type === 'gasto' && isOperationalTransaction(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function calcIncomeMonth(state: LifeOSState, offset = 0): number {
  return txInMonth(state, offset)
    .filter((t) => t.type === 'ingreso' && isOperationalTransaction(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function calcFixedSpentMonth(state: LifeOSState, offset = 0): number {
  return txInMonth(state, offset)
    .filter((t) => t.type === 'gasto' && t.fixed === 'fijo' && isOperationalTransaction(t))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

export function calcMonthComparison(state: LifeOSState): { pct: number; dir: 'up' | 'down' | 'flat' } {
  const cur = calcSpentMonth(state, 0);
  const prev = calcSpentMonth(state, -1);
  if (prev === 0) {
    return cur === 0 ? { pct: 0, dir: 'flat' } : { pct: 100, dir: 'up' };
  }
  const pct = ((cur - prev) / prev) * 100;
  return { pct: Math.abs(pct), dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

export function calcSpentByCategory(state: LifeOSState, offset = 0): Record<string, number> {
  const map: Record<string, number> = {};
  txInMonth(state, offset)
    .filter((t) => t.type === 'gasto' && isOperationalTransaction(t))
    .forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount || 0);
    });
  return map;
}

export function calcSpentByCategoryAllTime(state: LifeOSState): Record<string, number> {
  const map: Record<string, number> = {};
  state.finance.transactions
    .filter((t) => t.type === 'gasto' && isOperationalTransaction(t))
    .forEach((t) => {
      map[t.category] = (map[t.category] || 0) + Number(t.amount || 0);
    });
  return map;
}

export interface MonthTransactionGroup {
  key: string;
  label: string;
  txs: Transaction[];
  totalGasto: number;
  totalIngreso: number;
  isCurrent: boolean;
}

export function groupTransactionsByMonth(state: LifeOSState): MonthTransactionGroup[] {
  const groups: Record<string, Transaction[]> = {};
  state.finance.transactions.filter(isOperationalTransaction).forEach((t) => {
    const key = t.date.slice(0, 7); // YYYY-MM
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const curKey = todayISO().slice(0, 7);
  return Object.keys(groups)
    .sort((a,b) => b.localeCompare(a))
    .map((key) => {
      const txs = groups[key].sort((a, b) => b.date.localeCompare(a.date));
      const totalGasto = txs.filter((t) => t.type === 'gasto' && isOperationalTransaction(t)).reduce((s, t) => s + Number(t.amount || 0), 0);
      const totalIngreso = txs.filter((t) => t.type === 'ingreso' && isOperationalTransaction(t)).reduce((s, t) => s + Number(t.amount || 0), 0);
      const parts = key.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = new Date(y, m, 1);
      const labelRaw = d.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
      const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1);
      return { key, label, txs, totalGasto, totalIngreso, isCurrent: key === curKey };
    });
}

export function sortedWeight(state: LifeOSState) {
  return [...state.gym.weight].sort((a, b) => a.date.localeCompare(b.date));
}

export function currentWeight(state: LifeOSState): number | null {
  const w = sortedWeight(state);
  return w.length ? w[w.length - 1].kg : null;
}

export function firstWeight(state: LifeOSState): number | null {
  const w = sortedWeight(state);
  return w.length ? w[0].kg : null;
}

export function weightVariation(state: LifeOSState): number | null {
  const c = currentWeight(state);
  const f = firstWeight(state);
  if (c == null || f == null) return null;
  return c - f;
}

export function trainedDatesSet(state: LifeOSState): Set<string> {
  return new Set(state.gym.sessions.map((s) => s.date));
}

export function calcGymStreak(state: LifeOSState): number {
  const set = trainedDatesSet(state);
  let streak = 0;
  const d = new Date();
  while (true) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const iso = `${year}-${month}-${day}`;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (isWeekend) {
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (set.has(iso)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export interface PRInfo {
  weight: number;
  reps: number;
  date: string;
}

export function calcPRs(state: LifeOSState): Record<string, PRInfo> {
  const prs: Record<string, PRInfo> = {};
  state.gym.sessions.forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      ex.sets.forEach((set) => {
        const current = prs[ex.name];
        if (!current || set.weight > current.weight || (set.weight === current.weight && set.reps > current.reps)) {
          prs[ex.name] = { weight: set.weight, reps: set.reps, date: s.date };
        }
      });
    });
  });
  return prs;
}

export function studyMinutesForDate(state: LifeOSState, iso: string): number {
  return state.study.studyLog.filter((l) => l.date === iso).reduce((s, l) => s + Number(l.minutes || 0), 0);
}

export function studyMinutesThisWeek(state: LifeOSState): number {
  return state.study.studyLog.filter((l) => withinCurrentWeek(l.date)).reduce((s, l) => s + Number(l.minutes || 0), 0);
}

export function nextExam(state: LifeOSState) {
  const today = todayISO();
  const pend = state.study.exams
    .filter((e) => e.status === 'pendiente' && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return pend.length ? pend[0] : null;
}

export function examApprovalPct(state: LifeOSState): number | null {
  const done = state.study.exams.filter((e) => e.status === 'aprobado' || e.status === 'desaprobado');
  if (done.length === 0) return null;
  const ap = done.filter((e) => e.status === 'aprobado').length;
  return (ap / done.length) * 100;
}

export function streamSessionsInMonth(state: LifeOSState, offset = 0) {
  const ref = monthLabel(offset);
  return state.streaming.sessions.filter((s) => sameMonth(s.date, ref));
}

export function todayStreamStatus(state: LifeOSState) {
  const iso = todayISO();
  const s = state.streaming.sessions.find((x) => x.date === iso);
  return s ? { live: true, hours: s.hours } : { live: false, hours: 0 };
}

export const EVENT_TYPE_META = {
  cumpleanos: { label: 'Cumpleaños', icon: '🎂', pill: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  estreno: { label: 'Estreno', icon: '🎬', pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  importante: { label: 'Importante', icon: '⭐', pill: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  otro: { label: 'Otro', icon: '📌', pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
};

export function eventsOnDate(state: LifeOSState, iso: string): CalendarEvent[] {
  const parts = iso.split('-');
  const m = parts[1];
  const d = parts[2];
  return state.calendarEvents.filter((e) => {
    if (e.recurring) {
      const eParts = e.date.split('-');
      return eParts[1] === m && eParts[2] === d;
    }
    return e.date === iso;
  });
}

export function nextOccurrence(e: CalendarEvent): string {
  const today = todayISO();
  if (e.recurring) {
    const parts = e.date.split('-');
    const m = parts[1];
    const d = parts[2];
    const y = new Date().getFullYear();
    let candidate = `${y}-${m}-${d}`;
    if (candidate < today) candidate = `${y + 1}-${m}-${d}`;
    return candidate;
  }
  return e.date;
}

export function upcomingEvents(state: LifeOSState, limit = 5) {
  return state.calendarEvents
    .map((e) => ({ ...e, occursOn: nextOccurrence(e) }))
    .filter((e) => e.recurring || e.date >= todayISO())
    .sort((a, b) => a.occursOn.localeCompare(b.occursOn))
    .slice(0, limit);
}

export function hasGymSessionOn(state: LifeOSState, dateIso: string): boolean {
  return state.gym.sessions.some((s) => s.date === dateIso);
}

export function hasStudyLogOn(state: LifeOSState, dateIso: string): boolean {
  return state.study.studyLog.some((l) => l.date === dateIso);
}

export function hasTransactionOn(state: LifeOSState, dateIso: string): boolean {
  return state.finance.transactions.some((t) => t.date === dateIso);
}

export function checkoutQuestionsFor(state: LifeOSState, dateIso: string) {
  const log = state.checkoutLog[dateIso] || {};
  return {
    trained: !hasGymSessionOn(state, dateIso) && !log.trainedSkipped,
    studied: !hasStudyLogOn(state, dateIso) && !log.studiedSkipped,
    expenses: !hasTransactionOn(state, dateIso) && !log.expensesSkipped,
  };
}

export function findNowAndNext(state: LifeOSState) {
  const now = new Date();
  const dayKey = dayKeyFromDate(now);
  const blocks = [...(state.agenda[dayKey] || [])].sort((a, b) => a.time.localeCompare(b.time));
  const curMin = now.getHours() * 60 + now.getMinutes();
  let current: AgendaBlock | null = null;
  let next: AgendaBlock | null = null;
  for (let i = 0; i < blocks.length; i++) {
    const [h, m] = blocks[i].time.split(':').map(Number);
    const blockMin = h * 60 + m;
    if (blockMin <= curMin) {
      current = blocks[i];
    } else {
      next = blocks[i];
      break;
    }
  }
  return { current, next, dayKey };
}

export function jobStats(state: LifeOSState) {
  const apps = state.jobs.applications;
  const cvEnviados = apps.filter((a) => a.estado !== 'pendiente').length;
  const entrevistas = apps.filter((a) => a.estado === 'entrevista').length;
  const empresas = new Set(apps.map((a) => a.empresa)).size;
  const seguimientosPendientes = apps.filter((a) => a.nextActionDate && a.nextActionDate <= todayISO()).length;
  return {
    cvEnviados,
    entrevistas,
    empresas,
    ofertasNuevas: state.jobs.opportunities.filter((o) => o.status === 'nueva').length,
    seguimientosPendientes,
  };
}

export function resaleStats(state: LifeOSState) {
  const inv = state.resale.inventory;
  const stock = inv.filter((i) => i.status === 'comprado').length;
  const vendidos = inv.filter((i) => i.status === 'vendido');
  const ventas = vendidos.length;
  const compras = inv.length;
  const netProfit = (item: (typeof vendidos)[number]) => {
    const breakdown = Number(item.shippingCost || 0) + Number(item.platformFees || 0) + Number(item.taxes || 0);
    return Number(item.sellPrice || 0) - Number(item.buyPrice || 0) - (breakdown > 0 ? breakdown : Number(item.fees || 0));
  };
  const gananciaTotal = vendidos.reduce((s, i) => s + netProfit(i), 0);
  const gananciaPromedio = ventas ? gananciaTotal / ventas : 0;
  const costoTotal = vendidos.reduce((s, i) => {
    const breakdown = Number(i.shippingCost || 0) + Number(i.platformFees || 0) + Number(i.taxes || 0);
    return s + Number(i.buyPrice || 0) + (breakdown > 0 ? breakdown : Number(i.fees || 0));
  }, 0);
  const roi = costoTotal > 0 ? (gananciaTotal / costoTotal) * 100 : 0;
  const tiempos = vendidos
    .filter((i) => i.buyDate && i.sellDate)
    .map((i) => daysBetween(i.buyDate, i.sellDate!));
  const tiempoPromedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;
  const ranking = [...vendidos]
    .sort((a, b) => netProfit(b) - netProfit(a))
    .slice(0, 5);
  return {
    stock,
    ventas,
    compras,
    gananciaTotal,
    gananciaPromedio,
    roi,
    tiempoPromedio,
    ranking,
    oportunidadesNuevas: state.resale.opportunities.filter((o) => o.status === 'nueva').length,
  };
}

export function goalCurrentValue(state: LifeOSState, g: Goal): number {
  if (g.linked === 'weight') {
    const w = currentWeight(state);
    return w != null ? w : g.current;
  }
  if (g.linked === 'available') {
    return calcAccountsTotal(state);
  }
  return g.current;
}

export function goalProgressPct(g: Goal, cur: number): number {
  if (g.target === g.initial) return 100;
  return clamp(((cur - g.initial) / (g.target - g.initial)) * 100, 0, 100);
}

export function computeAgendaPriority(block: AgendaBlock, done: boolean): number {
  if (done) return 1;
  const now = new Date();
  const [h, m] = (block.time || '00:00').split(':').map(Number);
  const blockMin = h * 60 + m;
  const curMin = now.getHours() * 60 + now.getMinutes();
  const diff = blockMin - curMin;
  if (diff < 0) return 5;
  if (diff <= 120) return 4;
  return 3;
}

export function computeRutinaPriority(task: TaskRecurring, done: boolean): number {
  if (done) return 1;
  let base = task.freq === 'daily' ? 4 : task.freq === '2-3x' ? 3 : 2;
  if (new Date().getHours() >= 20) base = Math.min(5, base + 1);
  return base;
}

export function computeExtraPriority(extra: TodayExtra): number {
  if (extra.done) return 1;
  const map: Record<string, number> = { alta: 5, media: 3, baja: 2 };
  return map[extra.priority] || 3;
}

export function computeResaleMarginPct(o: ResaleOpportunity): number {
  const buy = Number(o.buyPrice || 0);
  const market = Number(o.marketPrice || 0);
  if (buy <= 0) return 0;
  return ((market - buy) / buy) * 100;
}

export function computeResalePriority(o: ResaleOpportunity): number {
  const pct = computeResaleMarginPct(o);
  if (pct >= 40) return 5;
  if (pct >= 25) return 4;
  if (pct >= 15) return 3;
  if (pct > 0) return 2;
  return 1;
}

export function computeFollowupPriority(dateStr: string): number {
  if (dateStr < todayISO()) return 5;
  return 4;
}

export interface TodayItem {
  id: string;
  text: string;
  done: boolean;
  source: 'agenda' | 'rutina' | 'extra' | 'trabajo';
  kind: 'toggle-task-today' | 'toggle-extra-today' | 'complete-followup';
  priority: number;
  effort: EffortLevel;
}

export function routineScheduledFor(state: LifeOSState, task: TaskRecurring, iso: string): boolean {
  const day = dayKeyFromDate(new Date(`${iso}T00:00:00`));
  if (task.days?.length) return task.days.includes(day);
  if (task.freq === 'daily') return true;
  if (state.taskLog[iso]?.[task.id]) return true;

  const monday = isoWeekMonday(new Date(`${iso}T00:00:00`));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const completedThisWeek = Object.entries(state.taskLog).filter(([date, log]) => {
    const parsed = new Date(`${date}T00:00:00`);
    return parsed >= monday && parsed <= sunday && Boolean(log[task.id]);
  }).length;
  return completedThisWeek < (task.freq === 'weekly' ? 1 : 3);
}

export function todayItems(state: LifeOSState, dateIso?: string, includeFollowups?: boolean): TodayItem[] {
  const iso = dateIso || todayISO();
  if (includeFollowups === undefined) includeFollowups = iso === todayISO();
  const dayKey = dayKeyFromDate(new Date(iso + 'T00:00:00'));
  const log = state.taskLog[iso] || {};
  const items: TodayItem[] = [];

  [...(state.agenda[dayKey] || [])]
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach((b) => {
      const done = Boolean(log[b.id]);
      items.push({
        id: b.id,
        text: `${b.activity} · ${b.time}`,
        done,
        source: 'agenda',
        kind: 'toggle-task-today',
        priority: computeAgendaPriority(b, done),
        effort: b.effort || 'medium',
      });
    });

  state.tasksRecurring.forEach((t) => {
    if (!routineScheduledFor(state, t, iso)) return;
    const done = Boolean(log[t.id]);
    items.push({
      id: t.id,
      text: t.name,
      done,
      source: 'rutina',
      kind: 'toggle-task-today',
      priority: computeRutinaPriority(t, done),
      effort: t.effort || 'medium',
    });
  });

  state.todayExtras
    .filter((x) => x.date === iso)
    .forEach((x) => {
      items.push({
        id: x.id,
        text: x.text,
        done: Boolean(x.done),
        source: 'extra',
        kind: 'toggle-extra-today',
        priority: computeExtraPriority(x),
        effort: x.effort || 'medium',
      });
    });

  if (includeFollowups) {
    state.jobs.applications
      .filter((a) => a.nextActionDate && a.nextActionDate <= iso)
      .forEach((a) => {
        items.push({
          id: a.id,
          text: `${a.nextAction || 'Seguimiento'} — ${a.empresa}`,
          done: false,
          source: 'trabajo',
          kind: 'complete-followup',
          priority: computeFollowupPriority(a.nextActionDate!),
          effort: 'medium',
        });
      });
  }

  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return b.priority - a.priority;
  });

  return items;
}

export function pendingTodayCount(state: LifeOSState): number {
  return todayItems(state).filter((i) => !i.done).length;
}
