import type { Exam } from '../types';

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
}): StudyOverviewKind {
  const { subjectCount, examCount, studyLogCount } = data;

  if (subjectCount === 0 && examCount === 0) {
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
  else list = [...exams].sort((a, b) => b.date.localeCompare(a.date));

  return subjectId ? list.filter((exam) => exam.subjectId === subjectId) : list;
}
