import React, { useEffect, useState } from 'react';
import { JobApplication, JobApplicationType, LifeOSState } from '../types';
import { todayISO, fmtDate, uid } from '../lib/storage';
import { jobStats } from '../lib/calculations';
import { JobKanbanBoard } from './JobKanbanBoard';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { ContextualHelp } from './ContextualHelp';
import {
  filterJobApplications,
  getJobApplicationType,
  getJobStageLabel,
  isJobStatusForType,
  JOB_STAGES,
  JobApplicationDraft,
  JobTypeFilter,
  saveJobApplication,
} from '../lib/jobApplications';

interface TrabajoViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
}

const NO_JOB_APPLICATIONS: JobApplication[] = [];

const emptyForm = (tipo: JobApplicationType = 'convencional'): JobApplicationDraft => ({
  tipo,
  empresa: '',
  puesto: '',
  estado: tipo === 'concurso' ? 'pendiente_inscripcion' : 'pendiente',
  fecha: todayISO(),
  reclutador: '',
  notas: '',
  link: '',
  nextAction: '',
  nextActionDate: '',
});

const initialProcessType = (applications: JobApplication[]): JobTypeFilter =>
  applications.length > 0 && applications.every((application) => getJobApplicationType(application) === 'concurso')
    ? 'concurso'
    : 'convencional';

export const TrabajoView: React.FC<TrabajoViewProps> = ({ state, onUpdateState }) => {
  const applications = state.jobs?.applications || NO_JOB_APPLICATIONS;
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [processType, setProcessType] = useState<JobTypeFilter>(() => initialProcessType(applications));
  const [processTypeChosen, setProcessTypeChosen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<JobApplicationDraft>(() => emptyForm(initialProcessType(applications) === 'concurso' ? 'concurso' : 'convencional'));
  const [tableSearch, setTableSearch] = useState('');
  const [formError, setFormError] = useState('');
  const today = todayISO();

  // If persisted data arrives after the view mounts, choose a useful initial pipeline only
  // until the user has made a process selection of their own.
  useEffect(() => {
    if (!processTypeChosen && applications.length > 0 && applications.every((application) => getJobApplicationType(application) === 'concurso')) {
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
    return !query || [application.empresa, application.puesto, application.estado, application.reclutador, application.notas, application.nextAction]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
  const stageCompatible = isJobStatusForType(form.tipo, form.estado);

  const chooseProcessType = (tipo: JobTypeFilter) => {
    setProcessType(tipo);
    setProcessTypeChosen(true);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(emptyForm(processType === 'todos' ? 'convencional' : processType));
    setFormError('');
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
      reclutador: application.reclutador || '',
      notas: application.notas || '',
      link: application.link || '',
      nextAction: application.nextAction || '',
      nextActionDate: application.nextActionDate || '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.empresa.trim()) return;
    if (!stageCompatible) {
      setFormError('Elegí una etapa válida para el tipo de proceso seleccionado. La etapa anterior se mantiene hasta que confirmes una compatible.');
      return;
    }

    const draft: JobApplicationDraft = {
      ...form,
      empresa: form.empresa.trim(),
      puesto: form.puesto.trim(),
      reclutador: form.reclutador.trim(),
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
    onUpdateState((draft) => {
      if (draft.jobs) draft.jobs.applications = (draft.jobs.applications || []).filter((application) => application.id !== id);
    });
  };

  const fieldClass = 'w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] outline-hidden focus:border-[var(--blue)]';
  const labelClass = 'mb-1 block text-xs font-semibold text-[var(--text-soft)]';
  const typeLabel = (tipo: JobApplicationType) => tipo === 'concurso' ? 'Concurso público' : 'Empleo convencional';

  return (
    <div className="product-refinement space-y-5">
      <PageHeader
        title="Trabajo y empleo"
        actions={
          <button id="qa-focus-trabajo" type="button" onClick={openCreateForm} className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--blue)] px-4 py-2 text-sm font-bold text-white shadow-xs transition-colors hover:bg-[var(--blue-hover)]">
            <AppIcon name="plus" className="h-4 w-4" /> Nueva postulación
          </button>
        }
      />

      {applications.length > 0 && (
        <>
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <span className="block text-xs font-semibold text-[var(--text-faint)]">Postulaciones</span>
            <span className="text-lg font-extrabold tabular-nums text-[var(--text)]">{scopedApplications.length}</span>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
            <span className="block text-xs font-semibold text-[var(--text-faint)]">Seguimientos vencidos o de hoy</span>
            <span className={`text-lg font-extrabold tabular-nums ${stats.seguimientosPendientes ? 'text-red-500' : 'text-[var(--text)]'}`}>{stats.seguimientosPendientes}</span>
          </div>
        </div>
        <details className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 lg:hidden">
          <summary className="min-h-8 cursor-pointer content-center text-xs font-semibold text-[var(--text-soft)]">Ver otras métricas</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {processType === 'convencional' && <>
              <div><span className="block text-xs text-[var(--text-faint)]">CV enviados</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.cvEnviados}</strong></div>
              <div><span className="block text-xs text-[var(--text-faint)]">Entrevistas</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.entrevistas}</strong></div>
              <div><span className="block text-xs text-[var(--text-faint)]">Empresas</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.empresas}</strong></div>
            </>}
            {processType === 'concurso' && <>
              <div><span className="block text-xs text-[var(--text-faint)]">Inscripciones avanzadas</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.inscripciones}</strong></div>
              <div><span className="block text-xs text-[var(--text-faint)]">Ingresos confirmados</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.ingresosConfirmados}</strong></div>
              <div><span className="block text-xs text-[var(--text-faint)]">Organismos</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.empresas}</strong></div>
            </>}
            {processType === 'todos' && <>
              <div><span className="block text-xs text-[var(--text-faint)]">CV enviados · empleo</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.cvEnviados}</strong></div>
              <div><span className="block text-xs text-[var(--text-faint)]">Inscripciones · concursos</span><strong className="text-sm tabular-nums text-[var(--text)]">{stats.inscripciones}</strong></div>
            </>}
          </div>
        </details>

        <div className="hidden grid-cols-2 gap-2 lg:grid lg:grid-cols-4 lg:gap-3">
          {processType === 'convencional' && <>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">CV enviados</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.cvEnviados}</div></div>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Entrevistas</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.entrevistas}</div></div>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Empresas</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.empresas}</div></div>
          </>}
          {processType === 'concurso' && <>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Inscripciones avanzadas</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.inscripciones}</div></div>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Ingresos confirmados</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.ingresosConfirmados}</div></div>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Organismos</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.empresas}</div></div>
          </>}
          {processType === 'todos' && <>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">CV enviados · empleo</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.cvEnviados}</div></div>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Inscripciones · concursos</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{stats.inscripciones}</div></div>
            <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Procesos</span><div className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text)]">{scopedApplications.length}</div></div>
          </>}
          <div className="lifeos-stat-card"><span className="text-xs font-semibold text-[var(--text-faint)]">Seguimientos para hoy o vencidos</span><div className={`mt-1 text-2xl font-extrabold tabular-nums ${stats.seguimientosPendientes ? 'text-red-500' : 'text-[var(--text)]'}`}>{stats.seguimientosPendientes}</div></div>
        </div>
        </>
      )}

      {formOpen && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5" aria-labelledby="job-form-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="job-form-title" className="text-base font-bold text-[var(--text)]">{editingId ? 'Editar postulación' : 'Nueva postulación'}</h2>
            <button type="button" onClick={closeForm} className="min-h-10 rounded-lg px-3 text-sm text-[var(--text-soft)] hover:bg-[var(--surface-muted)]">Cerrar</button>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>Tipo de proceso<select value={form.tipo} onChange={(e) => { setForm({ ...form, tipo: e.target.value as JobApplicationType }); setFormError(''); }} className={`${fieldClass} mt-1`}><option value="convencional">Empleo convencional</option><option value="concurso">Concurso público</option></select></label>
            <label className={labelClass}>{form.tipo === 'concurso' ? 'Organismo' : 'Empresa'}<input required autoFocus value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder={form.tipo === 'concurso' ? 'Ej.: Ministerio de Salud Pública' : 'Ej.: Scotiabank'} className={`${fieldClass} mt-1`} /></label>
            <label className={labelClass}>{form.tipo === 'concurso' ? 'Cargo' : 'Puesto'}<input value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value })} placeholder={form.tipo === 'concurso' ? 'Ej.: Administrativo III' : 'Ej.: Analista'} className={`${fieldClass} mt-1`} /></label>
            <label className={labelClass}>Estado<select value={stageCompatible ? form.estado : ''} onChange={(e) => { setForm({ ...form, estado: e.target.value as JobApplication['estado'] }); setFormError(''); }} className={`${fieldClass} mt-1`}><option value="" disabled>Elegí una etapa</option>{JOB_STAGES[form.tipo].map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select>{!stageCompatible && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">La etapa guardada pertenece al otro tipo. Seleccioná una etapa compatible; los datos actuales se conservan hasta guardar.</span>}</label>
            <label className={labelClass}>Fecha<input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={`${fieldClass} mt-1`} /></label>
            <label className={labelClass}>{form.tipo === 'concurso' ? 'Contacto / referente' : 'Contacto / LinkedIn'}<input value={form.reclutador} onChange={(e) => setForm({ ...form, reclutador: e.target.value })} placeholder="Opcional" className={`${fieldClass} mt-1`} /></label>
            <label className={labelClass}>Enlace a la publicación<input type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" className={`${fieldClass} mt-1`} /></label>
            <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>Notas<textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} className={`${fieldClass} mt-1 resize-y`} /></label>
            <label className={labelClass}>Próxima acción<input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} placeholder="Ej.: Consultar por el proceso" className={`${fieldClass} mt-1`} /></label>
            <label className={labelClass}>Fecha del seguimiento<input type="date" value={form.nextActionDate} onChange={(e) => setForm({ ...form, nextActionDate: e.target.value })} className={`${fieldClass} mt-1`} /></label>
            {formError && <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-300 sm:col-span-2 lg:col-span-3">{formError}</p>}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
              <button type="submit" disabled={!stageCompatible} className="min-h-11 rounded-xl bg-[var(--blue)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--blue-hover)] disabled:cursor-not-allowed disabled:opacity-50">{editingId ? 'Guardar cambios' : 'Agregar postulación'}</button>
              <button type="button" onClick={closeForm} className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)]">Cancelar</button>
            </div>
          </form>
        </section>
      )}

      <div className="space-y-2">
        <div className="flex w-full items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1 sm:ml-auto sm:w-fit">
          <button type="button" onClick={() => setViewMode('kanban')} aria-pressed={viewMode === 'kanban'} className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold sm:flex-none ${viewMode === 'kanban' ? 'bg-[var(--card)] text-[var(--text)] shadow-xs' : 'text-[var(--text-soft)]'}`}><span className="inline-flex items-center justify-center gap-1.5"><AppIcon name="dashboard" className="h-3.5 w-3.5" /> Tablero</span></button>
          <button type="button" onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'} className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold sm:flex-none ${viewMode === 'table' ? 'bg-[var(--card)] text-[var(--text)] shadow-xs' : 'text-[var(--text-soft)]'}`}><span className="inline-flex items-center justify-center gap-1.5"><AppIcon name="list" className="h-3.5 w-3.5" /> Lista / Tabla</span></button>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text-soft)]">Proceso<select aria-label="Filtrar por tipo de proceso" value={processType} onChange={(e) => chooseProcessType(e.target.value as JobTypeFilter)} className="min-h-10 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"><option value="convencional">Empleo convencional</option><option value="concurso">Concurso público</option><option value="todos">Todos los procesos (solo en Lista)</option></select></label>
      </div>

      {applications.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-5 py-10 text-center sm:py-14">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-muted)] text-[var(--blue)]"><AppIcon name="briefcase" className="h-6 w-6" /></div>
          <h2 className="text-lg font-bold text-[var(--text)]">Tu búsqueda empieza acá</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-soft)]">Registrá una postulación laboral o un concurso público con su etapa y próximo seguimiento.</p>
          {!formOpen && <button type="button" onClick={openCreateForm} className="mt-5 min-h-11 rounded-xl bg-[var(--blue)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--blue-hover)]">Crear primera postulación</button>}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center gap-1"><h2 className="text-base font-bold text-[var(--text)]">Postulaciones <span className="ml-1 text-sm font-normal text-[var(--text-soft)]">{scopedApplications.length}</span></h2><ContextualHelp label="Estados de las postulaciones">{processType === 'concurso' ? 'Las etapas del llamado no son obligatorias ni secuenciales. «Ingreso confirmado» indica que vas a ingresar al cargo.' : processType === 'todos' ? 'Cada proceso conserva sus etapas. «Oferta recibida» es una propuesta laboral; «Contratado» e «Ingreso confirmado» indican un ingreso confirmado.' : '«Oferta recibida» es una propuesta laboral. «Contratado» indica que el ingreso está confirmado.'}</ContextualHelp></div>

          {relevantFollowups.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
              <h3 className="mb-2 text-sm font-bold text-[var(--text)]">Próximos seguimientos</h3>
              <ul className="divide-y divide-[var(--border)]">
                {relevantFollowups.map((application) => {
                  const overdue = Boolean(application.nextActionDate && application.nextActionDate < today);
                  return <li key={application.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text)]">{application.nextAction || 'Seguimiento'} · {application.empresa}</p><p className={`mt-0.5 text-xs ${overdue ? 'font-semibold text-red-500' : 'text-[var(--text-soft)]'}`}>{overdue ? 'Vencido' : application.nextActionDate === today ? 'Hoy' : 'Próximo'} · {fmtDate(application.nextActionDate || '')}</p></div><button type="button" onClick={() => openEditForm(application)} className="min-h-10 shrink-0 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-muted)]">Ver / editar</button></li>;
                })}
              </ul>
            </div>
          )}

          {viewMode === 'kanban' && processType === 'todos' ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-5 text-sm text-[var(--text-soft)]">
              El tablero muestra un solo tipo de proceso para mantener sus etapas claras. Elegí Empleo convencional o Concurso público, o abrí Lista / Tabla para verlos juntos.
            </div>
          ) : viewMode === 'kanban' && scopedApplications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-4 text-center">
              <p className="text-sm text-[var(--text-soft)]">Todavía no hay procesos de tipo {processType === 'concurso' ? 'concurso público' : 'empleo convencional'}.</p>
            </div>
          ) : viewMode === 'kanban' ? (
            <div className="job-kanban-panorama">
              <JobKanbanBoard applications={scopedApplications} tipo={processType} onSetEstado={handleSetEstado} onEditApplication={openEditForm} onDeleteApplication={handleDeleteApplication} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="max-w-sm"><label className="sr-only" htmlFor="job-table-search">Buscar postulaciones</label><input id="job-table-search" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Buscar por empresa, puesto o contacto…" className={fieldClass} /></div>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                  <thead><tr className="border-b border-[var(--border)] text-xs text-[var(--text-faint)]"><th className="px-3 py-2.5">Tipo</th><th className="px-3 py-2.5">Empresa / Organismo</th><th className="px-3 py-2.5">Puesto / Cargo</th><th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Fecha</th><th className="px-3 py-2.5">Contacto</th><th className="px-3 py-2.5">Seguimiento</th><th className="px-3 py-2.5">Acciones</th></tr></thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visibleApplications.sort((a, b) => b.fecha.localeCompare(a.fecha)).map((application) => {
                      const tipo = getJobApplicationType(application);
                      return <tr key={application.id} className="hover:bg-[var(--bg)]/50"><td className="px-3 py-3"><span className="inline-flex rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--text-soft)]">{typeLabel(tipo)}</span></td><td className="px-3 py-3 font-bold text-[var(--text)]">{application.empresa}{application.link && <a href={application.link} target="_blank" rel="noreferrer" className="ml-2 whitespace-nowrap text-[var(--blue)] hover:underline">Ver publicación ↗</a>}</td><td className="px-3 py-3 text-[var(--text-soft)]">{application.puesto}{application.notas && <p className="mt-1 max-w-xs truncate text-xs text-[var(--text-faint)]">{application.notas}</p>}</td><td className="px-3 py-3"><select aria-label={`Estado de ${application.empresa}`} value={application.estado} onChange={(e) => handleSetEstado(application.id, e.target.value as JobApplication['estado'])} className="max-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text)]">{JOB_STAGES[tipo].map((stage) => <option key={stage.id} value={stage.id}>{getJobStageLabel(tipo, stage.id)}</option>)}</select></td><td className="px-3 py-3 tabular-nums text-[var(--text-soft)]">{fmtDate(application.fecha)}</td><td className="px-3 py-3 text-[var(--text-soft)]">{application.reclutador || '—'}</td><td className="px-3 py-3 text-[var(--text-soft)]">{application.nextAction ? <>{application.nextAction}<br />{application.nextActionDate && fmtDate(application.nextActionDate)}</> : '—'}</td><td className="whitespace-nowrap px-3 py-3"><button type="button" onClick={() => openEditForm(application)} className="min-h-10 rounded-lg px-2 text-xs font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)]">Editar</button><button type="button" onClick={() => handleDeleteApplication(application.id)} className="min-h-10 rounded-lg px-2 text-xs text-[var(--text-faint)] hover:text-red-500" aria-label={`Eliminar postulación de ${application.empresa}`}>Eliminar</button></td></tr>;
                    })}
                    {visibleApplications.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-[var(--text-faint)]">{scopedApplications.length === 0 ? 'No hay postulaciones para este tipo de proceso.' : 'No hay postulaciones que coincidan con esa búsqueda.'}</td></tr>}
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
