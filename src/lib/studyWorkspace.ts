import type { LifeOSState } from '../types';
import { getSortedNotes } from './notesFlows';
import { categorizeExams } from './studyFlows';

/** Uses existing subject IDs for tasks and explicit tags for notes. No inferred ownership. */
export function getStudyWorkspace(state: LifeOSState, subjectId: string | null, today: string) {
  const subject = state.study.subjects.find((entry) => entry.id === subjectId);
  const exams = state.study.exams.filter((entry) => !subjectId || entry.subjectId === subjectId);
  const { upcoming, pendingResults } = categorizeExams(exams, today);
  const tasks = (state.todayExtras || []).filter((task) => !task.done && task.linkedType === 'study'
    && (!subjectId || task.linkedId === subjectId))
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
  const notes = subject ? getSortedNotes(state.notes.postits, { order: 'recent' })
    .filter((note) => note.tags?.some((tag) => tag.trim().toLocaleLowerCase('es') === subject.name.trim().toLocaleLowerCase('es'))) : [];
  return { subject, upcoming, pendingResults, tasks, notes };
}
