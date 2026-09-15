import React, { useState } from 'react';
import { JobApplication } from '../types';
import { fmtDate, ESTADO_LABELS } from '../lib/storage';
import { AppIcon } from './AppIcon';

interface JobKanbanBoardProps {
  applications: JobApplication[];
  onSetEstado: (id: string, newEstado: JobApplication['estado']) => void;
  onSetNextAction: (id: string, nextAction: string) => void;
  onSetNextActionDate: (id: string, nextActionDate: string) => void;
  onDeleteApplication: (id: string) => void;
  onQuickAddInColumn?: (estado: JobApplication['estado']) => void;
}

const KANBAN_COLUMNS: {
  id: JobApplication['estado'];
  label: string;
  colorClass: string;
  dotColor: string;
  badgeBg: string;
}[] = [
  {
    id: 'pendiente',
    label: 'Pendiente',
    colorClass: 'border-slate-300 dark:border-slate-700',
    dotColor: 'bg-slate-400',
    badgeBg: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20',
  },
  {
    id: 'cv_enviado',
    label: 'CV Enviado',
    colorClass: 'border-blue-300 dark:border-blue-800',
    dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  },
  {
    id: 'entrevista',
    label: 'Entrevista',
    colorClass: 'border-amber-300 dark:border-amber-800',
    dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  },
  {
    id: 'oferta',
    label: 'Oferta',
    colorClass: 'border-emerald-300 dark:border-emerald-800',
    dotColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  },
  {
    id: 'rechazado',
    label: 'Rechazado',
    colorClass: 'border-rose-300 dark:border-rose-800',
    dotColor: 'bg-rose-500',
    badgeBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  },
];

export const JobKanbanBoard: React.FC<JobKanbanBoardProps> = ({
  applications,
  onSetEstado,
  onSetNextAction,
  onSetNextActionDate,
  onDeleteApplication,
  onQuickAddInColumn,
}) => {
  const [draggedAppId, setDraggedAppId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<JobApplication['estado'] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  const filteredApps = applications.filter((app) => {
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* Kanban Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
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
            <strong className="font-mono text-[var(--text)]">{applications.length}</strong>
          </span>
          <span className="text-[var(--border)]">|</span>
          <span className="text-[11px] text-[var(--text-faint)] hidden sm:inline">
            Arrastrá las tarjetas para cambiar su estado
          </span>
        </div>
      </div>

      {/* 5-Column Kanban Board Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 items-start overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map((col) => {
          const colApps = filteredApps.filter((a) => a.estado === col.id);
          const isDropTarget = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => handleDragLeave(col.id)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex flex-col rounded-2xl border transition-all duration-150 min-h-[360px] max-h-[780px] overflow-hidden bg-[var(--bg-elevated)] ${
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
                    className={`rounded-full border px-1.5 py-0.2 font-mono text-[10px] font-bold ${col.badgeBg}`}
                  >
                    {colApps.length}
                  </span>
                </div>

                {onQuickAddInColumn && (
                  <button
                    type="button"
                    onClick={() => onQuickAddInColumn(col.id)}
                    className="rounded-md p-1 text-[var(--text-faint)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] transition-colors"
                    title={`Agregar postulación en ${col.label}`}
                  >
                    ＋
                  </button>
                )}
              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
                {colApps.map((app) => {
                  const isBeingDragged = draggedAppId === app.id;
                  const isFollowupDue =
                    app.nextActionDate && app.nextActionDate <= today;
                  const isEditing = editingCardId === app.id;

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
                                title="Abrir enlace de oferta"
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
                          className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-[var(--text-faint)] hover:bg-red-500/10 hover:text-red-500 transition-opacity"
                          title="Eliminar postulación"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Recruiter / Notes / Metadata */}
                      <div className="mt-2 space-y-1 text-[11px] text-[var(--text-soft)]">
                        {app.reclutador && (
                          <div className="flex items-center gap-1 text-[var(--text-faint)]">
                            <AppIcon name="user" className="h-3 w-3 shrink-0" />
                            <span className="truncate">{app.reclutador}</span>
                          </div>
                        )}
                        {app.notas && (
                          <p className="line-clamp-2 italic text-[var(--text-faint)] text-[10px]">
                            {app.notas}
                          </p>
                        )}
                      </div>

                      {/* Next Action & Followup date */}
                      {isEditing ? (
                        <div
                          className="mt-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2 space-y-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
                            Seguimiento
                          </label>
                          <input
                            type="text"
                            value={app.nextAction || ''}
                            onChange={(e) => onSetNextAction(app.id, e.target.value)}
                            placeholder="Acción (ej: mandar mensaje)"
                            className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] outline-hidden"
                          />
                          <input
                            type="date"
                            value={app.nextActionDate || ''}
                            onChange={(e) => onSetNextActionDate(app.id, e.target.value)}
                            className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => setEditingCardId(null)}
                            className="w-full rounded bg-[var(--blue)] py-0.5 text-[10px] font-bold text-white"
                          >
                            Listo
                          </button>
                        </div>
                      ) : (
                        (app.nextAction || app.nextActionDate) && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCardId(app.id);
                            }}
                            className={`mt-2.5 flex items-center justify-between rounded-md px-2 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                              isFollowupDue
                                ? 'bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400'
                                : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                            }`}
                            title="Hacé clic para editar seguimiento"
                          >
                            <span className="truncate flex-1">
                              ⏰ {app.nextAction || 'Seguimiento'}
                            </span>
                            {app.nextActionDate && (
                              <span className="font-mono text-[9px] font-bold shrink-0 ml-1">
                                {fmtDate(app.nextActionDate)}
                              </span>
                            )}
                          </div>
                        )
                      )}

                      {/* Card Footer: Date & Stage selector */}
                      <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex items-center justify-between gap-1 text-[10px]">
                        <span className="font-mono text-[var(--text-faint)]">
                          {fmtDate(app.fecha)}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCardId(isEditing ? null : app.id);
                            }}
                            className="text-[var(--text-faint)] hover:text-[var(--text)] px-1 py-0.5"
                            title="Editar seguimiento"
                          >
                            {app.nextAction ? '✏' : '＋seg.'}
                          </button>
                          {/* Stage Fast Mover Dropdown */}
                          <select
                            value={app.estado}
                            onChange={(e) => {
                              e.stopPropagation();
                              onSetEstado(app.id, e.target.value as JobApplication['estado']);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-bold text-[10px] text-[var(--text)] outline-hidden cursor-pointer"
                          >
                            {Object.entries(ESTADO_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                → {v}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {colApps.length === 0 && (
                  <div className="flex h-28 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--text-faint)]">
                    <span>Sin postulaciones</span>
                    {onQuickAddInColumn && (
                      <button
                        type="button"
                        onClick={() => onQuickAddInColumn(col.id)}
                        className="mt-1 text-[11px] font-medium text-[var(--blue)] hover:underline"
                      >
                        ＋ Agregar aquí
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
