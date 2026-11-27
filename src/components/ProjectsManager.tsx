import React, { useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  Check,
  Clock,
  FolderKanban,
  Link2,
  Lock,
  MessageSquare,
  Pencil,
  Plus,
  Target,
  Trash2,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import type { LifeOSState, Project, ProjectStatus, ProjectTask } from '../types';
import { SurfaceCard, SectionHeader, ListDivider } from './ui/SurfacePrimitives';
import { CompletionCheck } from './ui/CompletionCheck';
import { daysBetween, fmtDate, todayISO, uid } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { maskFinancialText } from '../lib/financialPrivacy';
import { usePrivacyMode } from './PrivacyAmount';
import { sendProjectNextStepToToday, sendProjectTaskToToday } from '../lib/projectFlows';
import {
  getUnifiedTaskMap,
  isTaskBlocked,
  getBlockingTasks,
  validateTaskDependencies,
  getUnblockedCountIfCompleted,
} from '../lib/taskDependencies';
import { focusTargetElement } from '../lib/navigationFocus';

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  activo: 'Activo',
  en_pausa: 'En pausa',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

interface ProjectsManagerProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  initialFocusId?: string | null;
  focusNonce?: number;
  /** Optional initial modal visibility for deterministic testing. */
  initialShowForm?: boolean;
}

export const ProjectsManager: React.FC<ProjectsManagerProps> = ({
  state,
  onUpdateState,
  initialFocusId,
  focusNonce,
  initialShowForm = false,
}) => {
  const [filter, setFilter] = useState<'activos' | 'pausados' | 'completados' | 'todos'>('activos');
  const [showCreateForm, setShowCreateForm] = useState(initialShowForm);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const contextPrivacy = usePrivacyMode();
  const privacyActive = Boolean(state.settings?.privacyMode) || contextPrivacy;

  React.useEffect(() => {
    if (!showCreateForm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setShowCreateForm(false);
        setEditingProjectId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showCreateForm]);

  React.useEffect(() => {
    if (initialFocusId) {
      if (initialFocusId.startsWith('project-task-')) {
        const taskId = initialFocusId.replace('project-task-', '');
        const parentProj = (state.projects || []).find((p) => (p.tasks || []).some((t) => t.id === taskId));
        if (parentProj && parentProj.status !== 'activo' && filter !== 'todos') {
          setFilter('todos');
        }
      }
      return focusTargetElement(initialFocusId);
    }
  }, [initialFocusId, state.projects, focusNonce, filter]);

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

    const saved = onUpdateState((draft) => {
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
    if (saved === false) return;

    playSound('click');
    showToast(editingProjectId ? 'Proyecto actualizado.' : 'Proyecto creado.');
    resetForm();
  };

  const handleUpdateStatus = (id: string, newStatus: ProjectStatus) => {
    const saved = onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === id);
      if (p) {
        p.status = newStatus;
        p.updatedAt = todayISO();
      }
    });
    if (saved === false) return;
    if (newStatus === 'completado') playSound('success');
    showToast(`Estado cambiado a ${PROJECT_STATUS_LABELS[newStatus]}.`);
  };

  const handleDeleteProject = (id: string) => {
    if (!window.confirm('¿Seguro que querés eliminar este proyecto?')) return;
    const saved = onUpdateState((draft) => {
      draft.projects = (draft.projects || []).filter((x) => x.id !== id);
    });
    if (saved === false) return;
    showToast('Proyecto eliminado.', 'info');
  };

  const handleSendNextStepToToday = (project: Project) => {
    if (!project.nextStep.trim()) return;
    let reason: string | undefined;
    let added = false;
    const saved = onUpdateState((draft) => {
      const res = sendProjectNextStepToToday(draft, project, today);
      added = res.added;
      reason = res.reason;
    });
    if (saved === false) return;
    if (!added) {
      if (reason === 'duplicate') {
        showToast('Este próximo paso ya está en tus tareas de Hoy.', 'info');
      }
      return;
    }
    playSound('success');
    showToast('Próximo paso agregado a Hoy.');
  };

  const handleSendTaskToToday = (project: Project, task: ProjectTask) => {
    let reason: string | undefined;
    let added = false;
    const saved = onUpdateState((draft) => {
      const res = sendProjectTaskToToday(draft, project, task, today);
      added = res.added;
      reason = res.reason;
    });
    if (saved === false) return;
    if (!added) {
      if (reason === 'already_due_today') {
        showToast('Esta tarea ya vence hoy y figura en Hoy.', 'info');
      } else if (reason === 'duplicate') {
        showToast('Esta tarea ya fue enviada a Hoy.', 'info');
      }
      return;
    }
    playSound('success');
    showToast('Tarea enviada a Hoy.');
  };

  const handleAddTask = (projectId: string) => {
    const text = (taskInputs[projectId] || '').trim();
    if (!text) return;
    const saved = onUpdateState((draft) => {
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
    if (saved === false) return;
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
        showToast(`Tarea completada. Desbloqueaste ${unblocks} ${unblocks === 1 ? 'tarea' : 'tareas'}.`, 'success');
      }
    }

    const saved = onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === projectId);
      if (p && p.tasks) {
        const t = p.tasks.find((task) => task.id === taskId);
        if (t) {
          t.done = !t.done;
          p.updatedAt = todayISO();
        }
      }
    });
    if (saved === false) return;
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

    const saved = onUpdateState((draft) => {
      const proj = (draft.projects || []).find((x) => x.id === projectId);
      const task = proj?.tasks?.find((x) => x.id === taskId);
      if (task) {
        task.dependsOn = nextDeps.length > 0 ? nextDeps : undefined;
        proj.updatedAt = todayISO();
      }
    });
    if (saved === false) return;
  };

  const handleSetTaskDueDate = (projectId: string, taskId: string, dueDate: string) => {
    const saved = onUpdateState((draft) => {
      const proj = (draft.projects || []).find((x) => x.id === projectId);
      const task = proj?.tasks?.find((x) => x.id === taskId);
      if (task) {
        task.dueDate = dueDate || undefined;
        proj.updatedAt = todayISO();
      }
    });
    if (saved === false) return;
    setEditingDueDateTaskId(null);
  };

  const handleDeleteTask = (projectId: string, taskId: string) => {
    const saved = onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === projectId);
      if (p && p.tasks) {
        p.tasks = p.tasks.filter((task) => task.id !== taskId);
        p.updatedAt = todayISO();
      }
    });
    if (saved === false) return;
  };

  const handleResolveBlocker = (projectId: string) => {
    const saved = onUpdateState((draft) => {
      const p = (draft.projects || []).find((x) => x.id === projectId);
      if (p) {
        p.blockers = undefined;
        p.updatedAt = todayISO();
      }
    });
    if (saved === false) return;
    playSound('success');
    showToast('Bloqueo marcado como resuelto.');
  };

  const fieldClass =
    'celestian-clean-field w-full min-h-11 sm:min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500';
  const cleanBtnFocus =
    'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header & Controls */}
      <SurfaceCard className="p-4 sm:p-5 space-y-3">
        <SectionHeader
          icon={<Target size={16} strokeWidth={1.75} />}
          title="Proyectos"
          count={projects.length > 0 ? projects.length : null}
          action={
            (projects.length > 0 || showCreateForm) ? (
              <button
                type="button"
                onClick={() => {
                  if (showCreateForm) resetForm();
                  else setShowCreateForm(true);
                }}
                className={`inline-flex min-h-11 sm:min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${cleanBtnFocus}`}
              >
                {showCreateForm ? <X size={15} strokeWidth={1.75} aria-hidden="true" /> : <Plus size={15} strokeWidth={1.75} aria-hidden="true" />}
                <span>{showCreateForm ? 'Cerrar' : 'Nuevo proyecto'}</span>
              </button>
            ) : undefined
          }
        />
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Tareas, próximo paso y bloqueos de cada proyecto.
        </p>

        {/* Filter Tabs (scrollable on 389px without horizontal page overflow) */}
        <div className="flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/75 p-1 dark:border-white/[0.08] dark:bg-white/[0.03] sm:w-fit">
          {(['activos', 'pausados', 'completados', 'todos'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={filter === tab}
              onClick={() => setFilter(tab)}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${cleanBtnFocus} cursor-pointer ${
                filter === tab
                  ? 'bg-[#4F46E5] text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab === 'activos'
                ? `Activos (${projects.filter((p) => p.status === 'activo').length})`
                : tab === 'pausados'
                ? `En pausa (${projects.filter((p) => p.status === 'en_pausa').length})`
                : tab === 'completados'
                ? `Completados (${projects.filter((p) => p.status === 'completado').length})`
                : `Todos (${projects.length})`}
            </button>
          ))}
        </div>
      </SurfaceCard>

      {/* Create / Edit Project Modal (Bottom Sheet on mobile, centered on desktop) */}
      {showCreateForm && (
        <div
          className="fixed inset-0 z-50 !m-0 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4 animate-in fade-in"
          onClick={resetForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-form-title"
            className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl border border-slate-200/80 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-white/[0.08] dark:bg-[#0D111A] sm:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-300 dark:bg-white/20 sm:hidden" aria-hidden="true" />
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="project-form-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingProjectId ? 'Editar proyecto' : 'Nuevo proyecto'}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                aria-label="Cerrar formulario de proyecto"
                title="Cerrar"
                className={`inline-flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer ${cleanBtnFocus}`}
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleSaveProject} className="space-y-4">

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
                <div className="min-w-0">
                  <label htmlFor="project-name-input" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Nombre del proyecto *
                  </label>
                  <input
                    id="project-name-input"
                    type="text"
                    required
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej.: Lanzamiento de producto, mudanza"
                    className={`${fieldClass} font-semibold`}
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="project-review-date" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Fecha de revisión
                  </label>
                  <input
                    id="project-review-date"
                    type="date"
                    value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="min-w-0">
                <label htmlFor="project-objective-input" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Resultado esperado
                </label>
                <input
                  id="project-objective-input"
                  type="text"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  placeholder="Ej.: Conseguir los primeros 10 clientes antes de fin de mes."
                  className={fieldClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="project-next-step-input" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Próximo paso
                  </label>
                  <input
                    id="project-next-step-input"
                    type="text"
                    value={nextStep}
                    onChange={(e) => setNextStep(e.target.value)}
                    placeholder="Ej.: Redactar correo para agendar reunión."
                    className={fieldClass}
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="project-blockers-input" className="mb-1 block text-xs font-medium text-amber-700 dark:text-amber-400">
                    Bloqueos (opcional)
                  </label>
                  <input
                    id="project-blockers-input"
                    type="text"
                    value={blockers}
                    onChange={(e) => setBlockers(e.target.value)}
                    placeholder="Ej.: Esperando respuesta o aprobación."
                    className="celestian-clean-field w-full min-h-11 sm:min-h-10 rounded-xl border border-amber-500/30 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:bg-white/[0.03] dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <label htmlFor="project-notes-input" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Notas y contexto adicional
                </label>
                <textarea
                  id="project-notes-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles, enlaces, consideraciones técnicas..."
                  rows={2}
                  className="celestian-clean-field w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 resize-y"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={resetForm}
                  className={`inline-flex min-h-11 sm:min-h-10 items-center justify-center rounded-xl border border-slate-200/80 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.04] cursor-pointer ${cleanBtnFocus}`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`inline-flex min-h-11 sm:min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer ${cleanBtnFocus}`}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>{editingProjectId ? 'Guardar cambios' : 'Crear proyecto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projects List */}
      {filteredProjects.length === 0 ? (
        <SurfaceCard className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <FolderKanban size={24} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {filter === 'activos'
                ? 'No tenés proyectos activos en este momento.'
                : 'No hay proyectos en esta categoría.'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Definí un resultado esperado y el próximo paso concreto para avanzar sin fricción.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer"
          >
            <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Crear tu primer proyecto</span>
          </button>
        </SurfaceCard>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map((project) => {
            const completedTasks = (project.tasks || []).filter((t) => t.done).length;
            const totalTasks = (project.tasks || []).length;
            const daysToReview = project.reviewDate ? daysBetween(today, project.reviewDate) : null;

            return (
              <SurfaceCard
                key={project.id}
                id={`project-${project.id}`}
                className="p-4 sm:p-5 space-y-4"
              >
                {/* Project Top Bar */}
                <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-slate-100 pb-3 dark:border-white/[0.06]">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100">
                        {maskFinancialText(project.name, privacyActive)}
                      </h3>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          project.status === 'activo'
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : project.status === 'en_pausa'
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : project.status === 'completado'
                            ? 'border-[#4F46E5]/20 bg-[#4F46E5]/10 text-[#4F46E5] dark:text-indigo-300'
                            : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400'
                        }`}
                      >
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>

                    {project.objective && (
                      <p className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                        <strong className="font-semibold text-slate-700 dark:text-slate-300">Objetivo:</strong> {maskFinancialText(project.objective, privacyActive)}
                      </p>
                    )}
                  </div>

                  {/* Actions & Status Switcher */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      aria-label={`Estado de ${project.name}`}
                      value={project.status}
                      onChange={(e) => handleUpdateStatus(project.id, e.target.value as ProjectStatus)}
                      className="celestian-clean-field min-h-11 sm:min-h-10 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-medium text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200 cursor-pointer"
                    >
                      <option value="activo">Activo</option>
                      <option value="en_pausa">En pausa</option>
                      <option value="completado">Completado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(project)}
                      className={`inline-flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#4F46E5] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-indigo-300 cursor-pointer ${cleanBtnFocus}`}
                      title="Editar proyecto"
                      aria-label="Editar proyecto"
                    >
                      <Pencil size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(project.id)}
                      className={`inline-flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer ${cleanBtnFocus}`}
                      title="Eliminar proyecto"
                      aria-label="Eliminar proyecto"
                    >
                      <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Próximo Paso (flat section, depth = 1) */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-[#4F46E5] dark:text-indigo-400">
                      Próximo paso
                    </span>
                    <p className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100 break-words">
                      {project.nextStep ? maskFinancialText(project.nextStep, privacyActive) : 'Sin próximo paso definido.'}
                    </p>
                  </div>

                  {project.nextStep && (
                    <button
                      type="button"
                      onClick={() => handleSendNextStepToToday(project)}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-[#4F46E5] transition-colors hover:bg-[#4F46E5] hover:text-white dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-[#4F46E5] dark:hover:text-white cursor-pointer"
                      title="Insertar en las tareas de Hoy"
                    >
                      <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>Enviar a Hoy</span>
                    </button>
                  )}
                </div>

                {/* Blockers inline bar (flat left accent, no nested box) */}
                {project.blockers && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-amber-500 pl-3 py-1 text-xs text-amber-800 dark:text-amber-300">
                    <div className="flex min-w-0 items-center gap-2">
                      <Zap size={15} strokeWidth={1.75} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      <span className="break-words"><strong>Bloqueo:</strong> {project.blockers}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleResolveBlocker(project.id)}
                      className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-amber-700 hover:underline dark:text-amber-300 cursor-pointer shrink-0"
                    >
                      <Check size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>Resolver</span>
                    </button>
                  </div>
                )}

                {/* Review Date Indicator */}
                {project.reviewDate && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <Calendar size={14} strokeWidth={1.75} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <span>
                      Revisión: <strong className="text-slate-800 dark:text-slate-200">{fmtDate(project.reviewDate)}</strong>
                      {daysToReview !== null && (
                        <span
                          className={`ml-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                            daysToReview < 0
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : daysToReview === 0
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                              : 'bg-indigo-500/10 text-[#4F46E5] dark:text-indigo-300'
                          }`}
                        >
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
                <div className="space-y-2.5 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      Tareas del proyecto ({completedTasks}/{totalTasks})
                    </span>
                    {totalTasks > 0 && (
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {Math.round((completedTasks / totalTasks) * 100)}% completado
                      </span>
                    )}
                  </div>

                  {/* Task List */}
                  <ListDivider>
                    {(project.tasks || []).map((t) => {
                      const isBlocked = isTaskBlocked(t.id, state);
                      const taskMap = getUnifiedTaskMap(state);
                      const blockersList = getBlockingTasks(t.id, taskMap);
                      const unblocks = getUnblockedCountIfCompleted(t.id, taskMap);
                      const isEditingDeps = editingDepTaskId === t.id;
                      const isEditingDueDate = editingDueDateTaskId === t.id;
                      const otherTasksInProject = (project.tasks || []).filter((other) => other.id !== t.id);

                      return (
                        <div key={t.id} id={`project-task-${t.id}`} className="py-2">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleTask(project.id, t.id)}
                              aria-label={t.done ? `Marcar pendiente: ${t.text}` : `Completar: ${t.text}`}
                              aria-pressed={t.done}
                              className="group flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                            >
                              <CompletionCheck checked={t.done} size="sm" />
                              <span
                                className={`min-w-0 max-w-full text-sm break-words [overflow-wrap:anywhere] ${
                                  t.done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {maskFinancialText(t.text, privacyActive)}
                              </span>

                              {!t.done && isBlocked && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 shrink-0"
                                  title={`Bloqueada por:\n${blockersList.map((b) => `• ${b.text}`).join('\n')}`}
                                >
                                  <Lock size={11} strokeWidth={1.75} aria-hidden="true" />
                                  <span>Bloqueada</span>
                                </span>
                              )}

                              {!t.done && unblocks > 0 && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-md border border-[#4F46E5]/20 bg-[#4F46E5]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#4F46E5] dark:text-indigo-300 shrink-0"
                                  title={`Completar esta tarea desbloqueará ${unblocks} tarea(s)`}
                                >
                                  <Unlock size={11} strokeWidth={1.75} aria-hidden="true" />
                                  <span>Desbloquea {unblocks}</span>
                                </span>
                              )}

                              {t.dueDate && (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold shrink-0 ${
                                    t.dueDate < today
                                      ? 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                      : t.dueDate === today
                                      ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                      : 'border-[#4F46E5]/20 bg-[#4F46E5]/10 text-[#4F46E5] dark:text-indigo-300'
                                  }`}
                                  title={`Fecha límite: ${fmtDate(t.dueDate)}`}
                                >
                                  <Clock size={11} strokeWidth={1.75} aria-hidden="true" />
                                  <span>{t.dueDate === today ? 'Hoy' : fmtDate(t.dueDate)}</span>
                                </span>
                              )}
                            </button>

                            <div className="flex items-center gap-0.5 shrink-0">
                              {!t.done && (
                                <button
                                  type="button"
                                  onClick={() => handleSendTaskToToday(project, t)}
                                  className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:bg-indigo-500/10 hover:text-[#4F46E5] dark:text-slate-400 dark:hover:text-indigo-300 cursor-pointer"
                                  title="Enviar esta tarea a Hoy"
                                  aria-label={`Enviar ${t.text} a Hoy`}
                                >
                                  <ArrowUpRight size={15} strokeWidth={1.75} aria-hidden="true" />
                                  <span className="hidden sm:inline">Hoy</span>
                                </button>
                              )}

                              {otherTasksInProject.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setEditingDepTaskId(isEditingDeps ? null : t.id)}
                                  className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                                    isEditingDeps || (t.dependsOn && t.dependsOn.length > 0)
                                      ? 'bg-indigo-500/15 text-[#4F46E5] dark:text-indigo-300'
                                      : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200'
                                  }`}
                                  title="Configurar dependencias"
                                  aria-label={`Configurar dependencias de ${t.text}`}
                                >
                                  <Link2 size={15} strokeWidth={1.75} aria-hidden="true" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setEditingDueDateTaskId(isEditingDueDate ? null : t.id)}
                                className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                                  isEditingDueDate || t.dueDate
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                    : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200'
                                }`}
                                title="Configurar fecha límite"
                                aria-label={`Configurar fecha límite de ${t.text}`}
                              >
                                <Calendar size={15} strokeWidth={1.75} aria-hidden="true" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteTask(project.id, t.id)}
                                className={`inline-flex min-h-11 min-w-11 sm:min-h-10 sm:min-w-10 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer ${cleanBtnFocus}`}
                                title="Eliminar tarea"
                                aria-label={`Eliminar tarea ${t.text}`}
                              >
                                <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          {/* Inline Dependencies Selector (flat indented divider, no nested card) */}
                          {isEditingDeps && (
                            <div className="mt-2 border-l-2 border-[#4F46E5]/40 pl-3 py-1.5 text-xs space-y-2">
                              <div className="flex items-center justify-between font-semibold text-slate-600 dark:text-slate-300">
                                <span>Esta tarea depende de:</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingDepTaskId(null)}
                                  className={`inline-flex min-h-9 items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer ${cleanBtnFocus}`}
                                >
                                  <span>Cerrar</span>
                                  <X size={13} strokeWidth={1.75} aria-hidden="true" />
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
                                      className={`inline-flex min-h-10 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${cleanBtnFocus} ${
                                        isSelected
                                          ? 'border-[#4F46E5] bg-[#4F46E5] text-white'
                                          : 'border-slate-200/80 bg-transparent text-slate-600 hover:border-[#4F46E5] dark:border-white/[0.08] dark:text-slate-300'
                                      }`}
                                    >
                                      {isSelected ? (
                                        <Check size={12} strokeWidth={2.2} aria-hidden="true" />
                                      ) : (
                                        <Plus size={12} strokeWidth={2.2} aria-hidden="true" />
                                      )}
                                      <span>{other.text}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Inline Due Date Picker (flat indented divider, no nested card) */}
                          {isEditingDueDate && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 border-l-2 border-amber-500/40 pl-3 py-1.5 text-xs">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Fecha límite:</span>
                              <input
                                type="date"
                                defaultValue={t.dueDate || today}
                                onChange={(e) => handleSetTaskDueDate(project.id, t.id, e.target.value)}
                                className="celestian-clean-field min-h-10 rounded-lg border border-slate-200/80 bg-white px-2.5 text-xs text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100"
                              />
                              {t.dueDate && (
                                <button
                                  type="button"
                                  onClick={() => handleSetTaskDueDate(project.id, t.id, '')}
                                  className="inline-flex min-h-10 items-center px-2 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                                >
                                  Quitar fecha
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingDueDateTaskId(null)}
                                className="ml-auto inline-flex min-h-10 items-center gap-1 px-2 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                              >
                                <Check size={13} strokeWidth={1.75} aria-hidden="true" />
                                <span>Listo</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ListDivider>

                  {/* Add Subtask Input */}
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
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
                      placeholder="Agregar tarea al proyecto..."
                      className={`${fieldClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTask(project.id)}
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-transparent px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer"
                    >
                      Añadir
                    </button>
                  </div>
                </div>

                {/* Notes footer if present */}
                {project.notes && (
                  <p className="flex items-start gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-white/[0.06] dark:text-slate-400">
                    <MessageSquare size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <span className="break-words">{maskFinancialText(project.notes, privacyActive)}</span>
                  </p>
                )}
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
