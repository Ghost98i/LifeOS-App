import React, { useEffect, useState } from 'react';
import { Clock, ExternalLink, Filter, Pencil, Search, Trash2, User, X } from 'lucide-react';
import { JobApplication, JobApplicationType } from '../types';
import { fmtDate, formatMoney, todayISO } from '../lib/storage';
import { maskFinancialText } from '../lib/financialPrivacy';
import { PrivacyAmount, usePrivacyMode } from './PrivacyAmount';
import {
  filterJobApplications,
  getNextJobKeyDate,
  getSafeJobHref,
  isJobApplicationActive,
  JOB_KEY_DATE_LABELS,
  JOB_STAGES,
  getJobStageLabel,
  type JobKeyDateProximity,
} from '../lib/jobApplications';

interface JobKanbanBoardProps {
  applications: JobApplication[];
  tipo: JobApplicationType;
  focusedAppId?: string | null;
  privacyMode?: boolean;
  onSetEstado: (id: string, newEstado: JobApplication['estado']) => void;
  onEditApplication: (application: JobApplication) => void;
  onDeleteApplication: (id: string) => void;
}

const CLEAN_CONTROL_FOCUS =
  'celestian-clean-field trabajo-clean-input outline-none focus:outline-none focus-visible:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 dark:focus:border-indigo-400 dark:focus:ring-indigo-400/40';

const CLEAN_BUTTON_FOCUS =
  'trabajo-clean-focus outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

const PROXIMITY_STYLE: Record<JobKeyDateProximity, string> = {
  overdue: 'border border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400',
  today: 'border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  soon: 'border border-indigo-500/30 bg-indigo-500/10 text-[#4F46E5] dark:text-indigo-300',
  future: 'bg-[var(--surface-muted)] text-[var(--text-soft)]',
};

function formatProximityBadge(proximity: JobKeyDateProximity, daysUntil: number): string {
  if (proximity === 'overdue') return daysUntil === -1 ? 'Venció ayer' : `Vencida (${Math.abs(daysUntil)} d)`;
  if (proximity === 'today') return 'Hoy';
  if (proximity === 'soon') return daysUntil === 1 ? 'Mañana' : `En ${daysUntil} d`;
  return 'Próxima';
}

export const JobKanbanBoard: React.FC<JobKanbanBoardProps> = ({
  applications,
  tipo,
  focusedAppId,
  privacyMode = false,
  onSetEstado,
  onEditApplication,
  onDeleteApplication,
}) => {
  const contextPrivacy = usePrivacyMode();
  const privacyActive = privacyMode || contextPrivacy;
  const columns = JOB_STAGES[tipo];
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<JobApplication['estado'] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<JobApplication['estado']>(() =>
    columns.find((column) => applications.some((application) => application.estado === column.id))?.id ?? columns[0].id
  );

  useEffect(() => {
    if (!columns.some((column) => column.id === selectedStage)) {
      setSelectedStage(
        columns.find((column) => applications.some((application) => application.estado === column.id))?.id ?? columns[0].id
      );
    }
  }, [columns, selectedStage, applications]);

  useEffect(() => {
    if (!focusedAppId) return;
    const focused = applications.find((a) => a.id === focusedAppId);
    if (focused && columns.some((c) => c.id === focused.estado)) {
      setSelectedStage(focused.estado);
    }
  }, [focusedAppId, applications, columns]);

  const filteredApps = filterJobApplications(applications, tipo).filter((app) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.empresa.toLowerCase().includes(q) ||
      app.puesto.toLowerCase().includes(q) ||
      (app.source && app.source.toLowerCase().includes(q)) ||
      (app.reclutador && app.reclutador.toLowerCase().includes(q)) ||
      (app.followUpNotes && app.followUpNotes.toLowerCase().includes(q)) ||
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
  const activeInProgressCount = filteredApps.filter((app) => isJobApplicationActive(app)).length;

  return (
    <div className="space-y-3">
      {/* Kanban Controls Bar */}
      <div className="flex flex-col items-stretch justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por empresa, puesto..."
            aria-label="Buscar en el tablero"
            className={`min-h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] pl-9 pr-8 py-2 text-xs text-[var(--text)] placeholder-[var(--text-faint)] ${CLEAN_CONTROL_FOCUS}`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] cursor-pointer ${CLEAN_BUTTON_FOCUS}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Filter className="h-3.5 w-3.5 text-[#4F46E5] dark:text-[#818CF8]" strokeWidth={1.75} aria-hidden="true" />
            {searchQuery.trim() ? (
              <>
                <span>Coincidencias:</span>
                <strong className="tabular-nums text-[var(--text)]">{filteredApps.length}</strong>
              </>
            ) : (
              <>
                <span>En curso:</span>
                <strong className="tabular-nums text-[var(--text)]">{activeInProgressCount}</strong>
                <span className="text-[var(--text-faint)]">·</span>
                <span>Total:</span>
                <strong className="tabular-nums text-[var(--text)]">{filteredApps.length}</strong>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Mobile Stage Selector & Stage Column (< lg) */}
      <div className="space-y-3 lg:hidden">
        <label className="block text-xs font-semibold text-[var(--text-soft)]" htmlFor="job-mobile-stage">
          Etapa del tablero
          <select
            id="job-mobile-stage"
            aria-label="Etapa del tablero"
            value={activeStage.id}
            onChange={(event) => setSelectedStage(event.target.value as JobApplication['estado'])}
            className={`mt-1.5 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--text)] cursor-pointer ${CLEAN_CONTROL_FOCUS}`}
          >
            {columns.map((column) => {
              const count = filteredApps.filter((application) => application.estado === column.id).length;
              return (
                <option key={column.id} value={column.id}>
                  {column.label} ({count})
                </option>
              );
            })}
          </select>
        </label>

        <section
          className={`rounded-2xl border bg-[var(--bg-elevated)] overflow-hidden ${activeStage.colorClass}`}
          aria-label={`Etapa ${activeStage.label}`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3.5 py-3">
            <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold text-[var(--text)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${activeStage.dotColor}`} />
              <span className="truncate">{activeStage.label}</span>
            </h3>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${activeStage.badgeBg}`}>
              {activeStageApplications.length}
            </span>
          </div>
          <div className="space-y-3 p-3">
            {activeStageApplications.map((app) => {
              const isFollowupDue = Boolean(app.nextActionDate && app.nextActionDate <= today);
              const nextKey = getNextJobKeyDate(app, today);
              const safeHref = getSafeJobHref(app.link);
              return (
                <article
                  key={app.id}
                  id={`job-app-mobile-${app.id}`}
                  className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 space-y-3 shadow-2xs"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <h4 className="text-sm font-bold leading-snug text-[var(--text)] break-words">{app.empresa}</h4>
                        {safeHref && (
                          <a
                            href={safeHref}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Ver publicación"
                            title={tipo === 'concurso' ? 'Abrir publicación o bases' : 'Abrir publicación de la vacante'}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#4F46E5] transition-colors hover:bg-indigo-500/10 hover:text-[#4338CA] dark:text-[#818CF8] dark:hover:text-indigo-300"
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                      {app.puesto && (
                        <p className="break-words text-xs font-medium text-[var(--text-soft)]">{app.puesto}</p>
                      )}
                      {(app.source || (typeof app.salaryExpectation === 'number' && app.salaryExpectation > 0)) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {app.source && (
                            <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-soft)]">
                              {app.source}
                            </span>
                          )}
                          {typeof app.salaryExpectation === 'number' && app.salaryExpectation > 0 && (
                            <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                              <PrivacyAmount>
                                {formatMoney(app.salaryExpectation, app.salaryCurrency || 'UYU')}
                              </PrivacyAmount>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {(app.reclutador || app.notas || app.followUpNotes) && (
                    <div className="space-y-1 text-xs text-[var(--text-soft)]">
                      {app.reclutador && (
                        <div className="flex items-center gap-1.5 text-[var(--text-faint)]">
                          <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="break-words">{app.reclutador}</span>
                        </div>
                      )}
                      {app.notas && <p className="break-words text-xs text-[var(--text-faint)]">{maskFinancialText(app.notas, privacyActive)}</p>}
                      {app.followUpNotes && (
                        <p className="break-words text-xs text-[var(--text-soft)]">Seguimiento: {maskFinancialText(app.followUpNotes, privacyActive)}</p>
                      )}
                    </div>
                  )}

                  {nextKey && !nextKey.keyDate.isLegacyNextAction && (
                    <div
                      className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${PROXIMITY_STYLE[nextKey.proximity]}`}
                    >
                      <span className="truncate font-semibold">
                        {JOB_KEY_DATE_LABELS[nextKey.keyDate.kind]} · {formatProximityBadge(nextKey.proximity, nextKey.daysUntil)}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums">
                        {fmtDate(nextKey.keyDate.date)}
                        {nextKey.keyDate.time ? ` ${nextKey.keyDate.time}` : ''}
                      </span>
                    </div>
                  )}

                  {(app.nextAction || app.nextActionDate) && (
                    <div
                      className={`flex min-w-0 items-start justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
                        isFollowupDue
                          ? 'border border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5 break-words">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{maskFinancialText(app.nextAction || 'Seguimiento', privacyActive)}</span>
                      </span>
                      {app.nextActionDate && (
                        <span className="shrink-0 text-xs font-bold tabular-nums">{fmtDate(app.nextActionDate)}</span>
                      )}
                    </div>
                  )}

                  <select
                    value={app.estado}
                    onChange={(event) => onSetEstado(app.id, event.target.value as JobApplication['estado'])}
                    aria-label={`Cambiar estado de ${app.empresa}`}
                    className={`min-h-11 sm:min-h-10 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/70 px-3 text-xs font-semibold text-[var(--text)] cursor-pointer ${CLEAN_CONTROL_FOCUS}`}
                  >
                    {columns.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {getJobStageLabel(tipo, stage.id)}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-xs">
                    <span className="shrink-0 tabular-nums text-[var(--text-faint)]">{fmtDate(app.fecha)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onEditApplication(app)}
                        aria-label={`Editar postulación de ${app.empresa}`}
                        title="Editar postulación"
                        className={`inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_BUTTON_FOCUS}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteApplication(app.id)}
                        aria-label={`Eliminar postulación de ${app.empresa}`}
                        title="Eliminar postulación"
                        className="trabajo-clean-focus inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-rose-500/10 hover:text-rose-600 outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-rose-400/70 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
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
                className={`flex min-h-[220px] max-h-[780px] flex-col overflow-hidden rounded-2xl border bg-[var(--bg-elevated)] transition-all duration-150 ${
                  isDropTarget
                    ? 'border-[#4F46E5] bg-indigo-500/10 ring-2 ring-indigo-500/30 dark:border-[#818CF8]'
                    : 'border-[var(--border)]'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${col.dotColor}`} />
                    <h3 className="truncate text-xs font-bold tracking-tight text-[var(--text)]">{col.label}</h3>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${col.badgeBg}`}>
                    {colApps.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 space-y-3 overflow-y-auto p-3">
                  {colApps.map((app) => {
                    const isBeingDragged = draggedAppId === app.id;
                    const isFollowupDue = Boolean(app.nextActionDate && app.nextActionDate <= today);
                    const nextKey = getNextJobKeyDate(app, today);
                    const safeHref = getSafeJobHref(app.link);

                    return (
                      <div
                        key={app.id}
                        id={`job-app-${app.id}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, app.id)}
                        onDragEnd={handleDragEnd}
                        className={`group relative space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-2xs transition-all hover:border-indigo-500/40 hover:shadow-xs dark:hover:border-indigo-400/40 cursor-grab active:cursor-grabbing ${
                          isBeingDragged ? 'scale-95 opacity-40' : ''
                        }`}
                      >
                        {/* Card Header: Company, Link, Role & Source */}
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="line-clamp-2 break-words text-sm font-bold leading-snug text-[var(--text)]">
                              {app.empresa}
                            </h4>
                            {safeHref && (
                              <a
                                href={safeHref}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Ver publicación"
                                title={tipo === 'concurso' ? 'Abrir publicación o bases' : 'Abrir publicación de la vacante'}
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#4F46E5] transition-colors hover:bg-indigo-500/10 hover:text-[#4338CA] dark:text-[#818CF8] dark:hover:text-indigo-300"
                              >
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                            )}
                          </div>
                          {app.puesto && (
                            <p className="line-clamp-2 break-words text-xs font-medium text-[var(--text-soft)]">
                              {app.puesto}
                            </p>
                          )}
                          {(app.source || (typeof app.salaryExpectation === 'number' && app.salaryExpectation > 0)) && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {app.source && (
                                <span className="inline-flex rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-soft)]">
                                  {app.source}
                                </span>
                              )}
                              {typeof app.salaryExpectation === 'number' && app.salaryExpectation > 0 && (
                                <span className="inline-flex rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                  <PrivacyAmount>
                                    {formatMoney(app.salaryExpectation, app.salaryCurrency || 'UYU')}
                                  </PrivacyAmount>
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Recruiter / Notes / Metadata */}
                        {(app.reclutador || app.notas || app.followUpNotes) && (
                          <div className="space-y-1 text-xs text-[var(--text-soft)]">
                            {app.reclutador && (
                              <div className="flex items-center gap-1.5 text-[var(--text-faint)]">
                                <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{app.reclutador}</span>
                              </div>
                            )}
                            {app.notas && (
                              <p className="line-clamp-2 italic text-[var(--text-faint)] text-xs">{maskFinancialText(app.notas, privacyActive)}</p>
                            )}
                            {app.followUpNotes && (
                              <p className="line-clamp-2 text-[var(--text-soft)] text-xs">
                                Seguimiento: {maskFinancialText(app.followUpNotes, privacyActive)}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Próxima fecha clave */}
                        {nextKey && !nextKey.keyDate.isLegacyNextAction && (
                          <div
                            className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${PROXIMITY_STYLE[nextKey.proximity]}`}
                            title={nextKey.keyDate.note || JOB_KEY_DATE_LABELS[nextKey.keyDate.kind]}
                          >
                            <span className="truncate font-semibold">
                              {JOB_KEY_DATE_LABELS[nextKey.keyDate.kind]} · {formatProximityBadge(nextKey.proximity, nextKey.daysUntil)}
                            </span>
                            <span className="shrink-0 text-xs font-bold tabular-nums">
                              {fmtDate(nextKey.keyDate.date)}
                              {nextKey.keyDate.time ? ` ${nextKey.keyDate.time}` : ''}
                            </span>
                          </div>
                        )}

                        {/* Next Action & Followup date */}
                        {(app.nextAction || app.nextActionDate) && (
                          <div
                            className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              isFollowupDue
                                ? 'border border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                            }`}
                            title="Seguimiento asociado a esta postulación"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              <span className="truncate">{maskFinancialText(app.nextAction || 'Seguimiento', privacyActive)}</span>
                            </span>
                            {app.nextActionDate && (
                              <span className="ml-1 shrink-0 text-xs font-bold tabular-nums">
                                {fmtDate(app.nextActionDate)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Stage Fast Mover Dropdown */}
                        <select
                          value={app.estado}
                          onChange={(e) => {
                            e.stopPropagation();
                            onSetEstado(app.id, e.target.value as JobApplication['estado']);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Cambiar estado de ${app.empresa}`}
                          className={`min-h-9 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/70 px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] cursor-pointer ${CLEAN_CONTROL_FOCUS}`}
                        >
                          {columns.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                              {getJobStageLabel(tipo, stage.id)}
                            </option>
                          ))}
                        </select>

                        {/* Card Footer: Date & Unified Pencil / Trash2 Actions */}
                        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-xs">
                          <span className="tabular-nums text-[var(--text-faint)]">{fmtDate(app.fecha)}</span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditApplication(app);
                              }}
                              aria-label={`Editar postulación de ${app.empresa}`}
                              title="Editar postulación"
                              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_BUTTON_FOCUS}`}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteApplication(app.id);
                              }}
                              aria-label={`Eliminar postulación de ${app.empresa}`}
                              title="Eliminar postulación"
                              className="trabajo-clean-focus inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-soft)] transition-colors hover:bg-rose-500/10 hover:text-rose-600 outline-none focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-rose-400/70 dark:hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
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
