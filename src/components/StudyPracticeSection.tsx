import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  LifeOSState,
  StudyPenaltyMode,
  StudyPracticeAttempt,
  StudyPracticeMode,
  StudyQuestion,
  Subject,
} from '../types';
import { AppIcon } from './AppIcon';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { showToast } from '../lib/toast';
import { requestConfirm } from '../lib/confirmDialog';
import { fmtDate, todayISO, uid } from '../lib/storage';
import { playSound } from '../lib/audio';
import {
  addStudyQuestion,
  deleteStudyQuestion,
  finishPracticeSession,
  getPracticeRemainingSeconds,
  recordPracticeAnswer,
  startPracticeSession,
  updateStudyQuestion,
} from '../lib/studyPractice';

interface StudyPracticeSectionProps {
  state: LifeOSState;
  subjects: Subject[];
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
}

interface DraftOption {
  id: string;
  text: string;
}

const PENALTY_LABELS: Record<StudyPenaltyMode, string> = {
  ninguno: 'Sin descuento',
  medio: 'Descuento 0,5 por error',
  total: 'Descuento 1 por error',
};

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const StudyPracticeSection: React.FC<StudyPracticeSectionProps> = ({
  state,
  subjects,
  onUpdateState,
}) => {
  const questions = useMemo(() => state.study?.questions || [], [state.study?.questions]);
  const attempts = useMemo(() => state.study?.practiceAttempts || [], [state.study?.practiceAttempts]);
  const activeSession = state.study?.activePracticeSession || null;

  // Configurador de sesión
  const [practiceSubjectId, setPracticeSubjectId] = useState<string>(() => subjects[0]?.id || '');
  const [practiceTopicId, setPracticeTopicId] = useState<string>('');
  const [practiceMode, setPracticeMode] = useState<StudyPracticeMode>('practica');
  const [practicePenalty, setPracticePenalty] = useState<StudyPenaltyMode>('ninguno');
  const [penaltyTouched, setPenaltyTouched] = useState<boolean>(false);
  const [practiceCount, setPracticeCount] = useState<number>(10);
  const [practiceMinutes, setPracticeMinutes] = useState<number>(10);
  const [practiceTimed, setPracticeTimed] = useState<boolean>(false);
  const [immediateFeedback, setImmediateFeedback] = useState<boolean>(true);

  // Estado del runner en curso
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showingFeedback, setShowingFeedback] = useState<boolean>(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() =>
    getPracticeRemainingSeconds(activeSession, Date.now()),
  );
  const [lastResult, setLastResult] = useState<{
    attempt: StudyPracticeAttempt;
    questionIds: string[];
    loggedMinutes: number;
    belowMinimumDuration: boolean;
  } | null>(null);
  const finishingRef = useRef<boolean>(false);
  const questionDialogRef = useRef<HTMLFormElement>(null);

  // Alta / edición de preguntas
  const [questionFormOpen, setQuestionFormOpen] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<StudyQuestion | null>(null);
  const [qSubjectId, setQSubjectId] = useState<string>(() => subjects[0]?.id || '');
  const [qTopicId, setQTopicId] = useState<string>('');
  const [qPrompt, setQPrompt] = useState<string>('');
  const [qOptions, setQOptions] = useState<DraftOption[]>(() => [
    { id: uid(), text: '' },
    { id: uid(), text: '' },
  ]);
  const [qCorrectId, setQCorrectId] = useState<string>('');
  const [qExplanation, setQExplanation] = useState<string>('');
  const [qError, setQError] = useState<string | null>(null);
  const [bankFilterSubjectId, setBankFilterSubjectId] = useState<string>('');

  useDialogFocus(questionFormOpen, questionDialogRef, () => setQuestionFormOpen(false));

  useEffect(() => {
    if (!practiceSubjectId && subjects.length > 0) {
      setPracticeSubjectId(subjects[0].id);
    }
    if (!qSubjectId && subjects.length > 0) {
      setQSubjectId(subjects[0].id);
    }
  }, [subjects, practiceSubjectId, qSubjectId]);

  const practiceTopics = useMemo(
    () => subjects.find((s) => s.id === practiceSubjectId)?.topics || [],
    [subjects, practiceSubjectId],
  );

  const formTopics = useMemo(
    () => subjects.find((s) => s.id === qSubjectId)?.topics || [],
    [subjects, qSubjectId],
  );

  const availablePoolCount = useMemo(() => {
    return questions.filter((q) => {
      if (practiceSubjectId && q.subjectId !== practiceSubjectId) return false;
      if (practiceTopicId && q.topicId !== practiceTopicId) return false;
      return true;
    }).length;
  }, [questions, practiceSubjectId, practiceTopicId]);

  const effectivePracticeCount = availablePoolCount > 0
    ? Math.max(1, Math.min(practiceCount, availablePoolCount))
    : 1;

  useEffect(() => {
    if (availablePoolCount > 0 && practiceCount > availablePoolCount) {
      setPracticeCount(availablePoolCount);
    }
  }, [availablePoolCount, practiceCount]);

  const handleCompleteSession = React.useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const sessionQuestionIds = activeSession?.questionIds ? [...activeSession.questionIds] : [];
    let outcome: ReturnType<typeof finishPracticeSession> | null = null;
    try {
      const saved = onUpdateState((draft) => {
        outcome = finishPracticeSession(draft, { now: Date.now(), dateIso: todayISO(), createId: uid });
      });
      if (!saved || !outcome) return;
      const res = outcome as ReturnType<typeof finishPracticeSession>;
      if (res.success && res.attempt) {
        setLastResult({
          attempt: res.attempt,
          questionIds: sessionQuestionIds.length > 0 ? sessionQuestionIds : res.attempt.answers.map((a) => a.questionId),
          loggedMinutes: res.loggedMinutes,
          belowMinimumDuration: res.belowMinimumDuration,
        });
        setSelectedOptionId(null);
        setShowingFeedback(false);
        if (res.belowMinimumDuration) {
          showToast('Práctica completada. Duró menos de 1 minuto y no se sumó al historial diario.', 'info');
        } else {
          showToast(`Práctica completada: ${res.loggedMinutes} min registrados hoy.`, 'success');
        }
        playSound('click');
      }
    } finally {
      finishingRef.current = false;
    }
  }, [activeSession, onUpdateState]);

  // Temporizador basado en Date.now() + endsAt persistido
  useEffect(() => {
    if (!activeSession?.endsAt) {
      setRemainingSeconds(null);
      return;
    }
    const tick = () => {
      const rem = getPracticeRemainingSeconds(activeSession, Date.now());
      setRemainingSeconds(rem);
      if (rem !== null && rem <= 0) {
        handleCompleteSession();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [activeSession, handleCompleteSession]);

  const currentQuestion = useMemo(() => {
    if (!activeSession) return null;
    const qId = activeSession.questionIds[activeSession.currentIndex];
    return questions.find((q) => q.id === qId) || null;
  }, [activeSession, questions]);

  const currentAnswer = useMemo(() => {
    if (!activeSession || !currentQuestion) return null;
    return activeSession.answers.find((a) => a.questionId === currentQuestion.id) || null;
  }, [activeSession, currentQuestion]);

  const handleConfirmOrAdvance = React.useCallback(() => {
    if (!activeSession || !currentQuestion) return;

    if (!currentAnswer) {
      if (!selectedOptionId) return;
      onUpdateState((draft) => {
        recordPracticeAnswer(draft, currentQuestion.id, selectedOptionId, Date.now());
        if (!activeSession.immediateFeedback && draft.study.activePracticeSession) {
          const nextIdx = draft.study.activePracticeSession.currentIndex + 1;
          if (nextIdx < draft.study.activePracticeSession.questionIds.length) {
            draft.study.activePracticeSession.currentIndex = nextIdx;
          }
        }
      });
      if (activeSession.immediateFeedback) {
        setShowingFeedback(true);
      } else {
        setSelectedOptionId(null);
        if (activeSession.currentIndex + 1 >= activeSession.questionIds.length) {
          handleCompleteSession();
        }
      }
      return;
    }

    // Ya respondida con feedback visible: avanzar o finalizar
    if (activeSession.currentIndex + 1 >= activeSession.questionIds.length) {
      handleCompleteSession();
    } else {
      onUpdateState((draft) => {
        if (draft.study.activePracticeSession) {
          draft.study.activePracticeSession.currentIndex += 1;
        }
      });
      setSelectedOptionId(null);
      setShowingFeedback(false);
    }
  }, [activeSession, currentQuestion, currentAnswer, selectedOptionId, onUpdateState, handleCompleteSession]);

  // Navegación por teclado (1–6 para opciones, Enter para confirmar/avanzar)
  useEffect(() => {
    if (!activeSession || !currentQuestion) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const num = Number(e.key);
      if (num >= 1 && num <= 6 && !currentAnswer) {
        const opt = currentQuestion.options[num - 1];
        if (opt) {
          e.preventDefault();
          setSelectedOptionId(opt.id);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmOrAdvance();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSession, currentQuestion, currentAnswer, handleConfirmOrAdvance]);

  const openNewQuestionForm = () => {
    const opt1 = { id: uid(), text: '' };
    const opt2 = { id: uid(), text: '' };
    setEditingQuestion(null);
    setQSubjectId(practiceSubjectId || subjects[0]?.id || '');
    setQTopicId(practiceTopicId || '');
    setQPrompt('');
    setQOptions([opt1, opt2]);
    setQCorrectId(opt1.id);
    setQExplanation('');
    setQError(null);
    setQuestionFormOpen(true);
  };

  const openEditQuestionForm = (q: StudyQuestion) => {
    setEditingQuestion(q);
    setQSubjectId(q.subjectId);
    setQTopicId(q.topicId || '');
    setQPrompt(q.prompt);
    setQOptions(q.options.map((o) => ({ ...o })));
    setQCorrectId(q.correctOptionId);
    setQExplanation(q.explanation || '');
    setQError(null);
    setQuestionFormOpen(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    let errorMsg: string | undefined;
    const saved = onUpdateState((draft) => {
      const payload = {
        subjectId: qSubjectId,
        topicId: qTopicId || null,
        prompt: qPrompt,
        options: qOptions,
        correctOptionId: qCorrectId,
        explanation: qExplanation,
      };
      const res = editingQuestion
        ? updateStudyQuestion(draft, editingQuestion.id, payload, Date.now(), uid)
        : addStudyQuestion(draft, payload, Date.now(), uid);
      if (!res.success) {
        errorMsg = res.error;
        throw new Error(res.error || 'Pregunta inválida');
      }
    });
    if (!saved) {
      setQError(errorMsg || 'Revisá los campos de la pregunta.');
      return;
    }
    setQuestionFormOpen(false);
    showToast(editingQuestion ? 'Pregunta actualizada.' : 'Pregunta agregada al banco.', 'success');
  };

  const handleDeleteQuestion = (id: string) => {
    const existing = questions.find((q) => q.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = onUpdateState((draft) => {
      deleteStudyQuestion(draft, id);
    });
    if (!saved) return;
    showToast('Pregunta eliminada.', 'info', snapshot ? {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (onUpdateState((draft) => {
          if (!draft.study) draft.study = { subjects: [], exams: [], studyLog: [] };
          if (!draft.study.questions) draft.study.questions = [];
          if (!draft.study.questions.some((q) => q.id === snapshot.id)) {
            draft.study.questions.unshift({ ...snapshot, updatedAt: Date.now() });
          }
        })) {
          showToast('Pregunta restaurada.', 'success');
        }
      },
    } : undefined);
  };

  const handleStartPractice = () => {
    if (!practiceSubjectId) {
      showToast('Creá o elegí una materia primero.', 'info');
      return;
    }
    let errorMsg: string | undefined;
    const saved = onUpdateState((draft) => {
      const res = startPracticeSession(draft, {
        subjectId: practiceSubjectId,
        topicId: practiceTopicId || null,
        mode: practiceMode,
        penalty: practicePenalty,
        questionCount: effectivePracticeCount,
        timeLimitMinutes: practiceMode === 'simulacro' || practiceTimed ? practiceMinutes : null,
        immediateFeedback: practiceMode === 'practica' ? immediateFeedback : false,
        now: Date.now(),
        createId: uid,
      });
      if (!res.success) {
        errorMsg = res.error;
        throw new Error(res.error || 'No se pudo iniciar');
      }
    });
    if (!saved) {
      showToast(errorMsg || 'No hay preguntas suficientes para iniciar.', 'info');
      return;
    }
    setLastResult(null);
    setSelectedOptionId(null);
    setShowingFeedback(false);
  };

  const handleCancelActivePractice = async () => {
    const confirmed = await requestConfirm({
      title: 'Abandonar sesión de repaso',
      message: 'Se perderá el progreso de esta sesión sin guardar resultados.',
      confirmLabel: 'Abandonar',
      tone: 'danger',
    });
    if (!confirmed) return;
    onUpdateState((draft) => {
      draft.study.activePracticeSession = null;
    });
    setSelectedOptionId(null);
    setShowingFeedback(false);
  };

  const filteredBank = useMemo(() => {
    return questions.filter((q) => !bankFilterSubjectId || q.subjectId === bankFilterSubjectId);
  }, [questions, bankFilterSubjectId]);

  // -------------------------------------------------------------------------
  // Vista de práctica activa
  // -------------------------------------------------------------------------
  if (activeSession && currentQuestion) {
    const subjectName = subjects.find((s) => s.id === activeSession.subjectId)?.name || 'Materia';
    const total = activeSession.questionIds.length;
    const progressLabel = `${activeSession.currentIndex + 1}/${total}`;
    const isLast = activeSession.currentIndex + 1 >= total;

    return (
      <section aria-label="Sesión de repaso activa" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[#4F46E5] dark:text-[#A5A0FF]">
              {activeSession.mode === 'simulacro' ? 'Simulacro cronometrado' : 'Repaso activo'} · {subjectName}
            </span>
            <h2 className="text-lg font-bold text-[var(--text)] mt-0.5">
              Pregunta {progressLabel}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {remainingSeconds !== null && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold tabular-nums ${
                  remainingSeconds <= 60
                    ? 'border-red-500/40 bg-red-500/10 text-red-500'
                    : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)]'
                }`}
              >
                <AppIcon name="clock" className="h-3.5 w-3.5" />
                {formatCountdown(remainingSeconds)}
              </span>
            )}
            <button
              type="button"
              onClick={handleCancelActivePractice}
              className="min-h-10 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-soft)] hover:text-red-500 cursor-pointer"
            >
              Salir
            </button>
          </div>
        </div>

        <p className="text-base font-semibold text-[var(--text)] leading-relaxed">
          {currentQuestion.prompt}
        </p>

        <div className="space-y-2" role="radiogroup" aria-label="Opciones de respuesta">
          {currentQuestion.options.map((opt, idx) => {
            const isSelected = (currentAnswer?.optionId || selectedOptionId) === opt.id;
            const isCorrectOption = opt.id === currentQuestion.correctOptionId;
            const reveal = Boolean(currentAnswer) && (showingFeedback || activeSession.immediateFeedback);

            let cardStyle = 'border-[var(--border)] bg-[var(--bg)] hover:border-[#4F46E5]/60';
            if (reveal) {
              if (isCorrectOption) {
                cardStyle = 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
              } else if (isSelected && !isCorrectOption) {
                cardStyle = 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300';
              }
            } else if (isSelected) {
              cardStyle = 'border-[#4F46E5] bg-[#4F46E5]/12 dark:bg-[#4F46E5]/20 ring-1 ring-[#4F46E5]';
            }

            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={Boolean(currentAnswer)}
                onClick={() => setSelectedOptionId(opt.id)}
                className={`w-full min-h-11 rounded-xl border px-3.5 py-2.5 text-left text-sm transition flex items-center gap-3 cursor-pointer disabled:cursor-default ${cardStyle}`}
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-xs font-bold tabular-nums">
                  {idx + 1}
                </span>
                <span className="flex-1 font-medium">{opt.text}</span>
              </button>
            );
          })}
        </div>

        <div aria-live="polite" className="min-h-6">
          {currentAnswer && activeSession.immediateFeedback && (
            <div
              className={`rounded-xl border p-3 text-xs ${
                currentAnswer.correct
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
              }`}
            >
              <p className="font-bold">
                {currentAnswer.correct ? 'Respuesta correcta.' : 'Respuesta incorrecta.'}
              </p>
              {currentQuestion.explanation && (
                <p className="mt-1 text-[var(--text-soft)]">{currentQuestion.explanation}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <span className="text-[11px] text-[var(--text-faint)]">
            Atajos: teclas 1–{currentQuestion.options.length} para elegir · Enter para confirmar
          </span>
          <button
            type="button"
            disabled={!currentAnswer && !selectedOptionId}
            onClick={handleConfirmOrAdvance}
            className="min-h-11 rounded-xl bg-[#4F46E5] px-5 text-sm font-bold text-white hover:bg-[#4338CA] dark:hover:bg-[#6366F1] disabled:opacity-45 cursor-pointer transition-colors"
          >
            {!currentAnswer
              ? 'Confirmar'
              : isLast
              ? 'Finalizar repaso'
              : 'Siguiente pregunta'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* Resultado reciente */}
      {lastResult && (
        <section aria-label="Resultado del repaso" className="rounded-2xl border border-emerald-500/30 bg-[var(--card)] p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Resultado del {lastResult.attempt.mode === 'simulacro' ? 'simulacro' : 'repaso'}
              </span>
              <h2 className="text-xl font-black text-[var(--text)] mt-0.5 tabular-nums">
                {lastResult.attempt.score}% · {lastResult.attempt.correctCount}/{lastResult.attempt.totalQuestions} correctas
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setLastResult(null)}
              className="min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--text-soft)] cursor-pointer"
            >
              Cerrar
            </button>
          </div>
          <p className="text-xs text-[var(--text-soft)]">
            {lastResult.attempt.answers.filter((a) => !a.correct).length} errores ·{' '}
            Duración: {Math.floor(lastResult.attempt.durationSec / 60)} min {lastResult.attempt.durationSec % 60} s ·{' '}
            {PENALTY_LABELS[lastResult.attempt.penalty]} ·{' '}
            {lastResult.belowMinimumDuration
              ? 'Menos de 1 min (no sumado al historial).'
              : `${lastResult.loggedMinutes} min sumados al estudio de hoy.`}
          </p>
          {lastResult.questionIds.length > 0 && (
            <ul className="divide-y divide-[var(--border)]/60 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-xs">
              {lastResult.questionIds.map((qId, idx) => {
                const q = questions.find((item) => item.id === qId);
                const ans = lastResult.attempt.answers.find((a) => a.questionId === qId);
                const chosen = q?.options.find((o) => o.id === ans?.optionId);
                const correctOpt = q?.options.find((o) => o.id === q.correctOptionId);
                return (
                  <li key={qId} className="py-2.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-[var(--text)] break-words">
                        {idx + 1}. {q?.prompt || 'Pregunta'}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          !ans
                            ? 'bg-[var(--surface-muted)] text-[var(--text-soft)]'
                            : ans.correct
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-500/15 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {!ans ? 'Sin responder' : ans.correct ? 'Correcta' : 'Incorrecta'}
                      </span>
                    </div>
                    {ans && !ans.correct && (
                      <p className="text-[11px] text-[var(--text-soft)]">
                        Tu respuesta: <span className="text-red-600 dark:text-red-400 font-medium">{chosen?.text || '—'}</span> · Correcta: <span className="text-emerald-600 dark:text-emerald-400 font-medium">{correctOpt?.text || '—'}</span>
                      </p>
                    )}
                    {q?.explanation && (
                      <p className="text-[11px] text-[var(--text-faint)]">{q.explanation}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Configurador de sesión */}
      <section aria-label="Configurar práctica" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Repaso activo y simulacro</h2>
            <p className="text-xs text-[var(--text-soft)]">
              Practicá preguntas vinculadas a tus materias y temas. Al terminar, se actualiza el tema y tu tiempo de hoy.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewQuestionForm}
            disabled={subjects.length === 0}
            className={`min-h-10 rounded-xl px-4 text-xs font-bold transition-colors disabled:opacity-45 cursor-pointer ${
              subjects.length > 0 && questions.length === 0
                ? 'bg-[#4F46E5] text-white hover:bg-[#4338CA] dark:hover:bg-[#6366F1] shadow-xs'
                : 'border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] hover:border-[#4F46E5]/50 hover:text-[#4F46E5] dark:hover:text-[#A5A0FF]'
            }`}
          >
            + Nueva pregunta
          </button>
        </div>

        {subjects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)]/60 p-4 text-xs text-[var(--text-soft)]">
            Primero creá al menos una materia en la pestaña principal para poder asociar preguntas de repaso.
          </p>
        ) : questions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)]/60 p-4 sm:p-5 space-y-1.5">
            <p className="text-sm font-semibold text-[var(--text)]">Todavía no tenés preguntas cargadas</p>
            <p className="text-xs text-[var(--text-soft)]">
              Cargá preguntas de opción múltiple por materia o tema para entrenar con práctica libre o simulacro con reloj y descuento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <label className="space-y-1">
              <span className="font-semibold text-[var(--text-soft)]">Materia</span>
              <select
                value={practiceSubjectId}
                onChange={(e) => {
                  setPracticeSubjectId(e.target.value);
                  setPracticeTopicId('');
                }}
                className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="font-semibold text-[var(--text-soft)]">Tema (opcional)</span>
              <select
                value={practiceTopicId}
                onChange={(e) => setPracticeTopicId(e.target.value)}
                className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
              >
                <option value="">Todos los temas</option>
                {practiceTopics.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="font-semibold text-[var(--text-soft)]">Modo</span>
              <select
                value={practiceMode}
                onChange={(e) => {
                  const nextMode = e.target.value as StudyPracticeMode;
                  setPracticeMode(nextMode);
                  if (!penaltyTouched) {
                    setPracticePenalty(nextMode === 'simulacro' ? 'medio' : 'ninguno');
                  }
                }}
                className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
              >
                <option value="practica">Práctica libre</option>
                <option value="simulacro">Simulacro cronometrado</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="font-semibold text-[var(--text-soft)]">Cantidad de preguntas</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, availablePoolCount)}
                value={effectivePracticeCount}
                onChange={(e) => {
                  const raw = Math.max(1, Number(e.target.value) || 1);
                  setPracticeCount(availablePoolCount > 0 ? Math.min(raw, availablePoolCount) : raw);
                }}
                className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
              />
            </label>

            <label className="space-y-1">
              <span className="font-semibold text-[var(--text-soft)]">Penalización por error</span>
              <select
                value={practicePenalty}
                onChange={(e) => {
                  setPracticePenalty(e.target.value as StudyPenaltyMode);
                  setPenaltyTouched(true);
                }}
                className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
              >
                <option value="ninguno">Sin descuento</option>
                <option value="medio">Resta 0,5 por error</option>
                <option value="total">Resta 1 por error</option>
              </select>
            </label>

            {practiceMode === 'simulacro' ? (
              <label className="space-y-1">
                <span className="font-semibold text-[var(--text-soft)]">Tiempo límite (min)</span>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={practiceMinutes}
                  onChange={(e) => setPracticeMinutes(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
                />
              </label>
            ) : (
              <div className="flex flex-col justify-center gap-2 sm:pt-1">
                <div className="flex items-center justify-between gap-3 min-h-9 rounded-lg border border-[var(--border)]/70 bg-[var(--bg)]/60 px-2.5 py-1.5">
                  <span className="font-medium text-[var(--text-soft)]">Mostrar feedback inmediato</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={immediateFeedback}
                    aria-label="Mostrar feedback inmediato"
                    onClick={() => setImmediateFeedback((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                      immediateFeedback
                        ? 'border-[#4F46E5] bg-[#4F46E5] justify-end'
                        : 'border-[var(--border-strong)] bg-[var(--surface-muted)] justify-start'
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full bg-white shadow-2xs transition-transform" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 min-h-9 rounded-lg border border-[var(--border)]/70 bg-[var(--bg)]/60 px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-[var(--text-soft)]">Con temporizador</span>
                    {practiceTimed && (
                      <input
                        type="number"
                        aria-label="Minutos del temporizador opcional"
                        min={1}
                        max={180}
                        value={practiceMinutes}
                        onChange={(e) => setPracticeMinutes(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 min-h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 tabular-nums text-[var(--text)]"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={practiceTimed}
                    aria-label="Con temporizador"
                    onClick={() => setPracticeTimed((prev) => !prev)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                      practiceTimed
                        ? 'border-[#4F46E5] bg-[#4F46E5] justify-end'
                        : 'border-[var(--border-strong)] bg-[var(--surface-muted)] justify-start'
                    }`}
                  >
                    <span className="h-3.5 w-3.5 rounded-full bg-white shadow-2xs transition-transform" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {questions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-[var(--text-soft)]">
              {availablePoolCount} {availablePoolCount === 1 ? 'pregunta disponible' : 'preguntas disponibles'} en esta selección.
            </span>
            <button
              type="button"
              disabled={availablePoolCount === 0}
              onClick={handleStartPractice}
              className="min-h-11 rounded-xl bg-[#4F46E5] px-5 text-sm font-bold text-white hover:bg-[#4338CA] dark:hover:bg-[#6366F1] disabled:opacity-45 cursor-pointer transition-colors"
            >
              Comenzar {practiceMode === 'simulacro' ? 'simulacro' : 'repaso'}
            </button>
          </div>
        )}
      </section>

      {/* Banco de preguntas */}
      {questions.length > 0 && (
        <section aria-label="Banco de preguntas" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text)]">Banco de preguntas ({filteredBank.length})</h3>
            <select
              aria-label="Filtrar banco por materia"
              value={bankFilterSubjectId}
              onChange={(e) => setBankFilterSubjectId(e.target.value)}
              className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text)]"
            >
              <option value="">Todas las materias</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <ul className="divide-y divide-[var(--border)]/60">
            {filteredBank.map((q) => {
              const sub = subjects.find((s) => s.id === q.subjectId);
              const top = sub?.topics?.find((t) => t.id === q.topicId);
              return (
                <li key={q.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--text)] break-words">{q.prompt}</p>
                    <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
                      {sub?.name || 'Materia'}{top ? ` · ${top.title}` : ''} · {q.options.length} opciones
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditQuestionForm(q)}
                      className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
                      title="Editar pregunta"
                      aria-label={`Editar pregunta: ${q.prompt}`}
                    >
                      <AppIcon name="edit" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Eliminar pregunta"
                      aria-label={`Eliminar pregunta: ${q.prompt}`}
                    >
                      <AppIcon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Historial de intentos recientes */}
      {attempts.length > 0 && (
        <section aria-label="Últimos intentos" className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 space-y-2.5">
          <h3 className="text-sm font-bold text-[var(--text)]">Últimos repasos</h3>
          <ul className="divide-y divide-[var(--border)]/60 text-xs">
            {attempts.slice(0, 5).map((att) => {
              const subName = subjects.find((s) => s.id === att.subjectId)?.name || 'Materia';
              return (
                <li key={att.id} className="py-2 flex items-center justify-between gap-2">
                  <span className="text-[var(--text)] font-medium">
                    {subName} · {att.mode === 'simulacro' ? 'Simulacro' : 'Repaso'} ({fmtDate(att.date)})
                  </span>
                  <span className="font-bold tabular-nums text-[var(--text)]">
                    {att.score}% ({att.correctCount}/{att.totalQuestions})
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Modal de creación/edición de pregunta */}
      {questionFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setQuestionFormOpen(false)}
        >
          <form
            ref={questionDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-modal-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveQuestion}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4 shadow-2xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 id="question-modal-title" className="text-base font-bold text-[var(--text)]">
                {editingQuestion ? 'Editar pregunta' : 'Nueva pregunta de repaso'}
              </h3>
              <button
                type="button"
                onClick={() => setQuestionFormOpen(false)}
                aria-label="Cerrar modal"
                className="p-1.5 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] cursor-pointer"
              >
                <AppIcon name="x" className="h-4 w-4" />
              </button>
            </div>

            {qError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-red-500 font-medium">
                {qError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-semibold text-[var(--text-soft)]">Materia</span>
                <select
                  value={qSubjectId}
                  onChange={(e) => {
                    setQSubjectId(e.target.value);
                    setQTopicId('');
                  }}
                  className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold text-[var(--text-soft)]">Tema (opcional)</span>
                <select
                  value={qTopicId}
                  onChange={(e) => setQTopicId(e.target.value)}
                  className="w-full min-h-10 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
                >
                  <option value="">General de la materia</option>
                  {formTopics.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="font-semibold text-[var(--text-soft)]">Consigna</span>
              <textarea
                rows={2}
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                placeholder="Ej.: ¿Cuál es la complejidad temporal de búsqueda binaria?"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[var(--text)]"
              />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--text-soft)]">Opciones (2 a 6) — marcá la correcta</span>
                {qOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setQOptions([...qOptions, { id: uid(), text: '' }])}
                    className="text-[#4F46E5] dark:text-[#A5A0FF] font-semibold hover:underline cursor-pointer"
                  >
                    + Agregar opción
                  </button>
                )}
              </div>
              {qOptions.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    aria-label={`Marcar opción ${idx + 1} como correcta`}
                    checked={qCorrectId === opt.id}
                    onChange={() => setQCorrectId(opt.id)}
                  />
                  <input
                    type="text"
                    value={opt.text}
                    onChange={(e) => {
                      const next = [...qOptions];
                      next[idx] = { ...opt, text: e.target.value };
                      setQOptions(next);
                    }}
                    placeholder={`Opción ${idx + 1}`}
                    className="flex-1 min-h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
                  />
                  {qOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const filtered = qOptions.filter((o) => o.id !== opt.id);
                        setQOptions(filtered);
                        if (qCorrectId === opt.id && filtered[0]) {
                          setQCorrectId(filtered[0].id);
                        }
                      }}
                      className="p-1.5 text-[var(--text-faint)] hover:text-red-500 cursor-pointer"
                      aria-label={`Quitar opción ${idx + 1}`}
                    >
                      <AppIcon name="x" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="font-semibold text-[var(--text-soft)]">Explicación (opcional)</span>
              <input
                type="text"
                value={qExplanation}
                onChange={(e) => setQExplanation(e.target.value)}
                placeholder="Breve aclaración que se muestra al responder"
                className="w-full min-h-9 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 text-[var(--text)]"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuestionFormOpen(false)}
                className="min-h-10 rounded-xl border border-[var(--border)] px-4 font-semibold text-[var(--text-soft)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-10 rounded-xl bg-[#4F46E5] px-4 font-bold text-white hover:bg-[#4338CA] dark:hover:bg-[#6366F1] cursor-pointer transition-colors"
              >
                Guardar pregunta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
