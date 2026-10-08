import { LifeOSState, DayKey } from '../types';
import { migrateGym } from './gymMigration';
import { DEFAULT_FINANCE_CATEGORIES, normalizeCategories } from './financeCategories';

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

export type RecoveryAction =
  | 'import_backup'
  | 'reset_data'
  | 'cloud_conflict'
  | 'repair_balances'
  | 'manual_snapshot';

export interface RecoveryMetadata {
  savedAt: string;
  action: RecoveryAction;
  description: string;
  transactionsCount: number;
  notesCount: number;
  tasksCount: number;
  gymSessionsCount: number;
  commitmentsCount: number;
  schemaVersion?: number;
}

export interface RecoveryEnvelope {
  meta: RecoveryMetadata;
  state: LifeOSState;
}

export interface BackupPreviewSummary {
  schemaVersion: number;
  profileName: string | null;
  transactionsCount: number;
  accountsCount: number;
  notesCount: number;
  tasksCount: number;
  gymSessionsCount: number;
  studySubjectsCount: number;
  commitmentsCount: number;
  backupDate?: string | null;
  lastBackupAt?: string | null;
  warnings: string[];
  state: LifeOSState;
}

export interface StorageDiagnostics {
  backend: string;
  schemaVersion: number;
  primaryBytes: number;
  recoveryAvailable: boolean;
  recoveryBytes: number;
  recoveryMeta?: RecoveryMetadata | null;
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
  const da = new Date(a.slice(0, 10) + 'T00:00:00');
  const db = new Date(b.slice(0, 10) + 'T00:00:00');
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
      categories: [...DEFAULT_FINANCE_CATEGORIES],
      budgets: {},
      accounts: [
        { id: accEfectivoId, name: 'Efectivo', balance: 0, initialBalance: 0 },
        { id: accBancoId, name: 'Banco', balance: 0, initialBalance: 0 },
      ],
      debts: [],
      investments: [],
      subscriptions: [],
      expectedIncomes: [],
      commitments: [],
      minCushion: 5000,
      cushionEnabled: true,
      heroDisplayMode: 'actual',
    },
    gym: { weight: [], measurements: [], sessions: [], routineTemplates: [], restDays: [], activeTimer: null },
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
    settings: { darkMode: false, lastBackupAt: null, hiddenTabs: ['ia'], onboardingCompleted: false, lastWeeklyReviewAt: null },
    checkoutLog: {},
  };
}

export function hasMeaningfulData(state: LifeOSState): boolean {
  if (!state) return false;
  const def = defaultState();
  const agendaHasData = state.agenda ? Object.values(state.agenda).some((blocks) => Array.isArray(blocks) && blocks.length > 0) : false;
  const recurringSignature = (items: LifeOSState['tasksRecurring']) => (items || []).map(({ name, freq, days }) => ({ name, freq, days: days || [] }));
  const accounts = state.finance?.accounts || [];
  const defaultAccounts = accounts.length === 2
    && accounts[0]?.name === 'Efectivo'
    && accounts[1]?.name === 'Banco'
    && accounts.every((account) => Number(account.balance) === 0);
  const collections = [
    state.todayExtras || [], state.dailyPriorities || [], state.dailyContext || [],
    state.finance?.transactions || [], state.finance?.transfers || [], state.finance?.reconciliations || [],
    state.finance?.debts || [], state.finance?.investments || [], state.finance?.subscriptions || [],
    state.finance?.expectedIncomes || [],
    state.gym?.weight || [], state.gym?.measurements || [], state.gym?.sessions || [], state.gym?.routineTemplates || [],
    state.study?.subjects || [], state.study?.exams || [], state.study?.studyLog || [],
    state.streaming?.sessions || [], state.jobs?.opportunities || [], state.jobs?.applications || [],
    state.resale?.opportunities || [], state.resale?.inventory || [], state.ideas || [], state.calendarEvents || [],
    state.goals || [], state.notes?.postits || [], state.notes?.shopping || [], state.notes?.links || [], state.notes?.possessions || [],
  ];

  return Boolean(
    state.profile?.name?.trim()
      || (state.profile?.height !== undefined && state.profile?.height !== def.profile.height)
      || state.profile?.bodyCompositionSex
      || agendaHasData
      || JSON.stringify(recurringSignature(state.tasksRecurring)) !== JSON.stringify(recurringSignature(def.tasksRecurring))
      || !defaultAccounts
      || Object.keys(state.finance?.budgets || {}).some((key) => Number(state.finance?.budgets?.[key]) !== 0)
      || (state.streaming?.monthlyGoal !== undefined && state.streaming?.monthlyGoal !== def.streaming.monthlyGoal)
      || state.settings?.darkMode
      || (state.settings?.hiddenTabs && (
        state.settings.hiddenTabs.length !== def.settings.hiddenTabs.length
        || state.settings.hiddenTabs.some((tab) => !def.settings.hiddenTabs.includes(tab))
      ))
      || state.settings?.onboardingCompleted
      || collections.some((items) => items.length > 0)
      || Object.keys(state.checkoutLog || {}).length > 0
      || Object.keys(state.taskLog || {}).length > 0
  );
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

  const postits = Array.isArray(rawNotes.postits)
    ? rawNotes.postits
        .filter((p: any) => p && typeof p === 'object' && (typeof p.text === 'string' || typeof p.title === 'string'))
        .map((p: any) => ({
          id: typeof p.id === 'string' ? p.id : uid(),
          text: typeof p.text === 'string' ? p.text : '',
          title: typeof p.title === 'string' && p.title.trim().length > 0 ? p.title.trim() : undefined,
          date: typeof p.date === 'string' ? p.date : todayISO(),
          pinned: p.pinned ? true : undefined,
          archived: p.archived ? true : undefined,
          tags: Array.isArray(p.tags) && p.tags.length > 0
            ? p.tags.map((t: any) => String(t || '').trim().toLowerCase()).filter(Boolean)
            : undefined,
          createdAt: typeof p.createdAt === 'string' ? p.createdAt : undefined,
          updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : undefined,
        }))
    : [];

  const notes = {
    postits,
    shopping: Array.isArray(rawNotes.shopping) ? rawNotes.shopping : [],
    links: Array.isArray(rawNotes.links) ? rawNotes.links : [],
    possessions,
  };

  // Finance
  const rawFinance: any = candidate.finance || {};
  const rawTransactions = Array.isArray(rawFinance.transactions) ? rawFinance.transactions : [];
  const categories = normalizeCategories(rawFinance.categories, rawTransactions);
  const finance = {
    transactions: Array.isArray(rawFinance.transactions) ? rawFinance.transactions : [],
    transfers: Array.isArray(rawFinance.transfers) ? rawFinance.transfers : [],
    reconciliations: Array.isArray(rawFinance.reconciliations) ? rawFinance.reconciliations : [],
    categories,
    budgets: (rawFinance.budgets && typeof rawFinance.budgets === 'object') ? rawFinance.budgets : {},
    accounts: Array.isArray(rawFinance.accounts)
      ? rawFinance.accounts.map((acc: any) => {
          const id = typeof acc.id === 'string' ? acc.id : uid();
          const name = typeof acc.name === 'string' ? acc.name : 'Cuenta';
          const balance = Number(acc.balance || 0);
          let initialBalance = typeof acc.initialBalance === 'number' && Number.isFinite(acc.initialBalance)
            ? acc.initialBalance
            : undefined;
          if (initialBalance === undefined) {
            const rawTxs = Array.isArray(rawFinance.transactions) ? rawFinance.transactions : [];
            const rawTransfers = Array.isArray(rawFinance.transfers) ? rawFinance.transfers : [];
            let delta = 0;
            for (const tx of rawTxs) {
              if (tx.accountId !== id) continue;
              if (tx.type === 'ingreso') delta += Number(tx.amount || 0);
              else delta -= Number(tx.amount || 0);
            }
            for (const tr of rawTransfers) {
              if (tr.toAccountId === id) delta += Number(tr.amount || 0);
              if (tr.fromAccountId === id) delta -= Number(tr.amount || 0);
            }
            initialBalance = Math.round((balance - delta) * 100) / 100;
          }
          return {
            id,
            name,
            balance,
            initialBalance,
            lastReconciledAt: typeof acc.lastReconciledAt === 'string' ? acc.lastReconciledAt : undefined,
          };
        })
      : def.finance.accounts,
    debts: Array.isArray(rawFinance.debts) ? rawFinance.debts : [],
    investments: Array.isArray(rawFinance.investments) ? rawFinance.investments : [],
    subscriptions: Array.isArray(rawFinance.subscriptions) ? rawFinance.subscriptions : [],
    expectedIncomes: Array.isArray(rawFinance.expectedIncomes)
      ? rawFinance.expectedIncomes
          .filter((inc: any) => inc && typeof inc === 'object' && String(inc.name || '').trim().length > 0 && Number(inc.amount || 0) > 0)
          .map((inc: any) => ({
            id: typeof inc.id === 'string' ? inc.id : uid(),
            name: String(inc.name).trim(),
            amount: Number(inc.amount || 0),
            startDate: typeof inc.startDate === 'string' ? inc.startDate : todayISO(),
            frequency: ['once', 'weekly', 'biweekly', 'monthly', 'yearly'].includes(inc.frequency)
              ? inc.frequency
              : 'monthly',
            active: inc.active !== false,
            category: typeof inc.category === 'string' ? inc.category : null,
            accountId: typeof inc.accountId === 'string' ? inc.accountId : null,
            endDate: typeof inc.endDate === 'string' ? inc.endDate : null,
            updatedAt: typeof inc.updatedAt === 'string' ? inc.updatedAt : undefined,
          }))
      : [],
    commitments: Array.isArray(rawFinance.commitments)
      ? rawFinance.commitments
          .filter((c: any) => c && typeof c === 'object' && String(c.name || '').trim().length > 0 && Number(c.amount || 0) > 0)
          .map((c: any) => ({
            id: typeof c.id === 'string' ? c.id : uid(),
            name: String(c.name).trim(),
            amount: Number(c.amount || 0),
            category: typeof c.category === 'string' ? c.category : 'Varios',
            frequency: ['once', 'weekly', 'biweekly', 'monthly', 'yearly'].includes(c.frequency) ? c.frequency : 'monthly',
            nextDueDate: typeof c.nextDueDate === 'string' ? c.nextDueDate : todayISO(),
            active: c.active !== false && (typeof c.remainingOccurrences !== 'number' || c.remainingOccurrences > 0),
            accountId: typeof c.accountId === 'string' ? c.accountId : null,
            endDate: typeof c.endDate === 'string' ? c.endDate : null,
            totalOccurrences: typeof c.totalOccurrences === 'number' && Number.isFinite(c.totalOccurrences) && c.totalOccurrences > 0 ? Math.round(c.totalOccurrences) : null,
            remainingOccurrences: typeof c.remainingOccurrences === 'number' && Number.isFinite(c.remainingOccurrences) ? Math.max(0, Math.round(c.remainingOccurrences)) : null,
            dueDay: typeof c.dueDay === 'number' && Number.isFinite(c.dueDay) ? Math.max(1, Math.min(31, Math.round(c.dueDay))) : (typeof c.nextDueDate === 'string' ? new Date(`${c.nextDueDate}T12:00:00`).getDate() : null),
            notes: typeof c.notes === 'string' ? c.notes : undefined,
            createdAt: typeof c.createdAt === 'string' ? c.createdAt : undefined,
            updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : undefined,
          }))
      : [],
    minCushion: typeof rawFinance.minCushion === 'number' && Number.isFinite(rawFinance.minCushion)
      ? rawFinance.minCushion
      : rawFinance.minCushion === null ? null : 5000,
    cushionEnabled: rawFinance.cushionEnabled !== undefined ? Boolean(rawFinance.cushionEnabled) : true,
    heroDisplayMode: ['actual', 'real_available', 'both'].includes(rawFinance.heroDisplayMode)
      ? rawFinance.heroDisplayMode
      : 'actual',
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
              dueDate: typeof t.dueDate === 'string' ? t.dueDate : undefined,
              priority: ['alta', 'media', 'baja'].includes(t.priority) ? t.priority : undefined,
              effort: typeof t.effort === 'string' ? t.effort : undefined,
              dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter((id: any) => typeof id === 'string') : undefined,
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

  // TodayExtras normalization
  const todayExtras = Array.isArray(candidate.todayExtras)
    ? candidate.todayExtras.map((x: any) => ({
        id: typeof x.id === 'string' ? x.id : uid(),
        date: typeof x.date === 'string' ? x.date : todayISO(),
        text: typeof x.text === 'string' ? x.text : '',
        done: Boolean(x.done),
        priority: ['alta', 'media', 'baja'].includes(x.priority) ? x.priority : 'media',
        effort: typeof x.effort === 'string' ? x.effort : undefined,
        dueDate: typeof x.dueDate === 'string' ? x.dueDate : undefined,
        time: typeof x.time === 'string' ? x.time : undefined,
        durationMinutes: typeof x.durationMinutes === 'number' ? x.durationMinutes : undefined,
        dependsOn: Array.isArray(x.dependsOn) ? x.dependsOn.filter((id: any) => typeof id === 'string') : undefined,
        linkedType: typeof x.linkedType === 'string' ? x.linkedType : undefined,
        linkedId: typeof x.linkedId === 'string' ? x.linkedId : undefined,
      }))
    : [];

  return {
    ...def,
    ...candidate,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile,
    agenda: (() => {
      const rawAgenda = candidate.agenda || {};
      const normalized: typeof def.agenda = { ...def.agenda };
      for (const day of DAYS) {
        const rawBlocks = rawAgenda[day];
        normalized[day] = Array.isArray(rawBlocks)
          ? rawBlocks.map((b: any) => ({
              id: typeof b.id === 'string' ? b.id : uid(),
              time: typeof b.time === 'string' ? b.time : '09:00',
              activity: typeof b.activity === 'string' ? b.activity : '',
              effort: typeof b.effort === 'string' ? b.effort : undefined,
              linkedTaskId: typeof b.linkedTaskId === 'string' ? b.linkedTaskId : undefined,
            }))
          : normalized[day] || [];
      }
      return normalized;
    })(),
    tasksRecurring: Array.isArray(candidate.tasksRecurring) ? candidate.tasksRecurring : def.tasksRecurring,
    taskLog: candidate.taskLog && typeof candidate.taskLog === 'object' ? candidate.taskLog : {},
    todayExtras,
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
    settings: (() => {
      const rawSettings: any = candidate.settings || {};
      let onboardingCompleted: boolean;
      if (typeof rawSettings.onboardingCompleted === 'boolean') {
        onboardingCompleted = rawSettings.onboardingCompleted;
      } else {
        onboardingCompleted = hasMeaningfulData(candidate as LifeOSState);
      }
      let lastWeeklyReviewAt: string | null = null;
      if (typeof rawSettings.lastWeeklyReviewAt === 'string') {
        lastWeeklyReviewAt = rawSettings.lastWeeklyReviewAt.slice(0, 10);
      }
      return {
        ...def.settings,
        ...rawSettings,
        lastWeeklyReviewAt,
        hiddenTabs: Array.isArray(rawSettings.hiddenTabs) ? rawSettings.hiddenTabs : [...def.settings.hiddenTabs],
        onboardingCompleted,
      };
    })(),
    checkoutLog: candidate.checkoutLog && typeof candidate.checkoutLog === 'object' ? candidate.checkoutLog : {},
  };
}

function getDefaultRecoveryDescription(action: RecoveryAction): string {
  switch (action) {
    case 'import_backup':
      return 'Copia previa a importar backup';
    case 'reset_data':
      return 'Copia previa a reiniciar datos a valores de fábrica';
    case 'repair_balances':
      return 'Copia previa a reparación de saldos con libro mayor';
    case 'cloud_conflict':
      return 'Copia previa a resolución de conflicto en la nube';
    case 'manual_snapshot':
    default:
      return 'Punto de restauración de seguridad';
  }
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

  // Support envelope: { meta: ..., state: ... } or { state: ... }
  const candidate = parsed.state && typeof parsed.state === 'object' && !Array.isArray(parsed.state)
    ? parsed.state
    : parsed;

  const knownKeys = ['profile', 'agenda', 'finance', 'gym', 'notes', 'tasksRecurring', 'study', 'streaming', 'jobs', 'resale', 'schemaVersion'];
  const hasRecognizedKey = knownKeys.some((k) => k in candidate);
  if (!hasRecognizedKey) {
    throw new Error('El archivo no parece pertenecer a LifeOS.');
  }
  const normalized = normalizeStoredState(candidate);
  if (candidate?.settings?.onboardingCompleted === undefined) {
    normalized.settings.onboardingCompleted = true;
  }
  return normalized;
}

export function inspectBackupJSON(text: string): BackupPreviewSummary {
  const normalized = parseBackupJSON(text);
  let rawParsed: any;
  try {
    rawParsed = JSON.parse(text);
  } catch {
    rawParsed = {};
  }
  const rawState = rawParsed?.state && typeof rawParsed.state === 'object' ? rawParsed.state : rawParsed;

  const detectedVersion = Number(rawState?.schemaVersion) || CURRENT_SCHEMA_VERSION;
  const warnings: string[] = [];
  if (detectedVersion < CURRENT_SCHEMA_VERSION) {
    warnings.push(`El archivo usa el esquema v${detectedVersion}. Se normalizará automáticamente a la versión actual v${CURRENT_SCHEMA_VERSION}.`);
  }
  if (!rawState?.finance?.commitments && (normalized.finance?.commitments?.length || 0) === 0) {
    warnings.push('El archivo no contiene compromisos financieros ni cuotas modernas.');
  }

  return {
    schemaVersion: detectedVersion,
    profileName: normalized.profile?.name || null,
    transactionsCount: normalized.finance?.transactions?.length || 0,
    accountsCount: normalized.finance?.accounts?.length || 0,
    notesCount: (normalized.notes?.postits?.length || 0) + (normalized.notes?.shopping?.length || 0) + (normalized.notes?.links?.length || 0),
    tasksCount: (normalized.todayExtras?.length || 0) + (normalized.tasksRecurring?.length || 0),
    gymSessionsCount: normalized.gym?.sessions?.length || 0,
    studySubjectsCount: normalized.study?.subjects?.length || 0,
    commitmentsCount: normalized.finance?.commitments?.length || 0,
    backupDate: rawState?.settings?.lastBackupAt || null,
    lastBackupAt: rawState?.settings?.lastBackupAt || null,
    warnings,
    state: normalized,
  };
}

export function loadRecoveryState(userId?: string | null): { state: LifeOSState; meta: RecoveryMetadata } | null {
  try {
    const key = getRecoveryKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    if (parsed.meta && parsed.state && typeof parsed.state === 'object') {
      return {
        state: normalizeStoredState(parsed.state),
        meta: parsed.meta,
      };
    }

    // Older flat LifeOSState recovery format
    const normalized = normalizeStoredState(parsed);
    return {
      state: normalized,
      meta: {
        savedAt: new Date().toISOString(),
        action: 'manual_snapshot',
        description: 'Copia de recuperación previa',
        transactionsCount: normalized.finance?.transactions?.length || 0,
        notesCount: (normalized.notes?.postits?.length || 0) + (normalized.notes?.shopping?.length || 0),
        tasksCount: (normalized.todayExtras?.length || 0) + (normalized.tasksRecurring?.length || 0),
        gymSessionsCount: normalized.gym?.sessions?.length || 0,
        commitmentsCount: normalized.finance?.commitments?.length || 0,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
    };
  } catch (e) {
    console.error('Error loading recovery state:', e);
    return null;
  }
}

export function clearRecoveryState(userId?: string | null): void {
  try {
    const key = getRecoveryKey(userId);
    localStorage.removeItem(key);
  } catch (e) {
    console.error('Error clearing recovery state:', e);
  }
}

export function getStorageDiagnostics(userId?: string | null): StorageDiagnostics {
  const pKey = getStorageKey(userId);
  const rKey = getRecoveryKey(userId);
  const pVal = localStorage.getItem(pKey) || '';
  const rVal = localStorage.getItem(rKey) || '';
  const recoveryInfo = loadRecoveryState(userId);
  return {
    backend: 'localStorage',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    primaryBytes: new Blob([pVal]).size,
    recoveryAvailable: Boolean(rVal),
    recoveryBytes: new Blob([rVal]).size,
    recoveryMeta: recoveryInfo?.meta || null,
  };
}

export function saveRecoveryState(
  state: LifeOSState,
  userId?: string | null,
  action: RecoveryAction = 'manual_snapshot',
  description?: string
): boolean {
  try {
    const key = getRecoveryKey(userId);
    const meta: RecoveryMetadata = {
      savedAt: new Date().toISOString(),
      action,
      description: description || getDefaultRecoveryDescription(action),
      transactionsCount: state.finance?.transactions?.length || 0,
      notesCount: (state.notes?.postits?.length || 0) + (state.notes?.shopping?.length || 0),
      tasksCount: (state.todayExtras?.length || 0) + (state.tasksRecurring?.length || 0),
      gymSessionsCount: state.gym?.sessions?.length || 0,
      commitmentsCount: state.finance?.commitments?.length || 0,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
    const envelope: RecoveryEnvelope = {
      meta,
      state,
    };
    localStorage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch (e) {
    console.error('Error saving recovery state:', e);
    return false;
  }
}

export function loadStoredState(userId?: string | null): { state: LifeOSState; backend: 'claude' | 'localStorage' | 'ninguno' } {
  const def = defaultState();
  try {
    const key = getStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeStoredState(parsed);
      if (parsed?.settings?.onboardingCompleted === undefined) {
        normalized.settings.onboardingCompleted = true;
      }
      return { state: normalized, backend: 'localStorage' };
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

