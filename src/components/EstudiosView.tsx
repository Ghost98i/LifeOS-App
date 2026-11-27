import { getStudyWorkspace } from '../lib/studyWorkspace';
import React, { useState, useEffect, useMemo } from 'react';
import { GraduationCap, Play, Plus } from 'lucide-react';
import { showToast } from '../lib/toast';
import { requestConfirm } from '../lib/confirmDialog';
import type { LifeOSState, Exam, Subject, StudyLog, StudyProgramKind, StudySessionPhase } from '../types';
import { FocusTimer } from './FocusTimer';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { StudyPracticeSection } from './StudyPracticeSection';
import { SurfaceCard } from './ui/SurfacePrimitives';
import { CompletionCheck } from './ui/CompletionCheck';
import { playSound } from '../lib/audio';
import {
  todayISO,
  fmtDate,
  localISODate,
  uid,
} from '../lib/storage';
import {
  studyMinutesForDate,
  studyMinutesThisWeek,
} from '../lib/calculations';
import {
  addStudyProgram,
  classifyStudyOverview,
  createGuidedStudySetup,
  filterExamsByProgram,
  filterSubjectsByProgram,
  GENERAL_PROGRAM_FILTER,
  getExamCardDisplay,
  getStudyThirdOverviewMetric,
  hasGeneralSubjects,
  selectStudyExams,
  STUDY_PROGRAM_KIND_LABELS,
  STUDY_PROGRAM_KINDS,
} from '../lib/studyPresentation';
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
  initialTab?: 'overview' | 'practice';
  onOpenNote?: (id: string) => void;
  onOpenAgenda?: () => void;
}

export const EstudiosView: React.FC<EstudiosViewProps> = ({
  state,
  onUpdateState,
  initialFocusId,
  focusNonce,
  initialTab,
  onOpenNote,
  onOpenAgenda,
}) => {
  const programs = useMemo(() => state.study?.programs || [], [state.study?.programs]);
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
  const [studyTab, setStudyTab] = useState<'overview' | 'practice'>(() =>
    initialTab || (state.study?.activePracticeSession ? 'practice' : 'overview')
  );
  const [examTab, setExamTab] = useState<'upcoming' | 'pending_results' | 'completed' | 'all'>('all');
  const [selectedProgramFilter, setSelectedProgramFilter] = useState<string | null>(null);
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState<string | null>(null);

  // Estado vacío guiado
  const [guidedKind, setGuidedKind] = useState<StudyProgramKind>('carrera');
  const [guidedProgramName, setGuidedProgramName] = useState('');
  const [guidedSubjectsRaw, setGuidedSubjectsRaw] = useState('');
  const [guidedError, setGuidedError] = useState<string | null>(null);

  // Modal de nuevo programa (carrera / curso)
  const [programModalOpen, setProgramModalOpen] = useState(false);
  const [programInputName, setProgramInputName] = useState('');
  const [programInputKind, setProgramInputKind] = useState<StudyProgramKind>('carrera');
  const [programInputInstitution, setProgramInputInstitution] = useState('');
  const [programInputError, setProgramInputError] = useState<string | null>(null);

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
  const [subjectInputProgramId, setSubjectInputProgramId] = useState<string>('');
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
    if (!editingLog && !subjectModalOpen && !examModalOpen && !programModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editingLog) setEditingLog(null);
      if (subjectModalOpen) setSubjectModalOpen(false);
      if (examModalOpen) setExamModalOpen(false);
      if (programModalOpen) setProgramModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingLog, subjectModalOpen, examModalOpen, programModalOpen]);

  const saveStudyChange = (updater: (draft: LifeOSState) => void) => {
    try { return onUpdateState(updater); }
    catch (error) { showToast(error instanceof Error ? error.message : 'No se pudo guardar Estudios.', 'error'); return false; }
  };

  // Derivaciones
  const minutesToday = useMemo(() => studyMinutesForDate(state, todayISO()), [state]);
  const minutesWeek = useMemo(() => studyMinutesThisWeek(state), [state]);

  const scopedSubjects = useMemo(
    () => filterSubjectsByProgram(subjects, selectedProgramFilter, programs),
    [subjects, selectedProgramFilter, programs]
  );
  const scopedExams = useMemo(
    () => filterExamsByProgram(exams, subjects, selectedProgramFilter, programs),
    [exams, subjects, selectedProgramFilter, programs]
  );
  const showGeneralProgramChip = useMemo(
    () => programs.length > 0 && hasGeneralSubjects(subjects, programs),
    [subjects, programs]
  );
  const programNameById = useMemo(
    () => new Map(programs.map((program) => [program.id, program.name])),
    [programs]
  );

  const categorized = useMemo(() => categorizeExams(scopedExams), [scopedExams]);
  const thirdMetric = useMemo(
    () =>
      getStudyThirdOverviewMetric({
        completedExams: categorized.completed,
        subjects: scopedSubjects,
        exams: scopedExams,
        studyLogs,
      }),
    [categorized.completed, scopedSubjects, scopedExams, studyLogs]
  );

  // Filtrado de evaluaciones según pestaña y materia seleccionada
  const displayedExams = useMemo(() => {
    return selectStudyExams(examTab, scopedExams, categorized, selectedSubjectFilter);
  }, [examTab, categorized, scopedExams, selectedSubjectFilter]);

  // ---------------------------------------------------------------------------
  // Handlers de Programas y Configuración Guiada
  // ---------------------------------------------------------------------------
  const handleSelectProgramFilter = (programId: string | null) => {
    setSelectedProgramFilter(programId);
    if (selectedSubjectFilter) {
      const nextSubjects = filterSubjectsByProgram(subjects, programId, programs);
      if (!nextSubjects.some((s) => s.id === selectedSubjectFilter)) {
        setSelectedSubjectFilter(null);
      }
    }
  };

  const openCreateProgramModal = () => {
    setProgramInputName('');
    setProgramInputKind('carrera');
    setProgramInputInstitution('');
    setProgramInputError(null);
    setProgramModalOpen(true);
  };

  const handleSaveProgram = (e: React.FormEvent) => {
    e.preventDefault();
    let resultError: string | undefined;
    let createdId: string | undefined;
    const saved = saveStudyChange((draft) => {
      const res = addStudyProgram(draft, {
        name: programInputName,
        kind: programInputKind,
        institution: programInputInstitution,
      });
      if (!res.success || !res.program) {
        resultError = res.error;
        throw new Error(res.error || 'No se pudo crear el programa.');
      }
      createdId = res.program.id;
    });
    if (!saved) {
      if (resultError) setProgramInputError(resultError);
      return;
    }
    setProgramModalOpen(false);
    if (createdId) setSelectedProgramFilter(createdId);
    showToast('Programa agregado.', 'success');
  };

  const handleGuidedSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let resultError: string | undefined;
    let createdCount = 0;
    const saved = saveStudyChange((draft) => {
      const res = createGuidedStudySetup(draft, {
        kind: guidedKind,
        programName: guidedProgramName,
        subjectsRaw: guidedSubjectsRaw,
      });
      if (!res.success) {
        resultError = res.error;
        throw new Error(res.error || 'Revisá los datos ingresados.');
      }
      createdCount = res.subjectsCreated.length;
    });
    if (!saved) {
      if (resultError) setGuidedError(resultError);
      return;
    }
    setGuidedProgramName('');
    setGuidedSubjectsRaw('');
    setGuidedError(null);
    playSound('success');
    showToast(
      createdCount > 1
        ? `${createdCount} materias listas para empezar.`
        : 'Espacio de estudios configurado.',
      'success'
    );
  };

  // ---------------------------------------------------------------------------
  // Handlers de Materias
  // ---------------------------------------------------------------------------
  const openCreateSubjectModal = () => {
    setEditingSubject(null);
    setSubjectInputName('');
    setSubjectInputProgramId(
      selectedProgramFilter && selectedProgramFilter !== GENERAL_PROGRAM_FILTER ? selectedProgramFilter : ''
    );
    setSubjectInputError(null);
    setSubjectModalOpen(true);
  };

  const openEditSubjectModal = (s: Subject) => {
    setEditingSubject(s);
    setSubjectInputName(s.name);
    setSubjectInputProgramId(s.programId || '');
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

    const nextProgramId = subjectInputProgramId.trim() || null;

    if (editingSubject) {
      const saved = saveStudyChange((draft) => {
        const result = renameSubject(draft, editingSubject.id, validated.name!);
        if (!result.success) throw new Error(result.error);
        const target = (draft.study?.subjects || []).find((s) => s.id === editingSubject.id);
        if (target) {
          target.programId = nextProgramId;
          target.updatedAt = Date.now();
        }
      });
      if (!saved) { setSubjectInputError('No se pudo guardar. Conservamos los datos para reintentar.'); return; }
      showToast('Materia actualizada.', 'success');
    } else {
      const saved = saveStudyChange((draft) => {
        if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
        if (!draft.study.subjects) draft.study.subjects = [];
        const now = Date.now();
        draft.study.subjects.push({
          id: uid(),
          name: validated.name!,
          ...(nextProgramId ? { programId: nextProgramId } : {}),
          createdAt: now,
          updatedAt: now,
        });
      });
      if (!saved) { setSubjectInputError('No se pudo guardar. Conservamos los datos para reintentar.'); return; }
      showToast('Materia agregada.', 'success');
    }
    setSubjectModalOpen(false);
  };

  const handleDeleteSubject = async (id: string) => {
    const check = canDeleteSubject(id, state);
    if (!check.canDelete) {
      setSubjectError(check.reason || 'Materia protegida contra eliminación.');
      showToast(check.reason || 'Materia protegida.', 'info');
      return;
    }
    setSubjectError(null);
    const sub = subjects.find((s) => s.id === id);
    const confirmed = await requestConfirm({
      title: 'Eliminar materia',
      message: `¿Eliminar la materia "${sub?.name || 'seleccionada'}"? Podrás deshacer esta acción desde el aviso inmediato.`,
      confirmLabel: 'Eliminar materia',
      tone: 'danger',
    });
    if (!confirmed) return;
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
    programCount: programs.length,
  }), [subjects.length, exams.length, studyLogs.length, programs.length]);
  const workspace = getStudyWorkspace(
    state,
    selectedSubjectFilter,
    todayISO(),
    selectedProgramFilter ? scopedSubjects.map((s) => s.id) : undefined
  );
  const notesVisible = !state.settings.hiddenTabs?.includes('notas');
  const agendaVisible = !state.settings.hiddenTabs?.includes('agenda');
  const workspaceVisibleNotes = workspace.subject ? workspace.notes.slice(0, 4) : workspace.notes.slice(0, 3);
  const showWorkspaceNotesColumn = notesVisible && workspaceVisibleNotes.length > 0;
  const hasWorkspaceActivity =
    workspace.upcoming.length > 0 ||
    showWorkspaceNotesColumn ||
    workspace.pendingResults.length > 0 ||
    (agendaVisible && workspace.tasks.length > 0);
  const isEmptyModule = overviewKind === 'empty';
  const showGuidedEmpty = isEmptyModule && !state.study?.activeSession;

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
        <div
          role="tablist"
          aria-label="Secciones de Estudios"
          className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={studyTab === 'overview'}
            onClick={() => setStudyTab('overview')}
            className={`min-h-11 sm:min-h-9 rounded-lg px-3.5 text-center text-xs font-bold transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
              studyTab === 'overview'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            Materias y exámenes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={studyTab === 'practice'}
            onClick={() => setStudyTab('practice')}
            className={`min-h-11 sm:min-h-9 rounded-lg px-3.5 text-center text-xs font-bold transition cursor-pointer outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
              studyTab === 'practice'
                ? 'bg-[#4F46E5] text-white shadow-xs'
                : 'text-[var(--text-soft)] hover:text-[var(--text)]'
            }`}
          >
            Repaso{(state.study?.questions?.length || 0) > 0 ? ` (${state.study?.questions?.length})` : ''}
          </button>
        </div>
      </div>

      {studyTab === 'practice' ? (
        <StudyPracticeSection
          state={state}
          subjects={subjects}
          onUpdateState={onUpdateState}
        />
      ) : showGuidedEmpty ? (
        <SurfaceCard
          as="section"
          aria-label="Configuración rápida de Estudios"
          className="p-5 sm:p-7 space-y-6"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
              <GraduationCap className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="text-xs font-semibold tracking-tight">Primeros pasos</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-slate-100">
              Organizá lo que estás estudiando
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              Podés llevar una o varias carreras, cursos o certificaciones al mismo tiempo. Empezá con tus primeras materias en segundos.
            </p>
          </div>

          <form onSubmit={handleGuidedSetupSubmit} className="space-y-5">
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                1. Tipo de estudio
              </span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de estudio">
                {STUDY_PROGRAM_KINDS.map((kind) => {
                  const active = guidedKind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setGuidedKind(kind)}
                      className={`min-h-9 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                        active
                          ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
                          : 'border-slate-200/80 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-transparent dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400'
                      }`}
                    >
                      {STUDY_PROGRAM_KIND_LABELS[kind]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="guided-study-program-name"
                  className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  2. Carrera o curso <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
                </label>
                <input
                  id="guided-study-program-name"
                  type="text"
                  value={guidedProgramName}
                  onChange={(e) => {
                    setGuidedProgramName(e.target.value);
                    if (guidedError) setGuidedError(null);
                  }}
                  placeholder={
                    guidedKind === 'carrera'
                      ? 'Ej. Ingeniería en Sistemas'
                      : guidedKind === 'curso'
                      ? 'Ej. Inglés B2'
                      : guidedKind === 'certificacion'
                      ? 'Ej. AWS Solutions Architect'
                      : 'Ej. Desarrollo Frontend'
                  }
                  className="min-h-11 w-full rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label
                  htmlFor="guided-study-subjects"
                  className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  3. Primera materia o varias <span className="font-normal text-slate-400 dark:text-slate-500">(separadas por coma)</span>
                </label>
                <input
                  id="guided-study-subjects"
                  type="text"
                  value={guidedSubjectsRaw}
                  onChange={(e) => {
                    setGuidedSubjectsRaw(e.target.value);
                    if (guidedError) setGuidedError(null);
                  }}
                  placeholder="Ej. Álgebra Lineal, Programación I"
                  className="min-h-11 w-full rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {guidedError && (
              <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                {guidedError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 cursor-pointer"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                <span>Guardar y empezar</span>
              </button>

              <button
                type="button"
                onClick={handleStartFreeSession}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                <span>Iniciar sesión libre de 25 min</span>
              </button>
            </div>
          </form>
        </SurfaceCard>
      ) : (
        <>

      {/* Barra de filtro por carrera / curso (solo si existen programas) */}
      {programs.length > 0 && (
        <div
          role="region"
          aria-label="Filtrar por carrera o curso"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={() => handleSelectProgramFilter(null)}
            aria-pressed={selectedProgramFilter === null}
            className={`min-h-10 sm:min-h-9 rounded-full border px-3.5 py-1 text-xs font-semibold transition cursor-pointer ${
              selectedProgramFilter === null
                ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
                : 'border-slate-200/80 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400'
            }`}
          >
            Todos
          </button>
          {programs.map((program) => {
            const active = selectedProgramFilter === program.id;
            return (
              <button
                key={program.id}
                type="button"
                onClick={() => handleSelectProgramFilter(program.id)}
                aria-pressed={active}
                className={`min-h-10 sm:min-h-9 rounded-full border px-3.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
                    : 'border-slate-200/80 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400'
                }`}
              >
                {program.name}
              </button>
            );
          })}
          {showGeneralProgramChip && (
            <button
              type="button"
              onClick={() => handleSelectProgramFilter(GENERAL_PROGRAM_FILTER)}
              aria-pressed={selectedProgramFilter === GENERAL_PROGRAM_FILTER}
              className={`min-h-10 sm:min-h-9 rounded-full border px-3.5 py-1 text-xs font-semibold transition cursor-pointer ${
                selectedProgramFilter === GENERAL_PROGRAM_FILTER
                  ? 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500'
                  : 'border-slate-200/80 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-300 dark:hover:border-indigo-500/40 dark:hover:text-indigo-400'
              }`}
            >
              Generales
            </button>
          )}
          <button
            type="button"
            onClick={openCreateProgramModal}
            className="inline-flex min-h-10 sm:min-h-9 items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-white/[0.14] dark:text-slate-400 dark:hover:border-indigo-400 dark:hover:text-indigo-400 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>Programa</span>
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* B. Métricas resumen de un vistazo */}
      {/* Daily workspace uses the same exams and tasks as Agenda/Calendario. */}
      {/* -------------------------------------------------------------------- */}
      <section
        aria-label="Para estudiar"
        data-study-workspace-compact={hasWorkspaceActivity ? 'false' : 'true'}
        className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] ${
          hasWorkspaceActivity ? 'p-4 sm:p-5 space-y-4' : 'px-4 py-3 sm:px-5 sm:py-3.5 space-y-2'
        }`}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5">
          <h2 className="text-base font-semibold text-[var(--text)]">Para estudiar</h2>
          <label className="flex min-w-0 max-w-full items-center gap-2 text-sm text-[var(--text-soft)]">Materia
            <select aria-label="Materia del espacio de estudio" value={selectedSubjectFilter || ''} onChange={(event) => setSelectedSubjectFilter(event.target.value || null)} className={`${hasWorkspaceActivity ? 'min-h-11' : 'min-h-9'} w-full min-w-0 max-w-[230px] rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-[var(--text)]`}>
              <option value="">Todas las materias</option>{scopedSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
        </div>
        {!hasWorkspaceActivity ? (
          <p className="text-xs text-[var(--text-soft)]">
            {workspace.subject
              ? `Sin evaluaciones próximas${notesVisible ? ` ni notas con #${workspace.subject.name}` : ''} en esta materia.`
              : `Sin evaluaciones próximas${notesVisible ? ` ni apuntes vinculados${scopedSubjects[0] ? ` (etiquetá notas con #${scopedSubjects[0].name} para verlas acá)` : ''}` : ''}.`}
          </p>
        ) : (
        <>
        <div className={showWorkspaceNotesColumn ? 'grid gap-5 md:grid-cols-2' : 'space-y-4'}>
          <div className="space-y-3 min-w-0">
            <h3 className="text-sm font-medium text-[var(--text-soft)]">Próximas evaluaciones</h3>
            {workspace.upcoming.length ? workspace.upcoming.slice(0, 3).map((exam) => {
              const prep = getExamPreparationMetrics(exam, state, todayISO());
              const cardDisplay = getExamCardDisplay(exam, subjects);
              const proxLabel = prep.daysUntil === 0 ? 'Hoy' : prep.daysUntil === 1 ? 'Mañana' : `En ${prep.daysUntil} d`;
              return (
                <div key={exam.id} className="flex min-w-0 items-center justify-between gap-3">
                  <button type="button" onClick={() => openEditExamModal(exam)} className="min-w-0 flex-1 py-1.5 text-left text-sm text-[var(--text)] hover:text-[#4F46E5] dark:hover:text-[#A5A0FF] transition-colors cursor-pointer">
                    <span className="block font-semibold break-words [overflow-wrap:anywhere]">{cardDisplay.primaryTitle}</span>
                    <span className="block text-xs text-[var(--text-soft)] break-words [overflow-wrap:anywhere]">
                      {cardDisplay.typeLabel ? `${cardDisplay.typeLabel} · ` : ''}
                      {fmtDate(exam.date)}{exam.time ? ' · ' + exam.time : ''} · {proxLabel}
                      {prep.totalTopics > 0 ? ` · ${prep.completedTopics}/${prep.totalTopics} temas` : ''}
                    </span>
                  </button>
                  {!state.study.activeSession && (
                    <button
                      type="button"
                      onClick={() => handleStartSession(25, exam.subjectId)}
                      className="shrink-0 min-h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-semibold text-[var(--text)] hover:border-[#4F46E5]/50 hover:text-[#4F46E5] dark:hover:text-[#A5A0FF] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Estudiar 25 min
                    </button>
                  )}
                </div>
              );
            }) : <p className="text-sm text-[var(--text-soft)]">Sin evaluaciones próximas en esta selección.</p>}
            {workspace.pendingResults.length > 0 && <button type="button" onClick={() => { setExamTab('pending_results'); document.getElementById('exam-view-filter')?.focus(); }} className="min-h-11 text-sm text-[var(--text-soft)] underline">{workspace.pendingResults.length} sin resultado · revisar</button>}
            {agendaVisible && workspace.tasks.length > 0 && <div className="border-t border-[var(--border)] pt-3 space-y-2"><h3 className="text-sm font-medium text-[var(--text-soft)]">Pendientes de Agenda</h3>{workspace.tasks.slice(0, 3).map((task) => <p key={task.id} className="text-sm text-[var(--text)] break-words">{task.text}<span className="block text-xs text-[var(--text-soft)]">{fmtDate(task.dueDate || task.date)}</span></p>)}{agendaVisible && onOpenAgenda && <button type="button" onClick={onOpenAgenda} className="min-h-11 text-sm underline text-[var(--text-soft)]">Abrir Agenda</button>}</div>}
          </div>
          {showWorkspaceNotesColumn && (
            <div className="space-y-3 min-w-0 md:border-l md:border-[var(--border)]/60 md:pl-5">
              <h3 className="text-sm font-medium text-[var(--text-soft)]">Apuntes y material en Notas</h3>
              <p className="text-xs text-[var(--text-soft)]">
                {workspace.subject
                  ? `Notas con la etiqueta #${workspace.subject.name}.`
                  : 'Apuntes recientes etiquetados con tus materias.'}
              </p>
              <div className="space-y-2">
                {workspaceVisibleNotes.map((note) => {
                  const matchedSubject = workspace.noteSubjectNames[note.id];
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => onOpenNote?.(note.id)}
                      className="block min-h-11 w-full rounded-xl border border-[var(--border)]/70 bg-[var(--bg)]/60 px-3 py-2 text-left text-sm text-[var(--text)] hover:border-[#4F46E5]/45 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold break-words truncate">
                          {note.title || note.text.split('\n')[0].slice(0, 80)}
                        </span>
                        {!workspace.subject && matchedSubject && (
                          <span className="shrink-0 whitespace-nowrap rounded-md border border-[#4F46E5]/25 bg-[#4F46E5]/10 px-1.5 py-0.5 text-[12px] font-medium text-[#4F46E5] dark:border-[#818CF8]/30 dark:bg-[#4F46E5]/18 dark:text-[#A5A0FF]">
                            #{matchedSubject}
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 text-xs text-[var(--text-soft)] mt-0.5">{note.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {notesVisible && !showWorkspaceNotesColumn && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--border)]/60 pt-3 text-xs text-[var(--text-faint)]">
            <span className="font-medium text-[var(--text-soft)]">Apuntes en Notas:</span>
            <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
              {workspace.subject
                ? `Todavía no hay notas con la etiqueta #${workspace.subject.name}.`
                : `Etiquetá una nota con el nombre de una materia${scopedSubjects[0] ? ` (ej. #${scopedSubjects[0].name})` : ''} para ver tus apuntes acá.`}
            </span>
          </div>
        )}
        </>
        )}
      </section>

      {!isEmptyModule && <div className="study-overview grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        {/* Estudio esta semana */}
        <div className="lifeos-stat-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-soft)]">
              Estudio esta semana
            </span>
            <AppIcon name="book" className="h-4 w-4 text-[#4F46E5] dark:text-[#818CF8] shrink-0" />
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

        {/* Aprobación académica o métrica real de preparación si aún no hay evaluaciones calificadas */}
        <div
          data-study-third-metric={thirdMetric.kind}
          className="lifeos-stat-card col-span-2 sm:col-span-1 flex items-center justify-between gap-3 sm:block"
        >
          <div className="min-w-0 sm:flex sm:items-center sm:justify-between">
            <span className="block text-xs font-medium text-[var(--text-soft)]">
              {thirdMetric.label}
            </span>
            <span className="block text-[11px] text-[var(--text-faint)] sm:hidden">
              {thirdMetric.subtitle}
            </span>
            <AppIcon
              name={thirdMetric.kind === 'approval' ? 'checkCircle' : thirdMetric.kind === 'topics' ? 'checkCircle' : 'clock'}
              className={`hidden sm:block h-4 w-4 shrink-0 ${
                thirdMetric.kind === 'approval'
                  ? 'text-teal-500'
                  : 'text-[#4F46E5] dark:text-[#818CF8]'
              }`}
            />
          </div>
          <div className="shrink-0 text-xl sm:text-2xl font-black tabular-nums sm:mt-1 text-[var(--text)]">
            {thirdMetric.value}
          </div>
          <p className="hidden sm:block text-[11px] text-[var(--text-soft)] mt-0.5">
            {thirdMetric.subtitle}
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
                  {scopedSubjects.length}
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              {programs.length === 0 && (
                <button
                  type="button"
                  onClick={openCreateProgramModal}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--border)] px-2.5 py-2 text-xs font-semibold text-[var(--text-soft)] transition hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                  title="Agrupar por carrera o curso"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  <span>Programa</span>
                </button>
              )}
              <button
                type="button"
                onClick={openCreateSubjectModal}
                className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-sm font-semibold rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white transition cursor-pointer"
                title="Nueva materia"
              >
                <AppIcon name="plus" className="h-4 w-4" />
                <span>Nueva</span>
              </button>
            </div>
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
            {scopedSubjects.length === 0 ? (
              <p className="text-center py-6 text-xs text-[var(--text-faint)]">
                {selectedProgramFilter ? 'Sin materias en este programa.' : 'Sin materias registradas aún.'}
              </p>
            ) : (
              scopedSubjects.map((s) => {
                const stats = getSubjectStats(s.id, state);
                const isSelected = selectedSubjectFilter === s.id;
                const topicsOpen = expandedSubjectTopicsId === s.id;
                const subjectTopics = s.topics || [];
                const programName = s.programId ? programNameById.get(s.programId) : undefined;
                return (
                  <div
                    key={s.id}
                    className={`py-3 text-xs rounded-xl px-2.5 transition-colors space-y-2 ${
                      isSelected
                        ? 'bg-[#4F46E5]/10 dark:bg-[#4F46E5]/18 ring-1 ring-inset ring-[#4F46E5]/35 dark:ring-[#818CF8]/35'
                        : 'hover:bg-[var(--surface-muted)]/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSubjectFilter(isSelected ? null : s.id)}
                        className="min-w-0 max-w-full flex-1 text-left cursor-pointer group"
                        title={isSelected ? 'Quitar filtro' : `Filtrar evaluaciones de ${s.name}`}
                      >
                        <span className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="min-w-0 max-w-full font-semibold text-[15px] leading-snug text-[var(--text)] group-hover:text-[#4F46E5] dark:group-hover:text-[#A5A0FF] break-words [overflow-wrap:anywhere]">
                            {s.name}
                          </span>
                          {!selectedProgramFilter && programs.length > 0 && (
                            <span className="shrink-0 whitespace-nowrap rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-soft)]">
                              {programName || 'General'}
                            </span>
                          )}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--text-soft)] mt-0.5">
                          <span className="whitespace-nowrap">
                            {stats.examCount} {stats.examCount === 1 ? 'evaluación' : 'evaluaciones'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="whitespace-nowrap">
                            {formatStudyDuration(stats.studyMinutes)} de estudio
                          </span>
                          {stats.topicCount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums whitespace-nowrap">
                                {stats.completedTopicCount}/{stats.topicCount} temas
                              </span>
                            </>
                          )}
                          {stats.pendingExamCount > 0 && (
                            <span className="whitespace-nowrap text-amber-600 dark:text-amber-400 font-medium">
                              ({stats.pendingExamCount} pend.)
                            </span>
                          )}
                        </span>
                      </button>

                      <div data-subject-actions="true" className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedSubjectTopicsId(topicsOpen ? null : s.id);
                            setNewSubjectTopicTitle('');
                          }}
                          aria-expanded={topicsOpen}
                          className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg border text-[12px] font-semibold transition cursor-pointer ${
                            topicsOpen
                              ? 'border-[#4F46E5]/40 bg-[#4F46E5]/12 text-[#4F46E5] dark:border-[#818CF8]/40 dark:bg-[#4F46E5]/20 dark:text-[#A5A0FF]'
                              : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)]'
                          }`}
                          title="Temario de la materia"
                        >
                          Temas{stats.topicCount > 0 ? ` (${stats.completedTopicCount}/${stats.topicCount})` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditSubjectModal(s)}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition cursor-pointer"
                          title="Renombrar materia"
                          aria-label={`Renombrar ${s.name}`}
                        >
                          <AppIcon name="edit" className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubject(s.id)}
                          className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[var(--text-soft)] hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
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
                                  aria-pressed={topic.done}
                                  className="group flex items-center gap-2 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                                >
                                  <CompletionCheck checked={topic.done} size="sm" />
                                  <span className="min-w-0 flex-1">
                                    <span className={`block text-xs break-words ${topic.done ? 'line-through text-[var(--text-faint)]' : 'text-[var(--text)]'}`}>
                                      {topic.title}
                                    </span>
                                    {topic.practice && topic.practice.attempts > 0 && (
                                      <span className="block text-[10px] text-[var(--text-soft)] tabular-nums mt-0.5">
                                        {topic.practice.attempts} {topic.practice.attempts === 1 ? 'repaso' : 'repasos'} · {topic.practice.correct} aciertos
                                        {topic.practice.bestScore !== undefined ? ` · mejor ${topic.practice.bestScore}%` : ''}
                                        {topic.practice.lastPracticedAt ? ` · último ${fmtDate(localISODate(new Date(topic.practice.lastPracticedAt)))}` : ''}
                                      </span>
                                    )}
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
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-hidden focus:border-[#4F46E5]"
                          />
                          <button
                            type="submit"
                            className="shrink-0 rounded-lg bg-[#4F46E5] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] transition cursor-pointer"
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
            </div>
            <button
              type="button"
              onClick={() => openCreateExamModal()}
              className="inline-flex min-h-11 items-center gap-1 px-3 py-2 text-sm font-semibold rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white transition cursor-pointer"
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
                const cardDisplay = getExamCardDisplay(e, subjects);
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
                    className="py-3.5 text-xs rounded-xl px-2 transition-all hover:bg-[var(--surface-muted)]/50 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => openEditExamModal(e)}
                          title={`Editar ${cardDisplay.primaryTitle}`}
                          className="max-w-full text-left font-semibold text-[15px] text-[var(--text)] hover:text-[#4F46E5] dark:hover:text-[#A5A0FF] transition-colors leading-snug break-words [overflow-wrap:anywhere] cursor-pointer"
                        >
                          {cardDisplay.primaryTitle}
                        </button>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-soft)] mt-1">
                          {cardDisplay.typeLabel && (
                            <span className="inline-block max-w-full break-words [overflow-wrap:anywhere] rounded-md border border-[var(--border)]/80 bg-[var(--bg)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--text-soft)]">
                              {cardDisplay.typeLabel}
                            </span>
                          )}
                          <span className="tabular-nums whitespace-nowrap">
                            {fmtDate(e.date)}{e.time ? ` · ${e.time}` : ''}
                          </span>
                          {e.grade && (
                            <span
                              data-testid={`exam-grade-${e.id}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-[var(--text)] px-1.5 py-0.5 rounded-md bg-[var(--surface-muted)] border border-[var(--border)]/60 text-[12px]"
                            >
                              <span className="text-[var(--text-soft)]">Nota:</span>{' '}
                              <span className="font-bold tabular-nums">{e.grade}</span>
                            </span>
                          )}
                        </div>
                        {isUpcomingPending && (prep.totalTopics > 0 || prep.recentMinutes7d > 0) && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-soft)] mt-1 tabular-nums">
                            {prep.totalTopics > 0 && (
                              <span>Temas: {prep.completedTopics}/{prep.totalTopics} ({prep.progressPct}%)</span>
                            )}
                            {prep.totalTopics > 0 && prep.recentMinutes7d > 0 && <span aria-hidden="true">·</span>}
                            {prep.recentMinutes7d > 0 && (
                              <span>{formatStudyDuration(prep.recentMinutes7d)} (últimos 7 d)</span>
                            )}
                          </div>
                        )}
                      </div>

                      {isUpcomingPending && (
                        <span
                          className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-semibold tabular-nums ${
                            prep.daysUntil <= 2
                              ? 'border-rose-500/30 bg-rose-500/12 text-rose-600 dark:text-rose-300'
                              : prep.daysUntil <= 7
                              ? 'border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300'
                              : 'border-[#4F46E5]/25 bg-[#4F46E5]/10 text-[#4F46E5] dark:border-[#818CF8]/30 dark:bg-[#4F46E5]/18 dark:text-[#A5A0FF]'
                          }`}
                        >
                          {proximityLabel}
                        </span>
                      )}
                      {isOverduePending && (
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/12 px-2.5 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                          Pendiente de nota
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {isUpcomingPending && (
                        <button
                          type="button"
                          disabled={alreadyInToday}
                          onClick={() => handlePrioritizeExamToday(e)}
                          className={`min-h-9 px-2.5 py-1 rounded-lg border text-[12px] font-semibold transition whitespace-nowrap ${
                            alreadyInToday
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 cursor-default'
                              : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:text-[var(--text)] hover:border-[#4F46E5]/45 cursor-pointer'
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
                          className={`min-h-9 px-2.5 py-1 rounded-lg border text-[12px] font-semibold transition whitespace-nowrap cursor-pointer ${
                            examTopicsOpen
                              ? 'border-[#4F46E5]/40 bg-[#4F46E5]/12 text-[#4F46E5] dark:border-[#818CF8]/40 dark:bg-[#4F46E5]/20 dark:text-[#A5A0FF]'
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
                        aria-label={`Estado de ${cardDisplay.primaryTitle}`}
                        className={`min-h-9 px-2.5 py-1 text-[12px] rounded-lg border font-semibold outline-hidden cursor-pointer ${
                          e.status === 'aprobado'
                            ? 'study-exam-status-approved bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-500/35'
                            : e.status === 'desaprobado'
                            ? 'study-exam-status-failed bg-rose-500/12 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 border-rose-500/35'
                            : 'study-exam-status-pending bg-amber-500/10 text-amber-700 dark:bg-amber-500/12 dark:text-amber-300 border-amber-500/30'
                        }`}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="aprobado">Aprobado</option>
                        <option value="desaprobado">Desaprobado</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDeleteExam(e.id)}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--text-soft)] hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                        title="Eliminar examen"
                        aria-label={`Eliminar evaluación ${cardDisplay.primaryTitle}`}
                      >
                        <AppIcon name="trash" className="h-3.5 w-3.5" />
                      </button>
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
                              : 'bg-[#4F46E5]'
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
                                  aria-pressed={topic.done}
                                  className="group flex items-center gap-2 min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                                >
                                  <CompletionCheck checked={topic.done} size="sm" />
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
                            aria-label={`Nuevo tema para ${cardDisplay.primaryTitle}`}
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-hidden focus:border-[#4F46E5]"
                          />
                          <button
                            type="submit"
                            className="shrink-0 rounded-lg bg-[#4F46E5] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] transition cursor-pointer"
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
          </div>
          <button
            type="button"
            aria-expanded={manualFormOpen}
            aria-controls="manual-study-form"
            onClick={() => setManualFormOpen((open) => !open)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--bg-elevated)] cursor-pointer"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5 text-[#4F46E5] dark:text-[#A5A0FF]" />
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
                    className="flex items-center justify-between gap-2.5 py-3 text-sm hover:bg-[var(--surface-muted)]/40 px-2 rounded-xl transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 max-w-full font-semibold text-sm text-[var(--text)] break-words [overflow-wrap:anywhere]">
                          {getSubjectDisplayName(l.subjectId, subjects, l.subjectName)}
                        </span>
                        <span className="tabular-nums whitespace-nowrap font-bold text-xs px-2 py-0.5 rounded-md bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/20 dark:text-[#A5A0FF]">
                          {formatStudyDuration(l.minutes)}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-soft)] mt-0.5 tabular-nums">
                        {fmtDate(l.date)}
                        {recordedTime ? ` · ${recordedTime}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
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

              {programs.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Carrera o curso (opcional)
                  </label>
                  <select
                    aria-label="Carrera o curso de la materia"
                    value={subjectInputProgramId}
                    onChange={(e) => setSubjectInputProgramId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)] cursor-pointer"
                  >
                    <option value="">Sin programa (Generales)</option>
                    {programs.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
      {/* MODAL: Nuevo Programa (Carrera / Curso) */}
      {/* -------------------------------------------------------------------- */}
      {programModalOpen && (
        <div
          onClick={() => setProgramModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 id="program-modal-title" className="text-sm font-bold text-[var(--text)]">
                Nuevo programa de estudio
              </h3>
              <button
                type="button"
                onClick={() => setProgramModalOpen(false)}
                aria-label="Cerrar programa"
                className="inline-flex items-center justify-center text-[var(--text-soft)] hover:text-[var(--text)] p-1 rounded-lg cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProgram} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  autoFocus
                  aria-label="Nombre del programa"
                  value={programInputName}
                  onChange={(e) => {
                    setProgramInputName(e.target.value);
                    if (programInputError) setProgramInputError(null);
                  }}
                  placeholder="Ej. Licenciatura en Sistemas / Inglés B2"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Tipo
                </label>
                <select
                  aria-label="Tipo de programa"
                  value={programInputKind}
                  onChange={(e) => setProgramInputKind(e.target.value as StudyProgramKind)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)] cursor-pointer"
                >
                  {STUDY_PROGRAM_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {STUDY_PROGRAM_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Institución (opcional)
                </label>
                <input
                  type="text"
                  aria-label="Institución del programa"
                  value={programInputInstitution}
                  onChange={(e) => setProgramInputInstitution(e.target.value)}
                  placeholder="Ej. FING, ORT, Coursera..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-indigo-500 outline-hidden text-[var(--text)]"
                />
              </div>

              {programInputError && (
                <p role="alert" className="text-xs text-red-500">{programInputError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setProgramModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border)] hover:bg-[var(--surface-muted)] text-[var(--text-soft)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs cursor-pointer"
                >
                  Crear programa
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
        </>
      )}
    </div>
  );
};
