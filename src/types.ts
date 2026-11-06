import type { CommercialSet } from './lib/commercialContract';

export type DayKey = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';

export type EffortLevel = 'baja' | 'media' | 'alta' | 'low' | 'medium' | 'high';

export type MuscleGroup = 'Pecho' | 'Espalda' | 'Piernas' | 'Hombros' | 'Brazos' | 'Core' | 'Cardio' | 'Otros';

export interface Profile {
  name: string;
  height: number;
  bodyCompositionSex?: 'male' | 'female' | null;
}

export interface AgendaBlock {
  id: string;
  time: string;
  activity: string;
  effort?: EffortLevel;
  /** ID of a linked UnifiedTask (TodayExtra or ProjectTask). Purely referential — completing a session does NOT auto-complete the task. */
  linkedTaskId?: string;
}

export type AgendaWeek = Record<DayKey, AgendaBlock[]>;

export interface TaskRecurring {
  id: string;
  name: string;
  freq: 'daily' | '2-3x' | 'weekly';
  days?: DayKey[];
  effort?: EffortLevel;
  /** Optional local time for agenda presentation. Older routines remain untimed. */
  time?: string;
}

export interface TodayExtra {
  id: string;
  date: string;
  text: string;
  done: boolean;
  priority: 'alta' | 'media' | 'baja';
  effort?: EffortLevel;
  dueDate?: string;
  time?: string;
  durationMinutes?: number;
  dependsOn?: string[];
  linkedType?: 'study' | 'gym' | 'calendar' | 'project' | null;
  linkedId?: string | null;
}

export interface DailyPriority {
  id: string;
  date: string;
  text: string;
  done?: boolean;
  rank?: number;
  /** Reasons why Smart Priorities 2.0 recommended this item. Used for display only. */
  reasons?: string[];
}

export type SleepQualityLevel = 1 | 2 | 3 | 4 | 5;

export type PerceivedStressLevel = 'bajo' | 'moderado' | 'alto';

export type PhysicalDiscomfortLevel = 'leve' | 'moderada' | 'alta';

export type ContextOptionalFactorKey = 'stress' | 'physicalDiscomfort' | 'connection' | 'note';

export interface DailyContextMorningSnapshot {
  sleepHours?: number | null;
  sleepQuality?: SleepQualityLevel | null;
  energy?: number | null;
  mood?: number | null;
  stress?: PerceivedStressLevel | null;
  physicalDiscomfort?: PhysicalDiscomfortLevel | null;
  connection?: number | string | null;
  capturedAt?: string;
}

export interface DailyContextEntry {
  date: string;
  sleepHours: number | null;
  sleepQuality?: SleepQualityLevel | null;
  energy: number | null;
  mood: number | null;
  connection: number | string | null;
  stress?: PerceivedStressLevel | null;
  physicalDiscomfort?: PhysicalDiscomfortLevel | null;
  note?: string;
  /** Preserves the initial morning check-in values when a field is edited later in the same day. */
  morningSnapshot?: DailyContextMorningSnapshot | null;
  recordedAt?: string;
  updatedAt?: string;
  /** Key of a contextual recommendation explicitly dismissed by the user for this date. */
  dismissedRecommendationKey?: string | null;
}

export type TransactionReviewStatus = 'pending' | 'reviewed' | 'ignored';

export interface Transaction {
  id: string;
  effectiveOrder?: string;
  revisionOrder?: string;
  /** Instante original de registro; no cambia al editar el movimiento. */
  createdAt?: string;
  type: 'gasto' | 'ingreso';
  amount: number;
  category: string;
  fixed: 'variable' | 'fijo';
  date: string;
  /** Hora local de la operación, cuando el usuario la conoce (HH:mm). */
  operationTime?: string | null;
  note?: string;
  accountId?: string | null;
  origin?: 'manual' | 'adjustment' | 'reventa' | 'quick-capture' | 'quick' | 'resale_purchase' | 'resale_sale' | 'import' | 'commitment' | 'debt_payment';
  reviewStatus?: TransactionReviewStatus;
  reviewed?: boolean;
  currency?: string;
  commitmentId?: string | null;
  expectedIncomeId?: string | null;
  agreementId?: string | null;
  matchedCycle?: string | null;
  rejectedMatchIds?: string[];
}

export interface FinanceTransfer {
  id: string;
  effectiveOrder?: string;
  revisionOrder?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
}

export interface AccountReconciliation {
  id: string;
  effectiveOrder?: string;
  revisionOrder?: string;
  accountId: string;
  actualBalance: number;
  systemBalance: number;
  difference: number;
  date: string;
  note?: string;
  adjustmentTxId?: string | null;
}

export interface Account {
  id: string;
  name: string;
  balance: number;
  initialBalance?: number;
  lastReconciledAt?: string | null;
  currency?: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  dueDay?: number | null;
}

export interface Debt {
  id: string;
  name: string;
  amount: number;
  monthlyPayment?: number | null;
  dueDate?: string | null;
}

export interface Investment {
  id: string;
  name: string;
  amount: number;
}

export type ExpectedIncomeFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface ExpectedIncome {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  startDate: string; // ISO date YYYY-MM-DD
  frequency: ExpectedIncomeFrequency;
  active: boolean;
  category?: string | null;
  accountId?: string | null;
  endDate?: string | null; // ISO date YYYY-MM-DD or null
  lastSettledTxId?: string | null;
  settledTxIds?: string[];
  updatedAt?: string;
}

export type FinancialCommitmentFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface FinancialCommitment {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  category?: string | null;
  frequency: FinancialCommitmentFrequency;
  nextDueDate: string; // ISO date YYYY-MM-DD
  active: boolean;
  status?: 'pending' | 'paid' | 'cancelled';
  accountId?: string | null;
  endDate?: string | null; // ISO date YYYY-MM-DD or null
  totalOccurrences?: number | null; // Total planned installments (e.g. 3)
  remainingOccurrences?: number | null; // Remaining unpaid installments (e.g. 2)
  currentInstallment?: number | null; // e.g. 3 (cuota 3 de 12)
  totalInstallments?: number | null; // e.g. 12 (cuota 3 de 12)
  installmentAmount?: number | null; // Importe por cuota si aplica
  dueDay?: number | null; // Anchor day of month (1-31) to prevent date drift
  notes?: string | null;
  lastSettledTxId?: string | null; // ID del movimiento real que finalmente la liquida
  settledTxIds?: string[]; // IDs de movimientos que liquidaron cuotas de este compromiso
  createdAt?: string;
  updatedAt?: string;
}

export type InstallmentFrequency = 'monthly' | 'biweekly' | 'weekly';

export interface InstallmentSchedule {
  /** Cantidad total de cuotas acordadas (ej. 6) */
  totalInstallments: number;
  /** Importe contractual de cada cuota regular */
  installmentAmount: number;
  /** Fecha de vencimiento de la primera cuota (YYYY-MM-DD) */
  firstDueDate: string;
  /** Día del mes pactado como ancla (1-31) para evitar desplazamientos por meses cortos */
  dueDay: number;
  /** Periodicidad (mensual por defecto) */
  frequency: InstallmentFrequency;
}

export type InstallmentStatus = 'paid' | 'partial' | 'pending' | 'overdue';

export interface DerivedInstallment {
  installmentNumber: number;
  totalInstallments: number;
  dueDate: string; // YYYY-MM-DD
  requiredAmount: number;
  allocatedPaid: number;
  remainingDue: number;
  status: InstallmentStatus;
  isOverdue: boolean;
}

export interface AgreementScheduleBreakdown {
  agreementId: string;
  totalAgreed: number;
  totalPaid: number;
  remainingBalance: number;
  installments: DerivedInstallment[];
  nextDueInstallment: DerivedInstallment | null;
  completedInstallmentsCount: number;
}

export interface FinancedAcquisition {
  /** Fecha real en que se realizó la compra o adquisición (YYYY-MM-DD) */
  acquisitionDate: string;
  /** Categoría del bien o servicio adquirido (ej. 'Hogar', 'Tecnología') */
  category: string;
  /** Importe total convenido de la compra financiada */
  totalPurchaseAmount: number;
}

export interface FinancingAgreement {
  id: string;
  title: string;
  creditorName: string;
  currency: 'UYU' | 'USD';
  initialRemainingBalance: number;
  initialReferenceDate: string; // ISO date YYYY-MM-DD
  originalPrincipal?: number | null;
  priorPaidAmount?: number | null;
  notes?: string | null;
  status: 'active' | 'settled' | 'cancelled';
  settledAt?: string | null;
  linkedLegacyDebtId?: string | null;
  schedule?: InstallmentSchedule | null;
  acquisition?: FinancedAcquisition | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CashFlowCommitment {
  id: string;
  sourceId: string;
  label: string;
  amount: number;
  dueDate: string | null;
  kind: 'subscription' | 'debt' | 'commitment';
}

export interface CashFlowDayPoint {
  date: string; // YYYY-MM-DD
  startingBalance: number;
  expectedIncome: number;
  expectedExpenses: number;
  debtPayments: number;
  endingBalance: number;
  netDayChange: number;
}

export interface CashFlowForecastItem {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  amount: number;
  type: 'income' | 'expense' | 'debt';
  category?: string | null;
  accountId?: string | null;
  sourceId: string;
  isOverdue?: boolean;
  installmentNumber?: number;
  totalInstallments?: number;
  agreementId?: string;
  isFinancing?: boolean;
}

export interface FinanceCategory {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type FinanceCategoryInput = string | FinanceCategory;

export interface MonthlyBudgetConfig {
  month: string; // YYYY-MM
  currency?: string;
  globalLimit?: number | null;
  categoryLimits?: Record<string, number>;
}

export type CashflowWindow = '7d' | 'month' | '30d';

export interface CashflowEventItem {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  amount: number;
  currency: string;
  type: 'expected_income' | 'committed_expense';
  category?: string | null;
  accountId?: string | null;
  sourceId: string;
  isOverdue?: boolean;
  kind?: 'commitment' | 'subscription' | 'debt' | 'expected_income';
  installmentNumber?: number;
  totalInstallments?: number;
  agreementId?: string;
  isFinancing?: boolean;
}

export interface CashflowCurrencySummary {
  currency: string;
  realBalance: number;
  committedExpenses: number;
  availableAfterCommitments: number; // realBalance - committedExpenses
  expectedIncomes: number;
  projectedBalance: number; // realBalance + expectedIncomes - committedExpenses
}

export interface CashflowWindowProjection {
  window: CashflowWindow;
  fromIso: string;
  horizonIso: string;
  summariesByCurrency: Record<string, CashflowCurrencySummary>;
  events: CashflowEventItem[];
  /** Kept visible, excluded from currency-specific sums; never persisted. */
  unconfirmedCurrencyEvents: CashflowEventItem[];
}

export interface BudgetCategoryStatus {
  categoryId: string;
  categoryName: string;
  currency: string;
  limit: number | null;
  hasBudget: boolean;
  spent: number;
  remaining: number | null; // limit - spent (null if no limit)
  exceeded: number; // Math.max(0, spent - limit) if has limit, else 0
  isExceeded: boolean;
  pct: number;
}

export interface MonthlyBudgetStatus {
  month: string; // YYYY-MM
  currency: string;
  hasBudget: boolean;
  globalLimit: number | null;
  totalSpent: number;
  remaining: number | null; // globalLimit - totalSpent (null if no globalLimit)
  exceeded: number;
  isExceeded: boolean;
  pct: number;
  categories: BudgetCategoryStatus[];
}

export interface Finance {
  transactions: Transaction[];
  transfers: FinanceTransfer[];
  reconciliations: AccountReconciliation[];
  categories: FinanceCategory[];
  budgets: Record<string, number>;
  monthlyBudgets?: Record<string, MonthlyBudgetConfig>;
  accounts: Account[];
  debts: Debt[];
  investments: Investment[];
  subscriptions: Subscription[];
  expectedIncomes?: ExpectedIncome[];
  commitments?: FinancialCommitment[];
  agreements?: FinancingAgreement[];
  minCushion?: number | null;
  cushionEnabled?: boolean;
  heroDisplayMode?: FinanceHeroDisplayMode;
}

export type FinanceHeroDisplayMode = 'actual' | 'real_available' | 'both';

export interface WeightPoint {
  date: string;
  kg: number;
}

export interface MeasurementPoint {
  date: string;
  waist: number;
}

export type GymSetType = 'normal' | 'warmup';

export interface GymSet {
  id: string;
  weight: number;
  reps: number;
  completedAt?: string | null;
  completed?: boolean;
  rpe?: number;
  type?: GymSetType;
}

export type ExerciseEquipment = 'barra' | 'mancuerna' | 'polea' | 'maquina' | 'corporal';
export type GymExerciseRestMode = 'inherit' | 'custom' | 'disabled';

export interface Exercise {
  id?: string;
  name: string;
  equipment?: ExerciseEquipment;
  icon?: import('./lib/gymIconRegistry').GymIconName | null;
  weight?: number;
  barWeight?: number;
  reps?: string;
  muscleGroup?: MuscleGroup | string;
  sets: GymSet[];
  restSeconds?: number;
  /** `custom` is the only explicit per-exercise override; otherwise Gym settings are inherited. */
  restSecondsMode?: GymExerciseRestMode;
  timerEnabled?: boolean;
  legacyReps?: string | null;
}

export type RoutineIconName =
  | 'dumbbell'
  | 'zap'
  | 'flame'
  | 'activity'
  | 'repeat'
  | 'sparkles'
  | 'target'
  | 'shield'
  | 'trophy'
  | 'scale'
  | 'gym-bench-press'
  | 'gym-lat-pulldown'
  | 'gym-leg-press'
  | 'gym-dumbbell'
  | 'gym-shoulder-press'
  | 'gym-yoga-mat'
  | 'gym-bike'
  | 'gym-rest'
  | 'gym-torso'
  | 'gym-biceps'
  | 'gym-abs'
  | 'gym-weightlifting'
  | 'gym-deadlift'
  | 'gym-curls'
  | 'gym-pushups'
  | 'gym-plank'
  | 'gym-stretching'
  | 'gym-triceps'
  | 'gym-hamstrings'
  | 'gym-calves';

export const ROUTINE_ICON_NAMES: readonly RoutineIconName[] = [
  'dumbbell',
  'zap',
  'flame',
  'activity',
  'repeat',
  'sparkles',
  'target',
  'shield',
  'trophy',
  'scale',
  'gym-bench-press',
  'gym-lat-pulldown',
  'gym-leg-press',
  'gym-dumbbell',
  'gym-shoulder-press',
  'gym-yoga-mat',
  'gym-bike',
  'gym-rest',
  'gym-torso',
  'gym-biceps',
  'gym-abs',
  'gym-weightlifting',
  'gym-deadlift',
  'gym-curls',
  'gym-pushups',
  'gym-plank',
  'gym-stretching',
  'gym-triceps',
  'gym-hamstrings',
  'gym-calves',
] as const;

export function isRoutineIconName(value: unknown): value is RoutineIconName {
  return typeof value === 'string' && (ROUTINE_ICON_NAMES as readonly string[]).includes(value);
}

export interface RoutineAppearance {
  icon?: RoutineIconName;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  exercises: Exercise[];
  days?: DayKey[];
  appearance?: RoutineAppearance;
}

export interface GymSession {
  id: string;
  date: string;
  exercises: Exercise[];
  weekLabel?: string;
  status?: 'active' | 'completed';
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface GymRevision {
  counter: number;
  deviceId: string;
}

export interface GymSyncMetadata {
  version: 2;
  clock: number;
  fields: Record<string, GymRevision>;
  tombstones: Record<string, GymRevision>;
}

export type GymTimerKind = 'set' | 'exercise';

export interface GymActiveTimer {
  endsAt: number;
  durationSeconds: number;
  sessionId?: string;
  exerciseId?: string | null;
  setId?: string | null;
  kind?: GymTimerKind;
  exerciseIndex?: number;
  targetExerciseIndex?: number;
  minimized?: boolean;
  pausedAt?: number | null;
  remainingSecondsWhenPaused?: number | null;
}

export interface GymSettings {
  restBetweenSetsSeconds?: number;
  restBetweenExercisesSeconds?: number;
  autoTimerEnabled?: boolean;
  showQuickRestAdjustments?: boolean;
  allowManualRestEditing?: boolean;
}

export interface Gym {
  weight: WeightPoint[];
  measurements: MeasurementPoint[];
  sessions: GymSession[];
  routineTemplates: RoutineTemplate[];
  restDays?: string[];
  activeTimer?: GymActiveTimer | null;
  settings?: GymSettings;
  _sync?: GymSyncMetadata;
}

export interface Subject {
  id: string;
  name: string;
  updatedAt?: number;
  createdAt?: number;
}

export interface Exam {
  id: string;
  title?: string;
  subjectId?: string | null;
  date: string;
  time?: string | null;
  status: 'pendiente' | 'aprobado' | 'desaprobado';
  grade?: string | null;
  updatedAt?: number;
  createdAt?: number;
}

export interface StudyLog {
  id: string;
  date: string;
  minutes: number;
  subjectId?: string | null;
  subjectName?: string | null;
  sessionId?: string | null;
  updatedAt?: number;
  createdAt?: number;
}

export type StudySessionPhase = 'focus' | 'short_break' | 'long_break';

export interface StudyActiveSession {
  id: string;
  targetSubjectId?: string | null;
  targetSubjectName?: string | null;
  plannedMinutes: number;
  startedAt: number;
  status: 'running' | 'paused' | 'completed_pending_review';
  endsAt?: number | null;
  remainingSeconds: number;
  lastTickAt: number;
  elapsedMinutes?: number;
  phase?: StudySessionPhase;
  cycle?: number;
  totalCycles?: number;
  focusMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
}

export interface Study {
  subjects: Subject[];
  exams: Exam[];
  studyLog: StudyLog[];
  activeSession?: StudyActiveSession | null;
}

export interface StreamSession {
  id: string;
  date: string;
  hours: number;
}

export interface StreamChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface StreamContentPipelineItem {
  id: string;
  title: string;
  status: 'idea' | 'outline' | 'recording' | 'editing' | 'published';
  note?: string;
  updatedAt?: string;
}

export interface Streaming {
  sessions: StreamSession[];
  monthlyGoal: number;
  preStreamChecklist?: StreamChecklistItem[];
  contentPipeline?: StreamContentPipelineItem[];
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

export type JobApplicationType = 'convencional' | 'concurso';

export type JobApplicationStatus =
  | 'cv_enviado' | 'pendiente' | 'entrevista' | 'oferta' | 'rechazado' | 'contratado'
  | 'pendiente_inscripcion' | 'inscripto' | 'sorteo_preseleccion' | 'prueba_evaluacion'
  | 'esperando_resultados' | 'lista_prelacion' | 'ingreso_confirmado' | 'no_seleccionado';

export interface JobApplication {
  id: string;
  /** Missing on legacy records; those are treated as conventional employment. */
  tipo?: JobApplicationType;
  empresa: string;
  puesto: string;
  estado: JobApplicationStatus;
  fecha: string;
  reclutador?: string;
  notas?: string;
  link?: string;
  nextAction?: string;
  nextActionDate?: string;
  sourceOpportunityId?: string | null;
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
  /** Currency captured when buying; absent on legacy items unless linked transaction proves it. */
  purchaseCurrency?: string;
  buyDate: string;
  sellPrice?: number | null;
  /** Currency captured when selling; never inferred from the current account currency. */
  saleCurrency?: string;
  sellDate?: string | null;
  status: 'comprado' | 'vendido';
  financeTxId?: string | null;
  purchaseTxId?: string | null;
  purchaseAccountId?: string | null;
  saleTxId?: string | null;
  saleAccountId?: string | null;
  feeTxId?: string | null;
  fees?: number;
  shippingCost?: number;
  platformFees?: number;
  taxes?: number;
  note?: string;
  sourceOpportunityId?: string | null;
}

export interface Resale {
  opportunities: ResaleOpportunity[];
  inventory: ResaleItem[];
  commercial?: CommercialSet;
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
  /** Optional local time. Existing all-day events remain untimed. */
  time?: string;
  type: 'cumpleanos' | 'estreno' | 'importante' | 'otro' | 'aniversario' | 'reunion' | 'cita' | 'tramite' | 'viaje' | 'recordatorio';
  recurring: boolean;
  linkedTaskId?: string;
  linkedType?: 'task' | 'study' | 'gym' | 'custom';
}

export type GoalLinkedSource = 'weight' | 'available' | 'gym_sessions' | 'study_hours' | 'resale_profit' | 'net_worth';

export interface Goal {
  id: string;
  name: string;
  initial: number;
  target: number;
  current: number;
  linked?: GoalLinkedSource | null;
}

export interface ProjectTask {
  id: string;
  text: string;
  done: boolean;
  dueDate?: string;
  priority?: 'alta' | 'media' | 'baja';
  effort?: EffortLevel;
  dependsOn?: string[];
}

export type ProjectStatus = 'activo' | 'en_pausa' | 'completado' | 'cancelado';

export interface Project {
  id: string;
  name: string;
  objective: string;
  status: ProjectStatus;
  nextStep: string;
  tasks: ProjectTask[];
  blockers?: string;
  reviewDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InboxItem {
  id: string;
  text: string;
  createdAt: string;
  source?: 'quick-capture' | 'voice' | 'manual';
  notes?: string;
  updatedAt?: string;
}

export interface Postit {
  id: string;
  text: string;
  title?: string;
  date: string;
  pinned?: boolean;
  archived?: boolean;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
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

export interface PossessionItem {
  id: string;
  name: string;
  category: string;
  location?: string;
  receivedAt?: string | null;
  note?: string;
}

export interface Notes {
  postits: Postit[];
  shopping: ShoppingItem[];
  links: UsefulLink[];
  possessions: PossessionItem[];
}

export type AttentionDismissalStatus = 'dismissed' | 'active';

export interface AttentionDismissalRecord {
  status: AttentionDismissalStatus;
  updatedAt: number;
}

export interface Settings {
  darkMode: boolean;
  lastBackupAt?: string | null;
  hiddenTabs: string[];
  lastWeeklyReviewAt?: string | null;
  privacyMode?: boolean;
  onboardingCompleted?: boolean;
  contextOptionalFactors?: ContextOptionalFactorKey[];
  dismissedAttentionKeys?: string[];
  attentionDismissals?: Record<string, AttentionDismissalRecord>;
}

export interface CheckoutLogDay {
  trainedSkipped?: boolean;
  studiedSkipped?: boolean;
  expensesSkipped?: boolean;
  closedAt?: string;
  dailyNote?: string;
  reflectionPostitId?: string;
  sleepHours?: number;
  energyLevel?: number;
}

export interface LifeOSState {
  schemaVersion?: number;
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
  projects?: Project[];
  inbox?: InboxItem[];
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
