import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Postit } from '../types';
import { showToast } from '../lib/toast';
import {
  loadPlacements, moveOrResizePlacement, placementNotePreview, placementStorageKey, placementsForNotes,
  removePlacement, savePlacements, type NotePlacement,
} from '../lib/notePlacements';

interface Props {
  notes: Postit[];
  storageUserId: string | null;
  privacyMode: boolean;
  onOpenNote: (id: string) => void;
}

type Interaction = { id: string; pointerId: number; mode: 'move' | 'resize'; x: number; y: number; base: NotePlacement; surfaceHeight: number };

export const GymNoteSurface: React.FC<Props> = ({ notes, storageUserId, privacyMode, onOpenNote }) => {
  const [placements, setPlacements] = useState(() => loadPlacements(storageUserId));
  const [placementOwner, setPlacementOwner] = useState(() => placementStorageKey(storageUserId));
  const [organizing, setOrganizing] = useState(false);
  const latest = useRef(placements);
  const interaction = useRef<Interaction | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  const replace = (next: NotePlacement[]) => { latest.current = next; setPlacements(next); };
  useEffect(() => { replace(loadPlacements(storageUserId)); setPlacementOwner(placementStorageKey(storageUserId)); setOrganizing(false); }, [storageUserId]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === placementStorageKey(storageUserId)) replace(loadPlacements(storageUserId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageUserId]);

  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const visible = placementsForNotes(
    placementOwner === placementStorageKey(storageUserId) ? placements : [],
    new Set(notes.map((note) => note.id)),
    new Set(notes.filter((note) => note.archived).map((note) => note.id)),
  );
  if (visible.length === 0) return null;

  const persist = (next: NotePlacement[]) => {
    if (!savePlacements(storageUserId, next)) { showToast('No se pudo guardar la organización local', 'error'); return false; }
    replace(next);
    return true;
  };
  const remove = (noteId: string) => persist(removePlacement(latest.current, noteId));
  const reorder = (id: string, direction: -1 | 1) => {
    const index = visible.findIndex((p) => p.id === id);
    const neighbor = visible[index + direction];
    if (!neighbor) return;
    persist(latest.current.map((p) => p.id === id ? { ...p, order: neighbor.order } : p.id === neighbor.id ? { ...p, order: visible[index].order } : p));
  };
  const toggleExpanded = (id: string) => persist(latest.current.map((p) => p.id === id ? { ...p, mobileExpanded: !p.mobileExpanded } : p));

  const startPointer = (event: React.PointerEvent<HTMLButtonElement>, placement: NotePlacement, mode: 'move' | 'resize') => {
    event.preventDefault();
    interaction.current = { id: placement.id, pointerId: event.pointerId, mode, x: event.clientX, y: event.clientY, base: placement, surfaceHeight: surface.current?.clientHeight || 360 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const others = latest.current.filter((p) => noteById.has(p.noteId));
    const next = moveOrResizePlacement(active.base, event.clientX - active.x, event.clientY - active.y, surface.current?.clientWidth || 0, active.mode, others, active.surfaceHeight);
    replace(latest.current.map((p) => p.id === active.id ? next : p));
  };
  const endPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (interaction.current?.pointerId !== event.pointerId) return;
    interaction.current = null;
    if (!savePlacements(storageUserId, latest.current)) {
      replace(loadPlacements(storageUserId));
      showToast('No se pudo guardar la organización local', 'error');
    }
  };
  const adjustWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, placement: NotePlacement, mode: 'move' | 'resize') => {
    const delta = event.shiftKey ? 32 : 12;
    const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0;
    const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    const others = latest.current.filter((p) => noteById.has(p.noteId));
    const nextPlacement = moveOrResizePlacement(placement, dx, dy, surface.current?.clientWidth || 0, mode, others, surface.current?.clientHeight || 360);
    if (nextPlacement !== placement) persist(latest.current.map((p) => p.id === placement.id ? nextPlacement : p));
  };
  const open = (noteId: string) => { if (!privacyMode) onOpenNote(noteId); };

  const content = (placement: NotePlacement, mobile: boolean) => {
    const note = noteById.get(placement.noteId);
    if (!note) return null;
    const preview = placementNotePreview(note, privacyMode);
    return (
      <div className={mobile ? 'flex flex-col' : 'flex min-h-0 flex-1 flex-col overflow-hidden'}>
        <button type="button" onClick={() => open(note.id)} disabled={privacyMode || (!mobile && organizing)}
          className={`${mobile ? '' : 'min-h-0 flex-1 overflow-auto'} text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5] disabled:cursor-default`}>
          <strong className="block text-sm font-semibold leading-snug text-[var(--text)]">{preview.title}</strong>
          {!!preview.text && <span className={`mt-2 block whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-soft)] ${mobile && !placement.mobileExpanded ? 'line-clamp-3' : ''}`}>{preview.text}</span>}
        </button>
        {!!preview.tags.length && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Etiquetas">
          {preview.tags.map((tag) => <span key={tag} className="rounded-md bg-[#4F46E5]/10 px-1.5 py-0.5 text-xs text-[#4F46E5] dark:text-indigo-300">#{tag}</span>)}
        </div>}
      </div>
    );
  };

  return <section data-gym-notes aria-label="Notas colocadas en Gimnasio" className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold text-[var(--text)]">Mis notas</h2><p className="text-xs text-[var(--text-soft)]">Ubicaciones solo en este dispositivo</p></div>
      <button type="button" onClick={() => setOrganizing((value) => !value)} aria-pressed={organizing}
        className="hidden min-h-10 rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5] md:inline-flex md:items-center">
        {organizing ? 'Terminar organización' : 'Organizar notas'}
      </button>
    </div>
    <div ref={surface} className="relative hidden rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/30 md:block" style={{ height: Math.max(360, ...visible.map((p) => p.y + p.height + 180)) }}>
      {visible.map((p) => <article key={p.id} style={{ left: `${p.x}%`, top: p.y, width: `${p.width}%`, height: p.height }}
        className="absolute flex min-h-0 flex-col overflow-hidden rounded-xl border border-indigo-500/20 bg-[var(--card)] p-3 shadow-sm">
        <div className="flex min-h-0 flex-1 flex-col pb-2">{content(p, false)}</div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-1.5">
          {organizing && <button type="button" aria-label="Mover nota con arrastre o flechas" title="Arrastrar o usar flechas para mover" onPointerDown={(e) => startPointer(e, p, 'move')} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onKeyDown={(e) => adjustWithKeyboard(e, p, 'move')} className="cursor-grab touch-none rounded-md px-2 py-1 text-sm text-[var(--text-soft)] hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5]">⠿</button>}
          <button type="button" onClick={() => remove(p.noteId)} aria-label="Retirar nota de Gimnasio" className="rounded-md px-2 py-1 text-xs text-[var(--text-soft)] hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5]">Retirar</button>
          {organizing && <button type="button" aria-label="Cambiar tamaño con arrastre o flechas" title="Arrastrar o usar flechas para cambiar tamaño" onPointerDown={(e) => startPointer(e, p, 'resize')} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onKeyDown={(e) => adjustWithKeyboard(e, p, 'resize')} className="cursor-nwse-resize touch-none rounded-md px-2 py-1 text-sm text-[var(--text-soft)] hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5]">◢</button>}
        </div>
      </article>)}
    </div>
    <div className="space-y-3 md:hidden">
      {visible.map((p, index) => <article key={p.id} className="rounded-xl border border-indigo-500/20 bg-[var(--surface-muted)] p-3">
        {content(p, true)}
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-[var(--border)] pt-2">
          <button type="button" onClick={() => reorder(p.id, -1)} disabled={index === 0} aria-label="Subir nota" className="min-h-10 min-w-10 rounded-lg text-[var(--text)] disabled:opacity-30">↑</button>
          <button type="button" onClick={() => reorder(p.id, 1)} disabled={index === visible.length - 1} aria-label="Bajar nota" className="min-h-10 min-w-10 rounded-lg text-[var(--text)] disabled:opacity-30">↓</button>
          <button type="button" onClick={() => toggleExpanded(p.id)} className="min-h-10 rounded-lg px-2 text-xs text-[var(--text)]">{p.mobileExpanded ? 'Compactar' : 'Expandir'}</button>
          <button type="button" onClick={() => open(p.noteId)} disabled={privacyMode} className="min-h-10 rounded-lg px-2 text-xs text-[var(--text)] disabled:opacity-40">Editar</button>
          <button type="button" onClick={() => remove(p.noteId)} className="ml-auto min-h-10 rounded-lg px-2 text-xs text-[var(--text-soft)]">Retirar</button>
        </div>
      </article>)}
    </div>
  </section>;
};
