import React, { useState } from 'react';
import type { LifeOSState, Project, ProjectStatus } from '../types';
import { AppIcon } from './AppIcon';
import { daysBetween, fmtDate, todayISO, uid } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import {
  getUnifiedTaskMap,
  isTaskBlocked,
  getBlockingTasks,
  validateTaskDependencies,
  getUnblockedCountIfCompleted,
} from '../lib/taskDependencies';

interface ProjectsManagerProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const ProjectsManager: React.FC<ProjectsManagerProps> = ({ state, onUpdateState }) => {
  const [filter, setFilter] = useState<'activos' | 'pausados' | 'completados' | 'todos'>('activos');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [blockers, setBlockers] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [notes, setNotes] = useState('');

  // Quick subtask input for specific project
  const [taskInputs, setTaskInputs] = useState<Record<string, string>>({});
  const [editingDepTaskId, setEditingDepTaskId] = useState<string | null>(null);
  const [editingDueDateTaskId, setEditingDueDateTaskId] = useState<string | null>(null);

  const projects = state.projects || [];
  const today = todayISO();

  const filteredProjects = projects.filter((p) => {
    if (filter === 'activos') return p.status === 'activo';
    if (filter === 'pausados') return p.status === 'en_pausa';
    if (filter === 'completados') return p.status === 'completado';
    return true;
  });

  const resetForm = () => {
    setName('');
    setObjective('');
    setNextStep('');
    setBlockers('');
    setReviewDate('');
    setNotes('');
    setEditingProjectId(null);
    setShowCreateForm(false);
  };

  const handleStartEdit = (p: Project) => {
    setName(p.name);
    setObjective(p.objective);
    setNextStep(p.nextStep);
    setBlockers(p.blockers || '');
    setReviewDate(p.reviewDate || '');
    setNotes(p.notes || '');
    setEditingProjectId(p.id);
    setShowCreateForm(true);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    onUpdateState((draft) => {
      if (!draft.projects) draft.projects = [];
      if (editingProjectId) {
        const p = draft.projects.find((x) => x.id === editingProjectId);
        if (p) {
          p.name = cleanName;
          p.objective = objective.trim();
          p.nextStep = nextStep.trim();
          p.blockers = blockers.trim() || undefined;
          p.reviewDate = reviewDate || undefined;
          p.notes = notes.trim() || undefined;
          p.updatedAt = todayISO();
        }
      } else {
        draft.projects.unshift({
          id: uid(),
          name: cleanName,
          objective: objective.trim(),
          status: 'activo',
          nextStep: nextStep.trim() || 'Definir primera acción',
          tasks: [],
          blockers: blockers.trim() || undefined,
          reviewDate: reviewDate || undefined,
          notes: notes.trim() || undefined,
          createdAt: todayISO(),
        });
      }
    });

    playSound('click');
    showToast(editingProjectId ? 'Proyecto actualizado.' : 'Proyecto creado.');
    resetForm();
  };

  const handleUpdateStatus = (id: string, newStatus: ProjectStatus) => {
    onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === id);
      if (p) {
        p.status = newStatus;
        p.updatedAt = todayISO();
      }
    });
    if (newStatus === 'completado') playSound('success');
    showToast(`Estado cambiado a ${newStatus}.`);
  };

  const handleDeleteProject = (id: string) => {
    if (!window.confirm('¿Seguro que querés eliminar este proyecto?')) return;
    onUpdateState((draft) => {
      draft.projects = (draft.projects || []).filter((x) => x.id !== id);
    });
    showToast('Proyecto eliminado.', 'info');
  };

  const handleSendNextStepToToday = (project: Project) => {
    if (!project.nextStep.trim()) return;
    onUpdateState((draft) => {
      draft.todayExtras.push({
        id: uid(),
        date: today,
        text: `[${project.name}] ${project.nextStep}`,
        priority: 'alta',
        done: false,
        effort: 'medium',
      });
    });
    playSound('success');
    showToast(`Próximo paso agregado a Hoy.`);
  };

  const handleAddTask = (projectId: string) => {
    const text = (taskInputs[projectId] || '').trim();
    if (!text) return;
    onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === projectId);
      if (p) {
        if (!p.tasks) p.tasks = [];
        p.tasks.push({
          id: uid(),
          text,
          done: false,
        });
        p.updatedAt = todayISO();
      }
    });
    setTaskInputs((prev) => ({ ...prev, [projectId]: '' }));
  };

  const handleToggleTask = (projectId: string, taskId: string) => {
    const taskMap = getUnifiedTaskMap(state);
    const task = taskMap.get(taskId);

    if (task && !task.done) {
      const blockers = getBlockingTasks(task, taskMap);
      if (blockers.length > 0) {
        const proceed = window.confirm(
          `Esta tarea depende de:\n${blockers.map((b) => `• ${b.text}`).join('\n')}\n\n¿Deseas marcarla como completada de todos modos?`
        );
        if (!proceed) return;
      }
      const unblocks = getUnblockedCountIfCompleted(taskId, taskMap);
      if (unblocks > 0) {
        showToast(`✦ Tarea completada. ¡Desbloqueaste ${unblocks} tarea(s)!`, 'success');
      }
    }

    onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === projectId);
      if (p && p.tasks) {
        const t = p.tasks.find((task) => task.id === taskId);
        if (t) {
          t.done = !t.done;
          p.updatedAt = todayISO();
        }
      }
    });
    playSound('click');
  };

  const handleToggleTaskDependency = (projectId: string, taskId: string, depId: string) => {
    const taskMap = getUnifiedTaskMap(state);
    const p = (state.projects || []).find((x) => x.id === projectId);
    const t = p?.tasks?.find((x) => x.id === taskId);
    if (!t) return;

    const currentDeps = t.dependsOn || [];
    let nextDeps: string[];
    if (currentDeps.includes(depId)) {
      nextDeps = currentDeps.filter((id) => id !== depId);
    } else {
      nextDeps = [...currentDeps, depId];
      const check = validateTaskDependencies(taskId, nextDeps, taskMap);
      if (!check.valid) {
        showToast(check.error || 'Dependencia no permitida', 'info');
        return;
      }
    }

    onUpdateState((draft) => {
      const proj = (draft.projects || []).find((x) => x.id === projectId);
      const task = proj?.tasks?.find((x) => x.id === taskId);
      if (task) {
        task.dependsOn = nextDeps.length > 0 ? nextDeps : undefined;
        proj.updatedAt = todayISO();
      }
    });
  };

  const handleSetTaskDueDate = (projectId: string, taskId: string, dueDate: string) => {
    onUpdateState((draft) => {
      const proj = (draft.projects || []).find((x) => x.id === projectId);
      const task = proj?.tasks?.find((x) => x.id === taskId);
      if (task) {
        task.dueDate = dueDate || undefined;
        proj.updatedAt = todayISO();
      }
    });
    setEditingDueDateTaskId(null);
  };

  const handleDeleteTask = (projectId: string, taskId: string) => {
    onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === projectId);
      if (p && p.tasks) {
        p.tasks = p.tasks.filter((task) => task.id !== taskId);
        p.updatedAt = todayISO();
      }
    });
  };

  const handleResolveBlocker = (projectId: string) => {
    onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === projectId);
      if (p) {
        p.blockers = undefined;
        p.updatedAt = todayISO();
      }
    });
    playSound('success');
    showToast('Bloqueo marcado como resuelto.');
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--card)] p-4 sm:p-5 rounded-2xl border border-[var(--border)] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
              <AppIcon name="target" className="h-4 w-4" />
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Proyectos & Objetivos</h2>
          </div>
          <p className="text-xs text-[var(--text-soft)] mt-0.5">
            Estructura tus metas con objetivo claro, próximo paso ejecutable, tareas y bloqueos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (showCreateForm) resetForm();
            else setShowCreateForm(true);
          }}
          className="px-3.5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
        >
          <AppIcon name={showCreateForm ? 'x' : 'plus'} className="h-3.5 w-3.5" />
          <span>{showCreateForm ? 'Cerrar formulario' : '＋ Nuevo Proyecto'}</span>
        </button>
      </div>

      {/* Create / Edit Form Modal / Card */}
      {showCreateForm && (
        <form onSubmit={handleSaveProject} className="bg-[var(--card)] border-2 border-blue-500/30 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
            <h3 className="text-sm font-extrabold text-[var(--text)]">
              {editingProjectId ? 'Editar Proyecto' : 'Crear Nuevo Proyecto'}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-bold text-[var(--text-soft)] hover:text-rose-500 cursor-pointer"
            >
              Cancelar ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                Nombre del Proyecto *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Lanzamiento de producto, Mudanza, Certificación AWS"
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden font-bold text-[var(--text)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                Fecha de Revisión Programada
              </label>
              <input
                type="date"
                value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
              Objetivo Final Medible (¿Qué define el éxito?)
            </label>
            <input
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Ej: Conseguir los primeros 10 clientes de pago antes de fin de mes."
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
                Próximo Paso Inmediato (Acción concreta y ejecutable)
              </label>
              <input
                type="text"
                value={nextStep}
                onChange={(e) => setNextStep(e.target.value)}
                placeholder="Ej: Redactar email para agendar reunión con 3 contactos clave."
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
                Bloqueos / Obstáculos Identificados (opcional)
              </label>
              <input
                type="text"
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
                placeholder="Ej: Esperando respuesta legal o aprobación de presupuesto."
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-amber-500/30 text-[var(--text)]"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block mb-1">
              Notas y Contexto Adicional
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles, enlaces, consideraciones técnicas..."
              rows={2}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] resize-y"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-all"
            >
              {editingProjectId ? 'Guardar Cambios' : '＋ Crear Proyecto'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] w-fit text-xs font-bold">
        {(['activos', 'pausados', 'completados', 'todos'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg transition-all capitalize cursor-pointer ${
              filter === tab
                ? 'bg-[var(--card)] text-[var(--blue)] shadow-2xs'
                : 'text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            {tab === 'activos'
              ? `Activos (${projects.filter((p) => p.status === 'activo').length})`
              : tab === 'pausados'
              ? `En Pausa (${projects.filter((p) => p.status === 'en_pausa').length})`
              : tab === 'completados'
              ? `Completados (${projects.filter((p) => p.status === 'completado').length})`
              : `Todos (${projects.length})`}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="py-12 text-center bg-[var(--card)] border border-[var(--border)] rounded-2xl space-y-2">
          <span className="text-3xl block">🚀</span>
          <p className="text-xs text-[var(--text-soft)] font-medium">
            {filter === 'activos'
              ? 'No tenés proyectos activos en este momento.'
              : 'No hay proyectos en esta categoría.'}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="text-xs text-[var(--blue)] font-bold hover:underline cursor-pointer"
          >
            ＋ Crear tu primer proyecto
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map((project) => {
            const completedTasks = (project.tasks || []).filter((t) => t.done).length;
            const totalTasks = (project.tasks || []).length;
            const daysToReview = project.reviewDate ? daysBetween(today, project.reviewDate) : null;

            return (
              <div
                key={project.id}
                className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 transition-all"
              >
                {/* Project Top Bar */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-black text-[var(--text)] tracking-tight">
                        {project.name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          project.status === 'activo'
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : project.status === 'en_pausa'
                            ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            : project.status === 'completado'
                            ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                            : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
                        }`}
                      >
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>

                    {project.objective && (
                      <p className="text-xs text-[var(--text-soft)] font-medium">
                        🎯 <strong>Objetivo:</strong> {project.objective}
                      </p>
                    )}
                  </div>

                  {/* Actions & Status Switcher */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value={project.status}
                      onChange={(e) => handleUpdateStatus(project.id, e.target.value as ProjectStatus)}
                      className="px-2 py-1 text-xs font-semibold rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] cursor-pointer"
                    >
                      <option value="activo">Activo</option>
                      <option value="en_pausa">En Pausa</option>
                      <option value="completado">Completado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(project)}
                      className="p-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--blue)] cursor-pointer rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
                      title="Editar proyecto"
                      aria-label="Editar proyecto"
                    >
                      <AppIcon name="edit" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(project.id)}
                      className="p-1.5 text-xs text-[var(--text-soft)] hover:text-rose-500 cursor-pointer rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
                      title="Eliminar proyecto"
                      aria-label="Eliminar proyecto"
                    >
                      <AppIcon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Próximo Paso Highlight (El corazón de GTD / Proyectos) */}
                <div className="p-3 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--blue)] block mb-0.5">
                      Próximo Paso Inmediato
                    </span>
                    <p className="text-xs font-bold text-[var(--text)] truncate">
                      {project.nextStep || 'Sin próximo paso definido.'}
                    </p>
                  </div>

                  {project.nextStep && (
                    <button
                      type="button"
                      onClick={() => handleSendNextStepToToday(project)}
                      className="px-3 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-[var(--blue)] text-xs font-bold rounded-xl transition cursor-pointer shrink-0 flex items-center gap-1.5 active:scale-95"
                      title="Insertar en las tareas de Hoy"
                    >
                      <AppIcon name="plus" className="h-3.5 w-3.5" />
                      <span>Enviar a Hoy</span>
                    </button>
                  )}
                </div>

                {/* Blockers Alert Banner */}
                {project.blockers && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <AppIcon name="zap" className="h-4 w-4 text-amber-600 shrink-0" />
                      <span><strong>Bloqueo identificado:</strong> {project.blockers}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResolveBlocker(project.id)}
                      className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer shrink-0"
                    >
                      Resolver ✓
                    </button>
                  </div>
                )}

                {/* Review Date Indicator */}
                {project.reviewDate && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
                    <AppIcon name="calendar" className="h-3.5 w-3.5" />
                    <span>
                      Fecha de revisión: <strong>{fmtDate(project.reviewDate)}</strong>
                      {daysToReview !== null && (
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          daysToReview < 0
                            ? 'bg-rose-500/15 text-rose-600'
                            : daysToReview === 0
                            ? 'bg-amber-500/15 text-amber-600'
                            : 'bg-blue-500/10 text-blue-600'
                        }`}>
                          {daysToReview < 0
                            ? `Vencida hace ${Math.abs(daysToReview)} días`
                            : daysToReview === 0
                            ? 'Toca revisar hoy'
                            : `En ${daysToReview} días`}
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Subtasks Checklist */}
                <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--text)]">
                      Tareas del Proyecto ({completedTasks}/{totalTasks})
                    </span>
                    {totalTasks > 0 && (
                      <span className="text-[11px] font-mono text-[var(--text-faint)]">
                        {Math.round((completedTasks / totalTasks) * 100)}% completado
                      </span>
                    )}
                  </div>

                  {/* Task List */}
                  <div className="divide-y divide-[var(--border)]">
                    {(project.tasks || []).map((t) => {
                      const isBlocked = isTaskBlocked(t.id, state);
                      const taskMap = getUnifiedTaskMap(state);
                      const blockers = getBlockingTasks(t.id, taskMap);
                      const unblocks = getUnblockedCountIfCompleted(t.id, taskMap);
                      const isEditingDeps = editingDepTaskId === t.id;
                      const isEditingDueDate = editingDueDateTaskId === t.id;
                      const otherTasksInProject = (project.tasks || []).filter((other) => other.id !== t.id);

                      return (
                        <div key={t.id} className="py-2 border-b border-[var(--border)] last:border-b-0">
                          <div className="flex items-center justify-between gap-2 group">
                            <label className="flex items-center gap-2 cursor-pointer min-w-0 flex-1 flex-wrap">
                              <input
                                type="checkbox"
                                checked={t.done}
                                onChange={() => handleToggleTask(project.id, t.id)}
                                className="rounded text-blue-600 cursor-pointer shrink-0"
                              />
                              <span
                                className={`text-xs ${
                                  t.done ? 'line-through text-[var(--text-faint)]' : 'text-[var(--text)] font-medium'
                                }`}
                              >
                                {t.text}
                              </span>

                              {/* Blocked indicator */}
                              {!t.done && isBlocked && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0"
                                  title={`Bloqueada por:\n${blockers.map((b) => `• ${b.text}`).join('\n')}`}
                                >
                                  <AppIcon name="lock" className="h-2.5 w-2.5" />
                                  <span>Bloqueada</span>
                                </span>
                              )}

                              {/* Unblocks indicator */}
                              {!t.done && unblocks > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0"
                                  title={`Completar esta tarea desbloqueará ${unblocks} tarea(s)`}
                                >
                                  <AppIcon name="unlock" className="h-2.5 w-2.5" />
                                  <span>Desbloquea {unblocks}</span>
                                </span>
                              )}

                              {/* Due Date pill */}
                              {t.dueDate && (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${
                                    t.dueDate < today
                                      ? 'bg-rose-500/15 text-rose-600 border-rose-500/30'
                                      : t.dueDate === today
                                      ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                                      : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                  }`}
                                  title={`Fecha límite: ${fmtDate(t.dueDate)}`}
                                >
                                  <AppIcon name="clock" className="h-2.5 w-2.5" />
                                  <span>{t.dueDate === today ? 'Hoy' : fmtDate(t.dueDate)}</span>
                                </span>
                              )}
                            </label>

                            <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                              {/* Toggle dependency edit */}
                              {otherTasksInProject.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setEditingDepTaskId(isEditingDeps ? null : t.id)}
                                  className={`p-1 rounded-lg text-xs cursor-pointer transition ${
                                    isEditingDeps || (t.dependsOn && t.dependsOn.length > 0)
                                      ? 'bg-blue-500/15 text-[var(--blue)] font-bold'
                                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                                  }`}
                                  title="Configurar dependencias"
                                >
                                  <AppIcon name="link" className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {/* Toggle DueDate edit */}
                              <button
                                type="button"
                                onClick={() => setEditingDueDateTaskId(isEditingDueDate ? null : t.id)}
                                className={`p-1 rounded-lg text-xs cursor-pointer transition ${
                                  isEditingDueDate || t.dueDate
                                    ? 'bg-amber-500/15 text-amber-600 font-bold'
                                    : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                                }`}
                                title="Configurar fecha límite"
                              >
                                <AppIcon name="calendar" className="h-3.5 w-3.5" />
                              </button>

                              {/* Delete task */}
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(project.id, t.id)}
                                className="text-xs text-[var(--text-faint)] hover:text-rose-500 p-1 cursor-pointer"
                                title="Eliminar tarea"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Inline Dependencies Selector */}
                          {isEditingDeps && (
                            <div className="mt-2 p-2 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)] text-xs space-y-1.5">
                              <div className="flex items-center justify-between text-[11px] font-bold text-[var(--text-soft)]">
                                <span>Esta tarea depende de:</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingDepTaskId(null)}
                                  className="text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                                >
                                  Cerrar ✕
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {otherTasksInProject.map((other) => {
                                  const isSelected = (t.dependsOn || []).includes(other.id);
                                  return (
                                    <button
                                      key={other.id}
                                      type="button"
                                      onClick={() => handleToggleTaskDependency(project.id, t.id, other.id)}
                                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                                        isSelected
                                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                          : 'bg-[var(--card)] text-[var(--text-soft)] border-[var(--border)] hover:border-[var(--blue)]'
                                      }`}
                                    >
                                      {isSelected ? '✓ ' : '+ '}
                                      {other.text}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Inline Due Date Picker */}
                          {isEditingDueDate && (
                            <div className="mt-2 p-2 bg-[var(--surface-muted)] rounded-xl border border-[var(--border)] text-xs flex items-center gap-2">
                              <span className="text-[11px] font-bold text-[var(--text-soft)]">Fecha límite:</span>
                              <input
                                type="date"
                                defaultValue={t.dueDate || today}
                                onChange={(e) => handleSetTaskDueDate(project.id, t.id, e.target.value)}
                                className="px-2 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text)] outline-hidden"
                              />
                              {t.dueDate && (
                                <button
                                  type="button"
                                  onClick={() => handleSetTaskDueDate(project.id, t.id, '')}
                                  className="text-[10px] text-rose-500 hover:underline cursor-pointer"
                                >
                                  Quitar fecha
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingDueDateTaskId(null)}
                                className="ml-auto text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
                              >
                                Listo ✓
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Subtask Input */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={taskInputs[project.id] || ''}
                      onChange={(e) =>
                        setTaskInputs((prev) => ({ ...prev, [project.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTask(project.id);
                        }
                      }}
                      placeholder="＋ Agregar tarea al proyecto..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] focus:border-[var(--blue)] outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTask(project.id)}
                      className="px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--border)] text-xs font-bold text-[var(--text)] rounded-xl border border-[var(--border)] cursor-pointer"
                    >
                      Añadir
                    </button>
                  </div>
                </div>

                {/* Notes footer if present */}
                {project.notes && (
                  <p className="text-[11px] text-[var(--text-faint)] italic border-t border-[var(--border)] pt-2">
                    💬 {project.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
