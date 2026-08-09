import { LifeOSState, DayKey, ResaleItem, Transaction } from '../types';

export const DAYS: DayKey[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export const DAY_LABELS: Record<DayKey, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

export const FREQ_LABELS = {
  daily: 'Diarias',
  '2-3x': '2-3 veces/semana',
  weekly: 'Semanales',
};

export const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  cv_enviado: 'CV enviado',
  entrevista: 'Entrevista',
  oferta: 'Oferta',
  rechazado: 'Rechazado',
};

export const STORAGE_KEY = 'lifeos-state-v1';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fmtMoney(n: number | string | undefined | null): string {
  const val = Number(n) || 0;
  return '$U ' + Math.round(val).toLocaleString('es-UY');
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short' });
}

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  const ms = db.getTime() - da.getTime();
  return Math.round(ms / 86400000);
}

export function isoWeekMonday(d: Date): Date {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - day);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function dayKeyFromDate(d: Date): DayKey {
  const idx = (d.getDay() + 6) % 7;
  return DAYS[idx];
}

export function withinCurrentWeek(iso: string): boolean {
  const d = new Date(iso + 'T00:00:00');
  const mon = isoWeekMonday(new Date());
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  return d >= mon && d <= sun;
}

export function sameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso + 'T00:00:00');
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

export function sameYear(iso: string, ref: Date): boolean {
  const d = new Date(iso + 'T00:00:00');
  return d.getFullYear() === ref.getFullYear();
}

export function monthLabel(offset: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d;
}

export function stars(n?: number): string {
  const val = clamp(Math.round(n || 0), 0, 5);
  return '★'.repeat(val) + '☆'.repeat(5 - val);
}

export const TEMPLATE_ESTUDIANTE: Record<DayKey, { time: string; activity: string }[]> = {
  lunes: [
    { time: '08:00', activity: 'Clases' },
    { time: '13:00', activity: 'Almuerzo' },
    { time: '14:00', activity: 'Estudio' },
    { time: '18:00', activity: 'Gimnasio' },
    { time: '20:00', activity: 'Cena' },
  ],
  martes: [
    { time: '08:00', activity: 'Clases' },
    { time: '13:00', activity: 'Almuerzo' },
    { time: '14:30', activity: 'Estudio' },
    { time: '19:00', activity: 'Stream' },
  ],
  miercoles: [
    { time: '08:00', activity: 'Clases' },
    { time: '13:00', activity: 'Almuerzo' },
    { time: '14:00', activity: 'Estudio' },
    { time: '18:00', activity: 'Gimnasio' },
  ],
  jueves: [
    { time: '08:00', activity: 'Clases' },
    { time: '13:00', activity: 'Almuerzo' },
    { time: '14:30', activity: 'Estudio' },
    { time: '19:00', activity: 'Stream' },
  ],
  viernes: [
    { time: '08:00', activity: 'Clases' },
    { time: '13:00', activity: 'Almuerzo' },
    { time: '15:00', activity: 'Estudio' },
    { time: '18:00', activity: 'Gimnasio' },
  ],
  sabado: [
    { time: '10:00', activity: 'Tareas del hogar' },
    { time: '16:00', activity: 'Stream' },
  ],
  domingo: [
    { time: '11:00', activity: 'Descanso' },
    { time: '17:00', activity: 'Planificación semanal' },
  ],
};

export function defaultState(): LifeOSState {
  const accEfectivoId = uid();
  const accBancoId = uid();

  return {
    profile: { name: '', height: 170 },
    agenda: {
      lunes: [],
      martes: [],
      miercoles: [],
      jueves: [],
      viernes: [],
      sabado: [],
      domingo: [],
    },
    tasksRecurring: [
      { id: uid(), name: 'Tender la cama', freq: 'daily' },
      { id: uid(), name: 'Tomar 2L de agua', freq: 'daily' },
      { id: uid(), name: 'Repasar apuntes', freq: '2-3x' },
      { id: uid(), name: 'Ordenar el cuarto', freq: 'weekly' },
    ],
    taskLog: {},
    todayExtras: [],
    finance: {
      transactions: [],
      categories: [
        'Comida',
        'Gimnasio',
        'Estudio',
        'Ocio',
        'Streaming',
        'Admin/Hogar',
        'Transporte',
        'Suscripciones',
        'Reventa',
        'Otros',
      ],
      budgets: {},
      accounts: [
        { id: accEfectivoId, name: 'Efectivo', balance: 0 },
        { id: accBancoId, name: 'Banco', balance: 0 },
      ],
      debts: [],
      investments: [],
      subscriptions: [],
    },
    gym: { weight: [], measurements: [], sessions: [], routineTemplates: [] },
    study: { subjects: [], exams: [], studyLog: [] },
    streaming: { sessions: [], monthlyGoal: 12 },
    jobs: { opportunities: [], applications: [] },
    resale: { opportunities: [], inventory: [] },
    ideas: [],
    calendarEvents: [],
    goals: [],
    notes: { postits: [], shopping: [], links: [] },
    settings: { darkMode: false, lastBackupAt: null, hiddenTabs: [] },
    checkoutLog: {},
  };
}

export function syncResaleSaleToFinance(state: LifeOSState, item: ResaleItem): void {
  const isVendido = Boolean(item.sellPrice && item.sellDate);
  if (isVendido) {
    const tx = item.financeTxId ? state.finance.transactions.find((t) => t.id === item.financeTxId) : null;
    if (tx) {
      const oldAmount = Number(tx.amount) || 0;
      const newAmount = Number(item.sellPrice) || 0;
      const delta = newAmount - oldAmount;
      if (tx.accountId) {
        const acc = state.finance.accounts.find((a) => a.id === tx.accountId);
        if (acc) acc.balance = Number(acc.balance || 0) + delta;
      }
      tx.amount = newAmount;
      tx.date = item.sellDate!;
      tx.note = 'Venta: ' + item.item;
    } else {
      const accountId = state.finance.accounts.length ? state.finance.accounts[0].id : null;
      const newTx: Transaction = {
        id: uid(),
        type: 'ingreso',
        amount: Number(item.sellPrice) || 0,
        category: 'Reventa',
        fixed: 'variable',
        date: item.sellDate!,
        note: 'Venta: ' + item.item,
        accountId,
      };
      state.finance.transactions.push(newTx);
      if (accountId) {
        const acc = state.finance.accounts.find((a) => a.id === accountId);
        if (acc) acc.balance = Number(acc.balance || 0) + newTx.amount;
      }
      item.financeTxId = newTx.id;
    }
  } else if (item.financeTxId) {
    const tx = state.finance.transactions.find((t) => t.id === item.financeTxId);
    if (tx && tx.accountId) {
      const acc = state.finance.accounts.find((a) => a.id === tx.accountId);
      if (acc) acc.balance = Number(acc.balance || 0) - Number(tx.amount || 0);
    }
    state.finance.transactions = state.finance.transactions.filter((t) => t.id !== item.financeTxId);
    item.financeTxId = null;
  }
}

export function loadStoredState(): { state: LifeOSState; backend: 'claude' | 'localStorage' | 'ninguno' } {
  const def = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged: LifeOSState = {
        ...def,
        ...parsed,
        profile: { ...def.profile, ...(parsed.profile || {}) },
        agenda: { ...def.agenda, ...(parsed.agenda || {}) },
        finance: { ...def.finance, ...(parsed.finance || {}) },
        gym: { ...def.gym, ...(parsed.gym || {}) },
        study: { ...def.study, ...(parsed.study || {}) },
        streaming: { ...def.streaming, ...(parsed.streaming || {}) },
        jobs: { ...def.jobs, ...(parsed.jobs || {}) },
        resale: { ...def.resale, ...(parsed.resale || {}) },
        notes: { ...def.notes, ...(parsed.notes || {}) },
        settings: { ...def.settings, ...(parsed.settings || {}) },
        checkoutLog: parsed.checkoutLog || def.checkoutLog,
        ideas: parsed.ideas || def.ideas,
        calendarEvents: parsed.calendarEvents || def.calendarEvents,
        goals: parsed.goals || def.goals,
        todayExtras: parsed.todayExtras || def.todayExtras,
      };

      if (!merged.finance.categories.includes('Reventa')) {
        merged.finance.categories.push('Reventa');
      }

      return { state: merged, backend: 'localStorage' };
    }
  } catch (e) {
    console.error('Error reading localStorage:', e);
  }
  return { state: def, backend: 'ninguno' };
}

export function saveStoredState(state: LifeOSState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Error saving to localStorage:', e);
    return false;
  }
}
