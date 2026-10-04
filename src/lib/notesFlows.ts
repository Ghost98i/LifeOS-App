import type { LifeOSState, Postit } from '../types';
import { todayISO, uid } from './storage';

export interface CreateNoteInput {
  text: string;
  title?: string;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
  date?: string;
}

export interface UpdateNoteInput {
  text?: string;
  title?: string;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
}

/**
 * Creates and appends a new note to state.notes.postits
 */
export function addNote(state: LifeOSState, input: CreateNoteInput): Postit {
  const cleanText = (input.text || '').trim();
  const cleanTitle = (input.title || '').trim();

  if (!cleanText && !cleanTitle) {
    throw new Error('La nota no puede estar vacía.');
  }

  if (!state.notes) {
    state.notes = { postits: [], shopping: [], links: [], possessions: [] };
  }
  if (!Array.isArray(state.notes.postits)) {
    state.notes.postits = [];
  }

  const now = new Date().toISOString();
  const newNote: Postit = {
    id: uid(),
    text: cleanText,
    title: cleanTitle || undefined,
    date: input.date || todayISO(),
    pinned: input.pinned ? true : undefined,
    archived: input.archived ? true : undefined,
    tags: Array.isArray(input.tags)
      ? input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)
      : undefined,
    createdAt: now,
    updatedAt: now,
  };

  state.notes.postits.push(newNote);
  return newNote;
}

/**
 * Updates an existing note by ID
 */
export function updateNote(state: LifeOSState, id: string, updates: UpdateNoteInput): Postit {
  const postits = state.notes?.postits || [];
  const note = postits.find((n) => n.id === id);
  if (!note) {
    throw new Error('Nota no encontrada.');
  }

  if (updates.text !== undefined) {
    note.text = updates.text.trim();
  }
  if (updates.title !== undefined) {
    note.title = updates.title.trim() || undefined;
  }
  if (updates.tags !== undefined) {
    note.tags = updates.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  }
  if (updates.pinned !== undefined) {
    note.pinned = updates.pinned ? true : undefined;
  }
  if (updates.archived !== undefined) {
    note.archived = updates.archived ? true : undefined;
  }

  note.updatedAt = new Date().toISOString();
  return note;
}

/**
 * Deletes a note by ID
 */
export function deleteNote(state: LifeOSState, id: string): boolean {
  if (!state.notes?.postits) return false;
  const initialLen = state.notes.postits.length;
  state.notes.postits = state.notes.postits.filter((n) => n.id !== id);
  return state.notes.postits.length < initialLen;
}

/**
 * Toggles the pinned status of a note
 */
export function togglePinNote(state: LifeOSState, id: string): boolean {
  const postits = state.notes?.postits || [];
  const note = postits.find((n) => n.id === id);
  if (!note) throw new Error('Nota no encontrada.');
  note.pinned = note.pinned ? undefined : true;
  note.updatedAt = new Date().toISOString();
  return Boolean(note.pinned);
}

/**
 * Toggles the archived status of a note
 */
export function toggleArchiveNote(state: LifeOSState, id: string): boolean {
  const postits = state.notes?.postits || [];
  const note = postits.find((n) => n.id === id);
  if (!note) throw new Error('Nota no encontrada.');
  note.archived = note.archived ? undefined : true;
  note.updatedAt = new Date().toISOString();
  return Boolean(note.archived);
}

/**
 * Converts a note into an actionable task in todayExtras without deleting or altering the original note.
 */
export function convertNoteToTask(
  state: LifeOSState,
  noteId: string,
  options?: { priority?: 'alta' | 'media' | 'baja'; date?: string } | string
): { taskId: string; taskText: string } {
  const opts = typeof options === 'string' ? { date: options } : options;
  const postits = state.notes?.postits || [];
  const note = postits.find((n) => n.id === noteId);
  if (!note) throw new Error('Nota no encontrada.');

  // Deriva el texto de la tarea: preferir título si existe, o la primera línea significativa del texto
  let taskText = '';
  if (note.title && note.title.trim()) {
    taskText = note.title.trim();
  } else if (note.text && note.text.trim()) {
    const firstLine = note.text.trim().split('\n')[0].trim();
    taskText = firstLine.slice(0, 100);
  }

  if (!taskText) {
    taskText = 'Tarea desde nota';
  }

  if (!Array.isArray(state.todayExtras)) {
    state.todayExtras = [];
  }

  const taskId = uid();
  state.todayExtras.push({
    id: taskId,
    text: taskText,
    date: opts?.date || todayISO(),
    priority: opts?.priority || 'media',
    done: false,
    effort: 'medium',
    linkedType: null,
    linkedId: note.id,
  });

  return { taskId, taskText };
}

/**
 * Filters and sorts notes for display:
 * - Pinned notes first
 * - Then sorted by updatedAt or date descending
 */
export function getSortedNotes(
  notes: Postit[] = [],
  options?: {
    filter?: 'active' | 'archived' | 'all';
    includeArchived?: boolean;
    searchQuery?: string;
  }
): Postit[] {
  const filter = options?.includeArchived
    ? 'all'
    : options?.filter || 'active';
  const query = (options?.searchQuery || '').trim().toLowerCase();

  return [...notes]
    .filter((n) => {
      // Archive filter
      if (filter === 'active' && n.archived) return false;
      if (filter === 'archived' && !n.archived) return false;

      // Query filter
      if (query) {
        const titleMatch = (n.title || '').toLowerCase().includes(query);
        const textMatch = (n.text || '').toLowerCase().includes(query);
        const tagMatch = (n.tags || []).some((t) => t.toLowerCase().includes(query));
        return titleMatch || textMatch || tagMatch;
      }
      return true;
    })
    .sort((a, b) => {
      // 1. Pinned first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // 2. UpdatedAt / Date descending
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.date).getTime();
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.date).getTime();
      return timeB - timeA;
    });
}

/**
 * Formats a timestamp or ISO date into human-readable relative time (es-UY).
 * e.g. "Hace 15 min", "Hace 2 h", "Ayer", "Hace 3 d", "15 mar"
 */
export function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const today = todayISO();
    if (dateString === today) return 'Hoy';
    const [y1, m1, d1] = today.split('-').map(Number);
    const [y2, m2, d2] = dateString.split('-').map(Number);
    const dt1 = new Date(y1, m1 - 1, d1);
    const dt2 = new Date(y2, m2 - 1, d2);
    const diffDays = Math.round((dt1.getTime() - dt2.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Ayer';
    if (diffDays > 1 && diffDays < 7) return `Hace ${diffDays} d`;
    return dt2.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
  }

  const now = new Date();
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHours < 24 && now.getDate() === date.getDate()) return `Hace ${diffHours} h`;
  if (diffDays === 1 || (diffHours < 48 && now.getDate() - date.getDate() === 1)) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} d`;

  return date.toLocaleDateString('es-UY', { day: 'numeric', month: 'short' });
}
