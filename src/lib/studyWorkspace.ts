import type { LifeOSState, Postit } from '../types';
import { getSortedNotes } from './notesFlows';
import { categorizeExams } from './studyFlows';

/** Uses existing subject IDs for tasks and explicit tags for notes. No inferred ownership. */
export function getStudyWorkspace(
  state: LifeOSState,
  subjectId: string | null,
  today: string,
  allowedSubjectIds?: string[]
) {
  const allowedSet = allowedSubjectIds ? new Set(allowedSubjectIds) : null;
  const scopedSubjects = allowedSet
    ? state.study.subjects.filter((entry) => allowedSet.has(entry.id))
    : state.study.subjects;
  const subject = scopedSubjects.find((entry) => entry.id === subjectId)
    || state.study.subjects.find((entry) => entry.id === subjectId);
  const exams = state.study.exams.filter((entry) => {
    if (subjectId) return entry.subjectId === subjectId;
    if (allowedSet) return Boolean(entry.subjectId && allowedSet.has(entry.subjectId));
    return true;
  });
  const { upcoming, pendingResults } = categorizeExams(exams, today);
  const tasks = (state.todayExtras || [])
    .filter(
      (task) =>
        !task.done &&
        task.linkedType === 'study' &&
        (subjectId
          ? task.linkedId === subjectId
          : !allowedSet || (task.linkedId ? allowedSet.has(task.linkedId) : false))
    )
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));

  const sortedRecentNotes = getSortedNotes(state.notes.postits, { order: 'recent' });
  const noteSubjectNames: Record<string, string> = {};
  let notes: Postit[] = [];

  if (subject) {
    const normalizedName = subject.name.trim().toLocaleLowerCase('es');
    notes = sortedRecentNotes.filter((note) =>
      note.tags?.some((tag) => tag.trim().toLocaleLowerCase('es') === normalizedName)
    );
    for (const note of notes) {
      noteSubjectNames[note.id] = subject.name;
    }
  } else {
    const subjectByNormalizedTag = new Map<string, string>();
    for (const entry of scopedSubjects) {
      const normalized = entry.name.trim().toLocaleLowerCase('es');
      if (normalized && !subjectByNormalizedTag.has(normalized)) {
        subjectByNormalizedTag.set(normalized, entry.name);
      }
    }
    if (subjectByNormalizedTag.size > 0) {
      for (const note of sortedRecentNotes) {
        const matchedTag = note.tags?.find((tag) =>
          subjectByNormalizedTag.has(tag.trim().toLocaleLowerCase('es'))
        );
        if (matchedTag) {
          notes.push(note);
          noteSubjectNames[note.id] = subjectByNormalizedTag.get(matchedTag.trim().toLocaleLowerCase('es'))!;
        }
      }
    }
  }

  return { subject, upcoming, pendingResults, tasks, notes, noteSubjectNames };
}
