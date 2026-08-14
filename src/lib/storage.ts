import { LifeOSState, DayKey } from '../types';

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
export const STORAGE_RECOVERY_KEY = 'lifeos-state-recovery-v1';
export const CURRENT_SCHEMA_VERSION = 6;

type StorageBackend = 'localStorage' | 'recovery' | 'ninguno';

export interface StorageDiagnostics {
  backend: StorageBackend;
  schemaVersion: number;
  primaryBytes: number;
  recoveryBytes: number;
  recoveryAvailable: boolean;
}

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function scopedStorageKey(base: string, userId?: string | null): string {
  return userId ? `${base}:user:${userId}` : base;
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
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
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
    gym: { weight: [], measurements: [], sessions: [], routineTemplates: [] },
    study: { subjects: [], exams: [], studyLog: [] },
    streaming: { sessions: [], monthlyGoal: 12 },
    jobs: { opportunities: [], applications: [] },
    resale: { opportunities: [], inventory: [] },
    ideas: [],
    calendarEvents: [],
    goals: [],
    notes: { postits: [], shopping: [], links: [] },
    settings: { darkMode: false, lastBackupAt: null, hiddenTabs: [], lastWeeklyReviewAt: null },
    checkoutLog: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function arrayOr<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function normalizeStoredState(value: unknown): LifeOSState {
  if (!isRecord(value)) throw new Error('El backup debe contener un objeto de LifeOS.');

  const def = defaultState();
  const profile = isRecord(value.profile) ? value.profile : {};
  const agenda = isRecord(value.agenda) ? value.agenda : {};
  const finance = isRecord(value.finance) ? value.finance : {};
  const gym = isRecord(value.gym) ? value.gym : {};
  const study = isRecord(value.study) ? value.study : {};
  const streaming = isRecord(value.streaming) ? value.streaming : {};
  const jobs = isRecord(value.jobs) ? value.jobs : {};
  const resale = isRecord(value.resale) ? value.resale : {};
  const notes = isRecord(value.notes) ? value.notes : {};
  const settings = isRecord(value.settings) ? value.settings : {};

  const merged: LifeOSState = {
    ...def,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: {
      ...def.profile,
      ...profile,
      bodyCompositionSex: profile.bodyCompositionSex === 'male' || profile.bodyCompositionSex === 'female'
        ? profile.bodyCompositionSex
        : null,
    },
    agenda: { ...def.agenda, ...agenda },
    tasksRecurring: arrayOr(value.tasksRecurring, def.tasksRecurring),
    taskLog: isRecord(value.taskLog) ? (value.taskLog as LifeOSState['taskLog']) : def.taskLog,
    todayExtras: arrayOr(value.todayExtras, def.todayExtras),
    dailyPriorities: arrayOr(value.dailyPriorities, def.dailyPriorities).map((priority) => ({
      ...priority,
      sourceItemId: priority.sourceItemId || null,
      sourceKind: priority.sourceKind === 'toggle-task-today'
        || priority.sourceKind === 'toggle-extra-today'
        || priority.sourceKind === 'complete-followup'
        ? priority.sourceKind
        : null,
    })),
    dailyContext: arrayOr(value.dailyContext, def.dailyContext),
    finance: {
      ...def.finance,
      ...finance,
      transactions: arrayOr(finance.transactions, def.finance.transactions),
      transfers: arrayOr(finance.transfers, def.finance.transfers),
      reconciliations: arrayOr(finance.reconciliations, def.finance.reconciliations),
      categories: arrayOr(finance.categories, def.finance.categories),
      budgets: isRecord(finance.budgets) ? (finance.budgets as Record<string, number>) : def.finance.budgets,
      accounts: arrayOr(finance.accounts, def.finance.accounts).map((account) => ({
        ...account,
        lastReconciledAt: account.lastReconciledAt ?? null,
      })),
      debts: arrayOr(finance.debts, def.finance.debts),
      investments: arrayOr(finance.investments, def.finance.investments),
      subscriptions: arrayOr(finance.subscriptions, def.finance.subscriptions),
    },
    gym: {
      ...def.gym,
      ...gym,
      weight: arrayOr(gym.weight, def.gym.weight),
      measurements: arrayOr(gym.measurements, def.gym.measurements),
      sessions: arrayOr(gym.sessions, def.gym.sessions),
      routineTemplates: arrayOr(gym.routineTemplates, def.gym.routineTemplates),
    },
    study: {
      ...def.study,
      ...study,
      subjects: arrayOr(study.subjects, def.study.subjects),
      exams: arrayOr(study.exams, def.study.exams),
      studyLog: arrayOr(study.studyLog, def.study.studyLog),
    },
    streaming: {
      ...def.streaming,
      ...streaming,
      sessions: arrayOr(streaming.sessions, def.streaming.sessions),
    },
    jobs: {
      ...def.jobs,
      ...jobs,
      opportunities: arrayOr(jobs.opportunities, def.jobs.opportunities),
      applications: arrayOr(jobs.applications, def.jobs.applications),
    },
    resale: {
      ...def.resale,
      ...resale,
      opportunities: arrayOr(resale.opportunities, def.resale.opportunities),
      inventory: arrayOr(resale.inventory, def.resale.inventory).map((item) => ({
        ...item,
        purchaseTxId: item.purchaseTxId ?? null,
        saleTxId: item.saleTxId ?? item.financeTxId ?? null,
        feeTxId: item.feeTxId ?? null,
        fees: Number(item.fees || 0),
      })),
    },
    ideas: arrayOr(value.ideas, def.ideas),
    calendarEvents: arrayOr(value.calendarEvents, def.calendarEvents),
    goals: arrayOr(value.goals, def.goals),
    notes: {
      ...def.notes,
      ...notes,
      postits: arrayOr(notes.postits, def.notes.postits),
      shopping: arrayOr(notes.shopping, def.notes.shopping),
      links: arrayOr(notes.links, def.notes.links),
    },
    settings: {
      ...def.settings,
      ...settings,
      hiddenTabs: arrayOr(settings.hiddenTabs, def.settings.hiddenTabs),
    },
    checkoutLog: isRecord(value.checkoutLog)
      ? (value.checkoutLog as LifeOSState['checkoutLog'])
      : def.checkoutLog,
  };

  if (!merged.finance.categories.includes('Reventa')) merged.finance.categories.push('Reventa');
  return merged;
}

export function parseBackupJSON(raw: string): LifeOSState {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error('El archivo no contiene un backup válido.');

  const recognizedKeys = ['profile', 'agenda', 'finance', 'gym', 'study', 'jobs', 'resale', 'notes'];
  if (!recognizedKeys.some((key) => Object.prototype.hasOwnProperty.call(parsed, key))) {
    throw new Error('El archivo no parece pertenecer a LifeOS.');
  }

  return normalizeStoredState(parsed);
}

export function loadStoredState(userId?: string | null): { state: LifeOSState; backend: StorageBackend } {
  const primaryKey = scopedStorageKey(STORAGE_KEY, userId);
  const recoveryKey = scopedStorageKey(STORAGE_RECOVERY_KEY, userId);
  try {
    const raw = localStorage.getItem(primaryKey);
    if (raw) return { state: normalizeStoredState(JSON.parse(raw)), backend: 'localStorage' };
  } catch (e) {
    console.error('Error reading localStorage:', e);
    try {
      const recovery = localStorage.getItem(recoveryKey);
      if (recovery) return { state: normalizeStoredState(JSON.parse(recovery)), backend: 'recovery' };
    } catch (recoveryError) {
      console.error('Error reading recovery snapshot:', recoveryError);
    }
  }
  return { state: defaultState(), backend: 'ninguno' };
}

export function saveStoredState(state: LifeOSState, userId?: string | null): boolean {
  const primaryKey = scopedStorageKey(STORAGE_KEY, userId);
  const recoveryKey = scopedStorageKey(STORAGE_RECOVERY_KEY, userId);
  try {
    const previous = localStorage.getItem(primaryKey);
    if (previous) {
      try {
        normalizeStoredState(JSON.parse(previous));
        localStorage.setItem(recoveryKey, previous);
      } catch {
        // Never replace a valid recovery snapshot with corrupt data.
      }
    }
    localStorage.setItem(primaryKey, JSON.stringify({ ...state, schemaVersion: CURRENT_SCHEMA_VERSION }));
    return true;
  } catch (e) {
    console.error('Error saving to localStorage:', e);
    return false;
  }
}

export function saveRecoveryState(state: LifeOSState, userId?: string | null): boolean {
  try {
    const normalized = normalizeStoredState(state);
    localStorage.setItem(scopedStorageKey(STORAGE_RECOVERY_KEY, userId), JSON.stringify(normalized));
    return true;
  } catch (error) {
    console.error('Error saving recovery state:', error);
    return false;
  }
}

export function getStorageDiagnostics(userId?: string | null): StorageDiagnostics {
  const primaryKey = scopedStorageKey(STORAGE_KEY, userId);
  const recoveryKey = scopedStorageKey(STORAGE_RECOVERY_KEY, userId);
  try {
    const primary = localStorage.getItem(primaryKey) || '';
    const recovery = localStorage.getItem(recoveryKey) || '';
    let schemaVersion = CURRENT_SCHEMA_VERSION;
    if (primary) schemaVersion = normalizeStoredState(JSON.parse(primary)).schemaVersion;
    return {
      backend: primary ? 'localStorage' : 'ninguno',
      schemaVersion,
      primaryBytes: new Blob([primary]).size,
      recoveryBytes: new Blob([recovery]).size,
      recoveryAvailable: Boolean(recovery),
    };
  } catch {
    const recovery = localStorage.getItem(recoveryKey) || '';
    return {
      backend: recovery ? 'recovery' : 'ninguno',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      primaryBytes: 0,
      recoveryBytes: new Blob([recovery]).size,
      recoveryAvailable: Boolean(recovery),
    };
  }
}
