import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  Columns3,
  ExternalLink,
  Landmark,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { JobApplication, JobApplicationType, JobKeyDate, JobKeyDateKind, LifeOSState } from '../types';
import { todayISO, fmtDate, uid } from '../lib/storage';
import { jobStats } from '../lib/calculations';
import { JobKanbanBoard } from './JobKanbanBoard';
import { PageHeader } from './PageHeader';
import { ContextualHelp } from './ContextualHelp';
import { SurfaceCard } from './ui/SurfacePrimitives';
import { showToast } from '../lib/toast';
import { focusTargetElement } from '../lib/navigationFocus';
import {
  filterJobApplications,
  getJobApplicationType,
  getJobStageLabel,
  getNextJobKeyDate,
  getSafeJobHref,
  hasAdvancedJobDetails,
  isJobStatusForType,
  JOB_KEY_DATE_KINDS,
  JOB_KEY_DATE_LABELS,
  JOB_SOURCE_SUGGESTIONS,
  JOB_STAGES,
  JobApplicationDraft,
  JobTypeFilter,
  normalizeJobKeyDates,
  normalizeJobUrl,
  saveJobApplication,
} from '../lib/jobApplications';

export type TrabajoViewMode = 'kanban' | 'table';

export function resolveTrabajoViewTransition(
  currentProcess: JobTypeFilter,
  nextViewMode: TrabajoViewMode
): { viewMode: TrabajoViewMode; processType: JobTypeFilter; autoSwitchedProcess: boolean } {
  if (nextViewMode === 'kanban' && currentProcess === 'todos') {
    return { viewMode: 'kanban', processType: 'convencional', autoSwitchedProcess: true };
  }
  return { viewMode: nextViewMode, processType: currentProcess, autoSwitchedProcess: false };
}

export function resolveTrabajoProcessTransition(
  currentViewMode: TrabajoViewMode,
  nextProcess: JobTypeFilter
): { viewMode: TrabajoViewMode; processType: JobTypeFilter } {
  if (nextProcess === 'todos' && currentViewMode === 'kanban') {
    return { viewMode: 'table', processType: 'todos' };
  }
  return { viewMode: currentViewMode, processType: nextProcess };
}

interface TrabajoViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  initialFocusId?: string | null;
  focusNonce?: number;
  /** Optional initial form visibility (for deterministic testing). */
  initialFormOpen?: boolean;
  /** Optional initial form type when initialFormOpen is true. */
  initialFormType?: JobApplicationType;
  /** Optional initial view mode (for deterministic testing). */
  initialViewMode?: TrabajoViewMode;
  /** Optional initial process filter (for deterministic testing). */
  initialProcessType?: JobTypeFilter;
}

const NO_JOB_APPLICATIONS: JobApplication[] = [];

const CLEAN_CONTROL_FOCUS =
  'trabajo-clean-input outline-none focus:outline-none focus-visible:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/40';

const CLEAN_TAB_FOCUS =
  'trabajo-clean-focus outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

const emptyForm = (tipo: JobApplicationType = 'convencional'): JobApplicationDraft => ({
  tipo,
  empresa: '',
  puesto: '',
  estado: tipo === 'concurso' ? 'inscripto' : 'cv_enviado',
  fecha: todayISO(),
  source: '',
  reclutador: '',
  notas: '',
  followUpNotes: '',
  link: '',
  nextAction: '',
  nextActionDate: '',
  keyDates: [],
});

const defaultProcessTypeForApplications = (applications: JobApplication[]): JobTypeFilter =>
  applications.length > 0 && applications.every((application) => getJobApplicationType(application) === 'concurso')
    ? 'concurso'
    : 'convencional';

export const TrabajoView: React.FC<TrabajoViewProps> = ({
  state,
  onUpdateState,
  initialFocusId,
  focusNonce,
  initialFormOpen = false,
  initialFormType,
  initialViewMode = 'kanban',
  initialProcessType,
}) => {
  const applications = state.jobs?.applications || NO_JOB_APPLICATIONS;
  const [viewMode, setViewMode] = useState<TrabajoViewMode>(initialViewMode);
  const [processType, setProcessType] = useState<JobTypeFilter>(
    () => initialProcessType ?? defaultProcessTypeForApplications(applications)
  );
  const [processTypeChosen, setProcessTypeChosen] = useState(Boolean(initialProcessType));
  const [formOpen, setFormOpen] = useState(initialFormOpen);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobApplicationDraft>(() =>
    emptyForm(
      initialFormType ??
        ((initialProcessType ?? defaultProcessTypeForApplications(applications)) === 'concurso'
          ? 'concurso'
          : 'convencional')
    )
  );
  const [newKeyDateKind, setNewKeyDateKind] = useState<JobKeyDateKind>('entrevista');
  const [newKeyDateValue, setNewKeyDateValue] = useState<string>('');
  const [newKeyDateTime, setNewKeyDateTime] = useState<string>('');
  const [newKeyDateNote, setNewKeyDateNote] = useState<string>('');
  const [tableSearch, setTableSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [linkError, setLinkError] = useState('');
  const today = todayISO();

  const focusedAppId = initialFocusId?.startsWith('job-app-')
    ? initialFocusId.slice('job-app-'.length)
    : null;

  useEffect(() => {
    if (!focusedAppId) return;
    const target = applications.find((a) => a.id === focusedAppId);
    if (!target) return;
    const targetTipo = getJobApplicationType(target);
    if (processType !== 'todos' && processType !== targetTipo) {
      setProcessType(targetTipo);
      setProcessTypeChosen(true);
    }
    const desktopEl = typeof document !== 'undefined' ? document.getElementById(`job-app-${focusedAppId}`) : null;
    const useMobile =
      viewMode === 'kanban' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      !window.matchMedia('(min-width: 1024px)').matches &&
      (!desktopEl || desktopEl.getClientRects().length === 0);
    return focusTargetElement(useMobile ? `job-app-mobile-${focusedAppId}` : `job-app-${focusedAppId}`);
  }, [focusedAppId, focusNonce, applications, processType, viewMode]);

  // If persisted data arrives after the view mounts, choose a useful initial pipeline only
  // until the user has made a process selection of their own.
  useEffect(() => {
    if (
      !processTypeChosen &&
      applications.length > 0 &&
      applications.every((application) => getJobApplicationType(application) === 'concurso')
    ) {
      setProcessType('concurso');
    }
  }, [applications, processTypeChosen]);

  const scopedApplications = filterJobApplications(applications, processType);
  const stats = jobStats(state, processType);
  const nextWeek = new Date(`${today}T12:00:00`);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekISO = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;
  const relevantFollowups = scopedApplications
    .filter((application) => application.nextActionDate && application.nextActionDate <= nextWeekISO)
    .sort((a, b) => (a.nextActionDate || '').localeCompare(b.nextActionDate || ''));
  const visibleApplications = scopedApplications.filter((application) => {
    const query = tableSearch.trim().toLocaleLowerCase();
    return (
      !query ||
      [
        application.empresa,
        application.puesto,
        application.estado,
        application.source,
        application.reclutador,
        application.notas,
        application.followUpNotes,
        application.nextAction,
      ].some((value) => value?.toLocaleLowerCase().includes(query))
    );
  });
  const stageCompatible = isJobStatusForType(form.tipo, form.estado);
  const showProcessTypeColumn = processType === 'todos';

  const chooseProcessType = (tipo: JobTypeFilter) => {
    const next = resolveTrabajoProcessTransition(viewMode, tipo);
    setProcessType(next.processType);
    setViewMode(next.viewMode);
    setProcessTypeChosen(true);
  };

  const handleSelectViewMode = (nextMode: TrabajoViewMode) => {
    const next = resolveTrabajoViewTransition(processType, nextMode);
    setViewMode(next.viewMode);
    if (next.autoSwitchedProcess) {
      setProcessType(next.processType);
      setProcessTypeChosen(true);
    }
  };

  const resetNewKeyDateInputs = () => {
    setNewKeyDateKind('entrevista');
    setNewKeyDateValue('');
    setNewKeyDateTime('');
    setNewKeyDateNote('');
  };

  const openCreateForm = (presetType?: JobApplicationType) => {
    const targetType = presetType ?? (processType === 'todos' ? 'convencional' : processType);
    setEditingId(null);
    setForm(emptyForm(targetType));
    setDetailsOpen(false);
    resetNewKeyDateInputs();
    setFormError('');
    setLinkError('');
    setFormOpen(true);
  };

  const openEditForm = (application: JobApplication) => {
    const tipo = getJobApplicationType(application);
    setEditingId(application.id);
    setForm({
      tipo,
      empresa: application.empresa,
      puesto: application.puesto,
      estado: application.estado,
      fecha: application.fecha,
      source: application.source || '',
      reclutador: application.reclutador || '',
      notas: application.notas || '',
      followUpNotes: application.followUpNotes || '',
      link: application.link || '',
      nextAction: application.nextAction || '',
      nextActionDate: application.nextActionDate || '',
      keyDates: normalizeJobKeyDates(application.keyDates),
    });
    setDetailsOpen(hasAdvancedJobDetails(application));
    resetNewKeyDateInputs();
    setFormError('');
    setLinkError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setDetailsOpen(false);
    setEditingId(null);
    resetNewKeyDateInputs();
    setFormError('');
    setLinkError('');
  };

  const handleAddKeyDateToForm = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newKeyDateValue)) {
      setFormError('Elegí una fecha válida (YYYY-MM-DD) para la fecha clave.');
      return;
    }
    const nextItem: JobKeyDate = {
      id: uid(),
      kind: newKeyDateKind,
      date: newKeyDateValue,
      time: newKeyDateTime.trim() || null,
      ...(newKeyDateNote.trim() ? { note: newKeyDateNote.trim() } : {}),
    };
    setForm((prev) => ({
      ...prev,
      keyDates: [...(prev.keyDates || []), nextItem],
    }));
    resetNewKeyDateInputs();
    setFormError('');
  };

  const handleUpdateFormKeyDate = (id: string, patch: Partial<JobKeyDate>) => {
    setForm((prev) => ({
      ...prev,
      keyDates: (prev.keyDates || []).map((kd) => (kd.id === id ? { ...kd, ...patch } : kd)),
    }));
  };

  const handleDeleteFormKeyDate = (id: string) => {
    setForm((prev) => ({
      ...prev,
      keyDates: (prev.keyDates || []).filter((kd) => kd.id !== id),
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.empresa.trim()) return;
    if (!stageCompatible) {
      setFormError(
        'Elegí una etapa válida para el tipo de proceso seleccionado. La etapa anterior se mantiene hasta que confirmes una compatible.'
      );
      return;
    }

    const normalizedLink = normalizeJobUrl(form.link || '');
    if (!normalizedLink.valid) {
      setLinkError('Ingresá un enlace válido (ej.: linkedin.com/jobs/... o https://...).');
      return;
    }
    setLinkError('');

    const draft: JobApplicationDraft = {
      ...form,
      empresa: form.empresa.trim(),
      puesto: form.puesto.trim(),
      link: normalizedLink.url,
      source: form.source?.trim() || '',
      reclutador: form.reclutador?.trim() || '',
      followUpNotes: form.followUpNotes?.trim() || '',
      keyDates: normalizeJobKeyDates(form.keyDates),
    };
    const saved = onUpdateState((stateDraft) => {
      if (!stateDraft.jobs) stateDraft.jobs = { opportunities: [], applications: [] };
      if (!stateDraft.jobs.applications) stateDraft.jobs.applications = [];
      const result = saveJobApplication(stateDraft.jobs.applications, draft, editingId, uid);
      if (result.saved) stateDraft.jobs.applications = result.applications;
    });
    if (saved === false) {
      setFormError('No se pudo guardar. Conservamos los datos para que puedas reintentar.');
      return;
    }

    if (processType !== 'todos') chooseProcessType(form.tipo);
    closeForm();
  };

  const handleSetEstado = (id: string, estado: JobApplication['estado']) => {
    onUpdateState((draft) => {
      const application = (draft.jobs?.applications || []).find((candidate) => candidate.id === id);
      if (application && isJobStatusForType(getJobApplicationType(application), estado)) application.estado = estado;
    });
  };

  const handleDeleteApplication = (id: string) => {
    const existing = (state.jobs?.applications || []).find((candidate) => candidate.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = onUpdateState((draft) => {
      if (draft.jobs) draft.jobs.applications = (draft.jobs.applications || []).filter((application) => application.id !== id);
    });
    if (saved === false || !snapshot) return;
    showToast(`Postulación en "${snapshot.empresa}" eliminada.`, 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (
          onUpdateState((draft) => {
            if (!draft.jobs) draft.jobs = { opportunities: [], applications: [] };
            if (!draft.jobs.applications) draft.jobs.applications = [];
            if (!draft.jobs.applications.some((item) => item.id === snapshot.id)) {
              draft.jobs.applications.unshift({ ...snapshot });
            }
          }) !== false
        ) {
          showToast('Postulación restaurada.', 'success');
        }
      },
    });
  };

  const fieldClass = `w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] ${CLEAN_CONTROL_FOCUS}`;
  const compactFieldClass = `min-h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] ${CLEAN_CONTROL_FOCUS}`;
  const compactCardFieldClass = `min-h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] ${CLEAN_CONTROL_FOCUS}`;
  const labelClass = 'mb-1 block text-xs font-semibold text-[var(--text-soft)]';
  const typeLabel = (tipo: JobApplicationType) => (tipo === 'concurso' ? 'Concurso público' : 'Empleo convencional');

  return (
    <div className="product-refinement space-y-5">
      <PageHeader
        title="Trabajo y empleo"
        actions={
          applications.length > 0 ? (
            <button
              id="qa-focus-trabajo"
              type="button"
              onClick={() => openCreateForm()}
              className={`flex min-h-11 items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[#4338CA] cursor-pointer ${CLEAN_TAB_FOCUS}`}
            >
              <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span>Nueva postulación</span>
            </button>
          ) : undefined
        }
      />

      {applications.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:hidden">
            <div className="flex flex-col justify-between gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5">
              <span className="block text-xs font-semibold text-[var(--text-faint)]">Postulaciones</span>
              <span className="text-lg font-extrabold tabular-nums text-[var(--text)]">{scopedApplications.length}</span>
            </div>
            <div className="flex flex-col justify-between gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5">
              <span className="block text-xs font-semibold text-[var(--text-faint)]">Seguimientos hoy</span>
              <span
                className={`text-lg font-extrabold tabular-nums ${
                  stats.seguimientosPendientes ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text)]'
                }`}
              >
                {stats.seguimientosPendientes}
              </span>
            </div>
          </div>

          <details className="group rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 lg:hidden">
            <summary
              className={`flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg text-xs font-semibold text-[var(--text-soft)] transition-colors hover:text-[var(--text)] [&::-webkit-details-marker]:hidden ${CLEAN_TAB_FOCUS}`}
            >
              <ChevronRight
                className="h-4 w-4 shrink-0 text-[#4F46E5] transition-transform duration-200 group-open:rotate-90 dark:text-[#818CF8]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Ver otras métricas</span>
            </summary>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5 border-t border-[var(--border)] pt-2.5">
              {processType === 'convencional' && (
                <>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">CV enviados</span>
                    <strong className="text-sm tabular-nums text-[var(--text)]">{stats.cvEnviados}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">Entrevistas</span>
                    <strong className="text-sm tabular-nums text-[var(--text)]">{stats.entrevistas}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">Empresas</span>
                    <strong className="text-sm tabular-nums text-[var(--text)]">{stats.empresas}</strong>
                  </div>
                </>
              )}
              {processType === 'concurso' && (
                <>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">Inscripciones avanzadas</span>
                    <strong className="text-sm tabular-nums text-[var(--text)]">{stats.inscripciones}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">Ingresos confirmados</span>
                    <strong
                      className={`text-sm tabular-nums ${
                        stats.ingresosConfirmados ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text)]'
                      }`}
                    >
                      {stats.ingresosConfirmados}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">Organismos</span>
                    <strong className="text-sm tabular-nums text-[var(--text)]">{stats.empresas}</strong>
                  </div>
                </>
              )}
              {processType === 'todos' && (
                <>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">CV enviados · empleo</span>
                    <strong className="text-sm tabular-nums text-[var(--text)]">{stats.cvEnviados}</strong>
                  </div>
                  <div>
                    <span className="block text-xs text-[var(--text-faint)]">Inscripciones · concursos</span>
                    <strong className="text-sm tabular-nums text-[var(--text)]">{stats.inscripciones}</strong>
                  </div>
                </>
              )}
            </div>
          </details>

          <div className="hidden grid-cols-2 gap-2 lg:grid lg:grid-cols-4 lg:gap-3">
            {processType === 'convencional' && (
              <>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">CV enviados</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.cvEnviados}</div>
                </div>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">Entrevistas</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.entrevistas}</div>
                </div>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">Empresas</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.empresas}</div>
                </div>
              </>
            )}
            {processType === 'concurso' && (
              <>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">Inscripciones avanzadas</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.inscripciones}</div>
                </div>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">Ingresos confirmados</span>
                  <div
                    className={`mt-1 text-2xl font-extrabold tabular-nums ${
                      stats.ingresosConfirmados ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--text)]'
                    }`}
                  >
                    {stats.ingresosConfirmados}
                  </div>
                </div>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">Organismos</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.empresas}</div>
                </div>
              </>
            )}
            {processType === 'todos' && (
              <>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">CV enviados · empleo</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.cvEnviados}</div>
                </div>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">Inscripciones · concursos</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.inscripciones}</div>
                </div>
                <div className="lifeos-stat-card flex flex-col justify-between">
                  <span className="text-xs font-semibold text-[var(--text-faint)]">Procesos</span>
                  <div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">
                    {scopedApplications.length}
                  </div>
                </div>
              </>
            )}
            <div className="lifeos-stat-card flex flex-col justify-between">
              <span className="text-xs font-semibold text-[var(--text-faint)]">Seguimientos para hoy o vencidos</span>
              <div
                className={`mt-1 text-2xl font-extrabold tabular-nums ${
                  stats.seguimientosPendientes ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--text)]'
                }`}
              >
                {stats.seguimientosPendientes}
              </div>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <SurfaceCard as="section" className="p-4 sm:p-5" aria-labelledby="job-form-title">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <h2 id="job-form-title" className="text-base font-bold text-[var(--text)]">
              {editingId ? 'Editar postulación' : 'Nueva postulación'}
            </h2>
            <button
              type="button"
              onClick={closeForm}
              aria-label="Cerrar formulario"
              title="Cerrar formulario"
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] cursor-pointer ${CLEAN_TAB_FOCUS}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>
              Tipo de proceso
              <select
                value={form.tipo}
                onChange={(e) => {
                  const nextTipo = e.target.value as JobApplicationType;
                  const nextEstado = !editingId ? (nextTipo === 'concurso' ? 'inscripto' : 'cv_enviado') : form.estado;
                  setForm({ ...form, tipo: nextTipo, estado: nextEstado });
                  setFormError('');
                }}
                className={`${fieldClass} mt-1 cursor-pointer`}
              >
                <option value="convencional">Empleo convencional</option>
                <option value="concurso">Concurso público</option>
              </select>
            </label>

            <label className={labelClass}>
              {form.tipo === 'concurso' ? 'Organismo' : 'Empresa'}
              <input
                required
                autoFocus
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                placeholder={form.tipo === 'concurso' ? 'Ej.: Ministerio de Salud Pública' : 'Ej.: Mercado Libre'}
                className={`${fieldClass} mt-1`}
              />
            </label>

            <label className={labelClass}>
              {form.tipo === 'concurso' ? 'Cargo' : 'Puesto'}
              <input
                value={form.puesto}
                onChange={(e) => setForm({ ...form, puesto: e.target.value })}
                placeholder={form.tipo === 'concurso' ? 'Ej.: Administrativo III' : 'Ej.: Analista'}
                className={`${fieldClass} mt-1`}
              />
            </label>

            <label className={labelClass}>
              Estado actual
              <select
                value={stageCompatible ? form.estado : ''}
                onChange={(e) => {
                  setForm({ ...form, estado: e.target.value as JobApplication['estado'] });
                  setFormError('');
                }}
                className={`${fieldClass} mt-1 cursor-pointer`}
              >
                <option value="" disabled>
                  Elegí una etapa
                </option>
                {JOB_STAGES[form.tipo].map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
              {!stageCompatible && (
                <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                  La etapa guardada pertenece al otro tipo. Seleccioná una etapa compatible; los datos actuales se conservan hasta guardar.
                </span>
              )}
            </label>

            <div className="sm:col-span-2 lg:col-span-1">
              <label className={labelClass}>
                Dónde te postulaste
                <input
                  value={form.source || ''}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="Ej.: LinkedIn, BuscoJobs, Uruguay Concursa"
                  className={`${fieldClass} mt-1`}
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Portales sugeridos">
                {JOB_SOURCE_SUGGESTIONS.map((suggestion) => {
                  const selected = (form.source || '').trim().toLocaleLowerCase('es') === suggestion.toLocaleLowerCase('es');
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm({ ...form, source: suggestion })}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${CLEAN_TAB_FOCUS} ${
                        selected
                          ? 'border-[#4F46E5] bg-[#4F46E5] text-white shadow-2xs dark:border-[#818CF8]/60 dark:bg-[#4F46E5] dark:text-white'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:border-[#4F46E5]/50 hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:hover:border-[#818CF8]/50 dark:hover:bg-indigo-500/15 dark:hover:text-[#818CF8]'
                      }`}
                    >
                      {suggestion}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className={labelClass}>
              Enlace a la publicación <span className="font-normal text-[var(--text-faint)]">(opcional)</span>
              <input
                type="text"
                inputMode="url"
                value={form.link}
                onChange={(e) => {
                  setForm({ ...form, link: e.target.value });
                  if (linkError) setLinkError('');
                }}
                aria-invalid={Boolean(linkError)}
                aria-describedby={linkError ? 'job-link-error' : undefined}
                placeholder="Ej.: linkedin.com/jobs/... o https://…"
                className={`${fieldClass} mt-1${linkError ? ' border-rose-500/70 focus:border-rose-500 focus:ring-rose-500/30' : ''}`}
              />
              {linkError && (
                <span id="job-link-error" role="alert" className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-400">
                  {linkError}
                </span>
              )}
            </label>

            <div className="pt-1 sm:col-span-2 lg:col-span-3">
              <button
                type="button"
                aria-expanded={detailsOpen}
                aria-controls="job-form-advanced-details"
                onClick={() => setDetailsOpen((open) => !open)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text-soft)] transition-colors hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_TAB_FOCUS}`}
              >
                {detailsOpen ? (
                  <ChevronDown className="h-4 w-4 text-[#4F46E5] dark:text-[#818CF8]" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[#4F46E5] dark:text-[#818CF8]" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>Detalles, notas y fechas clave</span>
              </button>
            </div>

            {detailsOpen && (
              <div
                id="job-form-advanced-details"
                className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/35 p-3.5 sm:col-span-2 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-3"
              >
                <label className={labelClass}>
                  Fecha
                  <input
                    type="date"
                    value={form.fecha}
                    onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                    className={`${fieldClass} mt-1`}
                  />
                </label>
                <label className={labelClass}>
                  {form.tipo === 'concurso' ? 'Contacto / referente' : 'Contacto / LinkedIn'}
                  <input
                    value={form.reclutador}
                    onChange={(e) => setForm({ ...form, reclutador: e.target.value })}
                    placeholder="Opcional"
                    className={`${fieldClass} mt-1`}
                  />
                </label>
                <label className={labelClass}>
                  Próxima acción
                  <input
                    value={form.nextAction}
                    onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                    placeholder="Ej.: Consultar por el proceso"
                    className={`${fieldClass} mt-1`}
                  />
                </label>
                <label className={labelClass}>
                  Fecha del seguimiento
                  <input
                    type="date"
                    value={form.nextActionDate}
                    onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })}
                    className={`${fieldClass} mt-1`}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
                  Notas
                  <textarea
                    rows={2}
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    className={`${fieldClass} mt-1 resize-y`}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
                  Notas de seguimiento
                  <textarea
                    rows={2}
                    value={form.followUpNotes || ''}
                    onChange={(e) => setForm({ ...form, followUpNotes: e.target.value })}
                    placeholder="Avances, contactos o próximos pasos de seguimiento…"
                    className={`${fieldClass} mt-1 resize-y`}
                  />
                </label>

                <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 sm:col-span-2 lg:col-span-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--text)]">
                      Fechas clave (inscripción, pruebas, entrevistas)
                    </span>
                    {form.nextActionDate && (
                      <span className="text-[11px] text-[var(--text-soft)]">
                        Seguimiento ({fmtDate(form.nextActionDate)}) se muestra como tipo Otro
                      </span>
                    )}
                  </div>

                  {(form.keyDates || []).length > 0 && (
                    <ul className="space-y-2">
                      {(form.keyDates || []).map((kd) => (
                        <li
                          key={kd.id}
                          className="grid grid-cols-1 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 sm:grid-cols-[130px_140px_110px_1fr_auto]"
                        >
                          <select
                            aria-label="Tipo de fecha clave"
                            value={kd.kind}
                            onChange={(e) => handleUpdateFormKeyDate(kd.id, { kind: e.target.value as JobKeyDateKind })}
                            className={`${compactFieldClass} cursor-pointer`}
                          >
                            {JOB_KEY_DATE_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {JOB_KEY_DATE_LABELS[kind]}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            aria-label="Fecha clave"
                            value={kd.date}
                            onChange={(e) => handleUpdateFormKeyDate(kd.id, { date: e.target.value })}
                            className={compactFieldClass}
                          />
                          <input
                            type="time"
                            aria-label="Hora de fecha clave"
                            value={kd.time || ''}
                            onChange={(e) => handleUpdateFormKeyDate(kd.id, { time: e.target.value || null })}
                            className={compactFieldClass}
                          />
                          <input
                            type="text"
                            aria-label="Nota de fecha clave"
                            value={kd.note || ''}
                            placeholder="Nota opcional"
                            onChange={(e) => handleUpdateFormKeyDate(kd.id, { note: e.target.value })}
                            className={compactFieldClass}
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteFormKeyDate(kd.id)}
                            aria-label="Eliminar fecha clave"
                            title="Eliminar fecha clave"
                            className="trabajo-clean-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-rose-500/10 hover:text-rose-600 outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-rose-400/70 dark:hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[130px_140px_110px_1fr_auto]">
                    <select
                      aria-label="Tipo de nueva fecha clave"
                      value={newKeyDateKind}
                      onChange={(e) => setNewKeyDateKind(e.target.value as JobKeyDateKind)}
                      className={`${compactCardFieldClass} cursor-pointer`}
                    >
                      {JOB_KEY_DATE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {JOB_KEY_DATE_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      aria-label="Nueva fecha clave"
                      value={newKeyDateValue}
                      onChange={(e) => setNewKeyDateValue(e.target.value)}
                      className={compactCardFieldClass}
                    />
                    <input
                      type="time"
                      aria-label="Hora de nueva fecha clave"
                      value={newKeyDateTime}
                      onChange={(e) => setNewKeyDateTime(e.target.value)}
                      className={compactCardFieldClass}
                    />
                    <input
                      type="text"
                      aria-label="Detalle de nueva fecha clave"
                      value={newKeyDateNote}
                      onChange={(e) => setNewKeyDateNote(e.target.value)}
                      placeholder="Ej.: Entrevista técnica / Prueba escrita"
                      className={compactCardFieldClass}
                    />
                    <button
                      type="button"
                      onClick={handleAddKeyDateToForm}
                      className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 text-xs font-bold text-[#4F46E5] transition-colors hover:bg-indigo-500/15 dark:text-[#818CF8] cursor-pointer ${CLEAN_TAB_FOCUS}`}
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Fecha clave</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {formError && (
              <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-300 sm:col-span-2 lg:col-span-3">
                {formError}
              </p>
            )}

            <div className="flex items-end gap-2 border-t border-[var(--border)] pt-3 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                disabled={!stageCompatible}
                className={`min-h-11 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${CLEAN_TAB_FOCUS}`}
              >
                {editingId ? 'Guardar cambios' : 'Agregar postulación'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className={`min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] cursor-pointer ${CLEAN_TAB_FOCUS}`}
              >
                Cancelar
              </button>
            </div>
          </form>
        </SurfaceCard>
      )}

      {applications.length > 0 && (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2.5 text-xs font-semibold text-[var(--text-soft)]">
            <span className="shrink-0">Proceso</span>
            <select
              aria-label="Filtrar por tipo de proceso"
              value={processType}
              onChange={(e) => chooseProcessType(e.target.value as JobTypeFilter)}
              className={`min-h-10 flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)] shadow-2xs sm:flex-none cursor-pointer ${CLEAN_CONTROL_FOCUS}`}
            >
              <option value="convencional">Empleo convencional</option>
              <option value="concurso">Concurso público</option>
              <option value="todos">Todos los procesos (solo en Lista)</option>
            </select>
          </label>

          <div
            role="tablist"
            aria-label="Vista de postulaciones"
            className="grid w-full grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 sm:inline-flex sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'kanban'}
              onClick={() => handleSelectViewMode('kanban')}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors sm:min-h-9 cursor-pointer ${CLEAN_TAB_FOCUS} ${
                viewMode === 'kanban'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)]/70 hover:text-[var(--text)]'
              }`}
            >
              <Columns3 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>Tablero</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'table'}
              onClick={() => handleSelectViewMode('table')}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors sm:min-h-9 cursor-pointer ${CLEAN_TAB_FOCUS} ${
                viewMode === 'table'
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-[var(--text-soft)] hover:bg-[var(--surface-muted)]/70 hover:text-[var(--text)]'
              }`}
            >
              <List className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>Lista</span>
            </button>
          </div>
        </div>
      )}

      {applications.length === 0 ? (
        !formOpen && (
          <SurfaceCard as="section" className="space-y-4 p-6 text-center sm:p-8">
            <div className="mx-auto flex items-center justify-center text-[#4F46E5] dark:text-[#818CF8]">
              <Briefcase className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold tracking-[-0.02em] text-slate-900 dark:text-slate-100">
                Seguí tus postulaciones sin perder el hilo
              </h2>
              <p className="mx-auto max-w-lg text-sm text-slate-500 dark:text-slate-400">
                CV enviado → Entrevista → Oferta / Rechazado
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                id="qa-focus-trabajo"
                type="button"
                onClick={() => openCreateForm('convencional')}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${CLEAN_TAB_FOCUS}`}
              >
                <Briefcase className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Registrar postulación privada</span>
              </button>
              <button
                type="button"
                onClick={() => openCreateForm('concurso')}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-[#4F46E5]/50 hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-transparent dark:text-slate-200 dark:hover:border-[#818CF8]/50 dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_TAB_FOCUS}`}
              >
                <Landmark className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Registrar concurso público</span>
              </button>
            </div>
          </SurfaceCard>
        )
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-1">
            <h2 className="text-base font-bold text-[var(--text)]">
              Postulaciones{' '}
              <span className="ml-1 text-sm font-normal tabular-nums text-[var(--text-soft)]">
                {scopedApplications.length}
              </span>
            </h2>
            <ContextualHelp label="Estados de las postulaciones">
              {processType === 'concurso'
                ? 'Las etapas del llamado no son obligatorias ni secuenciales. «Ingreso confirmado» indica que vas a ingresar al cargo.'
                : processType === 'todos'
                ? 'Cada proceso conserva sus etapas. «Oferta recibida» es una propuesta laboral; «Contratado» e «Ingreso confirmado» indican un ingreso confirmado.'
                : '«Oferta recibida» es una propuesta laboral. «Contratado» indica que el ingreso está confirmado.'}
            </ContextualHelp>
          </div>

          {relevantFollowups.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5 sm:p-4">
              <h3 className="mb-2.5 text-sm font-bold text-[var(--text)]">Próximos seguimientos</h3>
              <ul className="divide-y divide-[var(--border)]">
                {relevantFollowups.map((application) => {
                  const overdue = Boolean(application.nextActionDate && application.nextActionDate < today);
                  return (
                    <li
                      key={application.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text)]">
                          {application.nextAction || 'Seguimiento'} · {application.empresa}
                        </p>
                        <p
                          className={`mt-0.5 text-xs ${
                            overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-[var(--text-soft)]'
                          }`}
                        >
                          {overdue ? 'Vencido' : application.nextActionDate === today ? 'Hoy' : 'Próximo'} ·{' '}
                          {fmtDate(application.nextActionDate || '')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditForm(application)}
                        aria-label={`Editar postulación de ${application.empresa}`}
                        title="Editar postulación"
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-soft)] transition-colors hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_TAB_FOCUS}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {viewMode === 'kanban' && processType === 'todos' ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--text-soft)]">
                Elegí un tipo de proceso para abrir su tablero por etapas:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => chooseProcessType('convencional')}
                  className={`min-h-9 rounded-xl bg-[#4F46E5] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${CLEAN_TAB_FOCUS}`}
                >
                  Empleo convencional
                </button>
                <button
                  type="button"
                  onClick={() => chooseProcessType('concurso')}
                  className={`min-h-9 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[#4F46E5]/50 hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_TAB_FOCUS}`}
                >
                  Concurso público
                </button>
              </div>
            </div>
          ) : viewMode === 'kanban' && scopedApplications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-5 text-center">
              <p className="text-sm text-[var(--text-soft)]">
                Todavía no hay procesos de tipo {processType === 'concurso' ? 'concurso público' : 'empleo convencional'}.
              </p>
            </div>
          ) : viewMode === 'kanban' ? (
            <div className="job-kanban-panorama">
              <JobKanbanBoard
                applications={scopedApplications}
                tipo={processType}
                focusedAppId={focusedAppId}
                onSetEstado={handleSetEstado}
                onEditApplication={openEditForm}
                onDeleteApplication={handleDeleteApplication}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative max-w-sm">
                <label className="sr-only" htmlFor="job-table-search">
                  Buscar postulaciones
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <input
                  id="job-table-search"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Buscar por empresa, puesto o contacto…"
                  className={`${fieldClass} pl-9 pr-8`}
                />
                {tableSearch && (
                  <button
                    type="button"
                    onClick={() => setTableSearch('')}
                    aria-label="Limpiar búsqueda"
                    title="Limpiar búsqueda"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] cursor-pointer ${CLEAN_TAB_FOCUS}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Vista Lista móvil (< sm): tarjetas verticales sin scroll horizontal */}
              <div className="space-y-2.5 sm:hidden" data-job-mobile-list="true">
                {visibleApplications.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--text-faint)]">
                    {scopedApplications.length === 0
                      ? 'No hay postulaciones para este tipo de proceso.'
                      : 'No hay postulaciones que coincidan con esa búsqueda.'}
                  </div>
                ) : (
                  [...visibleApplications]
                    .sort((a, b) => b.fecha.localeCompare(a.fecha))
                    .map((application) => {
                      const tipo = getJobApplicationType(application);
                      const nextKey = getNextJobKeyDate(application, today);
                      const safeHref = getSafeJobHref(application.link);
                      return (
                        <article
                          key={application.id}
                          id={`job-app-mobile-list-${application.id}`}
                          className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h3 className="break-words text-sm font-bold text-[var(--text)]">
                                  {application.empresa}
                                </h3>
                                {application.source && (
                                  <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-soft)]">
                                    {application.source}
                                  </span>
                                )}
                              </div>
                              {application.puesto && (
                                <p className="mt-0.5 break-words text-xs text-[var(--text-soft)]">
                                  {application.puesto}
                                </p>
                              )}
                            </div>
                            {showProcessTypeColumn && (
                              <span
                                data-job-type-badge="true"
                                className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/60 px-2 py-0.5 text-[10px] font-semibold text-[var(--text-soft)]"
                              >
                                {typeLabel(tipo)}
                              </span>
                            )}
                          </div>

                          {(application.nextAction || (nextKey && !nextKey.keyDate.isLegacyNextAction)) && (
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              {nextKey && !nextKey.keyDate.isLegacyNextAction && (
                                <span
                                  className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    nextKey.proximity === 'overdue'
                                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                      : nextKey.proximity === 'today'
                                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                      : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                                  }`}
                                >
                                  {JOB_KEY_DATE_LABELS[nextKey.keyDate.kind]}: {fmtDate(nextKey.keyDate.date)}
                                </span>
                              )}
                              {application.nextAction && (
                                <span className="text-xs text-[var(--text-soft)]">
                                  Seg.: {application.nextAction}
                                  {application.nextActionDate ? ` · ${fmtDate(application.nextActionDate)}` : ''}
                                </span>
                              )}
                            </div>
                          )}

                          <select
                            aria-label={`Estado de ${application.empresa}`}
                            value={application.estado}
                            onChange={(e) => handleSetEstado(application.id, e.target.value as JobApplication['estado'])}
                            className={`min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm font-medium text-[var(--text)] cursor-pointer ${CLEAN_CONTROL_FOCUS}`}
                          >
                            {JOB_STAGES[tipo].map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {getJobStageLabel(tipo, stage.id)}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
                            <div className="flex flex-wrap items-center gap-2.5 text-xs tabular-nums text-[var(--text-faint)]">
                              <span>{fmtDate(application.fecha)}</span>
                              {safeHref && (
                                <a
                                  href={safeHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[#4F46E5] transition-colors hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300"
                                >
                                  <span>Ver publicación</span>
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                </a>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditForm(application)}
                                aria-label={`Editar postulación de ${application.empresa}`}
                                title="Editar postulación"
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_TAB_FOCUS}`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteApplication(application.id)}
                                aria-label={`Eliminar postulación de ${application.empresa}`}
                                title="Eliminar postulación"
                                className="trabajo-clean-focus inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-rose-500/10 hover:text-rose-600 outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-rose-400/70 dark:hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })
                )}
              </div>

              {/* Tabla completa en sm+ y desktop */}
              <div className="hidden overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] sm:block">
                <table
                  className={`w-full border-collapse text-left text-xs ${
                    showProcessTypeColumn ? 'min-w-[900px]' : 'min-w-[780px]'
                  }`}
                >
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs text-[var(--text-faint)]">
                      {showProcessTypeColumn && <th className="px-3.5 py-2.5 font-semibold">Tipo</th>}
                      <th className="px-3.5 py-2.5 font-semibold">Empresa / Organismo</th>
                      <th className="px-3.5 py-2.5 font-semibold">Puesto / Cargo</th>
                      <th className="px-3.5 py-2.5 font-semibold">Estado</th>
                      <th className="px-3.5 py-2.5 font-semibold">Fecha</th>
                      <th className="px-3.5 py-2.5 font-semibold">Contacto</th>
                      <th className="px-3.5 py-2.5 font-semibold">Seguimiento</th>
                      <th className="px-3.5 py-2.5 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {[...visibleApplications]
                      .sort((a, b) => b.fecha.localeCompare(a.fecha))
                      .map((application) => {
                        const tipo = getJobApplicationType(application);
                        const nextKey = getNextJobKeyDate(application, today);
                        const safeHref = getSafeJobHref(application.link);
                        return (
                          <tr key={application.id} id={`job-app-${application.id}`} className="transition-colors hover:bg-[var(--bg)]/50">
                            {showProcessTypeColumn && (
                              <td className="px-3.5 py-3">
                                <span className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-muted)]/60 px-2 py-1 text-xs font-semibold text-[var(--text-soft)]">
                                  {typeLabel(tipo)}
                                </span>
                              </td>
                            )}
                            <td className="px-3.5 py-3 font-bold text-[var(--text)]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{application.empresa}</span>
                                {application.source && (
                                  <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-soft)]">
                                    {application.source}
                                  </span>
                                )}
                                {safeHref && (
                                  <a
                                    href={safeHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-[#4F46E5] transition-colors hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300"
                                  >
                                    <span>Ver publicación</span>
                                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-3.5 py-3 text-[var(--text-soft)]">
                              {application.puesto}
                              {application.notas && (
                                <p className="mt-1 max-w-xs truncate text-xs text-[var(--text-faint)]">
                                  {application.notas}
                                </p>
                              )}
                              {application.followUpNotes && (
                                <p className="mt-1 max-w-xs truncate text-xs text-[var(--text-soft)]">
                                  Seg.: {application.followUpNotes}
                                </p>
                              )}
                            </td>
                            <td className="px-3.5 py-3">
                              <select
                                aria-label={`Estado de ${application.empresa}`}
                                value={application.estado}
                                onChange={(e) =>
                                  handleSetEstado(application.id, e.target.value as JobApplication['estado'])
                                }
                                className={`max-w-[190px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-xs font-medium text-[var(--text)] cursor-pointer ${CLEAN_CONTROL_FOCUS}`}
                              >
                                {JOB_STAGES[tipo].map((stage) => (
                                  <option key={stage.id} value={stage.id}>
                                    {getJobStageLabel(tipo, stage.id)}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3.5 py-3 tabular-nums text-[var(--text-soft)]">
                              {fmtDate(application.fecha)}
                              {nextKey && !nextKey.keyDate.isLegacyNextAction && (
                                <span
                                  className={`mt-1 block w-fit rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    nextKey.proximity === 'overdue'
                                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                      : nextKey.proximity === 'today'
                                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                      : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                                  }`}
                                >
                                  {JOB_KEY_DATE_LABELS[nextKey.keyDate.kind]}: {fmtDate(nextKey.keyDate.date)}
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-3 text-[var(--text-soft)]">{application.reclutador || '—'}</td>
                            <td className="px-3.5 py-3 text-[var(--text-soft)]">
                              {application.nextAction ? (
                                <>
                                  {application.nextAction}
                                  <br />
                                  {application.nextActionDate && fmtDate(application.nextActionDate)}
                                </>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-3 text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditForm(application)}
                                  aria-label={`Editar postulación de ${application.empresa}`}
                                  title="Editar postulación"
                                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_TAB_FOCUS}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteApplication(application.id)}
                                  aria-label={`Eliminar postulación de ${application.empresa}`}
                                  title="Eliminar postulación"
                                  className="trabajo-clean-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-rose-500/10 hover:text-rose-600 outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-rose-400/70 dark:hover:text-rose-400 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {visibleApplications.length === 0 && (
                      <tr>
                        <td
                          colSpan={showProcessTypeColumn ? 8 : 7}
                          className="px-3.5 py-8 text-center text-sm text-[var(--text-faint)]"
                        >
                          {scopedApplications.length === 0
                            ? 'No hay postulaciones para este tipo de proceso.'
                            : 'No hay postulaciones que coincidan con esa búsqueda.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
