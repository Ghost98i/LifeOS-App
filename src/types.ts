export type DayKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';

export interface Profile {
  name: string;
  height: number;
}

export interface AgendaBlock {
  id: string;
  time: string;
  activity: string;
}

export type AgendaWeek = Record<DayKey, AgendaBlock[]>;

export interface TaskRecurring {
  id: string;
  name: string;
  freq: 'daily' | '2-3x' | 'weekly';
  days?: DayKey[];
}

export interface TodayExtra {
  id: string;
  date: string;
  text: string;
  done: boolean;
  priority: 'alta' | 'media' | 'baja';
}

export interface DailyPriority {
  id: string;
  date: string;
  text: string;
  done: boolean;
  rank: 1 | 2 | 3;
}

export interface DailyContextEntry {
  date: string;
  sleepHours: number | null;
  energy: 1 | 2 | 3 | 4 | 5 | null;
  mood: 1 | 2 | 3 | 4 | 5 | null;
  connection: 'solo' | 'mensaje' | 'encuentro' | null;
  note?: string;
}

export interface Transaction {
  id: string;
  type: 'gasto' | 'ingreso';
  amount: number;
  category: string;
  fixed: 'variable' | 'fijo';
  date: string;
  note?: string;
  accountId?: string | null;
  origin?: 'manual' | 'quick' | 'adjustment' | 'resale_purchase' | 'resale_sale';
}

export interface Account {
  id: string;
  name: string;
  balance: number;
  lastReconciledAt?: string | null;
}

export interface FinanceTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface AccountReconciliation {
  id: string;
  accountId: string;
  date: string;
  systemBalance: number;
  actualBalance: number;
  difference: number;
  adjustmentTxId?: string | null;
  note?: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
}

export interface Debt {
  id: string;
  name: string;
  amount: number;
}

export interface Investment {
  id: string;
  name: string;
  amount: number;
}

export interface Finance {
  transactions: Transaction[];
  transfers: FinanceTransfer[];
  reconciliations: AccountReconciliation[];
  categories: string[];
  budgets: Record<string, number>;
  accounts: Account[];
  debts: Debt[];
  investments: Investment[];
  subscriptions: Subscription[];
}

export interface WeightPoint {
  date: string;
  kg: number;
}

export interface MeasurementPoint {
  date: string;
  waist: number;
}

export interface Exercise {
  name: string;
  weight: number;
  reps: string;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  exercises: Exercise[];
}

export interface GymSession {
  id: string;
  date: string;
  exercises: Exercise[];
  weekLabel?: string;
}

export interface Gym {
  weight: WeightPoint[];
  measurements: MeasurementPoint[];
  sessions: GymSession[];
  routineTemplates: RoutineTemplate[];
}

export interface Subject {
  id: string;
  name: string;
}

export interface Exam {
  id: string;
  subjectId: string;
  date: string;
  status: 'pendiente' | 'aprobado' | 'desaprobado';
}

export interface StudyLog {
  id: string;
  date: string;
  minutes: number;
  subjectId?: string | null;
}

export interface Study {
  subjects: Subject[];
  exams: Exam[];
  studyLog: StudyLog[];
}

export interface StreamSession {
  id: string;
  date: string;
  hours: number;
}

export interface Streaming {
  sessions: StreamSession[];
  monthlyGoal: number;
}

export interface JobOpportunity {
  id: string;
  empresa: string;
  puesto?: string;
  rating?: number;
  link?: string;
  nota?: string;
  fecha: string;
  status: 'nueva' | 'aplicada' | 'descartada';
}

export interface JobApplication {
  id: string;
  empresa: string;
  puesto: string;
  estado: 'cv_enviado' | 'pendiente' | 'entrevista' | 'oferta' | 'rechazado';
  fecha: string;
  reclutador?: string;
  notas?: string;
  link?: string;
  nextAction?: string;
  nextActionDate?: string;
  sourceOpportunityId?: string;
}

export interface Jobs {
  opportunities: JobOpportunity[];
  applications: JobApplication[];
}

export interface ResaleOpportunity {
  id: string;
  item: string;
  buyPrice: number;
  marketPrice: number;
  nota?: string;
  fecha: string;
  status: 'nueva' | 'comprada' | 'descartada';
}

export interface ResaleItem {
  id: string;
  item: string;
  buyPrice: number;
  buyDate: string;
  sellPrice?: number | null;
  sellDate?: string | null;
  status: 'comprado' | 'vendido';
  purchaseTxId?: string | null;
  saleTxId?: string | null;
  feeTxId?: string | null;
  fees?: number;
  saleAccountId?: string | null;
  purchaseAccountId?: string | null;
  /** @deprecated Conservado para migrar ventas creadas por versiones anteriores. */
  financeTxId?: string | null;
  note?: string;
  sourceOpportunityId?: string;
}

export interface Resale {
  opportunities: ResaleOpportunity[];
  inventory: ResaleItem[];
}

export interface Idea {
  id: string;
  text: string;
  date: string;
  source: 'manual' | 'ia';
}

export interface CalendarEvent {
  id: string;
  name: string;
  date: string;
  type: 'cumpleanos' | 'estreno' | 'importante' | 'otro';
  recurring: boolean;
}

export interface Goal {
  id: string;
  name: string;
  initial: number;
  target: number;
  current: number;
  linked?: 'weight' | 'available' | null;
}

export interface Postit {
  id: string;
  text: string;
  date: string;
}

export interface ShoppingItem {
  id: string;
  text: string;
  done: boolean;
}

export interface UsefulLink {
  id: string;
  name: string;
  url: string;
}

export interface Notes {
  postits: Postit[];
  shopping: ShoppingItem[];
  links: UsefulLink[];
}

export interface Settings {
  darkMode: boolean;
  lastBackupAt?: string | null;
  hiddenTabs: string[];
  lastWeeklyReviewAt?: string | null;
}

export interface CheckoutLogDay {
  trainedSkipped?: boolean;
  studiedSkipped?: boolean;
  expensesSkipped?: boolean;
  closedAt?: string;
}

export interface LifeOSState {
  schemaVersion: number;
  profile: Profile;
  agenda: AgendaWeek;
  tasksRecurring: TaskRecurring[];
  taskLog: Record<string, Record<string, boolean>>; // date -> taskID -> boolean
  todayExtras: TodayExtra[];
  dailyPriorities: DailyPriority[];
  dailyContext: DailyContextEntry[];
  finance: Finance;
  gym: Gym;
  study: Study;
  streaming: Streaming;
  jobs: Jobs;
  resale: Resale;
  ideas: Idea[];
  calendarEvents: CalendarEvent[];
  goals: Goal[];
  notes: Notes;
  settings: Settings;
  checkoutLog: Record<string, CheckoutLogDay>;
}

export type ViewType =
  | 'dashboard'
  | 'agenda'
  | 'calendario'
  | 'trabajo'
  | 'reventa'
  | 'finanzas'
  | 'gimnasio'
  | 'estudios'
  | 'notas'
  | 'ia'
  | 'config'
  | 'checkout';
