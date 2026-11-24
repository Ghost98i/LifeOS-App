import { JobApplication, JobApplicationStatus, JobApplicationType, JobKeyDate, JobKeyDateKind } from '../types';
import { daysBetween, todayISO } from './storage';

export type JobTypeFilter = JobApplicationType | 'todos';

export const JOB_SOURCE_SUGGESTIONS: readonly string[] = [
  'LinkedIn',
  'BuscoJobs',
  'Portal empresa',
  'Uruguay Concursa',
  'Referido',
] as const;

function hasValidWebHostname(hostname: string): boolean {
  if (!hostname || hostname.startsWith('.') || hostname.endsWith('.') || hostname.includes('..')) {
    return false;
  }
  const labels = hostname.split('.');
  if (labels.length < 2) return false;
  if (labels.some((label) => !label || label.startsWith('-') || label.endsWith('-') || !/^[a-z0-9-]+$/i.test(label))) {
    return false;
  }
  const tld = labels[labels.length - 1];
  const isIpv4 = labels.length === 4 && labels.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
  return isIpv4 || /^[a-z]{2,}$/i.test(tld);
}

/**
 * Pure URL normalizer for JobApplication links:
 * - Empty/whitespace -> valid empty string
 * - Contains internal whitespace -> invalid
 * - Starts with http:// or https:// -> validated with URL()
 * - No protocol but valid domain with dot (e.g. `gemini.com`) -> prepends `https://` and validates
 */
export function normalizeJobUrl(raw: string): { url: string; valid: boolean } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { url: '', valid: true };
  if (/\s/.test(trimmed)) return { url: trimmed, valid: false };

  const hasHttpProtocol = /^https?:\/\//i.test(trimmed);
  if (!hasHttpProtocol && /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { url: trimmed, valid: false };
  }

  const candidate = hasHttpProtocol
    ? trimmed.replace(/^https?:\/\//i, (match) => match.toLowerCase())
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url: trimmed, valid: false };
    }
    if (!hasValidWebHostname(parsed.hostname)) {
      return { url: trimmed, valid: false };
    }
    return { url: candidate, valid: true };
  } catch {
    return { url: trimmed, valid: false };
  }
}

/** Returns a safe normalized href for rendering external job links, including legacy URLs without scheme. */
export function getSafeJobHref(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const { url, valid } = normalizeJobUrl(raw);
  return valid && url ? url : null;
}

export function hasAdvancedJobDetails(
  application: Pick<JobApplication, 'reclutador' | 'notas' | 'followUpNotes' | 'nextAction' | 'nextActionDate' | 'keyDates'>
): boolean {
  return Boolean(
    application.reclutador?.trim() ||
    application.notas?.trim() ||
    application.followUpNotes?.trim() ||
    application.nextAction?.trim() ||
    application.nextActionDate?.trim() ||
    (Array.isArray(application.keyDates) && application.keyDates.length > 0)
  );
}

export const JOB_KEY_DATE_KINDS: readonly JobKeyDateKind[] = ['inscripcion', 'prueba', 'entrevista', 'otro'] as const;

export const JOB_KEY_DATE_LABELS: Record<JobKeyDateKind, string> = {
  inscripcion: 'Inscripción',
  prueba: 'Prueba',
  entrevista: 'Entrevista',
  otro: 'Otro',
};

export const CLOSED_JOB_STATUSES: ReadonlySet<JobApplicationStatus> = new Set([
  'rechazado',
  'no_seleccionado',
  'contratado',
  'ingreso_confirmado',
]);

export function isJobApplicationActive(application: Pick<JobApplication, 'estado'>): boolean {
  return !CLOSED_JOB_STATUSES.has(application.estado);
}

export function normalizeJobKeyDates(raw: unknown): JobKeyDate[] {
  if (!Array.isArray(raw)) return [];
  const result: JobKeyDate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<JobKeyDate>;
    const kind = candidate.kind;
    const date = typeof candidate.date === 'string' ? candidate.date.trim().slice(0, 10) : '';
    if (!kind || !(JOB_KEY_DATE_KINDS as readonly string[]).includes(kind)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const time =
      typeof candidate.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.time.trim())
        ? candidate.time.trim()
        : null;
    const note = typeof candidate.note === 'string' && candidate.note.trim() ? candidate.note.trim() : undefined;
    result.push({
      id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `${kind}-${date}-${result.length}`,
      kind,
      date,
      time,
      ...(note ? { note } : {}),
    });
  }
  return result;
}

export interface DisplayJobKeyDate extends JobKeyDate {
  isLegacyNextAction?: boolean;
}

/**
 * Returns structured `keyDates` plus legacy `nextActionDate` (if present) as a virtual `'otro'` entry
 * for display without migrating or deleting `nextActionDate`.
 */
export function getEffectiveJobKeyDates(
  application: Pick<JobApplication, 'keyDates' | 'nextActionDate' | 'nextAction'>,
): DisplayJobKeyDate[] {
  const list: DisplayJobKeyDate[] = normalizeJobKeyDates(application.keyDates).map((kd) => ({ ...kd }));
  const nextDate = typeof application.nextActionDate === 'string' ? application.nextActionDate.trim().slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
    list.push({
      id: 'legacy-next-action',
      kind: 'otro',
      date: nextDate,
      time: null,
      note: application.nextAction?.trim() || 'Seguimiento',
      isLegacyNextAction: true,
    });
  }
  return list.sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));
}

export type JobKeyDateProximity = 'overdue' | 'today' | 'soon' | 'future';

export interface NextJobKeyDateInfo {
  keyDate: DisplayJobKeyDate;
  daysUntil: number;
  proximity: JobKeyDateProximity;
}

/**
 * Returns the earliest key date (showing overdue dates first so past deadlines are never hidden)
 * along with its proximity status relative to `todayIso`.
 */
export function getNextJobKeyDate(
  application: Pick<JobApplication, 'keyDates' | 'nextActionDate' | 'nextAction'>,
  todayIso: string = todayISO(),
): NextJobKeyDateInfo | null {
  const sorted = getEffectiveJobKeyDates(application);
  if (sorted.length === 0) return null;
  const first = sorted[0];
  const daysUntil = daysBetween(todayIso, first.date);
  const proximity: JobKeyDateProximity =
    daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : daysUntil <= 7 ? 'soon' : 'future';
  return { keyDate: first, daysUntil, proximity };
}

export interface JobStagePresentation {
  id: JobApplicationStatus;
  label: string;
  colorClass: string;
  dotColor: string;
  badgeBg: string;
}

export const JOB_STAGES: Record<JobApplicationType, JobStagePresentation[]> = {
  convencional: [
    { id: 'pendiente', label: 'Pendiente', colorClass: 'border-slate-300 dark:border-slate-700', dotColor: 'bg-slate-400', badgeBg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' },
    { id: 'cv_enviado', label: 'CV enviado', colorClass: 'border-indigo-300 dark:border-indigo-500/40', dotColor: 'bg-[#4F46E5] dark:bg-indigo-400', badgeBg: 'bg-indigo-500/10 text-[#4F46E5] dark:text-indigo-300 border-indigo-500/25' },
    { id: 'entrevista', label: 'Entrevista', colorClass: 'border-amber-300 dark:border-amber-800', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' },
    { id: 'oferta', label: 'Oferta recibida', colorClass: 'border-emerald-300 dark:border-emerald-800', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' },
    { id: 'contratado', label: 'Contratado', colorClass: 'border-emerald-300 dark:border-emerald-800', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' },
    { id: 'rechazado', label: 'Rechazado', colorClass: 'border-rose-300 dark:border-rose-800', dotColor: 'bg-rose-500', badgeBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' },
  ],
  concurso: [
    { id: 'pendiente_inscripcion', label: 'Pendiente de inscripción', colorClass: 'border-slate-300 dark:border-slate-700', dotColor: 'bg-slate-400', badgeBg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' },
    { id: 'inscripto', label: 'Inscripto', colorClass: 'border-indigo-300 dark:border-indigo-500/40', dotColor: 'bg-[#4F46E5] dark:bg-indigo-400', badgeBg: 'bg-indigo-500/10 text-[#4F46E5] dark:text-indigo-300 border-indigo-500/25' },
    { id: 'sorteo_preseleccion', label: 'Sorteo / Preselección', colorClass: 'border-indigo-300 dark:border-indigo-500/40', dotColor: 'bg-indigo-400', badgeBg: 'bg-indigo-500/10 text-[#4F46E5] dark:text-indigo-300 border-indigo-500/20' },
    { id: 'prueba_evaluacion', label: 'Prueba / Evaluación', colorClass: 'border-amber-300 dark:border-amber-800', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' },
    { id: 'esperando_resultados', label: 'Esperando resultados', colorClass: 'border-amber-300 dark:border-amber-800', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' },
    { id: 'lista_prelacion', label: 'Lista de prelación', colorClass: 'border-indigo-300 dark:border-indigo-500/40', dotColor: 'bg-[#4F46E5] dark:bg-indigo-400', badgeBg: 'bg-indigo-500/10 text-[#4F46E5] dark:text-indigo-300 border-indigo-500/25' },
    { id: 'ingreso_confirmado', label: 'Ingreso confirmado', colorClass: 'border-emerald-300 dark:border-emerald-800', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' },
    { id: 'no_seleccionado', label: 'No seleccionado', colorClass: 'border-rose-300 dark:border-rose-800', dotColor: 'bg-rose-500', badgeBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' },
  ],
};

export function getJobApplicationType(application: Pick<JobApplication, 'tipo'>): JobApplicationType {
  return application.tipo === 'concurso' ? 'concurso' : 'convencional';
}

export function isJobStatusForType(tipo: JobApplicationType, estado: JobApplicationStatus): boolean {
  return JOB_STAGES[tipo].some((stage) => stage.id === estado);
}

export function getJobStageLabel(tipo: JobApplicationType, estado: JobApplicationStatus): string {
  return JOB_STAGES[tipo].find((stage) => stage.id === estado)?.label || estado;
}

export function filterJobApplications(applications: JobApplication[], filter: JobTypeFilter): JobApplication[] {
  return filter === 'todos'
    ? applications
    : applications.filter((application) => getJobApplicationType(application) === filter);
}

export type JobApplicationDraft = Omit<JobApplication, 'id' | 'sourceOpportunityId' | 'tipo'> & { tipo: JobApplicationType };

export interface SaveJobApplicationResult {
  applications: JobApplication[];
  saved: boolean;
  reason?: 'invalid_status' | 'missing_record' | 'invalid_url';
}

/** Saves an application without dropping legacy fields, IDs, or opportunity links. */
export function saveJobApplication(
  applications: JobApplication[],
  draft: JobApplicationDraft,
  editingId?: string | null,
  createId: () => string = () => `${Date.now()}`
): SaveJobApplicationResult {
  if (!isJobStatusForType(draft.tipo, draft.estado)) {
    return { applications, saved: false, reason: 'invalid_status' };
  }

  const normalizedLink = normalizeJobUrl(draft.link || '');
  if (!normalizedLink.valid) {
    return { applications, saved: false, reason: 'invalid_url' };
  }

  const cleanSource = typeof draft.source === 'string' ? draft.source.trim() : '';
  const normalizedDraft: JobApplicationDraft = {
    ...draft,
    link: normalizedLink.url,
    ...(cleanSource ? { source: cleanSource } : { source: undefined }),
  };

  if (editingId) {
    const index = applications.findIndex((application) => application.id === editingId);
    if (index < 0) return { applications, saved: false, reason: 'missing_record' };
    const updated = applications.slice();
    updated[index] = { ...applications[index], ...normalizedDraft, id: applications[index].id };
    return { applications: updated, saved: true };
  }

  return { applications: [...applications, { ...normalizedDraft, id: createId() }], saved: true };
}
