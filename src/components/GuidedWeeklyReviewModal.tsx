import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LifeOSState, ViewType } from '../types';
import {
  gatherWeeklyReviewData,
  formatWeeklyReviewSummaryNote,
  type WeeklyReviewData,
} from '../lib/review';
import { fmtDate, fmtMoney, todayISO, uid } from '../lib/storage';
import { playSound } from '../lib/audio';
import { showToast } from '../lib/toast';
import { PrivacyAmount } from './PrivacyAmount';

interface GuidedWeeklyReviewModalProps {
  state: LifeOSState;
  open: boolean;
  onClose: () => void;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate?: (view: ViewType) => void;
}
import { isModuleEnabled } from '../lib/moduleVisibility';

export type ReviewStepKey = 'tasks' | 'gym' | 'finances' | 'sleep' | 'projects' | 'conclusions';

export interface ReviewStepItem {
  key: ReviewStepKey;
  label: string;
}

export const GuidedWeeklyReviewModal: React.FC<GuidedWeeklyReviewModalProps> = ({
  state,
  open,
  onClose,
  onUpdateState,
  onNavigate: _onNavigate,
}) => {
  const today = todayISO();
  const [step, setStep] = useState(1);
  const [learnings, setLearnings] = useState('');
  const [priorityInput, setPriorityInput] = useState('');
  const [nextWeekPriorities, setNextWeekPriorities] = useState<string[]>([]);

  const steps: ReviewStepItem[] = useMemo(() => {
    const list: ReviewStepItem[] = [{ key: 'tasks', label: 'Tareas' }];
    if (isModuleEnabled(state, 'gimnasio')) {
      list.push({ key: 'gym', label: 'Gimnasio' });
    }
    if (isModuleEnabled(state, 'finanzas')) {
      list.push({ key: 'finances', label: 'Finanzas' });
    }
    list.push(
      { key: 'sleep', label: 'Descanso' },
      { key: 'projects', label: 'Proyectos' },
      { key: 'conclusions', label: 'Conclusiones' }
    );
    return list;
  }, [state]);

  const currentStep = steps[step - 1] || steps[0];
  const totalSteps = steps.length;

  useEffect(() => {
    if (step > steps.length) {
      setStep(steps.length);
    }
  }, [step, steps.length]);

  const reviewData: WeeklyReviewData = useMemo(() => {
    return gatherWeeklyReviewData(state, today);
  }, [state, today]);

  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusedElementRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusedElementRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleAddPriority = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!priorityInput.trim()) return;
    if (nextWeekPriorities.length >= 5) {
      showToast('Máximo 5 prioridades semanales recomendadas', 'info');
      return;
    }
    setNextWeekPriorities((prev) => [...prev, priorityInput.trim()]);
    setPriorityInput('');
  };

  const handleRemovePriority = (index: number) => {
    setNextWeekPriorities((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRescheduleTaskToToday = (taskId: string) => {
    onUpdateState((draft) => {
      const task = draft.todayExtras.find((t) => t.id === taskId);
      if (task) {
        task.date = today;
      }
    });
    playSound('click');
    showToast('Tarea movida a Hoy', 'success');
  };

  const handleDiscardOverdueTask = (taskId: string) => {
    onUpdateState((draft) => {
      draft.todayExtras = draft.todayExtras.filter((t) => t.id !== taskId);
    });
    playSound('click');
    showToast('Tarea descartada', 'info');
  };

  const handleClearBlocker = (projectId: string) => {
    onUpdateState((draft) => {
      const proj = (draft.projects || []).find((p) => p.id === projectId);
      if (proj) {
        proj.blockers = '';
        proj.updatedAt = new Date().toISOString();
      }
    });
    playSound('success');
    showToast('Bloqueo resuelto en el proyecto', 'success');
  };

  const handleCompleteReview = () => {
    const summaryNoteText = formatWeeklyReviewSummaryNote(
      reviewData,
      learnings,
      nextWeekPriorities,
      {
        showGym: isModuleEnabled(state, 'gimnasio'),
        showFinances: isModuleEnabled(state, 'finanzas'),
      }
    );

    onUpdateState((draft) => {
      // 1. Mark weekly review done
      draft.settings.lastWeeklyReviewAt = today;

      // 2. Save conclusions as post-it note
      if (!draft.notes) {
        draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
      }
      if (!draft.notes.postits) draft.notes.postits = [];
      draft.notes.postits.unshift({
        id: uid(),
        text: summaryNoteText,
        date: today,
      });

      // 3. Add next week priorities to dailyPriorities
      if (nextWeekPriorities.length > 0) {
        if (!draft.dailyPriorities) draft.dailyPriorities = [];
        nextWeekPriorities.forEach((priText, idx) => {
          draft.dailyPriorities.push({
            id: uid(),
            date: today,
            text: priText,
            done: false,
            rank: idx + 1,
          });
        });
      }
    });

    playSound('success');
    showToast('¡Revisión semanal completada y guardada en Notas! 🎉', 'success');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Revisión Semanal Guiada"
        className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-[var(--border)] bg-[var(--bg)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold">
                🧭
              </span>
              <div>
                <h2 className="text-base font-extrabold text-[var(--text)] tracking-tight">
                  Revisión Semanal Guiada
                </h2>
                <p className="text-xs text-[var(--text-soft)]">
                  Paso {step} de {totalSteps}: {currentStep.label}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] font-bold flex items-center justify-center cursor-pointer transition"
            >
              ✕
            </button>
          </div>

          {/* Stepper bar */}
          <div className="flex items-center gap-1.5 mt-4">
            {steps.map((s, idx) => {
              const stepNum = idx + 1;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(stepNum)}
                  className={`flex-1 h-1.5 rounded-full transition-all cursor-pointer ${
                    step === stepNum
                      ? 'bg-purple-500'
                      : step > stepNum
                      ? 'bg-purple-500/40'
                      : 'bg-[var(--border)]'
                  }`}
                  title={s.label}
                />
              );
            })}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* STEP 1: TASKS */}
          {currentStep.key === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)]">Tareas & Cumplimiento 📋</h3>
                  <p className="text-xs text-[var(--text-faint)]">
                    Auditoría de tareas terminadas y pendientes en los últimos 7 días.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                  <span className="text-2xl font-black text-emerald-500 block">
                    {reviewData.tasks.totalCompleted}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-soft)]">
                    Completadas
                  </span>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
                  <span className="text-2xl font-black text-amber-500 block">
                    {reviewData.tasks.totalOverdue}
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-soft)]">
                    Postergadas / Vencidas
                  </span>
                </div>
              </div>

              {reviewData.tasks.overdue.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-[var(--text)] block">
                    Limpieza de pendientes atrasados:
                  </span>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {reviewData.tasks.overdue.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--text)] truncate">{t.text}</p>
                          <span className="text-[10px] text-amber-500 tabular-nums">
                            Desde el {fmtDate(t.date)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleRescheduleTaskToToday(t.id)}
                            className="rounded-lg bg-[var(--blue-soft)] border border-[var(--blue)]/30 px-2 py-1 text-[10px] font-bold text-[var(--blue)] hover:bg-[var(--blue)] hover:text-white cursor-pointer"
                          >
                            Hoy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDiscardOverdueTask(t.id)}
                            className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--text-faint)] hover:text-rose-500 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-emerald-600 bg-emerald-500/5">
                  ✓ ¡Al día! No tenés tareas atrasadas acumuladas.
                </div>
              )}
            </div>
          )}

          {/* STEP 2: GYM & FITNESS */}
          {currentStep.key === 'gym' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Gimnasio & Entrenamiento 🏋️</h3>
                <p className="text-xs text-[var(--text-faint)]">
                  Sesiones completadas, series ejecutadas y tonelaje acumulado.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-center">
                  <span className="text-xl font-black text-[var(--text)] block">
                    {reviewData.gym.sessionsCount}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Sesiones
                  </span>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-center">
                  <span className="text-xl font-black text-[var(--text)] block">
                    {reviewData.gym.totalSets}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Series
                  </span>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-center">
                  <span className="text-xl font-black text-amber-500 block">
                    {reviewData.gym.totalVolumeKg.toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Kg Volumen
                  </span>
                </div>
              </div>

              {reviewData.gym.sessions.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[var(--text)] block">
                    Detalle de entrenamientos:
                  </span>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {reviewData.gym.sessions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xs"
                      >
                        <div>
                          <strong className="text-[var(--text)] block">{s.title}</strong>
                          <span className="text-[10px] text-[var(--text-faint)]">
                            {fmtDate(s.date)} • {s.setsCount} series
                          </span>
                        </div>
                        <span className="text-xs tabular-nums font-bold text-amber-500">
                          {s.volumeKg.toLocaleString()} kg
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--text-faint)]">
                  No registraste entrenamientos en los últimos 7 días.
                </div>
              )}

              {reviewData.gym.currentWeight && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 flex items-center justify-between text-xs">
                  <span className="text-[var(--text-soft)]">Último peso registrado:</span>
                  <strong className="text-[var(--text)] tabular-nums text-sm">
                    {reviewData.gym.currentWeight} kg
                  </strong>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: FINANCES */}
          {currentStep.key === 'finances' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Finanzas & Flujo Semanal 💰</h3>
                <p className="text-xs text-[var(--text-faint)]">
                  Gastos e ingresos reales registrados en los últimos 7 días.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3 text-center">
                  <span className="text-lg font-black text-rose-500 block">
                    <PrivacyAmount>{fmtMoney(reviewData.finances.totalExpenses)}</PrivacyAmount>
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Gastos
                  </span>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                  <span className="text-lg font-black text-emerald-500 block">
                    <PrivacyAmount>{fmtMoney(reviewData.finances.totalIncome)}</PrivacyAmount>
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Ingresos
                  </span>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-center">
                  <span
                    className={`text-lg font-black block ${
                      reviewData.finances.netBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    <PrivacyAmount>{fmtMoney(reviewData.finances.netBalance)}</PrivacyAmount>
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Balance Neto
                  </span>
                </div>
              </div>

              {reviewData.finances.topCategories.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-[var(--text)] block">
                    Mayores categorías de gasto:
                  </span>
                  <div className="space-y-1.5">
                    {reviewData.finances.topCategories.map((c) => (
                      <div
                        key={c.category}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xs"
                      >
                        <span className="font-semibold text-[var(--text)]">{c.category}</span>
                        <span className="tabular-nums font-bold text-rose-500">
                          <PrivacyAmount>{fmtMoney(c.amount)}</PrivacyAmount>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: SLEEP & HABITS */}
          {currentStep.key === 'sleep' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Descanso & Energía 🌙</h3>
                <p className="text-xs text-[var(--text-faint)]">
                  Horas de sueño y nivel de energía registrados en el checkout diario.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-center">
                  <span className="text-xl font-black text-indigo-500 block">
                    {reviewData.sleep.avgHours !== null ? `${reviewData.sleep.avgHours} h` : '—'}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Promedio sueño
                  </span>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-center">
                  <span className="text-xl font-black text-[var(--text)] block">
                    {reviewData.sleep.minHours !== null ? `${reviewData.sleep.minHours} h` : '—'}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Noche más baja
                  </span>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-center">
                  <span className="text-xl font-black text-amber-500 block">
                    {reviewData.sleep.avgEnergy !== null ? `${reviewData.sleep.avgEnergy}/5` : '—'}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase">
                    Energía promedio
                  </span>
                </div>
              </div>

              {reviewData.sleep.avgHours !== null && reviewData.sleep.avgHours < 7 && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 flex items-start gap-2.5 text-xs text-rose-600 dark:text-rose-400">
                  <span className="text-base">⚠️</span>
                  <div>
                    <strong className="block font-bold">Déficit de sueño detectado</strong>
                    <p className="text-[11px] mt-0.5">
                      Tu promedio semanal ({reviewData.sleep.avgHours} h) está por debajo de las 7 horas recomendadas. Considerá ajustar horarios para priorizar recuperación.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: PROJECTS & BLOCKERS */}
          {currentStep.key === 'projects' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">Proyectos & Bloqueos 🎯</h3>
                <p className="text-xs text-[var(--text-faint)]">
                  Estado de proyectos activos, próximos pasos y resolución de cuellos de botella.
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 flex items-center justify-between text-xs">
                <span className="text-[var(--text-soft)]">Proyectos en curso:</span>
                <strong className="text-[var(--text)] font-bold">
                  {reviewData.projects.activeCount} activos
                </strong>
              </div>

              {/* Blockers alert */}
              {reviewData.projects.withBlockers.length > 0 ? (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-rose-500 block">
                    Bloqueos detectados ({reviewData.projects.withBlockers.length}):
                  </span>
                  <div className="space-y-2">
                    {reviewData.projects.withBlockers.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="font-bold text-rose-600 dark:text-rose-400">
                            {b.name}
                          </strong>
                          <button
                            type="button"
                            onClick={() => handleClearBlocker(b.id)}
                            className="rounded-md bg-rose-500 text-white px-2 py-0.5 text-[10px] font-bold cursor-pointer hover:bg-rose-600"
                          >
                            Resolver bloqueo ✓
                          </button>
                        </div>
                        <p className="text-[var(--text-soft)]">{b.blockers}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-emerald-600 bg-emerald-500/5">
                  ✓ Ningún proyecto activo reporta bloqueos en este momento.
                </div>
              )}

              {/* Active Projects Next Steps */}
              {reviewData.projects.active.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-[var(--text)] block">
                    Próximos pasos de proyectos:
                  </span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {reviewData.projects.active.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <strong className="text-[var(--text)] block truncate">{p.name}</strong>
                          <span className="text-[10px] text-[var(--text-faint)]">
                            {p.nextStep ? `Próximo paso: ${p.nextStep}` : 'Sin próximo paso definido'}
                          </span>
                        </div>
                        {p.nextStep && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!nextWeekPriorities.includes(p.nextStep!)) {
                                setNextWeekPriorities((prev) => [...prev, `${p.name}: ${p.nextStep}`]);
                                showToast('Agregado como prioridad semanal', 'success');
                              }
                            }}
                            className="shrink-0 text-[10px] font-bold text-[var(--blue)] hover:underline cursor-pointer"
                          >
                            + Prioridad
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: PRIORITIES & CONCLUSIONS */}
          {currentStep.key === 'conclusions' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-[var(--text)]">
                  Prioridades & Conclusiones 💡
                </h3>
                <p className="text-xs text-[var(--text-faint)]">
                  Fijá tus objetivos clave para la próxima semana y guardá tus aprendizajes.
                </p>
              </div>

              {/* Add Priority Input */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[var(--text)]">
                  Prioridades para la próxima semana (1 a 5):
                </label>
                <form onSubmit={handleAddPriority} className="flex gap-2">
                  <input
                    value={priorityInput}
                    onChange={(e) => setPriorityInput(e.target.value)}
                    placeholder="Ej: Finalizar entrega de proyecto, hacer 4 sesiones de gym..."
                    className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs outline-none focus:border-[var(--blue)]"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[var(--text)] px-3.5 py-2 text-xs font-bold text-[var(--bg-elevated)] cursor-pointer"
                  >
                    ＋ Agregar
                  </button>
                </form>

                {nextWeekPriorities.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {nextWeekPriorities.map((pri, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs"
                      >
                        <span className="font-semibold text-[var(--text)]">
                          {idx + 1}. {pri}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePriority(idx)}
                          className="text-xs text-[var(--text-faint)] hover:text-rose-500 px-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Learnings & Reflections */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--text)]">
                  Aprendizajes & ajustes (opcional):
                </label>
                <textarea
                  value={learnings}
                  onChange={(e) => setLearnings(e.target.value)}
                  placeholder="¿Qué anduvo bien esta semana? ¿Qué causó fricción y qué ajuste hacés para la próxima?"
                  rows={3}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-xs outline-none focus:border-[var(--blue)]"
                />
              </div>

              {/* Final notice */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-[11px] text-[var(--text-soft)]">
                Al finalizar, se creará una nota fechada en tus <strong>Notas & Post-its</strong> con toda la evidencia auditada y se marcará la revisión semanal como completada.
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)] flex items-center justify-between gap-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text)] hover:bg-[var(--card)] cursor-pointer"
            >
              ← Anterior
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
              className="rounded-xl bg-[var(--text)] px-5 py-2 text-xs font-bold text-[var(--bg-elevated)] hover:opacity-90 cursor-pointer flex items-center gap-1.5"
            >
              <span>Siguiente</span>
              <span>→</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCompleteReview}
              className="rounded-xl bg-purple-600 hover:bg-purple-700 px-6 py-2.5 text-xs font-extrabold text-white shadow-md cursor-pointer transition flex items-center gap-2"
            >
              <span>🎉 Guardar Revisión & Conclusiones</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
