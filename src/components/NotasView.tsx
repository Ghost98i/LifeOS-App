import React, { useMemo, useState } from 'react';
import type { LifeOSState, Goal, Postit } from '../types';
import {
  todayISO,
  fmtDate,
  fmtMoney,
  uid,
  clamp,
} from '../lib/storage';
import {
  streamSessionsInMonth,
  todayStreamStatus,
  goalCurrentValue,
  goalProgressPct,
} from '../lib/calculations';
import {
  addNote,
  updateNote,
  deleteNote,
  togglePinNote,
  toggleArchiveNote,
  convertNoteToTask,
  getSortedNotes,
  formatRelativeTime,
} from '../lib/notesFlows';
import { showToast } from '../lib/toast';
import { ProjectsManager } from './ProjectsManager';
import { AppIcon } from './AppIcon';
import { addGymPlacement, GYM_NOTE_PLACEMENTS_ENABLED, loadPlacements, placementStorageKey, removePlacement, savePlacements } from '../lib/notePlacements';

const TagEditor: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const [input, setInput] = useState('');
  const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
  const add = () => {
    const tag = input.trim().replace(/^#/, '').toLocaleLowerCase('es');
    if (!tag) return;
    if (!tags.some((existing) => existing.toLocaleLowerCase('es') === tag)) onChange([...tags, tag].join(', '));
    setInput('');
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-2.5 focus-within:border-[var(--blue)]">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 text-sm text-[var(--text)]">
          #{tag}
          <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag).join(', '))} aria-label={`Quitar etiqueta ${tag}`} className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-soft)] hover:bg-[var(--card)] hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)] cursor-pointer">×</button>
        </span>
      ))}
      <input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); }
      }} placeholder="Agregar etiqueta…" aria-label="Agregar etiqueta" className="min-h-10 min-w-32 flex-1 bg-transparent px-1 text-sm text-[var(--text)] outline-none" />
      <button type="button" onClick={add} disabled={!input.trim()} className="min-h-10 rounded-lg border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-soft)] hover:bg-[var(--card)] disabled:opacity-40 cursor-pointer">Agregar</button>
    </div>
  );
};

interface NotasViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean;
  initialNoteId?: string | null;
  initialTab?: 'notas' | 'proyectos' | 'streaming' | null;
  initialFocusId?: string | null;
  focusNonce?: number;
  storageUserId: string | null;
  onOpenGym: () => void;
}

export const NotasView: React.FC<NotasViewProps> = ({
  state,
  onUpdateState,
  initialNoteId,
  initialTab,
  initialFocusId,
  focusNonce,
  storageUserId,
  onOpenGym,
}) => {
  const initialNote = initialNoteId ? (state.notes?.postits || []).find((note) => note.id === initialNoteId) || null : null;
  type NotesSection = 'notas' | 'herramientas' | 'proyectos' | 'streaming' | 'cosas' | 'compras' | 'links';
  const [activeTab, setActiveTab] = useState<NotesSection>(initialTab || 'notas');
  const [toolMessage, setToolMessage] = useState('');
  const [projectView, setProjectView] = useState<'projects' | 'goals'>('projects');
  const [openNoteMenuId, setOpenNoteMenuId] = useState<string | null>(null);
  const [placements, setPlacements] = useState(() => loadPlacements(storageUserId));
  const [placementOwner, setPlacementOwner] = useState(() => placementStorageKey(storageUserId));
  const currentPlacements = placementOwner === placementStorageKey(storageUserId) ? placements : [];
  React.useEffect(() => { setPlacements(loadPlacements(storageUserId)); setPlacementOwner(placementStorageKey(storageUserId)); }, [storageUserId]);
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === placementStorageKey(storageUserId)) setPlacements(loadPlacements(storageUserId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageUserId]);

  React.useEffect(() => {
    if (!openNoteMenuId) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-note-menu]')) setOpenNoteMenuId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenNoteMenuId(null);
        document.getElementById(`note-menu-trigger-${openNoteMenuId}`)?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openNoteMenuId]);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      if (initialTab === 'proyectos') setProjectView('projects');
    }
  }, [initialTab, focusNonce]);
  const [streamDate, setStreamDate] = useState(todayISO());
  const [streamHours, setStreamHours] = useState('');
  const [checklistLabel, setChecklistLabel] = useState('');
  const [contentTitle, setContentTitle] = useState('');

  const [goalName, setGoalName] = useState('');
  const [goalInitial, setGoalInitial] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalLinked, setGoalLinked] = useState<'weight' | 'available' | null>(null);

  const [postitText, setPostitText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [notePinned, setNotePinned] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const [noteOrder, setNoteOrder] = useState<'pinned' | 'recent'>('recent');
  const [noteError, setNoteError] = useState('');
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [noteFilter, setNoteFilter] = useState<'activas' | 'fijadas' | 'archivadas'>('activas');
  const [noteWindow, setNoteWindow] = useState({ query: '', filter: 'activas', order: 'recent', count: 50 });
  React.useEffect(() => {
    setNoteWindow(previous => previous.query === noteSearch && previous.filter === noteFilter && previous.order === noteOrder
      ? previous : { query: noteSearch, filter: noteFilter, order: noteOrder, count: 50 });
  }, [noteSearch, noteFilter, noteOrder]);

  // Edit note modal state
  const [editingNote, setEditingNote] = useState<Postit | null>(initialNote);
  const [editTitle, setEditTitle] = useState(initialNote?.title || '');
  const [editText, setEditText] = useState(initialNote?.text || '');
  const [editTags, setEditTags] = useState(initialNote?.tags?.join(', ') || '');
  const [editPinned, setEditPinned] = useState(Boolean(initialNote?.pinned));
  const [editArchived, setEditArchived] = useState(Boolean(initialNote?.archived));

  const [shopItem, setShopItem] = useState('');

  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [possessionName, setPossessionName] = useState('');
  const [possessionCategory, setPossessionCategory] = useState('Regalo');
  const [possessionLocation, setPossessionLocation] = useState('');
  const [possessionDate, setPossessionDate] = useState(todayISO());
  const [possessionNote, setPossessionNote] = useState('');
  const [possessionSearch, setPossessionSearch] = useState('');

  const status = todayStreamStatus(state);
  const streamGoal = Number(state.streaming?.monthlyGoal || 0);
  const streamCount = streamSessionsInMonth(state, 0).length;
  const streamPct = streamGoal > 0 ? clamp((streamCount / streamGoal) * 100, 0, 100) : 0;
  const pipelineStages = [
    { id: 'idea', label: 'Idea' },
    { id: 'outline', label: 'Guión' },
    { id: 'recording', label: 'Grabación' },
    { id: 'editing', label: 'Edición' },
    { id: 'published', label: 'Publicado' },
  ] as const;

  const pendingShopCount = (state.notes?.shopping || []).filter((s) => !s.done).length;

  const saveToolChange = (updater: (draft: LifeOSState) => void) => {
    try {
      if (onUpdateState(updater)) { setToolMessage('Guardado.'); return true; }
    } catch { /* Keep the form available after a persistence failure. */ }
    setToolMessage('No se pudo guardar. Conservá el formulario y volvé a intentarlo.');
    return false;
  };

  const handleAddStream = (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Number(streamHours);
    if (!hours) return;
    const saved = saveToolChange((draft) => {
      const date = streamDate || todayISO();
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
      if (!draft.streaming.sessions) draft.streaming.sessions = [];
      draft.streaming.sessions = draft.streaming.sessions.filter((s) => s.date !== date);
      draft.streaming.sessions.push({ id: uid(), date, hours });
    });
    if (!saved) return;
    setStreamHours('');
  };

  const handleAddChecklistItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!checklistLabel.trim()) return;
    const saved = saveToolChange((draft) => {
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
      if (!draft.streaming.preStreamChecklist) draft.streaming.preStreamChecklist = [];
      draft.streaming.preStreamChecklist.push({ id: uid(), label: checklistLabel.trim(), done: false });
    });
    if (!saved) return;
    setChecklistLabel('');
  };

  const handleAddContent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!contentTitle.trim()) return;
    const saved = saveToolChange((draft) => {
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
      if (!draft.streaming.contentPipeline) draft.streaming.contentPipeline = [];
      draft.streaming.contentPipeline.push({ id: uid(), title: contentTitle.trim(), status: 'idea', note: '', updatedAt: new Date().toISOString() });
    });
    if (!saved) return;
    setContentTitle('');
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) return;
    const initial = Number(goalInitial) || 0;
    const target = Number(goalTarget) || 0;
    const saved = saveToolChange((draft) => {
      if (!draft.goals) draft.goals = [];
      draft.goals.push({
        id: uid(),
        name: goalName.trim(),
        initial,
        target,
        current: initial,
        linked: goalLinked,
      });
    });
    if (!saved) return;
    setGoalName('');
    setGoalInitial('');
    setGoalTarget('');
  };

  const handleUpdateGoal = (g: Goal) => {
    const val = prompt(`Nuevo valor actual para "${g.name}":`, String(g.current));
    if (val === null) return;
    const num = Number(val);
    saveToolChange((draft) => {
      if (!draft.goals) draft.goals = [];
      const targetGoal = draft.goals.find((x) => x.id === g.id);
      if (targetGoal) targetGoal.current = !isNaN(num) ? num : targetGoal.current;
    });
  };

  const handleDeleteGoal = (id: string) => {
    saveToolChange((draft) => {
      if (!draft.goals) draft.goals = [];
      draft.goals = draft.goals.filter((g) => g.id !== id);
    });
  };

  const saveNoteChange = (updater: (draft: LifeOSState) => void) => {
    setNoteError('');
    try {
      if (onUpdateState(updater)) return true;
      setNoteError('No se pudo guardar. El contenido sigue acá para que puedas reintentar.');
    } catch (error) { setNoteError(error instanceof Error ? error.message : 'No se pudo guardar la nota.'); }
    return false;
  };
  const closeEditor = () => {
    if (editingNote && (editTitle !== (editingNote.title || '') || editText !== editingNote.text
      || editTags !== (editingNote.tags?.join(', ') || '') || editPinned !== Boolean(editingNote.pinned)
      || editArchived !== Boolean(editingNote.archived))
      && !window.confirm('Hay cambios sin guardar. ¿Descartarlos y cerrar?')) return;
    setEditingNote(null); setNoteError('');
  };
  React.useEffect(() => {
    if (!editingNote) return;
    const previous = document.activeElement as HTMLElement | null;
    editorRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    return () => previous?.focus();
  }, [editingNote]);
  React.useEffect(() => {
    const pending = Boolean((showAddForm && (noteContent || noteTitle)) || (editingNote &&
      (editText !== editingNote.text || editTitle !== (editingNote.title || '') || editTags !== (editingNote.tags?.join(', ') || '')
       || editPinned !== Boolean(editingNote.pinned) || editArchived !== Boolean(editingNote.archived))));
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [showAddForm, noteContent, noteTitle, editingNote, editText, editTitle, editTags, editPinned, editArchived]);

  const handleAddPostit = (e: React.FormEvent) => {
    e.preventDefault();
    const content = noteContent.trim() || postitText.trim();
    if (!content) return;
    const rawTags = noteTags.split(',').map((t) => t.trim()).filter(Boolean);
    const saved = saveNoteChange((draft) => {
      addNote(draft, {
        title: noteTitle.trim() || undefined,
        text: content,
        tags: rawTags.length > 0 ? rawTags : undefined,
        pinned: notePinned,
      });
    });
    if (!saved) return;
    setPostitText('');
    setNoteTitle('');
    setNoteContent('');
    setNoteTags('');
    setNotePinned(false);
    setShowAddForm(false);
    showToast('Nota guardada', 'success');
  };

  const handleStartEdit = (note: Postit) => {
    setNoteError('');
    setEditingNote(structuredClone(note));
    setEditTitle(note.title || '');
    setEditText(note.text);
    setEditTags(note.tags ? note.tags.join(', ') : '');
    setEditPinned(Boolean(note.pinned));
    setEditArchived(Boolean(note.archived));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote || !editText.trim()) return;
    const rawTags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
    const saved = saveNoteChange((draft) => {
      updateNote(draft, editingNote.id, {
        title: editTitle.trim(),
        text: editText.trim(),
        tags: rawTags,
        pinned: editPinned,
        archived: editArchived,
      }, editingNote);
    });
    if (!saved) return;
    setEditingNote(null);
    showToast('Nota actualizada', 'success');
  };

  const handleTogglePin = (id: string, currentlyPinned: boolean) => {
    const saved = saveNoteChange((draft) => {
      togglePinNote(draft, id);
    });
    if (!saved) return;
    showToast(currentlyPinned ? 'Nota desfijada' : 'Nota fijada arriba', 'info');
  };

  const handleToggleArchive = (id: string, currentlyArchived: boolean) => {
    const saved = saveNoteChange((draft) => {
      toggleArchiveNote(draft, id);
    });
    if (!saved) return;
    showToast(currentlyArchived ? 'Nota restaurada a activas' : 'Nota archivada', 'info');
  };

  const handleConvertToTask = (id: string) => {
    const saved = saveNoteChange((draft) => {
      convertNoteToTask(draft, id, todayISO());
    });
    if (!saved) return;
    showToast('Nota convertida en tarea para Hoy', 'success');
  };

  const handleDeletePostit = (id: string) => {
    const note = state.notes?.postits.find((item) => item.id === id);
    const placed = currentPlacements.some((p) => p.noteId === id);
    if ((note?.pinned || placed) && !window.confirm(placed
      ? `Eliminar esta nota${note?.pinned ? ' fijada' : ''} también retirará su colocación local en Gimnasio. ¿Continuar?`
      : 'Esta nota está fijada. ¿Querés eliminarla definitivamente?')) return;
    const saved = saveNoteChange((draft) => {
      deleteNote(draft, id);
    });
    if (!saved) return;
    if (placed) {
      const next = removePlacement(currentPlacements, id);
      if (!savePlacements(storageUserId, next)) { showToast('No se pudo actualizar la ubicación local', 'error'); return; }
      setPlacements(next);
    }
    setOpenNoteMenuId(null);
    showToast('Nota eliminada', 'info');
  };

  const handlePlaceInGym = (noteId: string) => {
    const next = addGymPlacement(currentPlacements, noteId, uid());
    if (next === currentPlacements) { showToast('No hay espacio disponible para otra nota en Gimnasio', 'error'); return; }
    if (!savePlacements(storageUserId, next)) { showToast('No se pudo guardar la ubicación local', 'error'); return; }
    setPlacements(next);
    setOpenNoteMenuId(null);
    showToast('Nota colocada en Gimnasio solo en este dispositivo', 'success');
  };

  const handleRemoveFromGym = (noteId: string) => {
    const next = removePlacement(currentPlacements, noteId);
    if (!savePlacements(storageUserId, next)) { showToast('No se pudo actualizar la ubicación local', 'error'); return; }
    setPlacements(next);
    setOpenNoteMenuId(null);
  };

  const handleAddShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopItem.trim()) return;
    const saved = saveToolChange((draft) => {
      if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
      if (!draft.notes.shopping) draft.notes.shopping = [];
      draft.notes.shopping.push({
        id: uid(),
        text: shopItem.trim(),
        done: false,
      });
    });
    if (!saved) return;
    setShopItem('');
  };

  const handleToggleShop = (id: string) => {
    saveToolChange((draft) => {
      if (!draft.notes?.shopping) return;
      const item = draft.notes.shopping.find((s) => s.id === id);
      if (item) item.done = !item.done;
    });
  };

  const handleDeleteShop = (id: string) => {
    saveToolChange((draft) => {
      if (!draft.notes?.shopping) return;
      draft.notes.shopping = draft.notes.shopping.filter((s) => s.id !== id);
    });
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkName.trim() || !linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    const saved = saveToolChange((draft) => {
      if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
      if (!draft.notes.links) draft.notes.links = [];
      draft.notes.links.push({
        id: uid(),
        name: linkName.trim(),
        url,
      });
    });
    if (!saved) return;
    setLinkName('');
    setLinkUrl('');
  };

  const handleDeleteLink = (id: string) => {
    saveToolChange((draft) => {
      if (!draft.notes?.links) return;
      draft.notes.links = draft.notes.links.filter((l) => l.id !== id);
    });
  };

  const handleAddPossession = (event: React.FormEvent) => {
    event.preventDefault();
    if (!possessionName.trim()) return;
    const saved = saveToolChange((draft) => {
      if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
      if (!draft.notes.possessions) draft.notes.possessions = [];
      draft.notes.possessions.push({
        id: uid(), name: possessionName.trim(), category: possessionCategory.trim() || 'Otros',
        location: possessionLocation.trim(), receivedAt: possessionDate || null, note: possessionNote.trim(),
      });
    });
    if (!saved) return;
    setPossessionName('');
    setPossessionLocation('');
    setPossessionNote('');
  };

  const possessionQuery = possessionSearch.trim().toLocaleLowerCase('es');
  const visiblePossessions = (state.notes?.possessions || []).filter((item) => !possessionQuery || [item.name, item.category, item.location, item.note].some((value) => String(value || '').toLocaleLowerCase('es').includes(possessionQuery)));

  const allNotes = useMemo(() => state.notes?.postits || [], [state.notes?.postits]);
  const totalActiveNotes = allNotes.filter((n) => !n.archived).length;
  const totalPinnedNotes = allNotes.filter((n) => !n.archived && n.pinned).length;
  const totalArchivedNotes = allNotes.filter((n) => n.archived).length;

  const displayedNotes = useMemo(() => getSortedNotes(allNotes, {
    filter: noteFilter === 'archivadas' ? 'archived' : 'active', searchQuery: noteSearch, order: noteOrder,
  }).filter((note) => noteFilter !== 'fijadas' || note.pinned), [allNotes, noteFilter, noteSearch, noteOrder]);
  const visibleNoteCount = noteWindow.query === noteSearch && noteWindow.filter === noteFilter && noteWindow.order === noteOrder ? noteWindow.count : 50;
  const renderedNotes = displayedNotes.slice(0, visibleNoteCount);
  const expandNotes = (count: number) => setNoteWindow({ query: noteSearch, filter: noteFilter, order: noteOrder, count });
  const navigationNotes = React.useRef({ notes: allNotes, order: noteOrder });
  navigationNotes.current = { notes: allNotes, order: noteOrder };
  const pendingNoteFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!initialFocusId?.startsWith('note-')) return;
    const { notes, order } = navigationNotes.current;
    const note = notes.find(note => `note-${note.id}` === initialFocusId);
    if (!note) return;
    // An explicit search result must remain reachable even outside the first batch.
    // This changes only presentation, never the note or an open editor's draft.
    setActiveTab('notas'); setNoteSearch('');
    const filter = note.archived ? 'archivadas' : 'activas';
    setNoteFilter(filter);
    setNoteWindow({ query: '', filter, order, count: notes.length });
    pendingNoteFocus.current = initialFocusId;
  }, [initialFocusId, focusNonce]);
  React.useEffect(() => {
    const target = pendingNoteFocus.current && document.getElementById(pendingNoteFocus.current);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    target.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    pendingNoteFocus.current = null;
  }, [renderedNotes.length, initialFocusId, focusNonce]);
  const inTools = activeTab !== 'notas';


  return (
    <div className="notes-refinement space-y-5">
      {noteError && !editingNote && <p role="alert" className="text-sm text-rose-600">{noteError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Notas y herramientas</h1>
          {activeTab === 'notas' && <p className="mt-0.5 text-sm text-[var(--text-soft)]">{totalActiveNotes} {totalActiveNotes === 1 ? 'nota activa' : 'notas activas'}</p>}
        </div>
        <div className="flex items-center">
          {activeTab === 'notas' && <button type="button" onClick={() => setShowAddForm(!showAddForm)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#4F46E5] px-3.5 text-sm font-semibold text-white hover:bg-[#4338CA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] cursor-pointer"><AppIcon name="plus" className="h-4 w-4" />{showAddForm ? 'Cerrar' : 'Nueva nota'}</button>}
        </div>
      </div>

      <nav aria-label="Secciones de Notas" className="flex gap-1 border-b border-[var(--border)]">
        <button type="button" onClick={() => setActiveTab('notas')} aria-current={!inTools ? 'page' : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)] cursor-pointer ${!inTools ? 'border-[#4F46E5] text-[var(--text)]' : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text)]'}`}>Mis notas</button>
        <button type="button" onClick={() => setActiveTab('proyectos')} aria-current={inTools ? 'page' : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)] cursor-pointer ${inTools ? 'border-[#4F46E5] text-[var(--text)]' : 'border-transparent text-[var(--text-soft)] hover:text-[var(--text)]'}`}>Herramientas<span className="hidden sm:inline font-normal ml-2 text-[var(--text-soft)]">Proyectos, listas y enlaces</span></button>
      </nav>

      {inTools && toolMessage && <p role="status" className="text-sm text-[var(--text)]">{toolMessage}</p>}
      {inTools && <nav aria-label="Herramientas personales" className="flex flex-wrap gap-2">
        {([['proyectos', 'Proyectos y objetivos'], ['streaming', 'Streaming y contenido'], ['cosas', 'Objetos y regalos'], ['compras', 'Lista de compras'], ['links', 'Enlaces']] as const).map(([section, label]) =>
          <button key={section} type="button" aria-current={activeTab === section ? 'page' : undefined} onClick={() => setActiveTab(section)} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${activeTab === section ? 'border-[var(--blue)] text-[var(--blue)]' : 'border-[var(--border)] text-[var(--text-soft)]'}`}>{label}</button>)}
      </nav>}

      {/* Tab: Proyectos & Metas */}
      {activeTab === 'proyectos' && (
        <div className="space-y-8">
          <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3" role="group" aria-label="Tipo de seguimiento">
            <button type="button" aria-pressed={projectView === 'projects'} onClick={() => setProjectView('projects')} className="min-h-11 rounded-xl border border-[var(--border)] px-3 text-sm">Proyectos · tareas y próximo paso</button>
            <button type="button" aria-pressed={projectView === 'goals'} onClick={() => setProjectView('goals')} className="min-h-11 rounded-xl border border-[var(--border)] px-3 text-sm">Objetivos · avance numérico</button>
          </div>
          <div hidden={projectView !== 'projects'}><ProjectsManager state={state} onUpdateState={saveToolChange} initialFocusId={projectView === 'projects' ? initialFocusId : null} focusNonce={focusNonce} /></div>

          {/* Quantitative Goals */}
          <div hidden={projectView !== 'goals'} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text)]">Objetivos con progreso</h2>
                <p className="text-xs text-[var(--text-faint)]">Un valor actual y una meta. Actualizalos manualmente o vinculalos a tus registros.</p>
              </div>
            </div>

        <form onSubmit={handleAddGoal} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Nombre</label>
            <input
              type="text"
              aria-label="Nombre del objetivo" value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="Ej.: Leer 8 capítulos"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Valor inicial</label>
            <input
              type="number"
              aria-label="Valor inicial" value={goalInitial}
              onChange={(e) => setGoalInitial(e.target.value)}
              placeholder="0"
              className="w-24 px-2.5 py-1.5 text-xs tabular-nums rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Meta</label>
            <input
              type="number"
              aria-label="Meta" value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="8"
              className="w-24 px-2.5 py-1.5 text-xs tabular-nums rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Actualizar desde</label>
            <select
              aria-label="Origen del avance" value={goalLinked || ''}
              onChange={(e) => setGoalLinked((e.target.value as any) || null)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            >
              <option value="">Manual</option>
              <option value="weight">Peso corporal (kg)</option>
              <option value="available">Dinero disponible ($)</option>
              <option value="net_worth">Patrimonio neto ($)</option>
              <option value="gym_sessions">Sesiones de gimnasio</option>
              <option value="study_hours">Horas de estudio</option>
              <option value="resale_profit">Ganancia de reventa ($)</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer"
          >
            ＋ Crear objetivo
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(state.goals || []).length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)] col-span-full">
              Todavía no creaste objetivos.
            </p>
          ) : (
            (state.goals || []).map((g) => {
              const cur = goalCurrentValue(state, g);
              const pct = goalProgressPct(g, cur);
              const isFinancial = g.linked === 'available' || g.linked === 'net_worth' || g.linked === 'resale_profit';

              const fmtVal = (val: number) => {
                if (!Number.isFinite(val)) return 'No comparable';
                if (isFinancial) return fmtMoney(val);
                if (g.linked === 'study_hours') return `${Number(val).toFixed(1)}h`;
                if (g.linked === 'weight') return `${Number(val).toFixed(1)} kg`;
                if (g.linked === 'gym_sessions') return `${Math.round(val)}`;
                return Number(val).toFixed(1);
              };

              const getBadge = () => {
                switch (g.linked) {
                  case 'weight': return '⚖️ Peso';
                  case 'available': return '💰 Disponible';
                  case 'net_worth': return '💎 Patrimonio';
                  case 'gym_sessions': return '🏋️ Gimnasio';
                  case 'study_hours': return '📚 Estudio';
                  case 'resale_profit': return '🔁 Reventa';
                  default: return '✋ Manual';
                }
              };

              return (
                <div key={g.id} className={`bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 relative overflow-hidden space-y-3 ${isFinancial ? 'privacy-sensitive' : ''}`}>
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-500" />
                  <div className="flex items-start justify-between">
                    <span className="font-bold text-sm text-[var(--text)]">{g.name}</span>
                    <button
                      aria-label={`Eliminar objetivo ${g.name}`} onClick={() => handleDeleteGoal(g.id)}
                      className="text-xs text-[var(--text-faint)] hover:text-red-500 px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="tabular-nums text-2xl font-extrabold text-[var(--text)]">
                    {fmtVal(cur)}
                    <span className="text-xs font-normal text-[var(--text-faint)] ml-1">
                      / {fmtVal(g.target)}
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-[var(--bg)] overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      {getBadge()}
                    </span>
                    {!g.linked && (
                      <button
                        onClick={() => handleUpdateGoal(g)}
                        className="text-xs text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] px-2 py-0.5 rounded-md cursor-pointer"
                      >
                        Actualizar
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  )}

  {/* Tab: Notas & Personal */}
  {activeTab === 'notas' && (
    <div className="space-y-4">
      {/* Post-its / Notas Grid */}
      <div className="space-y-4">

        {/* Quick Add / Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddPostit}
            className="p-4 sm:p-5 bg-[var(--surface-muted)]/45 border border-[var(--border)] rounded-2xl space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--text)]">Nueva nota</span>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notePinned}
                  onChange={(e) => setNotePinned(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                <span>📌 Fijar arriba</span>
              </label>
            </div>

            <input
              type="text"
              aria-label="Título de la nueva nota"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Título (opcional)..."
              className="w-full px-3 py-2.5 text-sm font-semibold rounded-xl bg-[var(--card)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)]"
            />

            <textarea
              aria-label="Contenido de la nueva nota"
              autoFocus
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Escribí el contenido de la nota..."
              rows={3}
              className="w-full px-3 py-3 text-sm leading-6 rounded-xl bg-[var(--card)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)] resize-y"
              required
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="w-full sm:flex-1"><TagEditor value={noteTags} onChange={setNoteTags} /></div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text)] rounded-xl border border-[var(--border)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!noteContent.trim()}
                  className="px-4 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-xl hover:opacity-90 disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  Guardar nota
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]">
              <AppIcon name="search" className="h-3.5 w-3.5" />
            </span>
            <input
              type="text"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              aria-label="Buscar notas"
              placeholder="Buscar por título, texto o etiqueta"
              className="w-full pl-8 pr-8 py-2.5 text-sm rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--blue)] outline-none transition"
            />
            {noteSearch && (
              <button
                type="button"
                onClick={() => setNoteSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-faint)] hover:text-[var(--text)] p-0.5"
                title="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border)] text-xs font-bold">
            <button
              type="button"
              onClick={() => setNoteFilter('activas')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                noteFilter === 'activas'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs'
                  : 'text-[var(--text-faint)] hover:text-[var(--text)]'
              }`}
            >
              Activas ({totalActiveNotes})
            </button>
            <button
              type="button"
              onClick={() => setNoteFilter('fijadas')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                noteFilter === 'fijadas'
                  ? 'bg-[var(--card)] text-amber-600 dark:text-amber-400 shadow-2xs'
                  : 'text-[var(--text-faint)] hover:text-[var(--text)]'
              }`}
            >
              📌 Fijadas ({totalPinnedNotes})
            </button>
            <button
              type="button"
              onClick={() => setNoteFilter('archivadas')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                noteFilter === 'archivadas'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs'
                  : 'text-[var(--text-faint)] hover:text-[var(--text)]'
              }`}
            >
              Archivadas ({totalArchivedNotes})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-soft)]">
          <span role="status">{displayedNotes.length} {displayedNotes.length === 1 ? 'nota' : 'notas'}{noteSearch ? ' encontradas' : ''}</span>
          <label className="flex items-center gap-2">Ordenar
            <select aria-label="Ordenar notas" value={noteOrder} onChange={(event) => setNoteOrder(event.target.value as 'recent' | 'pinned')} className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-[var(--text)]">
              <option value="recent">Más recientes</option><option value="pinned">Fijadas primero</option>
            </select>
          </label>
        </div>
        {/* Notes Grid */}
        <div id="notes-grid" className="grid grid-cols-1 items-start md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {displayedNotes.length === 0 ? (
            <div className="py-12 text-center col-span-full bg-[var(--surface-muted)]/40 rounded-2xl border border-dashed border-[var(--border)] p-6">
              <p className="text-xs text-[var(--text-faint)] font-medium">
                {noteSearch.trim()
                  ? `No se encontraron notas para "${noteSearch}".`
                  : noteFilter === 'fijadas'
                  ? 'No tenés notas fijadas. Fijá una nota importante para verla arriba.'
                  : noteFilter === 'archivadas'
                  ? 'No hay notas archivadas.'
                  : 'No tenés notas guardadas. ¡Creá una nota para comenzar!'}
              </p>
              {!showAddForm && !noteSearch.trim() && noteFilter === 'activas' && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition cursor-pointer"
                >
                  <AppIcon name="plus" className="h-3.5 w-3.5" />
                  <span>Crear primera nota</span>
                </button>
              )}
            </div>
          ) : (
            renderedNotes.map((p) => {
              const relative = formatRelativeTime(p.updatedAt || p.date);
              const isPinned = Boolean(p.pinned);
              const isArchived = Boolean(p.archived);

              return (
                <div
                  key={p.id}
                  id={`note-${p.id}`}
                  className={`relative p-4 sm:p-5 rounded-2xl border flex flex-col gap-3 transition-[border-color,box-shadow] shadow-[0_8px_24px_-20px_rgba(17,24,39,0.35)] dark:shadow-[0_8px_24px_-20px_rgba(0,0,0,0.75)] ${openNoteMenuId === p.id ? 'z-20' : ''} ${
                    isPinned
                      ? 'bg-[#4F46E5]/[0.075] dark:bg-[#4F46E5]/[0.16] border-[#4F46E5]/30 dark:border-[#8B84FF]/40 hover:border-[#4F46E5]/55'
                      : isArchived
                      ? 'bg-[var(--surface-muted)]/45 border-[var(--border)]'
                      : 'bg-[var(--card)] border-[var(--border)] hover:border-[#4F46E5]/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      {isPinned && <AppIcon name="pin" aria-label="Nota fijada" className="mt-0.5 h-4 w-4 shrink-0 text-[#4F46E5] dark:text-[#A5A0FF]" />}
                      {p.title && <button type="button" onClick={() => handleStartEdit(p)} className="min-w-0 flex-1 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]" aria-label={`Abrir nota ${p.title}`}><h3 className="font-semibold text-base leading-snug tracking-[-0.01em] text-[var(--text)] break-words">{p.title}</h3></button>}
                    </div>
                    <div className="relative shrink-0" data-note-menu onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setOpenNoteMenuId(null);
                    }}>
                      <button id={`note-menu-trigger-${p.id}`} type="button" onClick={() => setOpenNoteMenuId(openNoteMenuId === p.id ? null : p.id)} aria-label={`Acciones de la nota ${p.title || p.text.slice(0, 45)}`} aria-haspopup="menu" aria-expanded={openNoteMenuId === p.id} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)] cursor-pointer"><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
                      {openNoteMenuId === p.id && (
                        <div role="menu" aria-label="Acciones de nota" onKeyDown={(event) => {
                          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                          event.preventDefault();
                          const items = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
                          const current = items.indexOf(document.activeElement as HTMLButtonElement);
                          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
                          items[next]?.focus();
                        }} className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1.5 shadow-lg">
                          <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleStartEdit(p); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer">Editar</button>
                          <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleTogglePin(p.id, isPinned); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer">{isPinned ? 'Desfijar' : 'Fijar'}</button>
                          <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleConvertToTask(p.id); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer">Convertir a tarea</button>
                          {GYM_NOTE_PLACEMENTS_ENABLED && (currentPlacements.some((placement) => placement.noteId === p.id) ? (
                            <>
                              <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); onOpenGym(); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer">Ver en Gimnasio</button>
                              <button role="menuitem" type="button" onClick={() => handleRemoveFromGym(p.id)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer">Retirar de Gimnasio</button>
                            </>
                          ) : <button role="menuitem" type="button" onClick={() => handlePlaceInGym(p.id)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer">Colocar en… Gimnasio</button>)}
                          <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleToggleArchive(p.id, isArchived); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-muted)] cursor-pointer">{isArchived ? 'Restaurar' : 'Archivar'}</button>
                          <button role="menuitem" type="button" onClick={() => handleDeletePostit(p.id)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-[var(--surface-muted)] cursor-pointer">Eliminar</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <button type="button" onClick={() => handleStartEdit(p)} className="min-w-0 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]" aria-label={`Abrir contenido de la nota ${p.title || p.text.slice(0, 45)}`}>
                    <span className="line-clamp-5 text-[var(--text)] text-sm leading-6 whitespace-pre-wrap break-words">{p.text}</span>
                  </button>

                  {/* Footer: Tags and Relative Date */}
                  <div className="pt-3 border-t border-[var(--border)]/60 flex flex-wrap items-end justify-between gap-2 text-xs">
                    {p.tags && p.tags.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {p.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setNoteSearch(tag)}
                            className="min-h-8 px-2 rounded-lg font-medium bg-[var(--surface-muted)] hover:bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] transition cursor-pointer"
                            title={`Filtrar por #${tag}`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-center gap-1.5 tabular-nums text-[var(--text-faint)] shrink-0 ml-auto">
                      {isPinned && <span className="font-medium text-[#4F46E5] dark:text-[#A5A0FF]">Fijada ·</span>}
                      {isArchived && (
                        <span className="px-2 py-1 rounded bg-[var(--surface-muted)] text-[11px] font-sans font-semibold">
                          Archivada
                        </span>
                      )}
                      <span className="text-xs" title={p.updatedAt ? `Modificada: ${p.updatedAt}` : `Creada: ${p.date}`}>
                        {relative}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {renderedNotes.length < displayedNotes.length && <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <span role="status" className="text-sm text-[var(--text-soft)]">Mostrando {renderedNotes.length} de {displayedNotes.length} notas</span>
          <button type="button" aria-controls="notes-grid" onClick={() => expandNotes(visibleNoteCount + 50)} className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 text-sm font-semibold text-[var(--text)]">Cargar 50 más</button>
          <button type="button" aria-controls="notes-grid" onClick={() => expandNotes(displayedNotes.length)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[var(--text-soft)] underline">Ver todas</button>
        </div>}
      </div>

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div ref={editorRef} role="dialog" aria-modal="true" aria-labelledby="note-editor-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.stopPropagation(); closeEditor(); }
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); editorRef.current?.querySelector('form')?.requestSubmit(); }
              if (event.key === 'Tab') {
                const controls = Array.from(editorRef.current?.querySelectorAll('button:not(:disabled), input, textarea, select') || []) as HTMLElement[];
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
              }
            }} className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="note-editor-title" className="text-base font-semibold text-[var(--text)]">Editar nota</h3>
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Cerrar editor de nota"
                className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              {noteError && <p role="alert" className="text-sm text-rose-600">{noteError}</p>}
              <p className="text-xs text-[var(--text-soft)]">Guardado manual · Ctrl+Enter para guardar</p>
              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                  Título (opcional)
                </label>
                <input
                  type="text"
                  aria-label="Título de la nota"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Título de la nota..."
                  className="w-full px-3 py-2.5 text-sm font-semibold rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                  Contenido
                </label>
                <textarea
                  aria-label="Contenido de la nota"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-3 text-sm leading-6 rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)] resize-y"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-soft)] block mb-1.5">
                  Etiquetas
                </label>
                <TagEditor value={editTags} onChange={setEditTags} />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editPinned}
                    onChange={(e) => setEditPinned(e.target.checked)}
                    className="rounded accent-amber-500"
                  />
                  <span>📌 Fijar arriba</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editArchived}
                    onChange={(e) => setEditArchived(e.target.checked)}
                    className="rounded accent-[var(--blue)]"
                  />
                  <span>📥 Archivada</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] rounded-xl border border-[var(--border)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!editText.trim()}
                  className="px-4 py-1.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl disabled:opacity-40 cursor-pointer shadow-2xs"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )}

      {/* Mis cosas */}
      {activeTab === 'cosas' && (
      <section className="space-y-3 pt-4 border-t border-[var(--border)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Objetos y regalos</h2>
            <p className="text-xs text-[var(--text-soft)]">Guardá dónde está cada objeto y los detalles que quieras recordar.</p>
          </div>
          {(state.notes?.possessions || []).length > 4 && (
            <input
              value={possessionSearch}
              onChange={(event) => setPossessionSearch(event.target.value)}
              placeholder="Buscar en mis cosas…"
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
            />
          )}
        </div>
        <form onSubmit={handleAddPossession} className="grid gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_110px_1fr_135px_auto]">
          <input aria-label="Objeto o regalo" value={possessionName} onChange={(event) => setPossessionName(event.target.value)} placeholder="Qué recibiste o querés recordar" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <input aria-label="Categoría" value={possessionCategory} onChange={(event) => setPossessionCategory(event.target.value)} placeholder="Categoría" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <input aria-label="Ubicación (opcional)" value={possessionLocation} onChange={(event) => setPossessionLocation(event.target.value)} placeholder="Dónde está (opcional)" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <input type="date" max={todayISO()} aria-label="Fecha del objeto" value={possessionDate} onChange={(event) => setPossessionDate(event.target.value)} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <button className="rounded-xl bg-[var(--blue)] px-4 py-2 text-xs font-extrabold text-white cursor-pointer">Guardar</button>
          <textarea aria-label="Detalles del objeto" value={possessionNote} onChange={(event) => setPossessionNote(event.target.value)} placeholder="Qué te gusta, quién te lo regaló o por qué lo valorás…" rows={2} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs sm:col-span-2 lg:col-span-5" />
        </form>
        {visiblePossessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-faint)]">
            {(state.notes?.possessions || []).length ? 'No encontré coincidencias.' : 'Agregá un objeto o regalo con el formulario.'}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePossessions.map((item) => (
              <article key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--blue)]">{item.category}</span>
                    <h3 className="font-extrabold text-[var(--text)]">{item.name}</h3>
                  </div>
                  <button
                    onClick={() => saveToolChange((draft) => {
                      if (!draft.notes?.possessions) return;
                      draft.notes.possessions = draft.notes.possessions.filter((candidate) => candidate.id !== item.id);
                    })}
                    aria-label={`Eliminar ${item.name}`}
                    className="text-xs text-[var(--text-faint)] hover:text-rose-500 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                {item.note && <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--text-soft)]">{item.note}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[var(--text-faint)]">
                  {item.location && <span>📍 {item.location}</span>}
                  {item.receivedAt && <span>🎁 {fmtDate(item.receivedAt)}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      )}

      {/* Shopping list and useful links keep their existing forms and records. */}
      {(activeTab === 'compras' || activeTab === 'links') && (
      <div className="pt-4 border-t border-[var(--border)]">
        {/* Shopping List */}
        {activeTab === 'compras' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text)]">Lista de compras</h2>
            {pendingShopCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {pendingShopCount} pendientes
              </span>
            )}
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddShop} className="flex gap-2">
              <input
                type="text"
                aria-label="Artículo para comprar" value={shopItem}
                onChange={(e) => setShopItem(e.target.value)}
                placeholder="Ej: Leche, avena..."
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                Agregar
              </button>
            </form>

            <div className="divide-y divide-[var(--border)] max-h-60 overflow-y-auto">
              {(state.notes?.shopping || []).length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Lista vacía.</p>
              ) : (
                (state.notes?.shopping || []).map((s) => (
                  <div key={s.id} className="py-2 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      aria-label={`${s.done ? 'Marcar pendiente' : 'Marcar comprado'}: ${s.text}`} aria-pressed={s.done} onClick={() => handleToggleShop(s.id)}
                      className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] cursor-pointer ${
                        s.done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-transparent'
                      }`}
                    >
                      ✓
                    </button>
                    <span className={`flex-1 ${s.done ? 'line-through text-[var(--text-faint)]' : 'text-[var(--text)]'}`}>
                      {s.text}
                    </span>
                    <button
                      aria-label={`Eliminar ${s.text}`} onClick={() => handleDeleteShop(s.id)}
                      className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        )}
        {/* Useful Links */}
        {activeTab === 'links' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Enlaces</h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddLink} className="flex flex-wrap gap-2">
              <input
                type="text"
                aria-label="Nombre del enlace" value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="Nombre (ej: Campus)"
                className="w-32 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input
                type="text"
                aria-label="Dirección del enlace" value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-[140px] px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                Agregar
              </button>
            </form>

            <div className="divide-y divide-[var(--border)] max-h-60 overflow-y-auto">
              {(state.notes?.links || []).length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Guardá un enlace con su nombre y dirección.</p>
              ) : (
                (state.notes?.links || []).map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 break-words text-[var(--blue)] font-bold hover:underline"
                    >
                      {l.name}
                    </a>
                    <button
                      aria-label={`Eliminar enlace ${l.name}`} onClick={() => handleDeleteLink(l.id)}
                      className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        )}
      </div>
      )}

  {/* Tab: Streaming & Contenido */}
  {activeTab === 'streaming' && (
    <div className="space-y-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-[var(--text)]">
              {status.live ? `En directo hoy (${status.hours} h)` : 'Sin directo registrado hoy'}
            </h3>
            <p className="text-xs text-[var(--text-faint)]">Sesiones del mes y contenido en preparación.</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            {streamCount}/{streamGoal} este mes
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-[var(--bg)] overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${streamPct}%` }} />
        </div>

        <form onSubmit={handleAddStream} className="flex flex-wrap items-end gap-2 p-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha</label>
            <input
              type="date"
              aria-label="Fecha del directo" value={streamDate}
              onChange={(e) => setStreamDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Horas</label>
            <input
              type="number"
              step="0.1"
              aria-label="Horas del directo" value={streamHours}
              onChange={(e) => setStreamHours(e.target.value)}
              placeholder="2.5"
              className="w-20 px-2.5 py-1.5 text-xs tabular-nums rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer"
          >
            ＋ Registrar horas
          </button>
        </form>

        <div className="grid gap-4 border-t border-[var(--border)] pt-4 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-extrabold text-[var(--text)]">Antes del directo</h3>
                <p className="text-[10px] text-[var(--text-faint)]">Marcá cada control y reiniciá la lista para el próximo directo.</p>
              </div>
              <button
                type="button"
                onClick={() => saveToolChange((draft) => (draft.streaming?.preStreamChecklist || []).forEach((item) => { item.done = false; }))}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--blue)] cursor-pointer"
              >
                Reiniciar
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {(state.streaming?.preStreamChecklist || []).map((item) => (
                <div key={item.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${item.done ? 'border-emerald-500/25 bg-emerald-500/10 opacity-70' : 'border-[var(--border)] bg-[var(--card)]'}`}>
                  <button
                    type="button"
                    onClick={() => saveToolChange((draft) => { const target = (draft.streaming?.preStreamChecklist || []).find((candidate) => candidate.id === item.id); if (target) target.done = !target.done; })}
                    className={`flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs cursor-pointer ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border)] text-transparent'}`}
                  >
                    ✓
                  </button>
                  <span className={`min-w-0 flex-1 text-xs font-semibold ${item.done ? 'line-through' : ''}`}>{item.label}</span>
                  <button
                    type="button"
                    onClick={() => saveToolChange((draft) => { if (draft.streaming?.preStreamChecklist) draft.streaming.preStreamChecklist = draft.streaming.preStreamChecklist.filter((candidate) => candidate.id !== item.id); })}
                    className="text-[10px] text-[var(--text-faint)] hover:text-rose-500 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddChecklistItem} className="mt-2 flex gap-1.5">
              <input
                aria-label="Control antes del directo" value={checklistLabel}
                onChange={(event) => setChecklistLabel(event.target.value)}
                placeholder="Nuevo control…"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs"
              />
              <button aria-label="Agregar control" className="rounded-lg bg-[var(--text)] px-2.5 text-xs font-bold text-[var(--bg)] cursor-pointer">Agregar</button>
            </form>
          </section>

          <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div>
              <h3 className="text-xs font-extrabold text-[var(--text)]">Contenido en preparación</h3>
              <p className="text-[10px] text-[var(--text-faint)]">Mové cada contenido según su avance.</p>
            </div>
            <form onSubmit={handleAddContent} className="mt-2 flex gap-1.5">
              <input
                aria-label="Título del contenido" value={contentTitle}
                onChange={(event) => setContentTitle(event.target.value)}
                placeholder="Nueva idea de contenido…"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs"
              />
              <button className="rounded-lg bg-amber-500 px-3 text-xs font-extrabold text-white cursor-pointer">Agregar</button>
            </form>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {pipelineStages.map((stage) => {
                const cards = (state.streaming?.contentPipeline || []).filter((item) => item.status === stage.id);
                return (
                  <div key={stage.id} className="w-[160px] shrink-0 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <strong className="text-[10px] uppercase tracking-wider text-[var(--text-soft)]">{stage.label}</strong>
                      <span className="rounded-md bg-[var(--bg)] px-1.5 text-[9px] font-bold">{cards.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {cards.map((item) => (
                        <article key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
                          <p className="text-[11px] font-bold text-[var(--text)]">{item.title}</p>
                          <div className="mt-1.5 flex gap-1">
                            <select
                              aria-label={`Estado de ${item.title}`}
                              value={item.status}
                              onChange={(event) => saveToolChange((draft) => { const target = (draft.streaming?.contentPipeline || []).find((candidate) => candidate.id === item.id); if (target) { target.status = event.target.value as typeof item.status; target.updatedAt = new Date().toISOString(); } })}
                              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-1 py-1 text-[9px]"
                            >
                              {pipelineStages.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => saveToolChange((draft) => { if (draft.streaming?.contentPipeline) draft.streaming.contentPipeline = draft.streaming.contentPipeline.filter((candidate) => candidate.id !== item.id); })}
                              className="px-1 text-[10px] text-rose-500 cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </article>
                      ))}
                      {!cards.length && <p className="py-3 text-center text-[9px] text-[var(--text-faint)]">Vacío</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  )}
</div>
);
};
