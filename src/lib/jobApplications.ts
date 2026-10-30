import { JobApplication, JobApplicationStatus, JobApplicationType } from '../types';

export type JobTypeFilter = JobApplicationType | 'todos';

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
    { id: 'cv_enviado', label: 'CV enviado', colorClass: 'border-blue-300 dark:border-blue-800', dotColor: 'bg-blue-500', badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' },
    { id: 'entrevista', label: 'Entrevista', colorClass: 'border-amber-300 dark:border-amber-800', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' },
    { id: 'oferta', label: 'Oferta recibida', colorClass: 'border-emerald-300 dark:border-emerald-800', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' },
    { id: 'contratado', label: 'Contratado', colorClass: 'border-teal-300 dark:border-teal-800', dotColor: 'bg-teal-500', badgeBg: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20' },
    { id: 'rechazado', label: 'Rechazado', colorClass: 'border-rose-300 dark:border-rose-800', dotColor: 'bg-rose-500', badgeBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20' },
  ],
  concurso: [
    { id: 'pendiente_inscripcion', label: 'Pendiente de inscripción', colorClass: 'border-slate-300 dark:border-slate-700', dotColor: 'bg-slate-400', badgeBg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20' },
    { id: 'inscripto', label: 'Inscripto', colorClass: 'border-blue-300 dark:border-blue-800', dotColor: 'bg-blue-500', badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20' },
    { id: 'sorteo_preseleccion', label: 'Sorteo / Preselección', colorClass: 'border-violet-300 dark:border-violet-800', dotColor: 'bg-violet-500', badgeBg: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20' },
    { id: 'prueba_evaluacion', label: 'Prueba / Evaluación', colorClass: 'border-amber-300 dark:border-amber-800', dotColor: 'bg-amber-500', badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20' },
    { id: 'esperando_resultados', label: 'Esperando resultados', colorClass: 'border-cyan-300 dark:border-cyan-800', dotColor: 'bg-cyan-500', badgeBg: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20' },
    { id: 'lista_prelacion', label: 'Lista de prelación', colorClass: 'border-indigo-300 dark:border-indigo-800', dotColor: 'bg-indigo-500', badgeBg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20' },
    { id: 'ingreso_confirmado', label: 'Ingreso confirmado', colorClass: 'border-emerald-300 dark:border-emerald-800', dotColor: 'bg-emerald-500', badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' },
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
  reason?: 'invalid_status' | 'missing_record';
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

  if (editingId) {
    const index = applications.findIndex((application) => application.id === editingId);
    if (index < 0) return { applications, saved: false, reason: 'missing_record' };
    const updated = applications.slice();
    updated[index] = { ...applications[index], ...draft, id: applications[index].id };
    return { applications: updated, saved: true };
  }

  return { applications: [...applications, { ...draft, id: createId() }], saved: true };
}
