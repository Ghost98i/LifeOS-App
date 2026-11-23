import type { Exam, LifeOSState, StudyLog, StudyProgram, StudyProgramKind, Subject } from '../types';
import { todayISO, uid, withinCurrentWeek } from './storage';

export const GENERAL_PROGRAM_FILTER = '__general__' as const;

export const STUDY_PROGRAM_KINDS: readonly StudyProgramKind[] = [
  'carrera',
  'curso',
  'certificacion',
  'autoestudio',
] as const;

export const STUDY_PROGRAM_KIND_LABELS: Record<StudyProgramKind, string> = {
  carrera: 'Carrera / Facultad',
  curso: 'Curso / Idioma',
  certificacion: 'Certificación',
  autoestudio: 'Autoestudio',
};

export function hasGeneralSubjects(subjects: Subject[], programs: StudyProgram[] = []): boolean {
  const validProgramIds = new Set(programs.map((p) => p.id));
  return subjects.some((subject) => !subject.programId || !validProgramIds.has(subject.programId));
}

export function filterSubjectsByProgram(
  subjects: Subject[],
  programFilter: string | null,
  programs: StudyProgram[] = []
): Subject[] {
  if (!programFilter) return subjects;
  const validProgramIds = new Set(programs.map((p) => p.id));
  if (programFilter === GENERAL_PROGRAM_FILTER) {
    return subjects.filter((subject) => !subject.programId || !validProgramIds.has(subject.programId));
  }
  return subjects.filter((subject) => subject.programId === programFilter);
}

export function filterExamsByProgram(
  exams: Exam[],
  subjects: Subject[],
  programFilter: string | null,
  programs: StudyProgram[] = []
): Exam[] {
  if (!programFilter) return exams;
  const scopedSubjectIds = new Set(
    filterSubjectsByProgram(subjects, programFilter, programs).map((subject) => subject.id)
  );
  if (programFilter === GENERAL_PROGRAM_FILTER) {
    return exams.filter((exam) => !exam.subjectId || scopedSubjectIds.has(exam.subjectId));
  }
  return exams.filter((exam) => Boolean(exam.subjectId && scopedSubjectIds.has(exam.subjectId)));
}

export function addStudyProgram(
  state: LifeOSState,
  input: { name: string; kind: StudyProgramKind; institution?: string },
  createId: () => string = uid
): { success: boolean; program?: StudyProgram; error?: string } {
  const cleanName = (input.name || '').trim();
  if (!cleanName) {
    return { success: false, error: 'Ingresá un nombre para la carrera o curso.' };
  }
  if (!state.study) state.study = { subjects: [], exams: [], studyLog: [] };
  if (!Array.isArray(state.study.programs)) state.study.programs = [];

  const duplicate = state.study.programs.some(
    (p) => p.name.trim().toLocaleLowerCase('es') === cleanName.toLocaleLowerCase('es')
  );
  if (duplicate) {
    return { success: false, error: 'Ya existe un programa con ese nombre.' };
  }

  const now = Date.now();
  const cleanInstitution = (input.institution || '').trim();
  const program: StudyProgram = {
    id: createId(),
    name: cleanName,
    kind: input.kind,
    ...(cleanInstitution ? { institution: cleanInstitution } : {}),
    createdAt: now,
    updatedAt: now,
  };
  state.study.programs.push(program);
  return { success: true, program };
}

export function createGuidedStudySetup(
  state: LifeOSState,
  input: {
    kind: StudyProgramKind;
    programName?: string;
    institution?: string;
    subjectsRaw: string;
  },
  createId: () => string = uid
): { success: boolean; program?: StudyProgram; subjectsCreated: Subject[]; error?: string } {
  const cleanProgramName = (input.programName || '').trim();
  const rawNames = (input.subjectsRaw || '')
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!cleanProgramName && rawNames.length === 0) {
    return {
      success: false,
      subjectsCreated: [],
      error: 'Ingresá al menos una materia o el nombre de tu carrera/curso.',
    };
  }

  if (!state.study) state.study = { subjects: [], exams: [], studyLog: [] };
  if (!Array.isArray(state.study.subjects)) state.study.subjects = [];

  let program: StudyProgram | undefined;
  if (cleanProgramName) {
    const existingProgram = (state.study.programs || []).find(
      (p) => p.name.trim().toLocaleLowerCase('es') === cleanProgramName.toLocaleLowerCase('es')
    );
    if (existingProgram) {
      program = existingProgram;
    } else {
      const added = addStudyProgram(
        state,
        { name: cleanProgramName, kind: input.kind, institution: input.institution },
        createId
      );
      if (!added.success || !added.program) {
        return { success: false, subjectsCreated: [], error: added.error };
      }
      program = added.program;
    }
  }

  const existingSubjectNames = new Set(
    state.study.subjects.map((s) => s.name.trim().toLocaleLowerCase('es'))
  );
  const subjectsCreated: Subject[] = [];
  const now = Date.now();

  for (const name of rawNames) {
    const key = name.toLocaleLowerCase('es');
    if (existingSubjectNames.has(key)) continue;
    existingSubjectNames.add(key);
    const subject: Subject = {
      id: createId(),
      name,
      ...(program ? { programId: program.id } : {}),
      createdAt: now,
      updatedAt: now,
    };
    state.study.subjects.push(subject);
    subjectsCreated.push(subject);
  }

  return { success: true, program, subjectsCreated };
}

export type StudyOverviewKind =
  | 'empty'
  | 'sessions_only'
  | 'subjects_without_exams'
  | 'evaluations_with_activity'
  | 'active';

/** Classifies visible study data so existing study logs never look like a first visit. */
export function classifyStudyOverview(data: {
  subjectCount: number;
  examCount: number;
  studyLogCount: number;
  programCount?: number;
}): StudyOverviewKind {
  const { subjectCount, examCount, studyLogCount, programCount = 0 } = data;

  if (subjectCount === 0 && examCount === 0 && programCount === 0) {
    return studyLogCount > 0 ? 'sessions_only' : 'empty';
  }
  if (subjectCount > 0 && examCount === 0) return 'subjects_without_exams';
  if (examCount > 0 && studyLogCount > 0) return 'evaluations_with_activity';
  return 'active';
}

export type StudyExamFilter = 'upcoming' | 'pending_results' | 'completed' | 'all';

export function selectStudyExams(
  filter: StudyExamFilter,
  exams: Exam[],
  categorized: { upcoming: Exam[]; pendingResults: Exam[]; completed: Exam[] },
  subjectId: string | null
): Exam[] {
  let list: Exam[];
  if (filter === 'upcoming') list = categorized.upcoming;
  else if (filter === 'pending_results') list = categorized.pendingResults;
  else if (filter === 'completed') list = categorized.completed;
  else {
    // En "Todas", priorizamos las evaluaciones próximas ordenadas de la más cercana a la más lejana,
    // seguidas por las pendientes de nota y por último el historial ya calificado.
    const ordered: Exam[] = [];
    const seen = new Set<string>();
    for (const exam of [...categorized.upcoming, ...categorized.pendingResults, ...categorized.completed]) {
      if (seen.has(exam.id)) continue;
      seen.add(exam.id);
      ordered.push(exam);
    }
    const remaining = exams
      .filter((exam) => !seen.has(exam.id))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99'));
    list = [...ordered, ...remaining];
  }

  return subjectId ? list.filter((exam) => exam.subjectId === subjectId) : list;
}

/**
 * Resuelve la jerarquía visual de una tarjeta de evaluación:
 * el nombre de la materia es siempre el título principal cuando existe,
 * y el tipo/nombre de la evaluación (Examen, Parcial, Entrega) pasa a chip/subtítulo sutil.
 */
export function getExamCardDisplay(
  exam: Exam,
  subjects: Subject[] = []
): { primaryTitle: string; typeLabel: string | null; subjectName: string | null } {
  const subject = exam.subjectId ? subjects.find((s) => s.id === exam.subjectId) : null;
  const subjectName = subject?.name?.trim() || null;
  const rawTitle = exam.title?.trim() || '';

  if (subjectName) {
    return {
      primaryTitle: subjectName,
      typeLabel: rawTitle || 'Examen',
      subjectName,
    };
  }

  return {
    primaryTitle: rawTitle || 'Examen',
    typeLabel: rawTitle ? 'General' : null,
    subjectName: null,
  };
}

export interface StudyThirdOverviewMetric {
  kind: 'approval' | 'topics' | 'sessions';
  label: string;
  value: string;
  subtitle: string;
}

/**
 * Devuelve la tercera métrica superior de Estudios:
 * - Si hay al menos una evaluación calificada: muestra Aprobación.
 * - Si aún no hay calificadas pero existen temas cargados: muestra Temas completados (X / Y).
 * - En caso contrario: muestra Sesiones esta semana.
 */
export function getStudyThirdOverviewMetric(params: {
  completedExams: Exam[];
  subjects: Subject[];
  exams: Exam[];
  studyLogs: StudyLog[];
  today?: string;
}): StudyThirdOverviewMetric {
  const { completedExams, subjects, exams, studyLogs, today = todayISO() } = params;

  if (completedExams.length > 0) {
    const approvedCount = completedExams.filter((e) => e.status === 'aprobado').length;
    const pct = Math.round((approvedCount / completedExams.length) * 100);
    return {
      kind: 'approval',
      label: 'Aprobación',
      value: `${approvedCount} de ${completedExams.length} aprobadas`,
      subtitle: `${pct}% en evaluaciones calificadas`,
    };
  }

  let totalTopics = 0;
  let completedTopics = 0;
  for (const subject of subjects) {
    const topics = subject.topics || [];
    totalTopics += topics.length;
    completedTopics += topics.filter((t) => t.done).length;
  }
  for (const exam of exams) {
    const topics = exam.topics || [];
    totalTopics += topics.length;
    completedTopics += topics.filter((t) => t.done).length;
  }

  if (totalTopics > 0) {
    const pct = Math.round((completedTopics / totalTopics) * 100);
    return {
      kind: 'topics',
      label: 'Temas completados',
      value: `${completedTopics} / ${totalTopics}`,
      subtitle: `${pct}% del temario`,
    };
  }

  const sessionsWeek = studyLogs.filter((l) => withinCurrentWeek(l.date)).length;
  const sessionsToday = studyLogs.filter((l) => l.date === today).length;
  return {
    kind: 'sessions',
    label: 'Sesiones esta semana',
    value: `${sessionsWeek} ${sessionsWeek === 1 ? 'sesión' : 'sesiones'}`,
    subtitle:
      sessionsToday > 0
        ? `${sessionsToday} hoy`
        : studyLogs.length > 0
        ? `${studyLogs.length} en el historial`
        : 'Sin sesiones registradas',
  };
}
