import React, { useState } from 'react';
import { LifeOSState, DayKey, EffortLevel, TaskRecurring } from '../types';
import {
  DAYS,
  DAY_LABELS,
  FREQ_LABELS,
  TEMPLATE_ESTUDIANTE,
  uid,
} from '../lib/storage';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';

interface AgendaViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const AgendaView: React.FC<AgendaViewProps> = ({ state, onUpdateState }) => {
  const [taskName, setTaskName] = useState('');
  const [taskFreq, setTaskFreq] = useState<'daily' | '2-3x' | 'weekly'>('daily');
  const [taskDays, setTaskDays] = useState<DayKey[]>([]);
  const [taskEffort, setTaskEffort] = useState<EffortLevel>('medium');

  // Editing state for Agenda Block
  const [editingBlock, setEditingBlock] = useState<{
    id: string;
    currentDay: DayKey;
    newDay: DayKey;
    time: string;
    activity: string;
    effort: EffortLevel;
  } | null>(null);

  // Editing state for Recurring Task
  const [editingTask, setEditingTask] = useState<TaskRecurring | null>(null);

  const handleLoadTemplate = () => {
    if (confirm('¿Cargar plantilla sugerida de estudiante? Esto reemplazará tu horario actual.')) {
      onUpdateState((draft) => {
        if (!draft.agenda) draft.agenda = {} as any;
        DAYS.forEach((d) => {
          draft.agenda[d] = TEMPLATE_ESTUDIANTE[d].map((b) => ({
            id: uid(),
            time: b.time,
            activity: b.activity,
            effort: 'medium',
          }));
        });
      });
    }
  };

  const handleClearAgenda = () => {
    if (confirm('¿Vaciar toda la agenda semanal?')) {
      onUpdateState((draft) => {
        if (!draft.agenda) draft.agenda = {} as any;
        DAYS.forEach((d) => {
          draft.agenda[d] = [];
        });
      });
    }
  };

  const handleAddBlock = (day: DayKey) => {
    const time = prompt('Hora (HH:MM):', '09:00');
    if (!time) return;
    const activity = prompt('Actividad:');
    if (!activity) return;
    onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      if (!draft.agenda[day]) draft.agenda[day] = [];
      draft.agenda[day].push({ id: uid(), time, activity, effort: 'medium' });
    });
  };

  const handleDeleteBlock = (day: DayKey, id: string) => {
    onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      if (!draft.agenda[day]) draft.agenda[day] = [];
      draft.agenda[day] = draft.agenda[day].filter((b) => b.id !== id);
    });
  };

  const handleSaveEditedBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBlock || !editingBlock.activity.trim()) return;
    const { id, currentDay, newDay, time, activity, effort } = editingBlock;

    onUpdateState((draft) => {
      if (!draft.agenda) draft.agenda = {} as any;
      if (!draft.agenda[currentDay]) draft.agenda[currentDay] = [];
      if (!draft.agenda[newDay]) draft.agenda[newDay] = [];
      // Remove from current day
      draft.agenda[currentDay] = draft.agenda[currentDay].filter((b) => b.id !== id);
      // Add to new day
      draft.agenda[newDay].push({
        id,
        time: time || '09:00',
        activity: activity.trim(),
        effort,
      });
    });

    setEditingBlock(null);
  };

  const toggleDaySelection = (day: DayKey, list: DayKey[], setList: (d: DayKey[]) => void) => {
    if (list.includes(day)) {
      setList(list.filter((d) => d !== day));
    } else {
      setList([...list, day]);
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;
    onUpdateState((draft) => {
      if (!draft.tasksRecurring) draft.tasksRecurring = [];
      draft.tasksRecurring.push({
        id: uid(),
        name: taskName.trim(),
        freq: taskFreq,
        days: taskDays.length > 0 ? taskDays : undefined,
        effort: taskEffort,
      });
    });
    setTaskName('');
    setTaskDays([]);
    setTaskEffort('medium');
  };

  const handleSaveEditedTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editingTask.name.trim()) return;

    onUpdateState((draft) => {
      if (!draft.tasksRecurring) draft.tasksRecurring = [];
      const idx = draft.tasksRecurring.findIndex((t) => t.id === editingTask.id);
      if (idx !== -1) {
        draft.tasksRecurring[idx] = {
          ...editingTask,
          name: editingTask.name.trim(),
        };
      }
    });

    setEditingTask(null);
  };

  const handleDeleteTask = (id: string) => {
    onUpdateState((draft) => {
      draft.tasksRecurring = (draft.tasksRecurring || []).filter((t) => t.id !== id);
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        category="Organización"
        title="Agenda & Rutinas"
        subtitle="Tu horario semanal y las rutinas que alimentan el checklist de Hoy."
        actions={
          <>
            <button
              onClick={handleLoadTemplate}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--blue)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <AppIcon name="list" className="h-3.5 w-3.5 text-[var(--blue)]" />
              <span>Plantilla sugerida</span>
            </button>
            <button
              onClick={handleClearAgenda}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <AppIcon name="trash" className="h-3.5 w-3.5" />
              <span>Vaciar semana</span>
            </button>
          </>
        }
      />

      {/* Week Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {DAYS.map((day) => {
          const blocks = [...(state.agenda?.[day] || [])].sort((a, b) => a.time.localeCompare(b.time));
          return (
            <div
              key={day}
              className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3 flex flex-col min-h-[160px] shadow-2xs transition-all hover:border-[var(--border-hover)]"
            >
              <div className="flex items-center justify-between font-bold text-xs capitalize text-[var(--text)] pb-2 mb-2 border-b border-[var(--border)]">
                <span>{DAY_LABELS[day]}</span>
                <button
                  onClick={() => handleAddBlock(day)}
                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] hover:opacity-80 transition-opacity cursor-pointer"
                  title="Agregar bloque"
                  aria-label={`Agregar bloque a ${DAY_LABELS[day]}`}
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-1.5 flex-1">
                {blocks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-[11px] text-[var(--text-faint)]">
                    <span>Sin bloques</span>
                  </div>
                ) : (
                  blocks.map((b) => (
                    <div
                      key={b.id}
                      className="bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--blue)] rounded-xl p-2 text-[11px] flex items-center justify-between gap-1 group transition-all"
                    >
                      <div className="truncate flex-1 min-w-0">
                        <span className="font-mono font-bold text-[var(--blue)] mr-1.5">{b.time}</span>
                        <span className="text-[var(--text)] font-medium truncate">{b.activity}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            setEditingBlock({
                              id: b.id,
                              currentDay: day,
                              newDay: day,
                              time: b.time,
                              activity: b.activity,
                              effort: b.effort || 'medium',
                            })
                          }
                          className="text-[var(--text-faint)] hover:text-[var(--blue)] p-1 rounded hover:bg-[var(--surface-muted)] cursor-pointer"
                          title="Editar bloque"
                          aria-label="Editar bloque"
                        >
                          <AppIcon name="edit" className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteBlock(day, b.id)}
                          className="text-[var(--text-faint)] hover:text-red-500 p-1 rounded hover:bg-[var(--surface-muted)] cursor-pointer"
                          title="Eliminar bloque"
                          aria-label="Eliminar bloque"
                        >
                          <AppIcon name="trash" className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal / Drawer for editing agenda block */}
      {editingBlock && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <AppIcon name="edit" className="h-4 w-4 text-[var(--blue)]" />
                <h3 className="text-sm font-extrabold text-[var(--text)]">Editar Bloque de Agenda</h3>
              </div>
              <button
                onClick={() => setEditingBlock(null)}
                className="text-xs text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded hover:bg-[var(--surface-muted)] cursor-pointer"
                aria-label="Cerrar modal"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedBlock} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                  Día de la semana
                </label>
                <select
                  value={editingBlock.newDay}
                  onChange={(e) =>
                    setEditingBlock({ ...editingBlock, newDay: e.target.value as DayKey })
                  }
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] capitalize focus:border-[var(--blue)] outline-hidden cursor-pointer"
                >
                  {DAYS.map((d) => (
                    <option key={d} value={d}>
                      {DAY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1">Esfuerzo mental</label>
                <select value={editingBlock.effort} onChange={(e) => setEditingBlock({ ...editingBlock, effort: e.target.value as EffortLevel })} className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]">
                  <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                  Horario (HH:MM)
                </label>
                <input
                  type="text"
                  value={editingBlock.time}
                  onChange={(e) => setEditingBlock({ ...editingBlock, time: e.target.value })}
                  placeholder="Ej: 09:00"
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                  Actividad
                </label>
                <input
                  type="text"
                  value={editingBlock.activity}
                  onChange={(e) => setEditingBlock({ ...editingBlock, activity: e.target.value })}
                  placeholder="Ej: Ir al Gimnasio"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--bg)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--blue)] text-white hover:bg-[var(--blue-hover)] cursor-pointer shadow-xs"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recurring Tasks */}
      <div className="space-y-3 pt-4">
        <div>
          <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
            Rutinas recurrentes
            <span className="text-xs font-semibold text-[var(--text-faint)] bg-[var(--bg)] px-2.5 py-0.5 rounded-md border border-[var(--border)]">
              {(state.tasksRecurring || []).length}
            </span>
          </h2>
          <p className="text-xs text-[var(--text-soft)]">
            Asigná días específicos a tus rutinas y modificalos cuando quieras.
          </p>
        </div>

        {/* Form for adding new recurring task with day selector */}
        <form onSubmit={handleAddTask} className="p-4 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-2xl space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Nombre de la Rutina</label>
              <input
                type="text"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Ej: Meditar 10 min, Estirar, Leer 20 pag..."
                className="w-full px-3 py-2 text-xs font-medium rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Frecuencia</label>
              <select
                value={taskFreq}
                onChange={(e) => setTaskFreq(e.target.value as 'daily' | '2-3x' | 'weekly')}
                className="px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden cursor-pointer"
              >
                <option value="daily">Diaria</option>
                <option value="2-3x">2-3 veces/semana</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Esfuerzo</label>
              <select value={taskEffort} onChange={(e) => setTaskEffort(e.target.value as EffortLevel)} className="px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]">
                <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
              </select>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[var(--blue)] text-white text-xs font-bold rounded-xl hover:bg-[var(--blue-hover)] transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Agregar rutina</span>
            </button>
          </div>

          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1.5">
              Días específicos (Opcional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const isSelected = taskDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDaySelection(d, taskDays, setTaskDays)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[var(--blue)] border-[var(--blue)] text-white'
                        : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                    }`}
                  >
                    {DAY_LABELS[d].slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {/* Modal for editing recurring task */}
        {editingTask && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 max-w-md w-full space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <AppIcon name="edit" className="h-4 w-4 text-[var(--blue)]" />
                  <h3 className="text-sm font-extrabold text-[var(--text)]">Editar Rutina Recurrente</h3>
                </div>
                <button
                  onClick={() => setEditingTask(null)}
                  className="text-xs text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded hover:bg-[var(--surface-muted)] cursor-pointer"
                  aria-label="Cerrar modal"
                >
                  <AppIcon name="x" className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditedTask} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={editingTask.name}
                    onChange={(e) => setEditingTask({ ...editingTask, name: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1">Esfuerzo mental</label>
                  <select value={editingTask.effort || 'medium'} onChange={(e) => setEditingTask({ ...editingTask, effort: e.target.value as EffortLevel })} className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]">
                    <option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-1">
                    Frecuencia
                  </label>
                  <select
                    value={editingTask.freq}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        freq: e.target.value as 'daily' | '2-3x' | 'weekly',
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden cursor-pointer"
                  >
                    <option value="daily">Diaria</option>
                    <option value="2-3x">2-3 veces/semana</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-[var(--text-faint)] block mb-2">
                    Días asignados
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const list = editingTask.days || [];
                      const isSelected = list.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            const updated = isSelected
                              ? list.filter((item) => item !== d)
                              : [...list, d];
                            setEditingTask({ ...editingTask, days: updated });
                          }}
                          className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-[var(--blue)] border-[var(--blue)] text-white'
                              : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)]'
                          }`}
                        >
                          {DAY_LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--bg)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--blue)] text-white hover:bg-[var(--blue-hover)] cursor-pointer shadow-xs"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {(['daily', '2-3x', 'weekly'] as const).map((freq) => {
            const items = (state.tasksRecurring || []).filter((t) => t.freq === freq);
            if (items.length === 0) return null;
            return (
              <div key={freq} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-2xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-faint)] mb-2">
                  {FREQ_LABELS[freq]}
                </h3>
                <div className="divide-y divide-[var(--border)]">
                  {items.map((t) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between text-xs sm:text-sm text-[var(--text)]">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
                        <span className="font-semibold truncate">{t.name}</span>
                        <span className={`w-fit rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase ${t.effort === 'low' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : t.effort === 'high' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>{t.effort === 'low' ? 'bajo' : t.effort === 'high' ? 'alto' : 'medio'}</span>
                        {t.days && t.days.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {t.days.map((d) => (
                              <span
                                key={d}
                                className="px-1.5 py-0.5 text-[10px] font-extrabold uppercase rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                              >
                                {DAY_LABELS[d].slice(0, 3)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => setEditingTask(t)}
                          className="flex items-center gap-1 text-[var(--text-soft)] hover:text-[var(--blue)] text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-[var(--blue)] transition-colors cursor-pointer"
                          title="Editar días o nombre"
                        >
                          <AppIcon name="edit" className="h-3 w-3" />
                          <span className="hidden sm:inline">Editar</span>
                        </button>
                        <button
                          onClick={() => handleDeleteTask(t.id)}
                          className="text-[var(--text-faint)] hover:text-red-500 text-xs p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] hover:border-red-400 transition-colors cursor-pointer"
                          title="Eliminar rutina"
                          aria-label="Eliminar rutina"
                        >
                          <AppIcon name="trash" className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
