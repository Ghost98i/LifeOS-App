import { LifeOSState, Subject, StudyActiveSession, Exam, StudySessionPhase } from '../types';
import { uid, todayISO } from './storage';

/**
 * Formatea minutos de estudio en una duración legible en español (ej. "4 h 36 min", "45 min", "1 h").
 */
export function formatStudyDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 min';
  const totalMins = Math.round(minutes);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

/**
 * Calcula la siguiente fase y ciclo de un flujo Pomodoro.
 * Enfoque (1) -> Descanso corto (1) -> Enfoque (2) -> ... -> Enfoque (4) -> Descanso largo (4) -> Enfoque (1).
 */
export function getNextPomodoroPhase(
  currentPhase: StudySessionPhase,
  currentCycle: number,
  totalCycles = 4
): { nextPhase: StudySessionPhase; nextCycle: number } {
  const safeCycle = Math.max(1, Math.min(totalCycles, currentCycle));
  if (currentPhase === 'focus') {
    if (safeCycle >= totalCycles) {
      return { nextPhase: 'long_break', nextCycle: safeCycle };
    }
    return { nextPhase: 'short_break', nextCycle: safeCycle };
  }
  if (currentPhase === 'short_break') {
    return { nextPhase: 'focus', nextCycle: Math.min(totalCycles, safeCycle + 1) };
  }
  // long_break
  return { nextPhase: 'focus', nextCycle: 1 };
}

/**
 * Valida los minutos de estudio para registros manuales y sesiones.
 * Exige números enteros, estrictamente positivos y dentro de un límite diario de 24 horas (1440 min).
 */
export function validateStudyMinutes(raw: unknown): { valid: boolean; minutes?: number; error?: string } {
  if (raw === '' || raw === null || raw === undefined) {
    return { valid: false, error: 'Ingresá los minutos de estudio.' };
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || isNaN(num)) {
    return { valid: false, error: 'Los minutos deben ser un número válido.' };
  }
  if (!Number.isInteger(num)) {
    return { valid: false, error: 'Ingresá un número entero de minutos sin decimales.' };
  }
  if (num <= 0) {
    return { valid: false, error: 'Los minutos deben ser mayores a cero.' };
  }
  if (num > 1440) {
    return { valid: false, error: 'El tiempo máximo por registro es 1440 minutos (24 horas).' };
  }
  return { valid: true, minutes: num };
}

/**
 * Valida el nombre de una materia antes de crearla o editarla.
 * Previene nombres vacíos, demasiado largos o duplicados exactos.
 */
export function validateSubjectName(
  rawName: string,
  existingSubjects: Subject[] = [],
  currentSubjectId?: string
): { valid: boolean; name?: string; error?: string } {
  const trimmed = (rawName || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'El nombre de la materia no puede estar vacío.' };
  }
  if (trimmed.length > 80) {
    return { valid: false, error: 'El nombre de la materia es demasiado largo (máximo 80 caracteres).' };
  }
  const duplicate = existingSubjects.some(
    (s) => s.id !== currentSubjectId && s.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    return { valid: false, error: `Ya existe una materia llamada "${trimmed}".` };
  }
  return { valid: true, name: trimmed };
}

/**
 * Renombra una materia existente conservando su ID, exámenes y registros históricos.
 */
export function renameSubject(
  draft: LifeOSState,
  subjectId: string,
  newName: string,
  now = Date.now()
): { success: boolean; error?: string } {
  if (!draft.study?.subjects) return { success: false, error: 'No hay materias registradas.' };
  const sub = draft.study.subjects.find((s) => s.id === subjectId);
  if (!sub) return { success: false, error: 'Materia no encontrada.' };

  const validated = validateSubjectName(newName, draft.study.subjects, subjectId);
  if (!validated.valid || !validated.name) {
    return { success: false, error: validated.error || 'Nombre inválido.' };
  }

  sub.name = validated.name;
  sub.updatedAt = now;

  // Actualizar snapshots de nombre en el historial para coherencia visual
  for (const log of draft.study.studyLog || []) {
    if (log.subjectId === subjectId) {
      log.subjectName = validated.name;
      log.updatedAt = now;
    }
  }

  return { success: true };
}

/**
 * Verifica si una materia puede eliminarse de forma segura.
 * Impide la eliminación destructiva en cascada si conserva exámenes o registros de estudio históricos.
 */
export function canDeleteSubject(
  subjectId: string,
  state: LifeOSState
): { canDelete: boolean; examCount: number; logCount: number; reason?: string } {
  const exams = (state.study?.exams || []).filter((e) => e.subjectId === subjectId);
  const logs = (state.study?.studyLog || []).filter((l) => l.subjectId === subjectId);
  const examCount = exams.length;
  const logCount = logs.length;

  if (examCount > 0 || logCount > 0) {
    const parts: string[] = [];
    if (examCount > 0) parts.push(`${examCount} ${examCount === 1 ? 'examen' : 'exámenes'}`);
    if (logCount > 0) parts.push(`${logCount} ${logCount === 1 ? 'registro' : 'registros'} de estudio`);
    return {
      canDelete: false,
      examCount,
      logCount,
      reason: `No se puede eliminar la materia porque conserva ${parts.join(' y ')} vinculados. Para proteger tu historial académico, elimina o desvincula primero estos elementos.`,
    };
  }
  return { canDelete: true, examCount: 0, logCount: 0 };
}

/**
 * Devuelve el nombre de la materia para visualización en el historial.
 * Garantiza que una materia eliminada NO se reinterprete falsamente como «General».
 */
export function getSubjectDisplayName(
  subjectId: string | null | undefined,
  subjects: Subject[] = [],
  fallbackSnapshot?: string | null
): string {
  if (!subjectId) {
    return 'General';
  }
  const found = subjects.find((s) => s.id === subjectId);
  if (found) {
    return found.name;
  }
  if (fallbackSnapshot && fallbackSnapshot.trim()) {
    return `${fallbackSnapshot.trim()} (materia eliminada)`;
  }
  return 'Materia eliminada';
}

export interface PomodoroSessionConfig {
  phase?: StudySessionPhase;
  cycle?: number;
  totalCycles?: number;
  focusMinutes?: number;
  shortBreakMinutes?: number;
  longBreakMinutes?: number;
}

/**
 * Inicia una nueva sesión de enfoque activa.
 * Asigna targetSubjectId como null si se eligió «General».
 */
export function startStudySession(
  plannedMinutes: number,
  targetSubjectId?: string | null,
  targetSubjectName?: string | null,
  now = Date.now(),
  pomodoroConfig?: PomodoroSessionConfig
): StudyActiveSession {
  const validMinutes = Math.max(1, Math.min(1440, Math.round(plannedMinutes)));
  return {
    id: uid(),
    plannedMinutes: validMinutes,
    targetSubjectId: targetSubjectId && targetSubjectId.trim() ? targetSubjectId.trim() : null,
    targetSubjectName: targetSubjectName && targetSubjectName.trim() ? targetSubjectName.trim() : null,
    startedAt: now,
    status: 'running',
    endsAt: now + validMinutes * 60 * 1000,
    remainingSeconds: validMinutes * 60,
    lastTickAt: now,
    elapsedMinutes: 0,
    phase: pomodoroConfig?.phase || 'focus',
    cycle: pomodoroConfig?.cycle ?? 1,
    totalCycles: pomodoroConfig?.totalCycles ?? 4,
    focusMinutes: pomodoroConfig?.focusMinutes,
    shortBreakMinutes: pomodoroConfig?.shortBreakMinutes,
    longBreakMinutes: pomodoroConfig?.longBreakMinutes,
  };
}

/**
 * Pausa una sesión en curso, congelando los segundos restantes.
 */
export function pauseStudySession(
  session: StudyActiveSession,
  now = Date.now()
): StudyActiveSession {
  if (session.status !== 'running') return session;
  const remaining = session.endsAt ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : session.remainingSeconds;
  const elapsedSeconds = Math.max(0, session.plannedMinutes * 60 - remaining);
  return {
    ...session,
    status: 'paused',
    endsAt: null,
    remainingSeconds: remaining,
    lastTickAt: now,
    elapsedMinutes: Math.floor(elapsedSeconds / 60),
  };
}

/**
 * Reanuda una sesión pausada calculando un nuevo endsAt a partir de remainingSeconds.
 */
export function resumeStudySession(
  session: StudyActiveSession,
  now = Date.now()
): StudyActiveSession {
  if (session.status !== 'paused') return session;
  const remainingSeconds = Math.max(0, session.remainingSeconds);
  return {
    ...session,
    status: 'running',
    endsAt: now + remainingSeconds * 1000,
    lastTickAt: now,
  };
}

/**
 * Evalúa el estado real de una sesión considerando el paso del tiempo offline.
 * Previene inventar minutos automáticamente si el navegador estuvo cerrado mucho tiempo.
 */
export function assessStudySession(
  session: StudyActiveSession,
  now = Date.now()
): {
  status: 'running' | 'paused' | 'completed' | 'interrupted_offline';
  remainingSeconds: number;
  effectiveMinutes: number;
} {
  if (session.status === 'paused') {
    const remainingSeconds = Math.max(0, session.remainingSeconds);
    const elapsedSeconds = Math.max(0, session.plannedMinutes * 60 - remainingSeconds);
    return {
      status: 'paused',
      remainingSeconds,
      effectiveMinutes: Math.floor(elapsedSeconds / 60),
    };
  }

  if (session.status === 'completed_pending_review') {
    return {
      status: 'completed',
      remainingSeconds: 0,
      effectiveMinutes: session.plannedMinutes,
    };
  }

  if (!session.endsAt) {
    return {
      status: 'paused',
      remainingSeconds: session.remainingSeconds,
      effectiveMinutes: 0,
    };
  }

  const remainingSeconds = Math.max(0, Math.ceil((session.endsAt - now) / 1000));
  if (remainingSeconds > 0) {
    const elapsedSeconds = Math.max(0, session.plannedMinutes * 60 - remainingSeconds);
    return {
      status: 'running',
      remainingSeconds,
      effectiveMinutes: Math.floor(elapsedSeconds / 60),
    };
  }

  // La cuenta llegó a 0
  const overdueSeconds = Math.round((now - session.endsAt) / 1000);

  // Si venció hace más de 15 minutos o si la sesión dejó de reportar actividad
  // mucho antes de su finalización planificada (más de 10 min antes de endsAt),
  // se marca como interrumpida/offline para requerir confirmación del usuario.
  const stoppedEarly = Boolean(session.lastTickAt && (session.endsAt - session.lastTickAt > 10 * 60 * 1000));
  if (overdueSeconds > 15 * 60 || stoppedEarly) {
    return {
      status: 'interrupted_offline',
      remainingSeconds: 0,
      effectiveMinutes: session.plannedMinutes,
    };
  }

  return {
    status: 'completed',
    remainingSeconds: 0,
    effectiveMinutes: session.plannedMinutes,
  };
}

/**
 * Registra una sesión de estudio en el studyLog de manera idempotente.
 * Respeta la semántica de «General» como null y guarda el nombre de la materia como resguardo.
 * Prohíbe terminantemente registrar períodos de descanso en el historial de estudio.
 */
export function recordStudySession(
  draft: LifeOSState,
  session: StudyActiveSession,
  customMinutes?: number,
  date = todayISO(),
  now = Date.now()
): { success: boolean; logId?: string; error?: string } {
  // Proteger: NUNCA registrar descansos (short_break o long_break) como tiempo de estudio
  if (session.phase === 'short_break' || session.phase === 'long_break') {
    if (draft.study) draft.study.activeSession = null;
    return { success: false, error: 'Los descansos no se registran en el historial de estudio.' };
  }

  if (!draft.study) {
    draft.study = { subjects: [], exams: [], studyLog: [] };
  }
  if (!draft.study.studyLog) {
    draft.study.studyLog = [];
  }

  // Idempotencia: evitar duplicar la misma sesión si ya fue guardada
  const existing = draft.study.studyLog.find((l) => l.sessionId === session.id);
  if (existing) {
    draft.study.activeSession = null;
    return { success: false, logId: existing.id, error: 'Esta sesión ya fue registrada previamente.' };
  }

  const minutesToRecord = customMinutes !== undefined ? customMinutes : session.plannedMinutes;
  const validated = validateStudyMinutes(minutesToRecord);
  if (!validated.valid || !validated.minutes) {
    return { success: false, error: validated.error || 'Minutos inválidos.' };
  }

  // Asignación estricta de materia: null si General, o el ID exacto si se seleccionó una materia
  let finalSubjectId: string | null = null;
  let finalSubjectName: string | null = null;

  if (session.targetSubjectId) {
    finalSubjectId = session.targetSubjectId;
    const found = (draft.study.subjects || []).find((s) => s.id === session.targetSubjectId);
    if (found) {
      finalSubjectName = found.name;
    } else if (session.targetSubjectName) {
      finalSubjectName = session.targetSubjectName;
    }
  }

  const logId = uid();
  draft.study.studyLog.push({
    id: logId,
    date,
    minutes: validated.minutes,
    subjectId: finalSubjectId,
    subjectName: finalSubjectName,
    sessionId: session.id,
    createdAt: now,
    updatedAt: now,
  });

  draft.study.activeSession = null;
  return { success: true, logId };
}

/** Completes one persisted phase and starts the next in the same state update. */
export function advanceStudyPhase(
  draft: LifeOSState,
  completedSessionId: string,
  nextMinutes: number,
  nextConfig: PomodoroSessionConfig,
  now = Date.now()
): boolean {
  const session = draft.study?.activeSession;
  if (!session || session.id !== completedSessionId || session.status !== 'running') return false;
  if (assessStudySession(session, now).status !== 'completed') return false;

  if (session.phase !== 'short_break' && session.phase !== 'long_break') {
    const result = recordStudySession(draft, session, session.plannedMinutes, todayISO(), now);
    if (!result.success) return false;
  }

  draft.study!.activeSession = startStudySession(
    nextMinutes,
    session.targetSubjectId,
    session.targetSubjectName,
    now,
    nextConfig
  );
  return true;
}

function validStudyDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Actualiza un registro del historial de estudio de manera segura.
 */
export function updateStudyLog(
  draft: LifeOSState,
  logId: string,
  updates: { minutes?: number; subjectId?: string | null; date?: string },
  now = Date.now()
): { success: boolean; error?: string } {
  if (!draft.study?.studyLog) return { success: false, error: 'No hay registros de estudio.' };
  const log = draft.study.studyLog.find((l) => l.id === logId);
  if (!log) return { success: false, error: 'Registro no encontrado.' };

  const validatedMinutes = updates.minutes === undefined ? null : validateStudyMinutes(updates.minutes);
  if (validatedMinutes && (!validatedMinutes.valid || !validatedMinutes.minutes)) {
    return { success: false, error: validatedMinutes.error || 'Minutos inválidos.' };
  }
  const nextDate = updates.date?.trim();
  if (updates.date !== undefined && (!nextDate || !validStudyDate(nextDate))) {
    return { success: false, error: 'Ingresá una fecha válida.' };
  }
  const nextSubjectId = updates.subjectId?.trim() || null;
  if (updates.subjectId !== undefined && nextSubjectId && nextSubjectId !== log.subjectId &&
      !(draft.study.subjects || []).some((s) => s.id === nextSubjectId)) {
    return { success: false, error: 'La materia seleccionada no existe.' };
  }

  if (validatedMinutes?.minutes) {
    log.minutes = validatedMinutes.minutes;
  }

  if (updates.subjectId !== undefined) {
    log.subjectId = nextSubjectId;
    if (log.subjectId) {
      const sub = (draft.study.subjects || []).find((s) => s.id === log.subjectId);
      log.subjectName = sub ? sub.name : log.subjectName;
    } else {
      log.subjectName = null;
    }
  }

  if (nextDate) {
    log.date = nextDate;
  }

  log.updatedAt = now;
  return { success: true };
}

/**
 * Elimina un registro del historial de estudio de manera segura.
 */
export function deleteStudyLog(
  draft: LifeOSState,
  logId: string
): { success: boolean } {
  if (!draft.study?.studyLog) return { success: false };
  draft.study.studyLog = draft.study.studyLog.filter((l) => l.id !== logId);
  return { success: true };
}

/**
 * Valida los datos de una evaluación académica antes de crearla o editarla.
 */
export function validateExamData(raw: {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  subjectId?: string | null;
  status?: string | null;
  grade?: string | null;
}): {
  valid: boolean;
  error?: string;
  data?: {
    title?: string;
    date: string;
    time?: string | null;
    subjectId: string | null;
    status: Exam['status'];
    grade?: string | null;
  };
} {
  const dateTrimmed = (raw.date || '').trim();
  if (!dateTrimmed) {
    return { valid: false, error: 'Ingresá una fecha para la evaluación.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrimmed)) {
    return { valid: false, error: 'La fecha debe tener el formato AAAA-MM-DD.' };
  }

  let timeFormatted: string | null = null;
  const rawTime = (raw.time || '').trim();
  if (rawTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime)) {
      return { valid: false, error: 'La hora debe tener el formato HH:mm (24 horas).' };
    }
    timeFormatted = rawTime;
  }

  const rawTitle = (raw.title || '').trim();
  if (rawTitle.length > 120) {
    return { valid: false, error: 'El título de la evaluación es demasiado largo (máximo 120 caracteres).' };
  }

  const status: Exam['status'] =
    raw.status === 'aprobado' || raw.status === 'desaprobado' || raw.status === 'pendiente'
      ? raw.status
      : 'pendiente';

  const rawGrade = (raw.grade || '').trim();
  if (rawGrade.length > 30) {
    return { valid: false, error: 'La calificación no puede superar los 30 caracteres.' };
  }

  const subjectId = raw.subjectId && raw.subjectId.trim() ? raw.subjectId.trim() : null;

  return {
    valid: true,
    data: {
      title: rawTitle || undefined,
      date: dateTrimmed,
      time: timeFormatted,
      subjectId,
      status,
      grade: rawGrade || null,
    },
  };
}

/**
 * Agrega una nueva evaluación académica al estado con metadatos de sincronización.
 */
export function addExam(
  draft: LifeOSState,
  data: {
    title?: string | null;
    date: string;
    time?: string | null;
    subjectId?: string | null;
    status?: Exam['status'];
    grade?: string | null;
  },
  now = Date.now()
): { success: boolean; exam?: Exam; error?: string } {
  const validated = validateExamData(data);
  if (!validated.valid || !validated.data) {
    return { success: false, error: validated.error || 'Datos de evaluación inválidos.' };
  }

  if (!draft.study) {
    draft.study = { subjects: [], exams: [], studyLog: [] };
  }
  if (!draft.study.exams) {
    draft.study.exams = [];
  }

  const exam: Exam = {
    id: uid(),
    title: validated.data.title,
    subjectId: validated.data.subjectId,
    date: validated.data.date,
    time: validated.data.time,
    status: validated.data.status,
    grade: validated.data.grade,
    createdAt: now,
    updatedAt: now,
  };

  draft.study.exams.push(exam);
  return { success: true, exam };
}

/**
 * Actualiza una evaluación existente conservando su ID original, fecha de creación y metadatos.
 */
export function updateExam(
  draft: LifeOSState,
  examId: string,
  data: {
    title?: string | null;
    date?: string;
    time?: string | null;
    subjectId?: string | null;
    status?: Exam['status'];
    grade?: string | null;
  },
  now = Date.now()
): { success: boolean; exam?: Exam; error?: string } {
  if (!draft.study?.exams) return { success: false, error: 'No hay evaluaciones registradas.' };
  const existing = draft.study.exams.find((e) => e.id === examId);
  if (!existing) return { success: false, error: 'Evaluación no encontrada.' };

  const merged = {
    title: data.title !== undefined ? data.title : existing.title,
    date: data.date !== undefined ? data.date : existing.date,
    time: data.time !== undefined ? data.time : existing.time,
    subjectId: data.subjectId !== undefined ? data.subjectId : existing.subjectId,
    status: data.status !== undefined ? data.status : existing.status,
    grade: data.grade !== undefined ? data.grade : existing.grade,
  };

  const validated = validateExamData(merged);
  if (!validated.valid || !validated.data) {
    return { success: false, error: validated.error || 'Datos inválidos.' };
  }

  existing.title = validated.data.title;
  existing.date = validated.data.date;
  existing.time = validated.data.time;
  existing.subjectId = validated.data.subjectId;
  existing.status = validated.data.status;
  existing.grade = validated.data.grade;
  existing.updatedAt = now;

  return { success: true, exam: existing };
}

/**
 * Elimina una evaluación de forma segura.
 */
export function deleteExam(
  draft: LifeOSState,
  examId: string
): { success: boolean } {
  if (!draft.study?.exams) return { success: false };
  draft.study.exams = draft.study.exams.filter((e) => e.id !== examId);
  return { success: true };
}

/**
 * Obtiene el nombre y rótulo de una evaluación, garantizando compatibilidad con registros históricos sin título.
 */
export function getExamDisplayName(
  exam: Exam,
  subjects: Subject[] = []
): { title: string; subjectName: string | null; fullLabel: string } {
  const subject = exam.subjectId ? subjects.find((s) => s.id === exam.subjectId) : null;
  const subjectName = subject ? subject.name : null;
  const rawTitle = exam.title?.trim();

  let title: string;
  if (rawTitle) {
    title = rawTitle;
  } else if (subjectName) {
    title = `Examen: ${subjectName}`;
  } else {
    title = 'Examen';
  }

  let fullLabel: string;
  if (rawTitle && subjectName) {
    fullLabel = `${rawTitle} · ${subjectName}`;
  } else {
    fullLabel = title;
  }

  return { title, subjectName, fullLabel };
}

export interface CategorizedExams {
  upcoming: Exam[];
  pendingResults: Exam[];
  completed: Exam[];
}

/**
 * Categoriza las evaluaciones en Próximas, Pendientes de resultado (pasadas aún en 'pendiente')
 * y Completadas (aprobadas o desaprobadas).
 */
export function categorizeExams(exams: Exam[], today = todayISO()): CategorizedExams {
  const upcoming: Exam[] = [];
  const pendingResults: Exam[] = [];
  const completed: Exam[] = [];

  for (const exam of exams) {
    if (exam.status === 'aprobado' || exam.status === 'desaprobado') {
      completed.push(exam);
    } else if (exam.date < today) {
      pendingResults.push(exam);
    } else {
      upcoming.push(exam);
    }
  }

  // Próximas: cronológico ascendente (más cercanas primero), luego por hora
  upcoming.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    const timeA = a.time || '99:99';
    const timeB = b.time || '99:99';
    return timeA.localeCompare(timeB);
  });

  // Pendientes de resultado: cronológico descendente (más recientes primero)
  pendingResults.sort((a, b) => b.date.localeCompare(a.date));

  // Completadas: más recientes primero
  completed.sort((a, b) => b.date.localeCompare(a.date));

  return { upcoming, pendingResults, completed };
}

/**
 * Calcula estadísticas para una materia específica: total de evaluaciones, pendientes y minutos de estudio.
 */
export function getSubjectStats(
  subjectId: string,
  state: LifeOSState
): { examCount: number; pendingExamCount: number; studyMinutes: number } {
  const exams = (state.study?.exams || []).filter((e) => e.subjectId === subjectId);
  const pendingExamCount = exams.filter((e) => e.status === 'pendiente').length;
  const studyMinutes = (state.study?.studyLog || [])
    .filter((l) => l.subjectId === subjectId)
    .reduce((sum, l) => sum + Number(l.minutes || 0), 0);
  return {
    examCount: exams.length,
    pendingExamCount,
    studyMinutes,
  };
}
