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
}

export type AgendaWeek = Record<DayKey, AgendaBlock[]>;

export interface TaskRecurring {
  id: string;
  name: string;
  freq: 'daily' | '2-3x' | 'weekly';
  days?: DayKey[];
  effort?: EffortLevel;
}

export interface TodayExtra {
  id: string;
  date: string;
  text: string;
  done: boolean;
  priority: 'alta' | 'media' | 'baja';
  effort?: EffortLevel;
}

export interface DailyPriority {
  id: string;
  date: string;
  text: string;
  done?: boolean;
  rank?: number;
}

export interface DailyContextEntry {
  date: string;
  sleepHours: number | null;
  energy: number | null;
  mood: number | null;
  connection: number | string | null;
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
  origin?: 'manual' | 'adjustment' | 'reventa' | 'quick-capture' | 'quick' | 'resale_purchase' | 'resale_sale';
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

export interface GymSet {
  id: string;
  weight: number;
  reps: number;
  completedAt?: string | null;
  completed?: boolean;
  rpe?: number;
}

export type ExerciseEquipment = 'barra' | 'mancuerna' | 'polea' | 'maquina' | 'corporal';

export interface Exercise {
  id?: string;
  name: string;
  equipment?: ExerciseEquipment;
  weight?: number;
  barWeight?: number;
  reps?: string;
  muscleGroup?: MuscleGroup | string;
  sets: GymSet[];
  restSeconds?: number;
  timerEnabled?: boolean;
  legacyReps?: string | null;
}

export interface RoutineTemplate {
  id: string;
  name: string;
  exercises: Exercise[];
  days?: DayKey[];
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

export interface Gym {
  weight: WeightPoint[];
  measurements: MeasurementPoint[];
  sessions: GymSession[];
  routineTemplates: RoutineTemplate[];
  restDays?: string[];
  activeTimer?: any;
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
  buyDate: string;
  sellPrice?: number | null;
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

export interface ProjectTask {
  id: string;
  text: string;
  done: boolean;
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

export interface Settings {
  darkMode: boolean;
  lastBackupAt?: string | null;
  hiddenTabs: string[];
  lastWeeklyReviewAt?: string | null;
  privacyMode?: boolean;
}

export interface CheckoutLogDay {
  trainedSkipped?: boolean;
  studiedSkipped?: boolean;
  expensesSkipped?: boolean;
  closedAt?: string;
  dailyNote?: string;
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
