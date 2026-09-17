import { LifeOSState, DayKey, ResaleItem, Transaction } from '../types';
import { migrateGym } from './gymMigration';

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
export const CURRENT_SCHEMA_VERSION = 2;

export interface StorageDiagnostics {
  backend: string;
  schemaVersion: number;
  primaryBytes: number;
  recoveryAvailable: boolean;
  recoveryBytes: number;
}

export function getStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

export function getRecoveryKey(userId?: string | null): string {
  return `${getStorageKey(userId)}:recovery`;
}

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
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: { name: '', height: 170, bodyCompositionSex: null },
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
    dailyPriorities: [],
    dailyContext: [],
    finance: {
      transactions: [],
      transfers: [],
      reconciliations: [],
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
    gym: { weight: [], measurements: [], sessions: [], routineTemplates: [], restDays: [] },
    study: { subjects: [], exams: [], studyLog: [] },
    streaming: { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] },
    jobs: { opportunities: [], applications: [] },
    resale: { opportunities: [], inventory: [] },
    ideas: [],
    calendarEvents: [],
    goals: [],
    projects: [],
    inbox: [],
    notes: { postits: [], shopping: [], links: [], possessions: [] },
    settings: { darkMode: false, lastBackupAt: null, hiddenTabs: [] },
    checkoutLog: {},
  };
}

export function normalizeStoredState(raw: unknown): LifeOSState {
  const def = defaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return def;
  }
  const candidate = raw as Partial<LifeOSState> & Record<string, any>;

  // Profile
  const rawProfile: any = candidate.profile || {};
  let bodyCompositionSex: 'male' | 'female' | null = null;
  if (rawProfile.bodyCompositionSex === 'male' || rawProfile.bodyCompositionSex === 'female') {
    bodyCompositionSex = rawProfile.bodyCompositionSex;
  }
  const profile = {
    name: typeof rawProfile.name === 'string' ? rawProfile.name : def.profile.name,
    height: typeof rawProfile.height === 'number' && Number.isFinite(rawProfile.height) ? rawProfile.height : def.profile.height,
    bodyCompositionSex,
  };

  // Notes & possessions
  const rawNotes: any = candidate.notes || {};
  const possessions = Array.isArray(rawNotes.possessions)
    ? rawNotes.possessions.map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : uid(),
        name: typeof item.name === 'string' ? item.name : '',
        category: (typeof item.category === 'string' && item.category.trim()) ? item.category : 'Otros',
        location: typeof item.location === 'string' ? item.location : undefined,
        receivedAt: typeof item.receivedAt === 'string' ? item.receivedAt : null,
        note: typeof item.note === 'string' ? item.note : undefined,
      }))
    : [];

  const notes = {
    postits: Array.isArray(rawNotes.postits) ? rawNotes.postits : [],
    shopping: Array.isArray(rawNotes.shopping) ? rawNotes.shopping : [],
    links: Array.isArray(rawNotes.links) ? rawNotes.links : [],
    possessions,
  };

  // Finance
  const rawFinance: any = candidate.finance || {};
  const rawCategories = Array.isArray(rawFinance.categories) ? rawFinance.categories : def.finance.categories;
  const categories = rawCategories.includes('Reventa') ? [...rawCategories] : [...rawCategories, 'Reventa'];
  const finance = {
    transactions: Array.isArray(rawFinance.transactions) ? rawFinance.transactions : [],
    transfers: Array.isArray(rawFinance.transfers) ? rawFinance.transfers : [],
    reconciliations: Array.isArray(rawFinance.reconciliations) ? rawFinance.reconciliations : [],
    categories,
    budgets: (rawFinance.budgets && typeof rawFinance.budgets === 'object') ? rawFinance.budgets : {},
    accounts: Array.isArray(rawFinance.accounts) ? rawFinance.accounts : def.finance.accounts,
    debts: Array.isArray(rawFinance.debts) ? rawFinance.debts : [],
    investments: Array.isArray(rawFinance.investments) ? rawFinance.investments : [],
    subscriptions: Array.isArray(rawFinance.subscriptions) ? rawFinance.subscriptions : [],
  };

  // Jobs
  const rawJobs: any = candidate.jobs || {};
  const jobs = {
    opportunities: Array.isArray(rawJobs.opportunities) ? rawJobs.opportunities : [],
    applications: Array.isArray(rawJobs.applications) ? rawJobs.applications : [],
  };

  // Gym
  const gym = migrateGym(candidate.gym);

  // Projects normalization
  const projects = Array.isArray(candidate.projects)
    ? candidate.projects.map((p: any) => ({
        id: typeof p.id === 'string' ? p.id : uid(),
        name: typeof p.name === 'string' ? p.name : 'Proyecto sin título',
        objective: typeof p.objective === 'string' ? p.objective : '',
        status: ['activo', 'en_pausa', 'completado', 'cancelado'].includes(p.status) ? p.status : 'activo',
        nextStep: typeof p.nextStep === 'string' ? p.nextStep : '',
        tasks: Array.isArray(p.tasks)
          ? p.tasks.map((t: any) => ({
              id: typeof t.id === 'string' ? t.id : uid(),
              text: typeof t.text === 'string' ? t.text : '',
              done: Boolean(t.done),
            }))
          : [],
        blockers: typeof p.blockers === 'string' ? p.blockers : undefined,
        reviewDate: typeof p.reviewDate === 'string' ? p.reviewDate : undefined,
        notes: typeof p.notes === 'string' ? p.notes : undefined,
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : todayISO(),
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
      }))
    : [];

  // Inbox normalization
  const inbox = Array.isArray(candidate.inbox)
    ? candidate.inbox.map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : uid(),
        text: typeof item.text === 'string' ? item.text : '',
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        source: ['quick-capture', 'voice', 'manual'].includes(item.source) ? item.source : 'quick-capture',
      }))
    : [];

  return {
    ...def,
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile,
    agenda: { ...def.agenda, ...(candidate.agenda || {}) },
    tasksRecurring: Array.isArray(candidate.tasksRecurring) ? candidate.tasksRecurring : def.tasksRecurring,
    taskLog: candidate.taskLog && typeof candidate.taskLog === 'object' ? candidate.taskLog : {},
    todayExtras: Array.isArray(candidate.todayExtras) ? candidate.todayExtras : [],
    dailyPriorities: Array.isArray(candidate.dailyPriorities) ? candidate.dailyPriorities : [],
    dailyContext: Array.isArray(candidate.dailyContext) ? candidate.dailyContext : [],
    finance,
    gym,
    study: { ...def.study, ...(candidate.study || {}) },
    streaming: {
      ...def.streaming,
      ...(candidate.streaming || {}),
      sessions: Array.isArray(candidate.streaming?.sessions) ? candidate.streaming.sessions : [],
      preStreamChecklist: Array.isArray(candidate.streaming?.preStreamChecklist) ? candidate.streaming.preStreamChecklist : [],
      contentPipeline: Array.isArray(candidate.streaming?.contentPipeline) ? candidate.streaming.contentPipeline : [],
    },
    jobs,
    resale: { ...def.resale, ...(candidate.resale || {}) },
    ideas: Array.isArray(candidate.ideas) ? candidate.ideas : [],
    calendarEvents: Array.isArray(candidate.calendarEvents) ? candidate.calendarEvents : [],
    goals: Array.isArray(candidate.goals) ? candidate.goals : [],
    projects,
    inbox,
    notes,
    settings: { ...def.settings, ...(candidate.settings || {}) },
    checkoutLog: candidate.checkoutLog && typeof candidate.checkoutLog === 'object' ? candidate.checkoutLog : {},
  };
}

export function parseBackupJSON(text: string): LifeOSState {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('El archivo no parece pertenecer a LifeOS.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El archivo no parece pertenecer a LifeOS.');
  }
  const knownKeys = ['profile', 'agenda', 'finance', 'gym', 'notes', 'tasksRecurring', 'study', 'streaming', 'jobs', 'resale', 'schemaVersion'];
  const hasRecognizedKey = knownKeys.some((k) => k in parsed);
  if (!hasRecognizedKey) {
    throw new Error('El archivo no parece pertenecer a LifeOS.');
  }
  return normalizeStoredState(parsed);
}

export function getStorageDiagnostics(userId?: string | null): StorageDiagnostics {
  const pKey = getStorageKey(userId);
  const rKey = getRecoveryKey(userId);
  const pVal = localStorage.getItem(pKey) || '';
  const rVal = localStorage.getItem(rKey) || '';
  return {
    backend: 'localStorage',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    primaryBytes: new Blob([pVal]).size,
    recoveryAvailable: Boolean(rVal),
    recoveryBytes: new Blob([rVal]).size,
  };
}

export function saveRecoveryState(state: LifeOSState, userId?: string | null): boolean {
  try {
    const key = getRecoveryKey(userId);
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Error saving recovery state:', e);
    return false;
  }
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

export function loadStoredState(userId?: string | null): { state: LifeOSState; backend: 'claude' | 'localStorage' | 'ninguno' } {
  const def = defaultState();
  try {
    const key = getStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { state: normalizeStoredState(parsed), backend: 'localStorage' };
    }
  } catch (e) {
    console.error('Error reading localStorage:', e);
  }
  return { state: def, backend: 'ninguno' };
}

export function saveStoredState(state: LifeOSState, userId?: string | null): boolean {
  try {
    const key = getStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Error saving to localStorage:', e);
    return false;
  }
}
