import React, { useMemo, useState } from 'react';
import {
  Archive,
  ExternalLink,
  Gift,
  Link2,
  MapPin,
  MoreHorizontal,
  Pin,
  Plus,
  Radio,
  Search,
  ShoppingCart,
  StickyNote,
  Target,
  X,
} from 'lucide-react';
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
import { isStreamingEnabled } from '../lib/moduleVisibility';
import { ProjectsManager } from './ProjectsManager';
import { CompletionCheck } from './ui/CompletionCheck';
import { ListDivider, SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';
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
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-2 focus-within:border-[#4F46E5] dark:border-white/[0.08] dark:bg-white/[0.03]">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 text-sm text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-slate-200">
          #{tag}
          <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag).join(', '))} aria-label={`Quitar etiqueta ${tag}`} className="ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5] cursor-pointer">
            <X size={13} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input type="text" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(); }
      }} placeholder="Agregar etiqueta…" aria-label="Agregar etiqueta" className="min-h-10 min-w-32 flex-1 bg-transparent px-1.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none dark:text-slate-100 dark:placeholder:text-slate-500" />
      <button type="button" onClick={add} disabled={!input.trim()} className="min-h-10 rounded-lg border border-slate-200/80 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.05] cursor-pointer">Agregar</button>
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
  const streamingEnabled = isStreamingEnabled(state);
  const resolvedInitialTab: NotesSection =
    initialTab === 'streaming' && !streamingEnabled ? 'proyectos' : (initialTab || 'notas');
  const [activeTab, setActiveTab] = useState<NotesSection>(resolvedInitialTab);
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
      const nextTab = initialTab === 'streaming' && !streamingEnabled ? 'proyectos' : initialTab;
      setActiveTab(nextTab);
      if (nextTab === 'proyectos') setProjectView('projects');
    }
  }, [initialTab, focusNonce, streamingEnabled]);

  React.useEffect(() => {
    if (activeTab === 'streaming' && !streamingEnabled) {
      setActiveTab('proyectos');
    }
  }, [activeTab, streamingEnabled]);
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
    const snapshot = note ? structuredClone(note) : null;
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
    showToast('Nota eliminada', 'info', snapshot ? {
      actionLabel: 'Deshacer',
      onAction: () => {
        if (saveNoteChange((draft) => {
          if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
          if (!draft.notes.postits.some((item) => item.id === snapshot.id)) {
            draft.notes.postits.unshift({ ...snapshot, updatedAt: new Date().toISOString() });
          }
        })) {
          showToast('Nota restaurada', 'success');
        }
      },
    } : undefined);
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
    const existing = state.notes?.shopping.find((s) => s.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = saveToolChange((draft) => {
      if (!draft.notes?.shopping) return;
      draft.notes.shopping = draft.notes.shopping.filter((s) => s.id !== id);
    });
    if (!saved || !snapshot) return;
    showToast('Ítem quitado de compras', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        saveToolChange((draft) => {
          if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
          if (!draft.notes.shopping) draft.notes.shopping = [];
          if (!draft.notes.shopping.some((s) => s.id === snapshot.id)) {
            draft.notes.shopping.push(snapshot);
          }
        });
      },
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
    const existing = state.notes?.links.find((l) => l.id === id);
    const snapshot = existing ? structuredClone(existing) : null;
    const saved = saveToolChange((draft) => {
      if (!draft.notes?.links) return;
      draft.notes.links = draft.notes.links.filter((l) => l.id !== id);
    });
    if (!saved || !snapshot) return;
    showToast('Enlace eliminado', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => {
        saveToolChange((draft) => {
          if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
          if (!draft.notes.links) draft.notes.links = [];
          if (!draft.notes.links.some((l) => l.id === snapshot.id)) {
            draft.notes.links.push(snapshot);
          }
        });
      },
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


  const fieldClass =
    'w-full min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500';
  const primaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';
  const secondaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer';

  return (
    <div className="notes-refinement space-y-5">
      {noteError && !editingNote && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{noteError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Notas y herramientas</h1>
          {activeTab === 'notas' && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{totalActiveNotes} {totalActiveNotes === 1 ? 'nota activa' : 'notas activas'}</p>}
        </div>
        <div className="flex items-center">
          {activeTab === 'notas' && (totalActiveNotes > 0 || showAddForm || Boolean(noteSearch.trim()) || noteFilter !== 'activas') && (
            <button type="button" onClick={() => setShowAddForm(!showAddForm)} className={primaryBtnClass}>
              {showAddForm ? <X size={16} strokeWidth={1.75} aria-hidden="true" /> : <Plus size={16} strokeWidth={1.75} aria-hidden="true" />}
              <span>{showAddForm ? 'Cerrar' : 'Nueva nota'}</span>
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Secciones de Notas" className="flex gap-1 border-b border-slate-200/80 dark:border-white/[0.08]">
        <button type="button" onClick={() => setActiveTab('notas')} aria-current={!inTools ? 'page' : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/50 cursor-pointer ${!inTools ? 'border-[#4F46E5] text-slate-900 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>Mis notas</button>
        <button type="button" onClick={() => setActiveTab('proyectos')} aria-current={inTools ? 'page' : undefined} className={`min-h-11 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/50 cursor-pointer ${inTools ? 'border-[#4F46E5] text-slate-900 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}>Herramientas<span className="hidden sm:inline font-normal ml-2 text-slate-400 dark:text-slate-500">Proyectos, listas y enlaces</span></button>
      </nav>

      {inTools && toolMessage && <p role="status" className="text-sm font-medium text-slate-700 dark:text-slate-300">{toolMessage}</p>}
      {inTools && (
        <nav aria-label="Herramientas personales" className="flex items-center gap-1.5 overflow-x-auto p-0.5 pb-1">
          {([
            ['proyectos', 'Proyectos y objetivos'],
            ...(streamingEnabled ? ([['streaming', 'Streaming y contenido']] as const) : []),
            ['cosas', 'Objetos y regalos'],
            ['compras', 'Lista de compras'],
            ['links', 'Enlaces'],
          ] as const).map(([section, label]) => (
            <button
              key={section}
              type="button"
              aria-current={activeTab === section ? 'page' : undefined}
              onClick={() => setActiveTab(section)}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/50 cursor-pointer ${
                activeTab === section
                  ? 'border-[#4F46E5] bg-[#4F46E5]/10 text-[#4F46E5] dark:border-indigo-400 dark:bg-indigo-500/15 dark:text-indigo-300'
                  : 'border-slate-200/80 text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.04]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* Tab: Proyectos & Metas */}
      {activeTab === 'proyectos' && (
        <div className="space-y-5">
          <div className="flex items-center gap-1.5 overflow-x-auto p-0.5 pb-1" role="group" aria-label="Tipo de seguimiento">
            <button
              type="button"
              aria-pressed={projectView === 'projects'}
              onClick={() => setProjectView('projects')}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/50 cursor-pointer ${
                projectView === 'projects'
                  ? 'border-[#4F46E5] bg-[#4F46E5]/10 text-[#4F46E5] dark:border-indigo-400 dark:text-indigo-300'
                  : 'border-slate-200/80 text-slate-600 dark:border-white/[0.08] dark:text-slate-400'
              }`}
            >
              Proyectos<span className="hidden sm:inline"> · tareas y próximo paso</span>
            </button>
            <button
              type="button"
              aria-pressed={projectView === 'goals'}
              onClick={() => setProjectView('goals')}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-xl border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/50 cursor-pointer ${
                projectView === 'goals'
                  ? 'border-[#4F46E5] bg-[#4F46E5]/10 text-[#4F46E5] dark:border-indigo-400 dark:text-indigo-300'
                  : 'border-slate-200/80 text-slate-600 dark:border-white/[0.08] dark:text-slate-400'
              }`}
            >
              Objetivos<span className="hidden sm:inline"> · avance numérico</span>
            </button>
          </div>

          <div hidden={projectView !== 'projects'}>
            <ProjectsManager state={state} onUpdateState={saveToolChange} initialFocusId={projectView === 'projects' ? initialFocusId : null} focusNonce={focusNonce} />
          </div>

          {/* Quantitative Goals */}
          <div hidden={projectView !== 'goals'} className="space-y-4">
            <SurfaceCard className="p-4 sm:p-5 space-y-4">
              <div>
                <SectionHeader
                  icon={<Target size={16} strokeWidth={1.75} />}
                  title="Objetivos con progreso"
                  count={(state.goals || []).length > 0 ? (state.goals || []).length : null}
                />
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Un valor actual y una meta. Actualizalos manualmente o vinculalos a tus registros.
                </p>
              </div>

              <form onSubmit={handleAddGoal} className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3.5 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_0.7fr_1fr_auto] lg:items-end dark:border-white/[0.06]">
                <div className="min-w-0">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</label>
                  <input
                    type="text"
                    aria-label="Nombre del objetivo"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder="Ej.: Leer 8 capítulos"
                    className={fieldClass}
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Valor inicial</label>
                  <input
                    type="number"
                    aria-label="Valor inicial"
                    value={goalInitial}
                    onChange={(e) => setGoalInitial(e.target.value)}
                    placeholder="0"
                    className={`${fieldClass} tabular-nums`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Meta</label>
                  <input
                    type="number"
                    aria-label="Meta"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="8"
                    className={`${fieldClass} tabular-nums`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Actualizar desde</label>
                  <select
                    aria-label="Origen del avance"
                    value={goalLinked || ''}
                    onChange={(e) => setGoalLinked((e.target.value as any) || null)}
                    className={fieldClass}
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
                <button type="submit" className={`${primaryBtnClass} sm:col-span-2 lg:col-span-1`}>
                  <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>Crear objetivo</span>
                </button>
              </form>
            </SurfaceCard>

            {(state.goals || []).length === 0 ? (
              <SurfaceCard className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                <Target size={22} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Todavía no creaste objetivos.</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Definí un valor inicial y una meta para seguir tu avance manual o automáticamente.
                </p>
              </SurfaceCard>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {(state.goals || []).map((g) => {
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
                      case 'weight': return 'Peso';
                      case 'available': return 'Disponible';
                      case 'net_worth': return 'Patrimonio';
                      case 'gym_sessions': return 'Gimnasio';
                      case 'study_hours': return 'Estudio';
                      case 'resale_profit': return 'Reventa';
                      default: return 'Manual';
                    }
                  };

                  return (
                    <SurfaceCard key={g.id} className={`p-4 space-y-3 ${isFinancial ? 'privacy-sensitive' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">{g.name}</span>
                        <button
                          type="button"
                          aria-label={`Eliminar objetivo ${g.name}`}
                          onClick={() => handleDeleteGoal(g.id)}
                          className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <X size={15} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {fmtVal(cur)}
                        <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                          / {fmtVal(g.target)}
                        </span>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                        <div className="h-full rounded-full bg-[#4F46E5] transition-all duration-300" style={{ width: `${pct}%` }} />
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                        <span className="rounded-md bg-[#4F46E5]/10 px-2 py-0.5 font-semibold text-[#4F46E5] dark:text-indigo-300">
                          {getBadge()}
                        </span>
                        {!g.linked && (
                          <button
                            type="button"
                            onClick={() => handleUpdateGoal(g)}
                            className="min-h-10 rounded-lg border border-slate-200/80 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.04] cursor-pointer"
                          >
                            Actualizar
                          </button>
                        )}
                      </div>
                    </SurfaceCard>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Notas & Personal */}
      {activeTab === 'notas' && (
        <div className="space-y-4">
          {/* Quick Add / Form */}
          {showAddForm && (
            <SurfaceCard as="div" className="p-4 sm:p-5">
              <form onSubmit={handleAddPostit} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nueva nota</span>
                  <label className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={notePinned}
                      onChange={(e) => setNotePinned(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#4F46E5]"
                    />
                    <Pin size={13} strokeWidth={1.75} aria-hidden="true" />
                    <span>Fijar arriba</span>
                  </label>
                </div>

                <input
                  type="text"
                  aria-label="Título de la nueva nota"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="Título (opcional)..."
                  className={`${fieldClass} font-semibold`}
                />

                <textarea
                  aria-label="Contenido de la nueva nota"
                  autoFocus
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Escribí el contenido de la nota..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 resize-y"
                  required
                />

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="w-full sm:flex-1"><TagEditor value={noteTags} onChange={setNoteTags} /></div>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setShowAddForm(false)} className={secondaryBtnClass}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={!noteContent.trim()} className={primaryBtnClass}>
                      Guardar nota
                    </button>
                  </div>
                </div>
              </form>
            </SurfaceCard>
          )}

          {/* Search & Filter Bar */}
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                <Search size={15} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <input
                type="text"
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                aria-label="Buscar notas"
                placeholder="Buscar por título, texto o etiqueta"
                className="w-full min-h-10 rounded-xl border border-slate-200/80 bg-white pl-9 pr-10 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-100"
              />
              {noteSearch && (
                <button
                  type="button"
                  onClick={() => setNoteSearch('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 text-xs font-semibold dark:border-white/[0.08] dark:bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setNoteFilter('activas')}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
                  noteFilter === 'activas'
                    ? 'bg-white text-[#4F46E5] dark:bg-[#0D111A] dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Activas ({totalActiveNotes})
              </button>
              <button
                type="button"
                onClick={() => setNoteFilter('fijadas')}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
                  noteFilter === 'fijadas'
                    ? 'bg-white text-[#4F46E5] dark:bg-[#0D111A] dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <Pin size={13} strokeWidth={1.75} aria-hidden="true" />
                <span>Fijadas ({totalPinnedNotes})</span>
              </button>
              <button
                type="button"
                onClick={() => setNoteFilter('archivadas')}
                className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors cursor-pointer ${
                  noteFilter === 'archivadas'
                    ? 'bg-white text-[#4F46E5] dark:bg-[#0D111A] dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Archivadas ({totalArchivedNotes})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span role="status">{displayedNotes.length} {displayedNotes.length === 1 ? 'nota' : 'notas'}{noteSearch ? ' encontradas' : ''}</span>
            <label className="flex items-center gap-2">
              <span>Ordenar</span>
              <select aria-label="Ordenar notas" value={noteOrder} onChange={(event) => setNoteOrder(event.target.value as 'recent' | 'pinned')} className="min-h-10 rounded-xl border border-slate-200/80 bg-white px-2.5 text-sm text-slate-900 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-100">
                <option value="recent">Más recientes</option>
                <option value="pinned">Fijadas primero</option>
              </select>
            </label>
          </div>

          {/* Notes Grid */}
          <div id="notes-grid" className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {displayedNotes.length === 0 ? (
              <SurfaceCard className="col-span-full flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <StickyNote size={24} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {noteSearch.trim()
                    ? `No se encontraron notas para "${noteSearch}".`
                    : noteFilter === 'fijadas'
                    ? 'No tenés notas fijadas. Fijá una nota importante para verla arriba.'
                    : noteFilter === 'archivadas'
                    ? 'No hay notas archivadas.'
                    : 'No tenés notas guardadas. Creá una nota para comenzar.'}
                </p>
                {!showAddForm && !noteSearch.trim() && noteFilter === 'activas' && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    className={primaryBtnClass}
                  >
                    <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
                    <span>Crear primera nota</span>
                  </button>
                )}
              </SurfaceCard>
            ) : (
              renderedNotes.map((p) => {
                const relative = formatRelativeTime(p.updatedAt || p.date);
                const isPinned = Boolean(p.pinned);
                const isArchived = Boolean(p.archived);

                return (
                  <SurfaceCard
                    as="div"
                    key={p.id}
                    id={`note-${p.id}`}
                    className={`relative flex flex-col gap-3 p-4 sm:p-5 transition-colors ${openNoteMenuId === p.id ? 'z-20' : ''} ${
                      isPinned
                        ? 'border-[#4F46E5]/35 bg-[#4F46E5]/[0.04] dark:border-indigo-400/35 dark:bg-indigo-500/[0.08]'
                        : isArchived
                        ? 'opacity-85'
                        : 'hover:border-[#4F46E5]/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {isPinned && <Pin size={15} strokeWidth={1.75} aria-label="Nota fijada" className="mt-1 shrink-0 text-[#4F46E5] dark:text-indigo-400" />}
                        {p.title && (
                          <button type="button" onClick={() => handleStartEdit(p)} className="min-w-0 flex-1 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5]" aria-label={`Abrir nota ${p.title}`}>
                            <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.015em] text-slate-900 dark:text-slate-100 break-words">{p.title}</h3>
                          </button>
                        )}
                      </div>
                      <div className="relative shrink-0" data-note-menu onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setOpenNoteMenuId(null);
                      }}>
                        <button
                          id={`note-menu-trigger-${p.id}`}
                          type="button"
                          onClick={() => setOpenNoteMenuId(openNoteMenuId === p.id ? null : p.id)}
                          aria-label={`Acciones de la nota ${p.title || p.text.slice(0, 45)}`}
                          aria-haspopup="menu"
                          aria-expanded={openNoteMenuId === p.id}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5] dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
                        >
                          <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                        {openNoteMenuId === p.id && (
                          <div
                            role="menu"
                            aria-label="Acciones de nota"
                            onKeyDown={(event) => {
                              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                              event.preventDefault();
                              const items = Array.from(event.currentTarget.querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
                              const current = items.indexOf(document.activeElement as HTMLButtonElement);
                              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
                              items[next]?.focus();
                            }}
                            className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-lg dark:border-white/[0.08] dark:bg-[#0D111A]"
                          >
                            <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleStartEdit(p); }} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer">Editar</button>
                            <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleTogglePin(p.id, isPinned); }} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer">{isPinned ? 'Desfijar' : 'Fijar'}</button>
                            <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleConvertToTask(p.id); }} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer">Convertir a tarea</button>
                            {GYM_NOTE_PLACEMENTS_ENABLED && (currentPlacements.some((placement) => placement.noteId === p.id) ? (
                              <>
                                <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); onOpenGym(); }} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer">Ver en Gimnasio</button>
                                <button role="menuitem" type="button" onClick={() => handleRemoveFromGym(p.id)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer">Retirar de Gimnasio</button>
                              </>
                            ) : <button role="menuitem" type="button" onClick={() => handlePlaceInGym(p.id)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer">Colocar en… Gimnasio</button>)}
                            <button role="menuitem" type="button" onClick={() => { setOpenNoteMenuId(null); handleToggleArchive(p.id, isArchived); }} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] cursor-pointer">{isArchived ? 'Restaurar' : 'Archivar'}</button>
                            <button role="menuitem" type="button" onClick={() => handleDeletePostit(p.id)} className="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer">Eliminar</button>
                          </div>
                        )}
                      </div>
                    </div>

                    <button type="button" onClick={() => handleStartEdit(p)} className="min-w-0 text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4F46E5]" aria-label={`Abrir contenido de la nota ${p.title || p.text.slice(0, 45)}`}>
                      <span className="line-clamp-5 text-sm leading-6 text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{p.text}</span>
                    </button>

                    {/* Footer: Tags and Relative Date */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs dark:border-white/[0.06]">
                      {p.tags && p.tags.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {p.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setNoteSearch(tag)}
                              className="min-h-10 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 hover:border-[#4F46E5] hover:text-[#4F46E5] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300 dark:hover:text-indigo-300 cursor-pointer"
                              title={`Filtrar por #${tag}`}
                            >
                              #{tag}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div />
                      )}

                      <div className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums text-slate-400 dark:text-slate-500">
                        {isPinned && <span className="font-medium text-[#4F46E5] dark:text-indigo-400">Fijada ·</span>}
                        {isArchived && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-400">
                            Archivada
                          </span>
                        )}
                        <span title={p.updatedAt ? `Modificada: ${p.updatedAt}` : `Creada: ${p.date}`}>
                          {relative}
                        </span>
                      </div>
                    </div>
                  </SurfaceCard>
                );
              })
            )}
          </div>

          {renderedNotes.length < displayedNotes.length && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
              <span role="status" className="text-sm text-slate-500 dark:text-slate-400">Mostrando {renderedNotes.length} de {displayedNotes.length} notas</span>
              <button type="button" aria-controls="notes-grid" onClick={() => expandNotes(visibleNoteCount + 50)} className={secondaryBtnClass}>Cargar 50 más</button>
              <button type="button" aria-controls="notes-grid" onClick={() => expandNotes(displayedNotes.length)} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-[#4F46E5] hover:underline dark:text-indigo-400 cursor-pointer">Ver todas</button>
            </div>
          )}

          {/* Edit Note Modal */}
          {editingNote && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
              <div
                ref={editorRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="note-editor-title"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') { event.stopPropagation(); closeEditor(); }
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); editorRef.current?.querySelector('form')?.requestSubmit(); }
                  if (event.key === 'Tab') {
                    const controls = Array.from(editorRef.current?.querySelectorAll('button:not(:disabled), input, textarea, select') || []) as HTMLElement[];
                    const first = controls[0], last = controls[controls.length - 1];
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
                  }
                }}
                className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4 shadow-2xl dark:border-white/[0.07] dark:bg-[#0D111A]"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 id="note-editor-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">Editar nota</h3>
                  <button
                    type="button"
                    onClick={closeEditor}
                    aria-label="Cerrar editor de nota"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
                  >
                    <X size={17} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={handleSaveEdit} className="space-y-3">
                  {noteError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{noteError}</p>}
                  <p className="text-xs text-slate-500 dark:text-slate-400">Guardado manual · Ctrl+Enter para guardar</p>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Título (opcional)
                    </label>
                    <input
                      type="text"
                      aria-label="Título de la nota"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Título de la nota..."
                      className={`${fieldClass} font-semibold`}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Contenido
                    </label>
                    <textarea
                      aria-label="Contenido de la nota"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={10}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-sm leading-6 text-slate-900 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 resize-y"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Etiquetas
                    </label>
                    <TagEditor value={editTags} onChange={setEditTags} />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editPinned}
                        onChange={(e) => setEditPinned(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#4F46E5]"
                      />
                      <Pin size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span>Fijar arriba</span>
                    </label>
                    <label className="inline-flex min-h-10 items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editArchived}
                        onChange={(e) => setEditArchived(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#4F46E5]"
                      />
                      <Archive size={13} strokeWidth={1.75} aria-hidden="true" />
                      <span>Archivada</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                    <button type="button" onClick={closeEditor} className={secondaryBtnClass}>
                      Cancelar
                    </button>
                    <button type="submit" disabled={!editText.trim()} className={primaryBtnClass}>
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
        <div className="space-y-4">
          <SurfaceCard className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <SectionHeader
                  icon={<Gift size={16} strokeWidth={1.75} />}
                  title="Objetos y regalos"
                  count={(state.notes?.possessions || []).length > 0 ? (state.notes?.possessions || []).length : null}
                />
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Guardá dónde está cada objeto y los detalles que quieras recordar.
                </p>
              </div>
              {(state.notes?.possessions || []).length > 4 && (
                <input
                  value={possessionSearch}
                  onChange={(event) => setPossessionSearch(event.target.value)}
                  placeholder="Buscar en mis cosas…"
                  className="min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-sm text-slate-900 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100"
                />
              )}
            </div>

            <form onSubmit={handleAddPossession} className="grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-3.5 sm:grid-cols-2 lg:grid-cols-[1.3fr_120px_1fr_145px_auto] dark:border-white/[0.06]">
              <input aria-label="Objeto o regalo" value={possessionName} onChange={(event) => setPossessionName(event.target.value)} placeholder="Qué recibiste o querés recordar" className={fieldClass} />
              <input aria-label="Categoría" value={possessionCategory} onChange={(event) => setPossessionCategory(event.target.value)} placeholder="Categoría" className={fieldClass} />
              <input aria-label="Ubicación (opcional)" value={possessionLocation} onChange={(event) => setPossessionLocation(event.target.value)} placeholder="Dónde está (opcional)" className={fieldClass} />
              <input type="date" max={todayISO()} aria-label="Fecha del objeto" value={possessionDate} onChange={(event) => setPossessionDate(event.target.value)} className={fieldClass} />
              <button type="submit" className={`${primaryBtnClass} sm:col-span-2 lg:col-span-1`}>Guardar</button>
              <textarea aria-label="Detalles del objeto" value={possessionNote} onChange={(event) => setPossessionNote(event.target.value)} placeholder="Qué te gusta, quién te lo regaló o por qué lo valorás…" rows={2} className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 sm:col-span-2 lg:col-span-5" />
            </form>
          </SurfaceCard>

          {visiblePossessions.length === 0 ? (
            <SurfaceCard className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <Gift size={22} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {(state.notes?.possessions || []).length ? 'No encontré coincidencias.' : 'Agregá un objeto o regalo con el formulario.'}
              </p>
            </SurfaceCard>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePossessions.map((item) => (
                <SurfaceCard as="div" key={item.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-[#4F46E5] dark:text-indigo-400">{item.category}</span>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">{item.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => saveToolChange((draft) => {
                        if (!draft.notes?.possessions) return;
                        draft.notes.possessions = draft.notes.possessions.filter((candidate) => candidate.id !== item.id);
                      })}
                      aria-label={`Eliminar ${item.name}`}
                      className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    >
                      <X size={15} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                  {item.note && <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">{item.note}</p>}
                  {(item.location || item.receivedAt) && (
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} strokeWidth={1.75} aria-hidden="true" />
                          <span>{item.location}</span>
                        </span>
                      )}
                      {item.receivedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Gift size={13} strokeWidth={1.75} aria-hidden="true" />
                          <span>{fmtDate(item.receivedAt)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </SurfaceCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Shopping list */}
      {activeTab === 'compras' && (
        <SurfaceCard className="p-4 sm:p-5 space-y-4">
          <SectionHeader
            icon={<ShoppingCart size={16} strokeWidth={1.75} />}
            title="Lista de compras"
            count={pendingShopCount > 0 ? `${pendingShopCount} pendientes` : null}
          />
          <form onSubmit={handleAddShop} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              aria-label="Artículo para comprar"
              value={shopItem}
              onChange={(e) => setShopItem(e.target.value)}
              placeholder="Ej: Leche, avena..."
              className={`${fieldClass} flex-1`}
            />
            <button type="submit" className={`${primaryBtnClass} shrink-0`}>Agregar</button>
          </form>

          {(state.notes?.shopping || []).length === 0 ? (
            <div className="border-t border-slate-100 py-6 text-center dark:border-white/[0.06]">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Lista vacía.</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sumá artículos arriba para tacharlos cuando compres.</p>
            </div>
          ) : (
            <ListDivider className="border-t border-slate-100 dark:border-white/[0.06]">
              {(state.notes?.shopping || []).map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    aria-label={`${s.done ? 'Marcar pendiente' : 'Marcar comprado'}: ${s.text}`}
                    aria-pressed={s.done}
                    onClick={() => handleToggleShop(s.id)}
                    className="group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                  >
                    <CompletionCheck checked={s.done} size="md" />
                  </button>
                  <span className={`min-w-0 flex-1 text-sm break-words ${s.done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                    {s.text}
                  </span>
                  <button
                    type="button"
                    aria-label={`Eliminar ${s.text}`}
                    onClick={() => handleDeleteShop(s.id)}
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <X size={15} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </ListDivider>
          )}
        </SurfaceCard>
      )}

      {/* Useful Links */}
      {activeTab === 'links' && (
        <SurfaceCard className="p-4 sm:p-5 space-y-4">
          <SectionHeader
            icon={<Link2 size={16} strokeWidth={1.75} />}
            title="Enlaces"
            count={(state.notes?.links || []).length > 0 ? (state.notes?.links || []).length : null}
          />
          <form onSubmit={handleAddLink} className="grid grid-cols-1 gap-2 sm:grid-cols-[0.8fr_1.4fr_auto]">
            <input
              type="text"
              aria-label="Nombre del enlace"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="Nombre (ej: Campus)"
              className={fieldClass}
            />
            <input
              type="text"
              aria-label="Dirección del enlace"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className={fieldClass}
            />
            <button type="submit" className={primaryBtnClass}>Agregar</button>
          </form>

          {(state.notes?.links || []).length === 0 ? (
            <div className="border-t border-slate-100 py-6 text-center dark:border-white/[0.06]">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Guardá un enlace con su nombre y dirección.</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tené a mano accesos frecuentes de estudio, trabajo o trámites.</p>
            </div>
          ) : (
            <ListDivider className="border-t border-slate-100 dark:border-white/[0.06]">
              {(state.notes?.links || []).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-[#4F46E5] hover:underline dark:text-indigo-400 break-words"
                  >
                    <span className="truncate">{l.name}</span>
                    <ExternalLink size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    aria-label={`Eliminar enlace ${l.name}`}
                    onClick={() => handleDeleteLink(l.id)}
                    className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <X size={15} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </ListDivider>
          )}
        </SurfaceCard>
      )}

      {/* Tab: Streaming & Contenido (flattened to depth = 1 sibling SurfaceCards) */}
      {activeTab === 'streaming' && streamingEnabled && (
        <div className="space-y-4">
          <SurfaceCard className="p-4 sm:p-5 space-y-4">
            <SectionHeader
              icon={<Radio size={16} strokeWidth={1.75} />}
              title={status.live ? `En directo hoy (${status.hours} h)` : 'Sin directo registrado hoy'}
              action={
                <span className="rounded-lg bg-[#4F46E5]/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-[#4F46E5] dark:text-indigo-300">
                  {streamCount}/{streamGoal} este mes
                </span>
              }
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">Sesiones del mes y contenido en preparación.</p>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
              <div className="h-full rounded-full bg-[#4F46E5] transition-all duration-300" style={{ width: `${streamPct}%` }} />
            </div>

            <form onSubmit={handleAddStream} className="grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-3.5 sm:grid-cols-[1fr_110px_auto] sm:items-end dark:border-white/[0.06]">
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Fecha</label>
                <input
                  type="date"
                  aria-label="Fecha del directo"
                  value={streamDate}
                  onChange={(e) => setStreamDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Horas</label>
                <input
                  type="number"
                  step="0.1"
                  aria-label="Horas del directo"
                  value={streamHours}
                  onChange={(e) => setStreamHours(e.target.value)}
                  placeholder="2.5"
                  className={`${fieldClass} tabular-nums`}
                />
              </div>
              <button type="submit" className={primaryBtnClass}>
                <Plus size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Registrar horas</span>
              </button>
            </form>
          </SurfaceCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <SurfaceCard className="p-4 sm:p-5 space-y-3.5">
              <SectionHeader
                title="Antes del directo"
                action={
                  <button
                    type="button"
                    onClick={() => saveToolChange((draft) => (draft.streaming?.preStreamChecklist || []).forEach((item) => { item.done = false; }))}
                    className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-xs font-semibold text-[#4F46E5] hover:bg-[#4F46E5]/10 dark:text-indigo-400 cursor-pointer"
                  >
                    Reiniciar
                  </button>
                }
              />

              {(state.streaming?.preStreamChecklist || []).length === 0 ? (
                <p className="border-t border-slate-100 py-4 text-center text-xs text-slate-500 dark:border-white/[0.06] dark:text-slate-400">
                  Agregá controles previos (micrófono, escenas, iluminación) para no olvidar nada.
                </p>
              ) : (
                <ListDivider className="border-t border-slate-100 dark:border-white/[0.06]">
                  {(state.streaming?.preStreamChecklist || []).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 py-2">
                      <button
                        type="button"
                        aria-label={`${item.done ? 'Desmarcar' : 'Marcar'} ${item.label}`}
                        aria-pressed={item.done}
                        onClick={() => saveToolChange((draft) => { const target = (draft.streaming?.preStreamChecklist || []).find((candidate) => candidate.id === item.id); if (target) target.done = !target.done; })}
                        className="group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] cursor-pointer"
                      >
                        <CompletionCheck checked={item.done} size="md" />
                      </button>
                      <span className={`min-w-0 flex-1 text-sm break-words ${item.done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>{item.label}</span>
                      <button
                        type="button"
                        aria-label={`Eliminar control ${item.label}`}
                        onClick={() => saveToolChange((draft) => { if (draft.streaming?.preStreamChecklist) draft.streaming.preStreamChecklist = draft.streaming.preStreamChecklist.filter((candidate) => candidate.id !== item.id); })}
                        className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <X size={15} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </ListDivider>
              )}

              <form onSubmit={handleAddChecklistItem} className="flex flex-col gap-2 pt-1 sm:flex-row">
                <input
                  aria-label="Control antes del directo"
                  value={checklistLabel}
                  onChange={(event) => setChecklistLabel(event.target.value)}
                  placeholder="Nuevo control…"
                  className={`${fieldClass} flex-1`}
                />
                <button type="submit" aria-label="Agregar control" className={`${primaryBtnClass} shrink-0`}>Agregar</button>
              </form>
            </SurfaceCard>

            <SurfaceCard className="min-w-0 p-4 sm:p-5 space-y-3.5">
              <SectionHeader title="Contenido en preparación" />
              <form onSubmit={handleAddContent} className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label="Título del contenido"
                  value={contentTitle}
                  onChange={(event) => setContentTitle(event.target.value)}
                  placeholder="Nueva idea de contenido…"
                  className={`${fieldClass} flex-1`}
                />
                <button type="submit" className={`${primaryBtnClass} shrink-0`}>Agregar</button>
              </form>

              <div className="flex gap-3 overflow-x-auto border-t border-slate-100 pt-3 pb-1 dark:border-white/[0.06]">
                {pipelineStages.map((stage) => {
                  const cards = (state.streaming?.contentPipeline || []).filter((item) => item.status === stage.id);
                  return (
                    <div key={stage.id} className="w-[172px] shrink-0 space-y-2 border-r border-slate-100 pr-3 last:border-r-0 last:pr-0 dark:border-white/[0.06]">
                      <div className="flex items-center justify-between">
                        <strong className="text-xs font-semibold text-slate-700 dark:text-slate-300">{stage.label}</strong>
                        <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">{cards.length}</span>
                      </div>
                      <ListDivider>
                        {cards.map((item) => (
                          <article key={item.id} className="py-2 space-y-1.5">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words">{item.title}</p>
                            <div className="flex items-center gap-1">
                              <select
                                aria-label={`Estado de ${item.title}`}
                                value={item.status}
                                onChange={(event) => saveToolChange((draft) => { const target = (draft.streaming?.contentPipeline || []).find((candidate) => candidate.id === item.id); if (target) { target.status = event.target.value as typeof item.status; target.updatedAt = new Date().toISOString(); } })}
                                className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-white px-1.5 text-xs text-slate-800 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-200"
                              >
                                {pipelineStages.map((option) => (
                                  <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                aria-label={`Eliminar ${item.title}`}
                                onClick={() => saveToolChange((draft) => { if (draft.streaming?.contentPipeline) draft.streaming.contentPipeline = draft.streaming.contentPipeline.filter((candidate) => candidate.id !== item.id); })}
                                className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                              >
                                <X size={14} strokeWidth={1.75} aria-hidden="true" />
                              </button>
                            </div>
                          </article>
                        ))}
                        {!cards.length && <p className="py-3 text-center text-xs text-slate-400 dark:text-slate-500">Sin elementos</p>}
                      </ListDivider>
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>
          </div>
        </div>
      )}
    </div>
  );
};
