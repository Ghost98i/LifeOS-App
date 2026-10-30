import React, { useEffect, useState } from 'react';
import { JobApplication, JobApplicationType } from '../types';
import { fmtDate, todayISO } from '../lib/storage';
import { filterJobApplications, JOB_STAGES, getJobStageLabel } from '../lib/jobApplications';
import { AppIcon } from './AppIcon';

interface JobKanbanBoardProps {
  applications: JobApplication[];
  tipo: JobApplicationType;
  onSetEstado: (id: string, newEstado: JobApplication['estado']) => void;
  onEditApplication: (application: JobApplication) => void;
  onDeleteApplication: (id: string) => void;
}

export const JobKanbanBoard: React.FC<JobKanbanBoardProps> = ({
  applications,
  tipo,
  onSetEstado,
  onEditApplication,
  onDeleteApplication,
}) => {
  const columns = JOB_STAGES[tipo];
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<JobApplication['estado'] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<JobApplication['estado']>(() =>
    columns.find(column => applications.some(application => application.estado === column.id))?.id ?? columns[0].id);

  useEffect(() => {
    if (!columns.some((column) => column.id === selectedStage)) {
      setSelectedStage(columns.find(column => applications.some(application => application.estado === column.id))?.id ?? columns[0].id);
    }
  }, [columns, selectedStage, applications]);

  const filteredApps = filterJobApplications(applications, tipo).filter((app) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.empresa.toLowerCase().includes(q) ||
      app.puesto.toLowerCase().includes(q) ||
      (app.reclutador && app.reclutador.toLowerCase().includes(q)) ||
      (app.nextAction && app.nextAction.toLowerCase().includes(q))
    );
  });

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedAppId(id);
  };

  const handleDragEnd = () => {
    setDraggedAppId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, colId: JobApplication['estado']) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = (colId: JobApplication['estado']) => {
    if (dragOverColumn === colId) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, colId: JobApplication['estado']) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedAppId;
    if (id) {
      onSetEstado(id, colId);
    }
    setDraggedAppId(null);
    setDragOverColumn(null);
  };

  const today = todayISO();
  const activeStage = columns.find((column) => column.id === selectedStage) || columns[0];
  const activeStageApplications = filteredApps.filter((application) => application.estado === activeStage.id);
  const allActiveStageApplications = applications.filter((application) => application.estado === activeStage.id);

  return (
    <div className="space-y-3">
      {/* Kanban Controls Bar */}
      <div className="flex flex-col items-stretch justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por empresa, puesto..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-faint)] focus:border-[var(--blue)] focus:outline-hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-faint)] hover:text-[var(--text)]"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
          <span className="inline-flex items-center gap-1 font-medium">
            <AppIcon name="filter" className="h-3.5 w-3.5" />
            <span>Total:</span>
            <strong className="tabular-nums text-[var(--text)]">{filteredApps.length}</strong>
          </span>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        <label className="block text-xs font-semibold text-[var(--text-soft)]" htmlFor="job-mobile-stage">
          Etapa del tablero
          <select
            id="job-mobile-stage"
            aria-label="Etapa del tablero"
            value={activeStage.id}
            onChange={(event) => setSelectedStage(event.target.value as JobApplication['estado'])}
            className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--text)]"
          >
            {columns.map((column) => {
              const count = filteredApps.filter((application) => application.estado === column.id).length;
              return <option key={column.id} value={column.id}>{column.label} ({count})</option>;
            })}
          </select>
        </label>

        <section className={`rounded-2xl border bg-[var(--bg-elevated)] ${activeStage.colorClass}`} aria-label={`Etapa ${activeStage.label}`}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
            <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-[var(--text)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${activeStage.dotColor}`} />
              <span className="truncate">{activeStage.label}</span>
            </h3>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${activeStage.badgeBg}`}>
              {activeStageApplications.length}
            </span>
          </div>
          <div className="space-y-2.5 p-2.5">
            {activeStageApplications.map((app) => {
              const isFollowupDue = Boolean(app.nextActionDate && app.nextActionDate <= today);
              return (
                <article key={app.id} className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xs">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h4 className="truncate text-sm font-bold text-[var(--text)]">{app.empresa}</h4>
                        {app.link && <a href={app.link} target="_blank" rel="noreferrer" className="shrink-0 text-[var(--blue)]" title={tipo === 'concurso' ? 'Abrir publicación o bases' : 'Abrir publicación de la vacante'}><AppIcon name="external-link" className="h-3.5 w-3.5" /></a>}
                      </div>
                      <p className="break-words text-xs font-medium text-[var(--text-soft)]">{app.puesto}</p>
                    </div>
                    <button type="button" onClick={() => onDeleteApplication(app.id)} className="min-h-10 min-w-10 shrink-0 rounded-lg text-[var(--text-faint)] hover:bg-red-500/10 hover:text-red-500" aria-label={`Eliminar postulación de ${app.empresa}`} title="Eliminar postulación">✕</button>
                  </div>

                  {(app.reclutador || app.notas) && <div className="mt-2 space-y-1 text-xs text-[var(--text-soft)]">
                    {app.reclutador && <p className="break-words">Contacto: {app.reclutador}</p>}
                    {app.notas && <p className="break-words text-xs text-[var(--text-faint)]">{app.notas}</p>}
                  </div>}
                  {(app.nextAction || app.nextActionDate) && <div className={`mt-2.5 flex min-w-0 items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${isFollowupDue ? 'border border-red-500/30 bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'}`}>
                    <span className="min-w-0 break-words">⏰ {app.nextAction || 'Seguimiento'}</span>
                    {app.nextActionDate && <span className="shrink-0 text-xs font-bold tabular-nums">{fmtDate(app.nextActionDate)}</span>}
                  </div>}

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs">
                    <span className="shrink-0 tabular-nums text-[var(--text-faint)]">{fmtDate(app.fecha)}</span>
                    <button type="button" onClick={() => onEditApplication(app)} className="min-h-10 rounded-lg px-3 font-semibold text-[var(--blue)] hover:bg-[var(--surface-muted)]">Editar</button>
                  </div>
                  <select value={app.estado} onChange={(event) => onSetEstado(app.id, event.target.value as JobApplication['estado'])} aria-label={`Cambiar estado de ${app.empresa}`} className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm font-semibold text-[var(--text)]">
                    {columns.map((stage) => <option key={stage.id} value={stage.id}>{getJobStageLabel(tipo, stage.id)}</option>)}
                  </select>
                </article>
              );
            })}
            {activeStageApplications.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-5 text-center text-sm text-[var(--text-faint)]">
                {allActiveStageApplications.length > 0 ? 'No hay coincidencias con la búsqueda.' : 'Sin postulaciones en esta etapa.'}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Panorama with one localized scroll area; mobile uses the stage selector above. */}
      <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-2 touch-pan-x lg:block">
        <div className="grid w-full min-w-0 grid-flow-col auto-cols-[minmax(240px,1fr)] items-start gap-3">
        {columns.map((col) => {
          const colApps = filteredApps.filter((a) => a.estado === col.id);
          const isDropTarget = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => handleDragLeave(col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex min-h-[220px] flex-col rounded-2xl border transition-all duration-150 max-h-[780px] overflow-hidden bg-[var(--bg-elevated)] ${
                isDropTarget
                  ? 'border-[var(--blue)] ring-2 ring-[var(--blue)]/30 bg-[var(--blue-soft)]/20'
                  : 'border-[var(--border)]'
              }`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${col.dotColor}`} />
                  <h3 className="font-bold text-xs tracking-tight text-[var(--text)]">
                    {col.label}
                  </h3>
                  <span
                    className={`rounded-full border px-1.5 py-0.2 tabular-nums text-xs font-bold ${col.badgeBg}`}
                  >
                    {colApps.length}
                  </span>
                </div>

              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                {colApps.map((app) => {
                  const isBeingDragged = draggedAppId === app.id;
                  const isFollowupDue =
                    app.nextActionDate && app.nextActionDate <= today;

                  return (
                    <div
                      key={app.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, app.id)}
                      onDragEnd={handleDragEnd}
                      className={`group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-xs hover:border-[var(--blue)]/60 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing ${
                        isBeingDragged ? 'opacity-40 scale-95' : ''
                      }`}
                    >
                      {/* Card Header: Company, Link & Menu */}
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                          <h4 className="truncate font-bold text-xs sm:text-sm text-[var(--text)]">
                              {app.empresa}
                            </h4>
                            {app.link && (
                              <a
                                href={app.link}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[var(--blue)] hover:opacity-80 transition-opacity"
                                title={tipo === 'concurso' ? 'Abrir publicación o bases' : 'Abrir publicación de la vacante'}
                              >
                                <AppIcon name="external-link" className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <p className="truncate text-xs font-medium text-[var(--text-soft)]">
                            {app.puesto}
                          </p>

                        </div>

                        {/* Quick Delete */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteApplication(app.id);
                          }}
                          className="min-h-9 min-w-9 rounded-md p-1 text-[var(--text-faint)] hover:bg-red-500/10 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          aria-label={`Eliminar postulación de ${app.empresa}`}
                          title="Eliminar postulación"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Recruiter / Notes / Metadata */}
                      <div className="mt-2 space-y-1 text-xs text-[var(--text-soft)]">
                        {app.reclutador && (
                          <div className="flex items-center gap-1 text-[var(--text-faint)]">
                            <AppIcon name="user" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{app.reclutador}</span>
                          </div>
                        )}
                        {app.notas && (
                          <p className="line-clamp-2 italic text-[var(--text-faint)] text-xs">
                            {app.notas}
                          </p>
                        )}
                      </div>

                      {/* Next Action & Followup date */}
                      {(app.nextAction || app.nextActionDate) && (
                          <div
                            className={`mt-2.5 flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                              isFollowupDue
                                ? 'bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400'
                                : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                            }`}
                            title="Seguimiento asociado a esta postulación"
                          >
                            <span className="truncate flex-1">
                              ⏰ {app.nextAction || 'Seguimiento'}
                            </span>
                            {app.nextActionDate && (
                              <span className="tabular-nums text-xs font-bold shrink-0 ml-1">
                                {fmtDate(app.nextActionDate)}
                              </span>
                            )}
                          </div>
                      )}

                      {/* Card Footer: Date & Stage selector */}
                      <div className="mt-2.5 border-t border-[var(--border)] pt-2 text-xs">
                        <span className="tabular-nums text-[var(--text-faint)]">
                          {fmtDate(app.fecha)}
                        </span>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditApplication(app);
                            }}
                            className="min-h-9 rounded-md px-2 py-1 text-[var(--blue)] hover:bg-[var(--surface-muted)]"
                            title="Editar postulación"
                          >
                            Editar
                          </button>
                          {/* Stage Fast Mover Dropdown */}
                          <select
                            value={app.estado}
                            onChange={(e) => {
                              e.stopPropagation();
                              onSetEstado(app.id, e.target.value as JobApplication['estado']);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Cambiar estado de ${app.empresa}`}
                            className="min-h-10 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 font-bold text-xs text-[var(--text)] outline-hidden cursor-pointer"
                          >
                            {columns.map((stage) => <option key={stage.id} value={stage.id}>{getJobStageLabel(tipo, stage.id)}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colApps.length === 0 && (
                  <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--text-faint)]">
                    <span>Sin postulaciones</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
};
