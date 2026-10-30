import type { Postit } from '../types';

// Piloto congelado. Cambiar a true para reactivar sus controles y superficie.
export const GYM_NOTE_PLACEMENTS_ENABLED = false;

/** Experimental, device-only layout. Never included in LifeOSState or cloud backups. */
export interface NotePlacement {
  id: string;
  noteId: string;
  category: 'gimnasio';
  x: number; // percentage of the desktop surface
  y: number; // CSS pixels from the surface top
  width: number; // percentage of the desktop surface
  height: number; // CSS pixels
  order: number;
  visible: boolean;
  mobileExpanded: boolean;
}

const VERSION = 1;
const PREFIX = 'celestea-note-placements-v1:';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function placementStorageKey(userId: string | null): string {
  return `${PREFIX}${encodeURIComponent(userId || 'local-guest')}`;
}

function validPlacement(value: unknown): value is NotePlacement {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  const numeric = [p.x, p.y, p.width, p.height, p.order].every((n) => typeof n === 'number' && Number.isFinite(n));
  if (!numeric) return false;
  const x = p.x as number;
  const y = p.y as number;
  const width = p.width as number;
  const height = p.height as number;
  return typeof p.id === 'string' && p.id.length > 0 && typeof p.noteId === 'string' && p.noteId.length > 0
    && p.category === 'gimnasio'
    && x >= 0 && x <= 100 && width >= 24 && width <= 100 && x + width <= 100.001
    && y >= 0 && y <= 10000 && height >= 120 && height <= 900
    && typeof p.visible === 'boolean' && typeof p.mobileExpanded === 'boolean';
}

export function parsePlacements(raw: string | null): NotePlacement[] {
  if (!raw) return [];
  try {
    const envelope = JSON.parse(raw);
    if (envelope?.version !== VERSION || !Array.isArray(envelope.placements)) return [];
    const seen = new Set<string>();
    return envelope.placements.filter((p: unknown) => {
      if (!validPlacement(p) || seen.has(p.noteId)) return false;
      seen.add(p.noteId);
      return true;
    });
  } catch { return []; }
}

export function loadPlacements(userId: string | null): NotePlacement[] {
  try { return parsePlacements(localStorage.getItem(placementStorageKey(userId))); }
  catch { return []; }
}

export function savePlacements(userId: string | null, placements: NotePlacement[]): boolean {
  if (placements.some((p) => !validPlacement(p))) return false;
  if (new Set(placements.map((p) => p.id)).size !== placements.length
    || new Set(placements.map((p) => `${p.category}:${p.noteId}`)).size !== placements.length) return false;
  try {
    const key = placementStorageKey(userId);
    const existing = localStorage.getItem(key);
    if (existing) {
      const envelope = JSON.parse(existing);
      if (envelope?.version !== VERSION || !Array.isArray(envelope.placements)) return false;
    }
    localStorage.setItem(key, JSON.stringify({ version: VERSION, placements }));
    return true;
  } catch { return false; }
}

export function addGymPlacement(placements: NotePlacement[], noteId: string, id: string): NotePlacement[] {
  if (placements.some((p) => p.noteId === noteId && p.category === 'gimnasio')) return placements;
  const order = Math.max(0, ...placements.map((p) => p.order)) + 1;
  for (let y = 0; y <= 9800; y += 196) {
    for (const x of [0, 38]) {
      const candidate: NotePlacement = { id, noteId, category: 'gimnasio', x, y, width: 36, height: 180, order, visible: true, mobileExpanded: false };
      if (fitsPlacement(candidate, placements)) return [...placements, candidate];
    }
  }
  return placements;
}

export function removePlacement(placements: NotePlacement[], noteId: string): NotePlacement[] {
  return placements.filter((p) => p.noteId !== noteId);
}

export function placementsForNotes(placements: NotePlacement[], noteIds: ReadonlySet<string>, archivedIds: ReadonlySet<string>): NotePlacement[] {
  return placements.filter((p) => p.visible && noteIds.has(p.noteId) && !archivedIds.has(p.noteId)).sort((a, b) => a.order - b.order);
}

export function placementNotePreview(note: Postit, privacyMode: boolean): { title: string; text: string; tags: string[] } {
  if (privacyMode) return { title: 'Nota privada', text: '', tags: [] };
  return { title: note.title || 'Sin título', text: note.text, tags: note.tags || [] };
}

export function fitsPlacement(candidate: NotePlacement, others: NotePlacement[]): boolean {
  if (!validPlacement(candidate)) return false;
  return !others.some((p) => p.id !== candidate.id && p.category === candidate.category && p.visible
    && candidate.x < p.x + p.width && candidate.x + candidate.width > p.x
    && candidate.y < p.y + p.height && candidate.y + candidate.height > p.y);
}

export function moveOrResizePlacement(p: NotePlacement, dx: number, dy: number, surfaceWidth: number, mode: 'move' | 'resize', others: NotePlacement[], surfaceHeight = 10000): NotePlacement {
  const pct = surfaceWidth > 0 ? dx / surfaceWidth * 100 : 0;
  const next = mode === 'move'
    ? { ...p, x: clamp(p.x + pct, 0, 100 - p.width), y: clamp(p.y + dy, 0, Math.max(0, Math.min(10000, surfaceHeight) - p.height)) }
    : { ...p, width: clamp(p.width + pct, 24, 100 - p.x), height: clamp(p.height + dy, 120, Math.min(900, Math.max(120, surfaceHeight - p.y))) };
  return fitsPlacement(next, others) ? next : p;
}
