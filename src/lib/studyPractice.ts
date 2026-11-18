import type {
  LifeOSState,
  StudyLog,
  StudyPenaltyMode,
  StudyPracticeAnswer,
  StudyPracticeAttempt,
  StudyPracticeMode,
  StudyPracticeSession,
  StudyQuestion,
  StudyQuestionOption,
} from '../types';
import { todayISO, uid } from './storage';

export interface QuestionValidationInput {
  subjectId: string;
  topicId?: string | null;
  prompt: string;
  options: Array<{ id?: string; text: string }>;
  correctOptionId: string;
  explanation?: string;
}

export function validateStudyQuestion(
  state: LifeOSState,
  input: QuestionValidationInput,
): { valid: boolean; error?: string } {
  const prompt = (input.prompt || '').trim();
  if (!prompt) {
    return { valid: false, error: 'Escribí la consigna de la pregunta.' };
  }
  const subject = (state.study?.subjects || []).find((s) => s.id === input.subjectId);
  if (!subject) {
    return { valid: false, error: 'Seleccioná una materia válida.' };
  }
  if (input.topicId) {
    const topicExists = (subject.topics || []).some((t) => t.id === input.topicId);
    if (!topicExists) {
      return { valid: false, error: 'El tema seleccionado no pertenece a la materia.' };
    }
  }
  const cleanOptions = (input.options || []).filter((opt) => (opt.text || '').trim().length > 0);
  if (cleanOptions.length < 2 || cleanOptions.length > 6) {
    return { valid: false, error: 'La pregunta debe tener entre 2 y 6 opciones con texto.' };
  }
  const hasCorrect = cleanOptions.some((opt) => opt.id && opt.id === input.correctOptionId);
  if (!hasCorrect) {
    return { valid: false, error: 'Marcá cuál es la opción correcta.' };
  }
  return { valid: true };
}

export function addStudyQuestion(
  draft: LifeOSState,
  input: QuestionValidationInput,
  now = Date.now(),
  createId: () => string = uid,
): { success: boolean; question?: StudyQuestion; error?: string } {
  if (!draft.study) return { success: false, error: 'Módulo de estudios no inicializado.' };
  const normalizedOptions: StudyQuestionOption[] = (input.options || [])
    .map((opt) => ({
      id: opt.id || createId(),
      text: (opt.text || '').trim(),
    }))
    .filter((opt) => opt.text.length > 0);

  const check = validateStudyQuestion(draft, { ...input, options: normalizedOptions });
  if (!check.valid) return { success: false, error: check.error };

  const question: StudyQuestion = {
    id: createId(),
    subjectId: input.subjectId,
    topicId: input.topicId || null,
    kind: 'multiple_choice',
    prompt: input.prompt.trim(),
    options: normalizedOptions,
    correctOptionId: input.correctOptionId,
    explanation: input.explanation?.trim() || undefined,
    updatedAt: now,
  };

  if (!Array.isArray(draft.study.questions)) {
    draft.study.questions = [];
  }
  draft.study.questions.unshift(question);
  return { success: true, question };
}

export function updateStudyQuestion(
  draft: LifeOSState,
  questionId: string,
  input: QuestionValidationInput,
  now = Date.now(),
  createId: () => string = uid,
): { success: boolean; question?: StudyQuestion; error?: string } {
  const questions = draft.study?.questions || [];
  const idx = questions.findIndex((q) => q.id === questionId);
  if (idx === -1) return { success: false, error: 'Pregunta no encontrada.' };

  const normalizedOptions: StudyQuestionOption[] = (input.options || [])
    .map((opt) => ({
      id: opt.id || createId(),
      text: (opt.text || '').trim(),
    }))
    .filter((opt) => opt.text.length > 0);

  const check = validateStudyQuestion(draft, { ...input, options: normalizedOptions });
  if (!check.valid) return { success: false, error: check.error };

  const updated: StudyQuestion = {
    ...questions[idx],
    subjectId: input.subjectId,
    topicId: input.topicId || null,
    kind: 'multiple_choice',
    prompt: input.prompt.trim(),
    options: normalizedOptions,
    correctOptionId: input.correctOptionId,
    explanation: input.explanation?.trim() || undefined,
    updatedAt: now,
  };
  questions[idx] = updated;
  return { success: true, question: updated };
}

export function deleteStudyQuestion(draft: LifeOSState, questionId: string): boolean {
  if (!draft.study?.questions) return false;
  const before = draft.study.questions.length;
  draft.study.questions = draft.study.questions.filter((q) => q.id !== questionId);
  return draft.study.questions.length < before;
}

/**
 * Fórmula de puntaje de repaso/simulacro:
 *   penaltyWeight = 0 ('ninguno') | 0.5 ('medio') | 1 ('total')
 *   effectiveCorrect = correctCount - wrongAnsweredCount * penaltyWeight
 *   score = clamp(0, 100, Math.round((effectiveCorrect / totalQuestions) * 100))
 * Solo las respuestas efectivamente emitidas e incorrectas descuentan puntos.
 */
export function calculatePracticeScore(
  totalQuestions: number,
  answers: Pick<StudyPracticeAnswer, 'correct'>[],
  penalty: StudyPenaltyMode,
): { correctCount: number; wrongCount: number; score: number } {
  if (totalQuestions <= 0) {
    return { correctCount: 0, wrongCount: 0, score: 0 };
  }
  const correctCount = answers.filter((a) => a.correct).length;
  const wrongCount = answers.filter((a) => !a.correct).length;
  const weight = penalty === 'medio' ? 0.5 : penalty === 'total' ? 1 : 0;
  const effective = correctCount - wrongCount * weight;
  const raw = Math.round((effective / totalQuestions) * 100);
  const score = Math.max(0, Math.min(100, raw));
  return { correctCount, wrongCount, score };
}

export interface StartPracticeOptions {
  subjectId: string;
  topicId?: string | null;
  mode: StudyPracticeMode;
  penalty?: StudyPenaltyMode;
  questionCount?: number;
  timeLimitMinutes?: number | null;
  immediateFeedback?: boolean;
  now?: number;
  createId?: () => string;
  shuffle?: <T>(items: T[]) => T[];
}

export function defaultShuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function startPracticeSession(
  draft: LifeOSState,
  options: StartPracticeOptions,
): { success: boolean; session?: StudyPracticeSession; error?: string } {
  const now = options.now ?? Date.now();
  const createId = options.createId ?? uid;
  const shuffle = options.shuffle ?? defaultShuffle;

  const allQuestions = draft.study?.questions || [];
  const pool = allQuestions.filter((q) => {
    if (q.subjectId !== options.subjectId) return false;
    if (options.topicId && q.topicId !== options.topicId) return false;
    return true;
  });

  if (pool.length === 0) {
    return { success: false, error: 'No hay preguntas disponibles para la materia o tema seleccionado.' };
  }

  const ordered = shuffle(pool);
  const limitCount = options.questionCount && options.questionCount > 0
    ? Math.min(options.questionCount, ordered.length)
    : ordered.length;
  const selected = ordered.slice(0, limitCount);

  const timeLimitMinutes = options.mode === 'simulacro'
    ? Math.max(1, Number(options.timeLimitMinutes) || Math.max(5, selected.length * 2))
    : (options.timeLimitMinutes && options.timeLimitMinutes > 0 ? options.timeLimitMinutes : null);

  const penalty: StudyPenaltyMode = options.penalty ?? (options.mode === 'simulacro' ? 'medio' : 'ninguno');

  const session: StudyPracticeSession = {
    id: createId(),
    subjectId: options.subjectId,
    topicId: options.topicId || null,
    mode: options.mode,
    penalty,
    questionIds: selected.map((q) => q.id),
    currentIndex: 0,
    answers: [],
    startedAt: now,
    endsAt: timeLimitMinutes ? now + timeLimitMinutes * 60_000 : null,
    immediateFeedback: options.immediateFeedback ?? (options.mode === 'practica'),
  };

  draft.study.activePracticeSession = session;
  return { success: true, session };
}

export function getPracticeRemainingSeconds(
  session: Pick<StudyPracticeSession, 'endsAt'> | null | undefined,
  now = Date.now(),
): number | null {
  if (!session?.endsAt) return null;
  return Math.max(0, Math.ceil((session.endsAt - now) / 1000));
}

export function recordPracticeAnswer(
  draft: LifeOSState,
  questionId: string,
  optionId: string,
  now = Date.now(),
): { success: boolean; answer?: StudyPracticeAnswer } {
  const session = draft.study?.activePracticeSession;
  if (!session) return { success: false };
  const question = (draft.study.questions || []).find((q) => q.id === questionId);
  if (!question) return { success: false };

  const alreadyAnswered = session.answers.some((a) => a.questionId === questionId);
  if (alreadyAnswered) return { success: false };

  const correct = question.correctOptionId === optionId;
  const previousDurationMs = session.answers.reduce((sum, a) => sum + (a.elapsedMs || 0), 0);
  const elapsedMs = Math.max(0, now - session.startedAt - previousDurationMs);
  const answer: StudyPracticeAnswer = {
    questionId,
    optionId,
    correct,
    elapsedMs,
  };
  session.answers.push(answer);
  return { success: true, answer };
}

export interface FinishPracticeResult {
  success: boolean;
  attempt?: StudyPracticeAttempt;
  loggedMinutes: number;
  belowMinimumDuration: boolean;
}

export function finishPracticeSession(
  draft: LifeOSState,
  options?: {
    now?: number;
    dateIso?: string;
    createId?: () => string;
  },
): FinishPracticeResult {
  const now = options?.now ?? Date.now();
  const dateIso = options?.dateIso ?? todayISO();
  const createId = options?.createId ?? uid;

  const session = draft.study?.activePracticeSession;
  if (!session) {
    return { success: false, loggedMinutes: 0, belowMinimumDuration: false };
  }

  if (!Array.isArray(draft.study.practiceAttempts)) {
    draft.study.practiceAttempts = [];
  }

  // Idempotencia: si este sessionId ya generó un intento, no duplicar intento ni StudyLog
  const existingAttempt = draft.study.practiceAttempts.find((a) => a.id === session.id);
  if (existingAttempt) {
    draft.study.activePracticeSession = null;
    const existingLog = existingAttempt.studyLogId
      ? (draft.study.studyLog || []).find((l) => l.id === existingAttempt.studyLogId)
      : null;
    return {
      success: true,
      attempt: existingAttempt,
      loggedMinutes: existingLog?.minutes || 0,
      belowMinimumDuration: existingAttempt.durationSec < 60,
    };
  }

  const effectiveEnd = session.endsAt ? Math.min(now, session.endsAt) : now;
  const durationSec = Math.max(0, Math.round((effectiveEnd - session.startedAt) / 1000));
  const totalQuestions = session.questionIds.length;
  const { correctCount, score } = calculatePracticeScore(totalQuestions, session.answers, session.penalty);

  let studyLogId: string | null = null;
  let loggedMinutes = 0;
  const belowMinimumDuration = durationSec < 60;

  if (!belowMinimumDuration) {
    const minutes = Math.max(1, Math.round(durationSec / 60));
    const subject = (draft.study.subjects || []).find((s) => s.id === session.subjectId);
    const alreadyLogged = (draft.study.studyLog || []).find((l) => l.sessionId === session.id);
    if (alreadyLogged) {
      studyLogId = alreadyLogged.id;
      loggedMinutes = alreadyLogged.minutes;
    } else {
      const logEntry: StudyLog = {
        id: createId(),
        date: dateIso,
        minutes,
        subjectId: session.subjectId,
        subjectName: subject?.name || null,
        sessionId: session.id,
        createdAt: now,
        updatedAt: now,
      };
      if (!Array.isArray(draft.study.studyLog)) {
        draft.study.studyLog = [];
      }
      draft.study.studyLog.unshift(logEntry);
      studyLogId = logEntry.id;
      loggedMinutes = minutes;
    }
  }

  const attempt: StudyPracticeAttempt = {
    id: session.id,
    date: dateIso,
    subjectId: session.subjectId,
    topicId: session.topicId || null,
    mode: session.mode,
    penalty: session.penalty,
    totalQuestions,
    correctCount,
    score,
    durationSec,
    answers: [...session.answers],
    studyLogId,
    createdAt: now,
  };

  draft.study.practiceAttempts.unshift(attempt);

  // Actualizar progreso del tema (y bumpear subject.updatedAt para que syncMerge no lo descarte)
  const subject = (draft.study.subjects || []).find((s) => s.id === session.subjectId);
  if (subject && Array.isArray(subject.topics)) {
    const questionById = new Map((draft.study.questions || []).map((q) => [q.id, q]));
    const answersByTopic = new Map<string, { total: number; correct: number }>();

    for (const qId of session.questionIds) {
      const q = questionById.get(qId);
      const tId = q?.topicId || session.topicId;
      if (!tId) continue;
      const ans = session.answers.find((a) => a.questionId === qId);
      const cur = answersByTopic.get(tId) || { total: 0, correct: 0 };
      cur.total += 1;
      if (ans?.correct) cur.correct += 1;
      answersByTopic.set(tId, cur);
    }

    let topicTouched = false;
    for (const topic of subject.topics) {
      const stats = answersByTopic.get(topic.id);
      if (!stats) continue;
      const prev = topic.practice || { attempts: 0, correct: 0 };
      const topicScore = session.topicId && topic.id === session.topicId && answersByTopic.size === 1
        ? score
        : (stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0);
      topic.practice = {
        attempts: prev.attempts + 1,
        correct: prev.correct + stats.correct,
        lastPracticedAt: now,
        bestScore: prev.bestScore !== undefined ? Math.max(prev.bestScore, topicScore) : topicScore,
      };
      topic.updatedAt = now;
      topicTouched = true;
    }

    if (topicTouched) {
      subject.updatedAt = now;
    }
  }

  draft.study.activePracticeSession = null;
  return {
    success: true,
    attempt,
    loggedMinutes,
    belowMinimumDuration,
  };
}
