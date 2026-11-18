import { getStudyWorkspace } from '../lib/studyWorkspace';
import React, { useState, useEffect, useMemo } from 'react';
import { showToast } from '../lib/toast';
import type { LifeOSState, Exam, Subject, StudyLog, StudySessionPhase } from '../types';
import { FocusTimer } from './FocusTimer';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { playSound } from '../lib/audio';
import {
  todayISO,
  fmtDate,
  uid,
} from '../lib/storage';
import {
  studyMinutesForDate,
  studyMinutesThisWeek,
  examApprovalPct,
} from '../lib/calculations';
import { classifyStudyOverview, selectStudyExams } from '../lib/studyPresentation';
import {
  validateStudyMinutes,
  validateSubjectName,
  renameSubject,
  canDeleteSubject,
  getSubjectDisplayName,
  startStudySession,
  advanceStudyPhase,
  pauseStudySession,
  resumeStudySession,
  recordStudySession,
  updateStudyLog,
  deleteStudyLog,
  formatStudyDuration,
  validateExamData,
  addExam,
  updateExam,
  deleteExam,
  getExamDisplayName,
  categorizeExams,
  getSubjectStats,
  addSubjectTopic,
  toggleSubjectTopic,
  deleteSubjectTopic,
  addExamTopic,
  toggleExamTopic,
  deleteExamTopic,
  getExamPreparationMetrics,
  type PomodoroSessionConfig,
} from '../lib/studyFlows';
import { focusTargetElement } from '../lib/navigationFocus';

interface EstudiosViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  initialFocusId?: string | null;
  focusNonce?: number;
  onOpenNote?: (id: string) => void;
  onOpenAgenda?: () => void;
}

export const EstudiosView: React.FC<EstudiosViewProps> = ({
  state,
  onUpdateState,
  initialFocusId,
  focusNonce,
  onOpenNote,
  onOpenAgenda,
}) => {
  const subjects = useMemo(() => state.study?.subjects || [], [state.study?.subjects]);
  const exams = useMemo(() => state.study?.exams || [], [state.study?.exams]);
  const studyLogs = useMemo(() => state.study?.studyLog || [], [state.study?.studyLog]);

  // Manejo de foco dirigido (e.g. desde «Atención ahora»)
  useEffect(() => {
    if (initialFocusId) {
      return focusTargetElement(initialFocusId);
    }
  }, [initialFocusId, focusNonce]);

  // Filtros y estados de visualización
  const [examTab, setExamTab] = useState<'upcoming' | 'pending_results' | 'completed' | 'all'>('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  // Registro manual de estudio
  const [studyDate, setStudyDate] = useState(todayISO());
  const [studyMinutes, setStudyMinutes] = useState('');
  const [studySubjectId, setStudySubjectId] = useState('');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [manualFormOpen, setManualFormOpen] = useState(false);

  // Edición de registro de estudio
  const [editingLog, setEditingLog] = useState<StudyLog | null>(null);
  const [editLogMinutes, setEditLogMinutes] = useState('');
  const [editLogSubjectId, setEditLogSubjectId] = useState('');
  const [editLogDate, setEditLogDate] = useState('');

  // Modales
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectInputName, setSubjectInputName] = useState('');
  const [subjectInputError, setSubjectInputError] = useState<string | null>(null);

  const [examModalOpen, setExamModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [examInputTitle, setExamInputTitle] = useState('');
  const [examInputSubjectId, setExamInputSubjectId] = useState('');
  const [examInputDate, setExamInputDate] = useState(todayISO());
  const [examInputTime, setExamInputTime] = useState('');
  const [examInputStatus, setExamInputStatus] = useState<Exam['status']>('pendiente');
  const [examInputGrade, setExamInputGrade] = useState('');
  const [examInputError, setExamInputError] = useState<string | null>(null);

  // Temarios por materia y por evaluación
  const [expandedSubjectTopicsId, setExpandedSubjectTopicsId] = useState<string | null>(null);
  const [newSubjectTopicTitle, setNewSubjectTopicTitle] = useState('');
  const [expandedExamTopicsId, setExpandedExamTopicsId] = useState<string | null>(null);
  const [newExamTopicTitle, setNewExamTopicTitle] = useState('');

  useEffect(() => {
    if (!editingLog && !subjectModalOpen && !examModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingLog) setEditingLog(null);
      if (subjectModalOpen) setSubjectModalOpen(false);
      if (examModalOpen) setExamModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingLog, subjectModalOpen, examModalOpen]);

  const saveStudyChange = (updater: (draft: LifeOSState) => void) => {
    try { return onUpdateState(updater); }
    catch (error) { showToast(error instanceof Error ? error.message : 'No se pudo guardar Estudios.', 'error'); return false; }
  };

  // Derivaciones
  const approvalRate = useMemo(() => examApprovalPct(state), [state]);
  const minutesToday = useMemo(() => studyMinutesForDate(state, todayISO()), [state]);
  const minutesWeek = useMemo(() => studyMinutesThisWeek(state), [state]);
  const categorized = useMemo(() => categorizeExams(exams), [exams]);

  // Filtrado de evaluaciones según pestaña y materia seleccionada
  const displayedExams = useMemo(() => {
    return selectStudyExams(examTab, exams, categorized, selectedSubjectFilter);
  }, [examTab, categorized, exams, selectedSubjectFilter]);

  // ---------------------------------------------------------------------------
  // Handlers de Materias
  // ---------------------------------------------------------------------------
  const openCreateSubjectModal = () => {
    setEditingSubject(null);
    setSubjectInputName('');
    setSubjectInputError(null);
    setSubjectModalOpen(true);
  };

  const openEditSubjectModal = (s: Subject) => {
    setEditingSubject(s);
    setSubjectInputName(s.name);
    setSubjectInputError(null);
    setSubjectModalOpen(true);
  };

  const handleSaveSubject = (e: React.FormEvent) => {
    e.preventDefault();
    const validated = validateSubjectName(
      subjectInputName,
      subjects,
      editingSubject?.id
    );
    if (!validated.valid || !validated.name) {
      setSubjectInputError(validated.error || 'Nombre inválido.');
      return;
    }

    if (editingSubject) {
      const saved = saveStudyChange((draft) => {
        const result = renameSubject(draft, editingSubject.id, validated.name!);
        if (!result.success) throw new Error(result.error);
      });
      if (!saved) { setSubjectInputError('No se pudo guardar. Conservamos los datos para reintentar.'); return; }
      showToast('Materia renombrada.', 'success');
    } else {
      const saved = saveStudyChange((draft) => {
        if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
        if (!draft.study.subjects) draft.study.subjects = [];
        const now = Date.now();
        draft.study.subjects.push({
          id: uid(),
          name: validated.name!,
          createdAt: now,
          updatedAt: now,
        });
      });
      if (!saved) { setSubjectInputError('No se pudo guardar. Conservamos los datos para reintentar.'); return; }
      showToast('Materia agregada.', 'success');
    }
    setSubjectModalOpen(false);
  };

  const handleDeleteSubject = (id: string) => {
    const check = canDeleteSubject(id, state);
    if (!check.canDelete) {
      setSubjectError(check.reason || 'Materia protegida contra eliminación.');
      showToast(check.reason || 'Materia protegida.', 'info');
      return;
    }
    setSubjectError(null);
    const sub = subjects.find((s) => s.id === id);
    if (!window.confirm(`¿Eliminar la materia "${sub?.name || 'seleccionada'}"?`)) return;
    const removedSubject = sub ? structuredClone(sub) : null;

    const saved = saveStudyChange((draft) => {
      if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
      const currentCheck = canDeleteSubject(id, draft);
      if (!currentCheck.canDelete) throw new Error(currentCheck.reason);
      draft.study.subjects = (draft.study.subjects || []).filter((s) => s.id !== id);
    });
    if (!saved) return;
    if (selectedSubjectFilter === id) {
      setSelectedSubjectFilter(null);
    }
    showToast('Materia eliminada.', 'info', removedSubject ? {
      actionLabel: 'Deshacer',
      onAction: () => {
        const restored = saveStudyChange((draft) => {
          if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
          if (!draft.study.subjects.some((s) => s.id === removedSubject.id)) {
            draft.study.subjects.push({ ...removedSubject, updatedAt: Date.now() });
          }
        });
        if (restored) showToast(`Materia "${removedSubject.name}" restaurada.`, 'success');
      },
    } : undefined);
  };

  const handleAddSubjectTopic = (subjectId: string, e: React.FormEvent) => {
    e.preventDefault();
    let errorMsg: string | undefined;
    const saved = saveStudyChange((draft) => {
      const res = addSubjectTopic(draft, subjectId, newSubjectTopicTitle);
      if (!res.success) {
        errorMsg = res.error;
        throw new Error(res.error || 'No se pudo agregar el tema.');
      }
    });
    if (!saved) {
      if (errorMsg) showToast(errorMsg, 'info');
      return;
    }
    setNewSubjectTopicTitle('');
  };

  const handleToggleSubjectTopic = (subjectId: string, topicId: string) => {
    saveStudyChange((draft) => {
      toggleSubjectTopic(draft, subjectId, topicId);
    });
  };

  const handleDeleteSubjectTopic = (subjectId: string, topicId: string) => {
    const subject = subjects.find((s) => s.id === subjectId);
    const removedTopic = subject?.topics?.find((t) => t.id === topicId);
    const snapshot = removedTopic ? structuredClone(removedTopic) : null;
    const saved = saveStudyChange((draft) => {
      deleteSubjectTopic(draft, subjectId, topicId);
    });
    if (!saved || !snapshot) return;
    showToast('Tema eliminado.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        saveStudyChange((draft) => {
          const target = (draft.study?.subjects || []).find((s) => s.id === subjectId);
          if (!target) return;
          if (!target.topics) target.topics = [];
          if (!target.topics.some((t) => t.id === snapshot.id)) {
            target.topics.push({ ...snapshot, updatedAt: Date.now() });
            target.updatedAt = Date.now();
          }
        });
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Handlers de Evaluaciones
  // ---------------------------------------------------------------------------
  const openCreateExamModal = (presetSubjectId?: string) => {
    setEditingExam(null);
    setExamInputTitle('');
    setExamInputSubjectId(presetSubjectId || selectedSubjectFilter || (subjects[0]?.id ?? ''));
    setExamInputDate(todayISO());
    setExamInputTime('');
    setExamInputStatus('pendiente');
    setExamInputGrade('');
    setExamInputError(null);
    setExamModalOpen(true);
  };

  const openEditExamModal = (examItem: Exam) => {
    setEditingExam(examItem);
    setExamInputTitle(examItem.title || '');
    setExamInputSubjectId(examItem.subjectId || '');
    setExamInputDate(examItem.date);
    setExamInputTime(examItem.time || '');
    setExamInputStatus(examItem.status);
    setExamInputGrade(examItem.grade || '');
    setExamInputError(null);
    setExamModalOpen(true);
  };

  const handleSaveExam = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: examInputTitle.trim(),
      subjectId: examInputSubjectId || null,
      date: examInputDate,
      time: examInputTime || null,
      status: examInputStatus,
      grade: examInputGrade || null,
    };

    const validated = validateExamData(payload);
    if (!validated.valid || !validated.data) {
      setExamInputError(validated.error || 'Datos de evaluación inválidos.');
      return;
    }

    if (editingExam) {
      const saved = saveStudyChange((draft) => {
        const result = updateExam(draft, editingExam.id, payload);
        if (!result.success) throw new Error(result.error);
      });
      if (!saved) { setExamInputError('No se pudo guardar. Conservamos los datos para reintentar.'); return; }
      showToast('Evaluación actualizada.', 'success');
    } else {
      const saved = saveStudyChange((draft) => {
        const result = addExam(draft, payload);
        if (!result.success) throw new Error(result.error);
      });
      if (!saved) { setExamInputError('No se pudo guardar. Conservamos los datos para reintentar.'); return; }
      showToast('Evaluación registrada.', 'success');
    }
    setExamModalOpen(false);
  };

  const handleSetExamStatus = (id: string, newStatus: Exam['status']) => {
    saveStudyChange((draft) => {
      const result = updateExam(draft, id, { status: newStatus });
      if (!result.success) throw new Error(result.error);
    });
  };

  const handleDeleteExam = (id: string) => {
    const existing = exams.find((ex) => ex.id === id);
    if (!window.confirm('¿Eliminar este examen?')) return;
    const removedExam = existing ? structuredClone(existing) : null;
    const saved = saveStudyChange((draft) => {
      deleteExam(draft, id);
    });
    if (!saved) return;
    showToast('Evaluación eliminada.', 'info', removedExam ? {
      actionLabel: 'Deshacer',
      onAction: () => {
        const restored = saveStudyChange((draft) => {
          if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
          if (!draft.study.exams.some((ex) => ex.id === removedExam.id)) {
            draft.study.exams.push({ ...removedExam, updatedAt: Date.now() });
          }
        });
        if (restored) showToast('Evaluación restaurada.', 'success');
      },
    } : undefined);
  };

  const handleAddExamTopic = (examId: string, e: React.FormEvent) => {
    e.preventDefault();
    let errorMsg: string | undefined;
    const saved = saveStudyChange((draft) => {
      const res = addExamTopic(draft, examId, newExamTopicTitle);
      if (!res.success) {
        errorMsg = res.error;
        throw new Error(res.error || 'No se pudo agregar el tema.');
      }
    });
    if (!saved) {
      if (errorMsg) showToast(errorMsg, 'info');
      return;
    }
    setNewExamTopicTitle('');
  };

  const handleToggleExamTopic = (examId: string, topicId: string) => {
    saveStudyChange((draft) => {
      toggleExamTopic(draft, examId, topicId);
    });
  };

  const handleDeleteExamTopic = (examId: string, topicId: string) => {
    const exam = exams.find((ex) => ex.id === examId);
    const removedTopic = exam?.topics?.find((t) => t.id === topicId);
    const snapshot = removedTopic ? structuredClone(removedTopic) : null;
    const saved = saveStudyChange((draft) => {
      deleteExamTopic(draft, examId, topicId);
    });
    if (!saved || !snapshot) return;
    showToast('Tema eliminado.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        saveStudyChange((draft) => {
          const target = (draft.study?.exams || []).find((ex) => ex.id === examId);
          if (!target) return;
          if (!target.topics) target.topics = [];
          if (!target.topics.some((t) => t.id === snapshot.id)) {
            target.topics.push({ ...snapshot, updatedAt: Date.now() });
            target.updatedAt = Date.now();
          }
        });
      },
    });
  };

  const getExamPriorityText = (examItem: Exam): string => {
    const meta = getExamDisplayName(examItem, subjects);
    const prep = getExamPreparationMetrics(examItem, state, todayISO());
    const nextTopic = prep.pendingTopics[0];
    return nextTopic
      ? `Repasar para ${meta.fullLabel}: ${nextTopic.title}`
      : `Repasar para ${meta.fullLabel}`;
  };

  const isExamPrioritizedToday = (examItem: Exam): boolean => {
    const today = todayISO();
    const meta = getExamDisplayName(examItem, subjects);
    const todayPrios = (state.dailyPriorities || []).filter((p) => p.date === today && !p.done);
    const targetNeedle = meta.subjectName
      ? meta.subjectName.toLowerCase()
      : meta.title.toLowerCase();
    return todayPrios.some((p) => p.text.toLowerCase().includes(targetNeedle));
  };

  const handlePrioritizeExamToday = (examItem: Exam) => {
    const today = todayISO();
    const currentToday = (state.dailyPriorities || []).filter((p) => p.date === today);
    if (currentToday.length >= 5) {
      showToast('Ya tenés 5 prioridades cargadas en Hoy.', 'info');
      return;
    }
    const text = getExamPriorityText(examItem);
    const createdId = uid();
    const saved = saveStudyChange((draft) => {
      if (!draft.dailyPriorities) draft.dailyPriorities = [];
      draft.dailyPriorities.push({
        id: createdId,
        text,
        done: false,
        date: today,
      });
    });
    if (!saved) return;
    playSound('click');
    showToast('Sumado a las prioridades de Hoy.', 'success', {
      actionLabel: 'Deshacer',
      onAction: () => {
        saveStudyChange((draft) => {
          draft.dailyPriorities = (draft.dailyPriorities || []).filter((p) => p.id !== createdId);
        });
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Handlers de Registro e Historial de Estudio
  // ---------------------------------------------------------------------------
  const handleAddStudy = (e: React.FormEvent) => {
    e.preventDefault();
    const validated = validateStudyMinutes(studyMinutes);
    if (!validated.valid || !validated.minutes) {
      showToast(validated.error || 'Minutos inválidos.', 'info');
      return;
    }

    const selectedSub = studySubjectId
      ? subjects.find((s) => s.id === studySubjectId)
      : null;

    const saved = onUpdateState((draft) => {
      if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] };
      if (!draft.study.studyLog) draft.study.studyLog = [];
      const now = Date.now();
      draft.study.studyLog.push({
        id: uid(),
        date: studyDate || todayISO(),
        minutes: validated.minutes!,
        subjectId: studySubjectId || null,
        subjectName: selectedSub?.name || null,
        createdAt: now,
        updatedAt: now,
      });
    });
    if (!saved) return;
    setStudyMinutes('');
    setManualFormOpen(false);
    showToast('Tiempo de estudio registrado.', 'success');
  };

  const openEditLogModal = (log: StudyLog) => {
    setEditingLog(log);
    setEditLogMinutes(String(log.minutes));
    setEditLogSubjectId(log.subjectId || '');
    setEditLogDate(log.date);
  };

  const handleSaveEditLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;
    const validated = validateStudyMinutes(editLogMinutes);
    if (!validated.valid || !validated.minutes) {
      showToast(validated.error || 'Minutos inválidos.', 'info');
      return;
    }
    let result: ReturnType<typeof updateStudyLog> = { success: false };
    const saved = onUpdateState((draft) => {
      result = updateStudyLog(draft, editingLog.id, {
        minutes: validated.minutes,
        subjectId: editLogSubjectId || null,
        date: editLogDate,
      });
    });
    if (!result.success) {
      showToast(result.error || 'No se pudo corregir el registro.', 'error');
      return;
    }
    if (!saved) return;
    setEditingLog(null);
    showToast('Registro de estudio corregido.', 'success');
  };

  const handleDeleteStudy = (id: string) => {
    const existing = studyLogs.find((l) => l.id === id);
    if (!window.confirm('¿Eliminar este registro de estudio?')) return;
    const removedLog = existing ? structuredClone(existing) : null;
    const saved = onUpdateState((draft) => {
      deleteStudyLog(draft, id);
    });
    if (saved) {
      showToast('Registro eliminado.', 'info', removedLog ? {
        actionLabel: 'Deshacer',
        onAction: () => {
          const restored = onUpdateState((draft) => {
            if (!draft.study) draft.study = { studyLog: [], subjects: [], exams: [] };
            if (!draft.study.studyLog.some((l) => l.id === removedLog.id)) {
              draft.study.studyLog.push({ ...removedLog, updatedAt: Date.now() });
            }
          });
          if (restored) showToast('Registro de estudio restaurado.', 'success');
        },
      } : undefined);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers del Temporizador Focus / Pomodoro
  // ---------------------------------------------------------------------------
  const handleStartSession = (
    mins: number,
    targetSubjectId?: string | null,
    pomodoroConfig?: PomodoroSessionConfig
  ) => {
    const subName = targetSubjectId
      ? subjects.find((s) => s.id === targetSubjectId)?.name || null
      : null;
    onUpdateState((draft) => {
      if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
      draft.study.activeSession = startStudySession(
        mins,
        targetSubjectId,
        subName,
        Date.now(),
        pomodoroConfig
      );
    });
  };

  const handleStartFreeSession = () => {
    handleStartSession(25, null, {
      phase: 'focus',
      cycle: 1,
      totalCycles: 4,
    });
    requestAnimationFrame(() => focusTargetElement('qa-focus-timer'));
  };

  const handlePauseSession = () => {
    onUpdateState((draft) => {
      if (draft.study?.activeSession) {
        draft.study.activeSession = pauseStudySession(draft.study.activeSession);
      }
    });
  };

  const handleResumeSession = () => {
    onUpdateState((draft) => {
      if (draft.study?.activeSession) {
        draft.study.activeSession = resumeStudySession(draft.study.activeSession);
      }
    });
  };

  const handleResetSession = () => {
    onUpdateState((draft) => {
      if (draft.study) draft.study.activeSession = null;
    });
  };

  const handleFinishEarly = (elapsedMinutes?: number) => {
    if (!state.study?.activeSession) return;
    const isBreak = state.study.activeSession.phase === 'short_break' || state.study.activeSession.phase === 'long_break';

    if (isBreak) {
      const saved = saveStudyChange((draft) => {
        if (draft.study) draft.study.activeSession = null;
      });
      if (!saved) return;
      playSound('click');
      showToast('Descanso omitido.', 'info');
      return;
    }

    const effectiveMins = Math.floor(elapsedMinutes || 0);
    if (effectiveMins < 1) {
      const saved = saveStudyChange((draft) => {
        if (draft.study) draft.study.activeSession = null;
      });
      if (!saved) return;
      playSound('click');
      showToast('Sesión finalizada (duró menos de 1 min, no se generó registro de estudio).', 'info');
      return;
    }

    const sessionId = state.study.activeSession.id;
    let recorded = false;
    const saved = onUpdateState((draft) => {
      const session = draft.study?.activeSession;
      if (!session || session.id !== sessionId) return;
      recorded = recordStudySession(draft, session, effectiveMins).success;
    });
    if (saved && recorded) {
      playSound('success');
      showToast(`Sesión registrada: ${formatStudyDuration(effectiveMins)}.`, 'success');
    }
  };

  const handlePomodoroComplete = (sessionId: string, mins: number, phase?: StudySessionPhase) => {
    if (!mins || phase === 'short_break' || phase === 'long_break') return;
    let recorded = false;
    const saved = onUpdateState((draft) => {
      const session = draft.study?.activeSession;
      if (!session || session.id !== sessionId || session.phase === 'short_break' || session.phase === 'long_break') return;
      recorded = recordStudySession(draft, session, mins).success;
    });
    if (saved && recorded) {
      playSound('success');
      showToast(`Sesión registrada: ${formatStudyDuration(mins)}.`, 'success');
    }
  };

  const handleAdvancePhase = (
    sessionId: string,
    nextPhase: StudySessionPhase,
    nextCycle: number,
    nextMinutes: number,
    config: PomodoroSessionConfig
  ) => {
    let advanced = false;
    onUpdateState((draft) => {
      advanced = advanceStudyPhase(draft, sessionId, nextMinutes, {
        ...config, phase: nextPhase, cycle: nextCycle,
      });
    });
    if (!advanced) showToast('Revisá la sesión antes de continuar.', 'info');
  };

  const handleDiscardSession = () => {
    onUpdateState((draft) => {
      if (draft.study) draft.study.activeSession = null;
    });
  };

  // Historial ordenado
  const allLogs = useMemo(
    () => [...studyLogs].sort((a, b) => b.date.localeCompare(a.date) || ((b.createdAt || 0) - (a.createdAt || 0))),
    [studyLogs]
  );
  const visibleLogs = showAllHistory ? allLogs : allLogs.slice(0, 10);

  const overviewKind = useMemo(() => classifyStudyOverview({
    subjectCount: subjects.length,
    examCount: exams.length,
    studyLogCount: studyLogs.length,
  }), [subjects.length, exams.length, studyLogs.length]);
  const workspace = getStudyWorkspace(state, selectedSubjectFilter, todayISO());
  const notesVisible = !state.settings.hiddenTabs?.includes('notas');
  const agendaVisible = !state.settings.hiddenTabs?.includes('agenda');
  const isEmptyModule = overviewKind === 'empty';

  // Formato de hora registrada sin inventar horas inexistentes
  const formatRecordedTime = (epochMs?: number) => {
    if (!epochMs || typeof epochMs !== 'number' || isNaN(epochMs)) return null;
    const d = new Date(epochMs);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="study-refinement space-y-6">
      {/* -------------------------------------------------------------------- */}
      {/* A. Encabezado principal */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <PageHeader title="Estudios" />
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* B. Métricas resumen de un vistazo */}
      {/* Daily workspace uses the same exams and tasks as Agenda/Calendario. */}
      {/* -------------------------------------------------------------------- */}
      <section aria-label="Para estudiar" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[var(--text)]">Para estudiar</h2>
          <label className="flex items-center gap-2 text-sm text-[var(--text-soft)]">Materia
            <select aria-label="Materia del espacio de estudio" value={selectedSubjectFilter || ''} onChange={(event) => setSelectedSubjectFilter(event.target.value || null)} className="min-h-11 max-w-[230px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-[var(--text)]">
              <option value="">Todas las materias</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3 min-w-0">
            <h3 className="text-sm font-medium text-[var(--text-soft)]">Próximas evaluaciones</h3>
            {workspace.upcoming.length ? workspace.upcoming.slice(0, 3).map((exam) => {
              const prep = getExamPreparationMetrics(exam, state, todayISO());
              const proxLabel = prep.daysUntil === 0 ? 'Hoy' : prep.daysUntil === 1 ? 'Mañana' : `En ${prep.daysUntil} d`;
              return <div key={exam.id} className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => openEditExamModal(exam)} className="min-w-0 py-2 text-left text-sm text-[var(--text)]">
                <span className="block font-semibold break-words">{getExamDisplayName(exam, subjects).fullLabel}</span>
                <span className="text-xs text-[var(--text-soft)]">
                  {fmtDate(exam.date)}{exam.time ? ' · ' + exam.time : ''} · {proxLabel}
                  {prep.totalTopics > 0 ? ` · ${prep.completedTopics}/${prep.totalTopics} temas` : ''}
                </span>
              </button>
              {!state.study.activeSession && <button type="button" onClick={() => handleStartSession(25, exam.subjectId)} className="shrink-0 min-h-11 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text)]">Estudiar 25 min</button>}
            </div>;
            }) : <p className="text-sm text-[var(--text-soft)]">Sin evaluaciones próximas en esta selección.</p>}
            {workspace.pendingResults.length > 0 && <button type="button" onClick={() => { setExamTab('pending_results'); document.getElementById('exam-view-filter')?.focus(); }} className="min-h-11 text-sm text-[var(--text-soft)] underline">{workspace.pendingResults.length} sin resultado · revisar</button>}
            {agendaVisible && workspace.tasks.length > 0 && <div className="border-t border-[var(--border)] pt-3 space-y-2"><h3 className="text-sm font-medium text-[var(--text-soft)]">Pendientes de Agenda</h3>{workspace.tasks.slice(0, 3).map((task) => <p key={task.id} className="text-sm text-[var(--text)] break-words">{task.text}<span className="block text-xs text-[var(--text-soft)]">{fmtDate(task.dueDate || task.date)}</span></p>)}{agendaVisible && onOpenAgenda && <button type="button" onClick={onOpenAgenda} className="min-h-11 text-sm underline text-[var(--text-soft)]">Abrir Agenda</button>}</div>}
          </div>
          {notesVisible && <div className="space-y-3 min-w-0">
            <h3 className="text-sm font-medium text-[var(--text-soft)]">Apuntes y material en Notas</h3>
            <p className="text-xs text-[var(--text-soft)]">{workspace.subject ? 'Notas con la etiqueta #' + workspace.subject.name + '. Podés guardar apuntes y enlaces en ellas.' : 'Elegí una materia para recuperar sus notas por etiqueta.'}</p>
            {workspace.notes.slice(0, 4).map((note) => <button key={note.id} type="button" onClick={() => onOpenNote?.(note.id)} className="block min-h-11 w-full text-left text-sm text-[var(--text)]"><span className="block font-semibold break-words">{note.title || note.text.split('\n')[0].slice(0, 80)}</span><span className="line-clamp-2 text-xs text-[var(--text-soft)]">{note.text}</span></button>)}
            {workspace.subject && workspace.notes.length === 0 && <p className="text-sm text-[var(--text-soft)]">Todavía no hay notas con esta etiqueta.</p>}
          </div>}
        </div>
      </section>

      {!isEmptyModule && <div className="study-overview grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {/* Estudio esta semana */}
        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-soft)]">
              Estudio esta semana
            </span>
            <AppIcon name="book" className="h-4 w-4 text-indigo-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-black tabular-nums mt-1 text-[var(--text)]">
            {formatStudyDuration(minutesWeek)}
          </div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
            {minutesToday > 0 ? `${formatStudyDuration(minutesToday)} hoy` : '0 min hoy'}
          </p>
        </div>

        {/* Evaluaciones próximas */}
        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-soft)]">
              Evaluaciones próximas
            </span>
            <AppIcon name="exam" className="h-4 w-4 text-amber-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-black tabular-nums mt-1 text-[var(--text)]">
            {categorized.upcoming.length === 0 ? '0 próximas' : `${categorized.upcoming.length} ${categorized.upcoming.length === 1 ? 'próxima' : 'próximas'}`}
          </div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
            {categorized.upcoming.length > 0
              ? `Próxima: ${fmtDate(categorized.upcoming[0].date)}`
              : categorized.pendingResults.length > 0
              ? `${categorized.pendingResults.length} sin resultado`
              : 'Al día'}
          </p>
        </div>

        {/* Aprobación académica */}
        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-soft)]">
              Aprobación
            </span>
            <AppIcon name="checkCircle" className="h-4 w-4 text-teal-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-2xl font-black tabular-nums mt-1 text-[var(--text)]">
            {categorized.completed.length > 0
              ? `${categorized.completed.filter((e) => e.status === 'aprobado').length} de ${categorized.completed.length} aprobadas`
              : '—'}
          </div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
            {approvalRate !== null ? 'Evaluaciones calificadas' : 'Sin evaluaciones calificadas'}
          </p>
        </div>
      </div>}

      {/* -------------------------------------------------------------------- */}
      {/* C. TEMPORIZADOR DE ENFOQUE Y POMODORO (PROTAGONISTA) */}
      {/* -------------------------------------------------------------------- */}
      <section id="qa-focus-timer" aria-label="Temporizador de enfoque">
        <FocusTimer
          targets={subjects.map((subject) => ({ id: subject.id, label: subject.name }))}
          activeSession={state.study?.activeSession || null}
          onStartSession={handleStartSession}
          onPauseSession={handlePauseSession}
          onResumeSession={handleResumeSession}
          onResetSession={handleResetSession}
          onFinishEarly={handleFinishEarly}
          onSessionComplete={handlePomodoroComplete}
          onDiscardSession={handleDiscardSession}
          onAdvancePhase={handleAdvancePhase}
        />
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* Primeros pasos amigables si el módulo está completamente vacío */}
      {/* -------------------------------------------------------------------- */}
      {isEmptyModule && (
        <section
          aria-label="Primeros pasos en Estudios"
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center space-y-4 shadow-2xs"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
            <AppIcon name="book" className="h-6 w-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-[var(--text)]">
              Comenzá a organizar tus materias
            </h3>
            <p className="text-xs text-[var(--text-soft)]">
              Agregá materias o evaluaciones para vincular tus sesiones de enfoque.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={openCreateSubjectModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 text-white transition cursor-pointer shadow-2xs"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Agregar primera materia</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateExamModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--surface-muted)] text-[var(--text)] transition cursor-pointer shadow-2xs"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5 text-[var(--blue)]" />
              <span>Agregar evaluación</span>
            </button>
            <button
              type="button"
              onClick={handleStartFreeSession}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-[var(--border)] bg-transparent hover:bg-[var(--surface-muted)] text-[var(--text-soft)] hover:text-[var(--text)] transition cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5"><AppIcon name="play" className="h-3.5 w-3.5" /><span>Sesión libre de 25 min</span></span>
            </button>
          </div>
        </section>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* D. Núcleo académico: 2 Columnas equilibradas (Materias y Evaluaciones) */}
      {/* -------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ================================================================= */}
        {/* COLUMNA 1: MATERIAS */}
        {/* ================================================================= */}
        <section
          aria-label="Gestión de materias"
          className="space-y-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xs"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/60 pb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                <span>Materias</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--text-soft)] font-semibold">
                  {subjects.length}
                </span>
              </h2>
              <p className="text-xs text-[var(--text-soft)] mt-0.5">
                Cursos y áreas de estudio.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateSubjectModal}
              className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-sm font-semibold rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white transition cursor-pointer"
              title="Nueva materia"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              <span>Nueva</span>
            </button>
          </div>

          {/* Aviso de protección contra eliminación */}
          {subjectError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AppIcon name="alertCircle" className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <span>{subjectError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSubjectError(null)}
                className="inline-flex items-center justify-center p-1 text-amber-600 hover:text-amber-800 dark:text-amber-400 shrink-0 cursor-pointer"
                aria-label="Cerrar aviso"
              >
                <AppIcon name="x" className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Filtro activo por materia */}
          {selectedSubjectFilter && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-500/10 text-xs text-indigo-700 dark:text-indigo-300 font-semibold">
              <span>Filtrando por: <strong>{subjects.find((s) => s.id === selectedSubjectFilter)?.name || 'Materia'}</strong></span>
              <button
                type="button"
                onClick={() => setSelectedSubjectFilter(null)}
                className="text-xs font-bold underline hover:opacity-80 cursor-pointer"
              >
                Ver todas
              </button>
            </div>
          )}

          {/* Lista de materias */}
          <div className="divide-y divide-[var(--border)]/60">
            {subjects.length === 0 ? (
              <p className="text-center py-6 text-xs text-[var(--text-faint)]">
                Sin materias registradas aún.
              </p>
            ) : (
              subjects.map((s) => {
                const stats = getSubjectStats(s.id, state);
                const isSelected = selectedSubjectFilter === s.id;
                const topicsOpen = expandedSubjectTopicsId === s.id;
                const subjectTopics = s.topics || [];
                return (
                  <div
                    key={s.id}
                    className={`py-3 text-xs rounded-xl px-2.5 transition-colors space-y-2.5 ${
                      isSelected
                        ? 'bg-[var(--blue-soft)] ring-1 ring-inset ring-[var(--blue)]/35'
                        : 'hover:bg-[var(--surface-muted)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedSubjectFilter(isSelected ? null : s.id)}
                        className="min-w-0 flex-1 text-left cursor-pointer group"
                        title={isSelected ? 'Quitar filtro' : `Filtrar evaluaciones de ${s.name}`}
                      >
                        <span className="font-bold text-sm text-[var(--text)] group-hover:text-[var(--blue)] truncate block">
                          {s.name}
                        </span>
                        <span className="text-[11px] text-[var(--text-soft)] block mt-0.5">
                          {stats.examCount} {stats.examCount === 1 ? 'evaluación' : 'evaluaciones'} · {formatStudyDuration(stats.studyMinutes)} de estudio
                          {stats.topicCount > 0 && (
                            <span className="tabular-nums"> · {stats.completedTopicCount}/{stats.topicCount} temas</span>
                          )}
                          {stats.pendingExamCount > 0 && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">
                              ({stats.pendingExamCount} pend.)
                            </span>
                          )}
                        </span>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedSubjectTopicsId(topicsOpen ? null : s.id);
                            setNewSubjectTopicTitle('');
                          }}
                          aria-expanded={topicsOpen}
                          className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                            topicsOpen
                              ? 'border-[var(--blue)]/40 bg-[var(--blue-soft)] text-[var(--blue)]'
                              : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                          }`}
                          title="Temario de la materia"
                        >
                          Temas{stats.topicCount > 0 ? ` (${stats.completedTopicCount}/${stats.topicCount})` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditSubjectModal(s)}
                          className="p-1.5 rounded-lg text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition cursor-pointer"
                          title="Renombrar materia"
                          aria-label={`Renombrar ${s.name}`}
                        >
                          <AppIcon name="edit" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubject(s.id)}
                          className="p-1.5 rounded-lg text-[var(--text-soft)] hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                          title="Eliminar materia"
                          aria-label={`Eliminar materia ${s.name}`}
                        >
                          <AppIcon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {topicsOpen && (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 space-y-2">
                        {subjectTopics.length > 0 ? (
                          <ul className="space-y-1">
                            {subjectTopics.map((topic) => (
                              <li key={topic.id} className="flex items-center justify-between gap-2 py-1 px-1.5 rounded-lg hover:bg-[var(--surface-muted)]/60">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSubjectTopic(s.id, topic.id)}
                                  className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                                >
                                  <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                    topic.done
                                      ? 'border-teal-500 bg-teal-500 text-white'
                                      : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                                  }`}>
                                    {topic.done && <AppIcon name="check" className="h-3 w-3" />}
                                  </span>
                                  <span className={`text-xs break-words ${topic.done ? 'line-through text-[var(--text-faint)]' : 'text-[var(--text)]'}`}>
                                    {topic.title}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubjectTopic(s.id, topic.id)}
                                  className="p-1 rounded text-[var(--text-faint)] hover:text-red-500 cursor-pointer"
                                  aria-label={`Quitar tema ${topic.title}`}
                                >
                                  <AppIcon name="x" className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-[var(--text-faint)]">
                            Agregá unidades o temas para conectar tu avance real con las prioridades de Hoy.
                          </p>
                        )}
                        <form onSubmit={(ev) => handleAddSubjectTopic(s.id, ev)} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={newSubjectTopicTitle}
                            onChange={(ev) => setNewSubjectTopicTitle(ev.target.value)}
                            placeholder="Ej. Grafos y árboles..."
                            aria-label={`Nuevo tema para ${s.name}`}
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
                          />
                          <button
                            type="submit"
                            className="shrink-0 rounded-lg bg-[var(--blue)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--blue-hover)] transition cursor-pointer"
                          >
                            Sumar
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ================================================================= */}
        {/* COLUMNA 2: EVALUACIONES */}
        {/* ================================================================= */}
        <section
          aria-label="Gestión de evaluaciones y exámenes"
          className="space-y-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xs"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/60 pb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                <span>Evaluaciones</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-muted)] text-[var(--text-soft)] font-semibold">
                  {displayedExams.length}
                </span>
              </h2>
              <p className="text-xs text-[var(--text-soft)] mt-0.5">
                Exámenes, entregas y pruebas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCreateExamModal()}
              className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-sm font-semibold rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white transition cursor-pointer"
              title="Agregar evaluación"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              <span>Agregar evaluación</span>
            </button>
          </div>

          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="exam-view-filter" className="text-xs font-semibold text-[var(--text-soft)]">
              Ver evaluaciones:
            </label>
            <select
              id="exam-view-filter"
              value={examTab}
              onChange={(event) => setExamTab(event.target.value as typeof examTab)}
              className="min-h-10 w-full sm:w-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs sm:text-sm text-[var(--text)] cursor-pointer"
            >
              <option value="upcoming">Próximas ({categorized.upcoming.length})</option>
              <option value="pending_results">Pendientes de resultado ({categorized.pendingResults.length})</option>
              <option value="completed">Historial ({categorized.completed.length})</option>
              <option value="all">Todas ({exams.length})</option>
            </select>
          </div>

          {/* Lista de evaluaciones */}
          <div className="divide-y divide-[var(--border)]/60">
            {displayedExams.length === 0 ? (
              <p className="text-center py-6 text-xs text-[var(--text-faint)]">
                {examTab === 'upcoming'
                  ? 'No hay evaluaciones próximas.'
                  : examTab === 'pending_results'
                  ? 'No hay evaluaciones pasadas pendientes de nota.'
                  : 'Sin evaluaciones en esta categoría.'}
              </p>
            ) : (
              displayedExams.map((e) => {
                const meta = getExamDisplayName(e, subjects);
                const today = todayISO();
                const isOverduePending = e.status === 'pendiente' && e.date < today;
                const isUpcomingPending = e.status === 'pendiente' && e.date >= today;
                const prep = getExamPreparationMetrics(e, state, today);
                const examTopicsOpen = expandedExamTopicsId === e.id;
                const ownTopics = e.topics || [];
                const alreadyInToday = isUpcomingPending && isExamPrioritizedToday(e);
                const proximityLabel =
                  prep.daysUntil === 0
                    ? 'Hoy'
                    : prep.daysUntil === 1
                    ? 'Mañana'
                    : `En ${prep.daysUntil} días`;
                return (
                  <div
                    key={e.id}
                    id={`exam-${e.id}`}
                    className="py-3 text-xs rounded-xl px-2 transition-all hover:bg-[var(--surface-muted)]/50 space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditExamModal(e)}
                            title={`Editar ${meta.title}`}
                            className="text-left font-bold text-sm text-[var(--text)] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-2 leading-snug break-words cursor-pointer"
                          >
                            {meta.title}
                          </button>
                          {meta.subjectName && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)]">
                              {meta.subjectName}
                            </span>
                          )}
                          {isUpcomingPending && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md tabular-nums ${
                              prep.daysUntil <= 2
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                                : prep.daysUntil <= 7
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                            }`}>
                              {proximityLabel}
                            </span>
                          )}
                          {isOverduePending && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                              Pendiente de nota
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-soft)] mt-0.5">
                          <span className="tabular-nums">
                            {fmtDate(e.date)}{e.time ? ` · ${e.time}` : ''}
                          </span>
                          {e.grade && (
                            <span
                              data-testid={`exam-grade-${e.id}`}
                              className="inline-flex items-center gap-1 font-medium text-[var(--text)] px-1.5 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)]/60 text-[11px]"
                            >
                              <span className="text-[var(--text-soft)]">Nota:</span>{' '}
                              <span className="font-bold tabular-nums">{e.grade}</span>
                            </span>
                          )}
                          {isUpcomingPending && (prep.totalTopics > 0 || prep.recentMinutes7d > 0) && (
                            <span className="tabular-nums">
                              {prep.totalTopics > 0 ? `Temas: ${prep.completedTopics}/${prep.totalTopics} (${prep.progressPct}%)` : ''}
                              {prep.totalTopics > 0 && prep.recentMinutes7d > 0 ? ' · ' : ''}
                              {prep.recentMinutes7d > 0 ? `7d: ${formatStudyDuration(prep.recentMinutes7d)}` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-auto">
                        {isUpcomingPending && (
                          <button
                            type="button"
                            disabled={alreadyInToday}
                            onClick={() => handlePrioritizeExamToday(e)}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
                              alreadyInToday
                                ? 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 cursor-default'
                                : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[var(--blue)]/40 cursor-pointer'
                            }`}
                            title={alreadyInToday ? 'Ya figura en tus prioridades de Hoy' : 'Enviar como prioridad del día a Hoy'}
                          >
                            {alreadyInToday ? 'En Hoy' : 'Priorizar hoy'}
                          </button>
                        )}
                        {e.status === 'pendiente' && (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedExamTopicsId(examTopicsOpen ? null : e.id);
                              setNewExamTopicTitle('');
                            }}
                            aria-expanded={examTopicsOpen}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                              examTopicsOpen
                                ? 'border-[var(--blue)]/40 bg-[var(--blue-soft)] text-[var(--blue)]'
                                : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                            }`}
                            title="Temas de la evaluación"
                          >
                            Temas{ownTopics.length > 0 ? ` (${ownTopics.filter((t) => t.done).length}/${ownTopics.length})` : ''}
                          </button>
                        )}
                        <select
                          value={e.status}
                          onChange={(ev) => handleSetExamStatus(e.id, ev.target.value as any)}
                          aria-label={`Estado de ${meta.title}`}
                          className={`px-2.5 py-1 text-xs rounded-lg border font-semibold outline-hidden cursor-pointer ${
                            e.status === 'aprobado'
                              ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20'
                              : e.status === 'desaprobado'
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-soft)] border-[var(--border)]'
                          }`}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="aprobado">Aprobado</option>
                          <option value="desaprobado">Desaprobado</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleDeleteExam(e.id)}
                          className="p-1.5 rounded-lg text-[var(--text-soft)] hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                          title="Eliminar examen"
                          aria-label={`Eliminar evaluación ${meta.title}`}
                        >
                          <AppIcon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isUpcomingPending && prep.progressPct !== null && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]" aria-hidden="true">
                        <div
                          className={`h-full rounded-full transition-all ${
                            prep.progressPct === 100
                              ? 'bg-teal-500'
                              : prep.readiness === 'critical'
                              ? 'bg-rose-500'
                              : prep.readiness === 'needs_attention'
                              ? 'bg-amber-500'
                              : 'bg-[var(--blue)]'
                          }`}
                          style={{ width: `${Math.max(4, prep.progressPct)}%` }}
                        />
                      </div>
                    )}

                    {examTopicsOpen && (
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 space-y-2">
                        {ownTopics.length > 0 ? (
                          <ul className="space-y-1">
                            {ownTopics.map((topic) => (
                              <li key={topic.id} className="flex items-center justify-between gap-2 py-1 px-1.5 rounded-lg hover:bg-[var(--surface-muted)]/60">
                                <button
                                  type="button"
                                  onClick={() => handleToggleExamTopic(e.id, topic.id)}
                                  className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                                >
                                  <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                    topic.done
                                      ? 'border-teal-500 bg-teal-500 text-white'
                                      : 'border-[var(--border)] bg-[var(--bg-elevated)]'
                                  }`}>
                                    {topic.done && <AppIcon name="check" className="h-3 w-3" />}
                                  </span>
                                  <span className={`text-xs break-words ${topic.done ? 'line-through text-[var(--text-faint)]' : 'text-[var(--text)]'}`}>
                                    {topic.title}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExamTopic(e.id, topic.id)}
                                  className="p-1 rounded text-[var(--text-faint)] hover:text-red-500 cursor-pointer"
                                  aria-label={`Quitar tema ${topic.title}`}
                                >
                                  <AppIcon name="x" className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] text-[var(--text-faint)]">
                            {prep.totalTopics > 0
                              ? `Usando los ${prep.totalTopics} temas de ${meta.subjectName || 'la materia'}. Sumá temas propios si querés acotar este examen.`
                              : 'Sumá los temas que entran en esta evaluación para medir tu preparación y guiar tus prioridades en Hoy.'}
                          </p>
                        )}
                        <form onSubmit={(ev) => handleAddExamTopic(e.id, ev)} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={newExamTopicTitle}
                            onChange={(ev) => setNewExamTopicTitle(ev.target.value)}
                            placeholder="Ej. Unidad 3: Programación dinámica..."
                            aria-label={`Nuevo tema para ${meta.title}`}
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-hidden focus:border-[var(--blue)]"
                          />
                          <button
                            type="submit"
                            className="shrink-0 rounded-lg bg-[var(--blue)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--blue-hover)] transition cursor-pointer"
                          >
                            Sumar
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* E. Historial de Estudio y Registro Manual */}
      {/* -------------------------------------------------------------------- */}
      <section
        id="qa-focus-estudio"
        aria-label="Registro manual e historial de estudio"
        className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)]/60 pb-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Historial de estudio</h2>
            <p className="text-xs text-[var(--text-soft)] mt-0.5">
              Sesiones de concentración y registros manuales.
            </p>
          </div>
          <button
            type="button"
            aria-expanded={manualFormOpen}
            aria-controls="manual-study-form"
            onClick={() => setManualFormOpen((open) => !open)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--bg-elevated)] cursor-pointer"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5 text-[var(--blue)]" />
            {manualFormOpen ? 'Cerrar registro' : 'Registrar estudio'}
          </button>
        </div>

        {manualFormOpen && (
          <form
            id="manual-study-form"
            onSubmit={handleAddStudy}
            className="grid grid-cols-1 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end gap-3 p-3 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl"
          >
            <div>
              <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">Fecha</label>
              <input
                type="date"
                aria-label="Fecha del estudio" value={studyDate}
                onChange={(e) => setStudyDate(e.target.value)}
                className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">Minutos</label>
              <input
                type="number"
                min="1"
                max="1440"
                aria-label="Minutos de estudio" value={studyMinutes}
                onChange={(e) => setStudyMinutes(e.target.value)}
                placeholder="60"
                className="w-full min-h-11 px-3 py-2 text-base sm:text-sm tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">Materia</label>
              <select
                aria-label="Materia del estudio" value={studySubjectId}
                onChange={(e) => setStudySubjectId(e.target.value)}
                className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)] cursor-pointer"
              >
                <option value="">General</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="flex min-h-11 items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Registrar</span>
            </button>
          </form>
        )}

        <div className="divide-y divide-[var(--border)]">
          {allLogs.length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)]">Sin registros de estudio aún.</p>
          ) : (
            <>
              {visibleLogs.map((l) => {
                const recordedTime = formatRecordedTime(l.createdAt);
                return (
                  <div
                    key={l.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 text-sm hover:bg-[var(--surface-muted)]/40 px-2 rounded-xl transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--text)]">
                          {getSubjectDisplayName(l.subjectId, subjects, l.subjectName)}
                        </span>
                        <span className="tabular-nums font-bold text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                          {formatStudyDuration(l.minutes)}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-soft)] mt-0.5 tabular-nums">
                        {fmtDate(l.date)}
                        {recordedTime ? ` · ${recordedTime}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => openEditLogModal(l)}
                        className="text-[var(--text-soft)] hover:text-[var(--text)] p-1.5 rounded-lg hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                        title="Corregir registro"
                        aria-label="Corregir registro"
                      >
                        <AppIcon name="edit" className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudy(l.id)}
                        className="text-[var(--text-faint)] hover:text-red-500 p-1.5 rounded-lg hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                        title="Eliminar registro"
                        aria-label="Eliminar registro"
                      >
                        <AppIcon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {allLogs.length > 10 && (
                <div className="pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAllHistory((prev) => !prev)}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {showAllHistory
                      ? 'Mostrar menos'
                      : `Ver historial completo (${allLogs.length} registros)`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* MODAL: Corregir Registro de Estudio */}
      {/* -------------------------------------------------------------------- */}
      {editingLog && (
        <div
          onClick={() => setEditingLog(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-log-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="edit-log-modal-title" className="text-sm font-bold text-[var(--text)]">
                Corregir registro de estudio
              </h3>
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                aria-label="Cerrar edición"
                className="inline-flex items-center justify-center text-[var(--text-soft)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditLog} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Minutos estudiados
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  autoFocus
                  value={editLogMinutes}
                  onChange={(e) => setEditLogMinutes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Materia
                </label>
                <select
                  value={editLogSubjectId}
                  onChange={(e) => setEditLogSubjectId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)] cursor-pointer"
                >
                  <option value="">General</option>
                  {editingLog.subjectId && !subjects.some((s) => s.id === editingLog.subjectId) && (
                    <option value={editingLog.subjectId}>{editingLog.subjectName || 'Materia eliminada'} (histórica)</option>
                  )}
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={editLogDate}
                  onChange={(e) => setEditLogDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingLog(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border)] hover:bg-[var(--surface-muted)] text-[var(--text-soft)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer"
                >
                  Guardar corrección
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* MODAL: Crear / Editar Materia */}
      {/* -------------------------------------------------------------------- */}
      {subjectModalOpen && (
        <div
          onClick={() => setSubjectModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="subject-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="subject-modal-title" className="text-sm font-bold text-[var(--text)]">
                {editingSubject ? 'Editar materia' : 'Nueva materia'}
              </h3>
              <button
                type="button"
                onClick={() => setSubjectModalOpen(false)}
                aria-label="Cerrar materia"
                className="inline-flex items-center justify-center text-[var(--text-soft)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubject} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Nombre de la materia
                </label>
                <input
                  type="text"
                  autoFocus
                  aria-label="Nombre de la materia" value={subjectInputName}
                  onChange={(e) => {
                    setSubjectInputName(e.target.value);
                    if (subjectInputError) setSubjectInputError(null);
                  }}
                  placeholder="Ej: Álgebra Lineal"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                />
                {subjectInputError && (
                  <p role="alert" className="text-xs text-red-500 mt-1">{subjectInputError}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSubjectModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border)] hover:bg-[var(--surface-muted)] text-[var(--text-soft)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer"
                >
                  {editingSubject ? 'Guardar cambios' : 'Crear materia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* MODAL: Crear / Editar Evaluación */}
      {/* -------------------------------------------------------------------- */}
      {examModalOpen && (
        <div
          onClick={() => setExamModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exam-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="exam-modal-title" className="text-sm font-bold text-[var(--text)]">
                {editingExam ? 'Editar evaluación' : 'Nueva evaluación'}
              </h3>
              <button
                type="button"
                onClick={() => setExamModalOpen(false)}
                aria-label="Cerrar formulario"
                className="inline-flex items-center justify-center min-h-10 min-w-10 text-[var(--text-soft)] hover:text-[var(--text)] p-2 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExam} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                  Nombre de la evaluación
                </label>
                <input
                  type="text"
                  autoFocus
                  aria-label="Título de la evaluación" value={examInputTitle}
                  onChange={(e) => {
                    setExamInputTitle(e.target.value);
                    if (examInputError) setExamInputError(null);
                  }}
                  placeholder="Ej. Primer parcial o examen final"
                  className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                    Materia
                  </label>
                  <select
                    value={examInputSubjectId}
                    onChange={(e) => setExamInputSubjectId(e.target.value)}
                    className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)] cursor-pointer"
                  >
                    <option value="">Sin materia asignada (General)</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                    Estado
                  </label>
                  <select
                    value={examInputStatus}
                    onChange={(e) => setExamInputStatus(e.target.value as any)}
                    className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)] cursor-pointer"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="aprobado">Aprobado</option>
                    <option value="desaprobado">Desaprobado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={examInputDate}
                    onChange={(e) => {
                      setExamInputDate(e.target.value);
                      if (examInputError) setExamInputError(null);
                    }}
                    className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                    Hora (opcional)
                  </label>
                  <input
                    type="time"
                    value={examInputTime}
                    onChange={(e) => setExamInputTime(e.target.value)}
                    className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[var(--text-soft)] block">
                    Nota o calificación <span className="font-normal">(opcional)</span>
                  </label>
                  {examInputStatus === 'pendiente' && (
                    <span className="text-xs text-[var(--text-soft)]">
                      Podés agregarla después
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={examInputGrade}
                  onChange={(e) => setExamInputGrade(e.target.value)}
                  placeholder="Ej. 8, 9/10, A o Sobresaliente"
                  className="w-full min-h-11 px-3 py-2 text-base sm:text-sm rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                />
              </div>

              {examInputError && (
                <p className="text-[11px] text-red-500">{examInputError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExamModalOpen(false)}
                  className="min-h-11 px-4 py-2 text-sm font-semibold rounded-xl border border-[var(--border)] hover:bg-[var(--surface-muted)] text-[var(--text-soft)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-11 px-4 py-2 text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer"
                >
                  {editingExam ? 'Guardar cambios' : 'Guardar evaluación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
