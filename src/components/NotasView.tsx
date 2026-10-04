import React, { useState } from 'react';
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
import { PageHeader } from './PageHeader';
import { ProjectsManager } from './ProjectsManager';
import { AppIcon } from './AppIcon';

interface NotasViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const NotasView: React.FC<NotasViewProps> = ({ state, onUpdateState }) => {
  const [activeTab, setActiveTab] = useState<'notas' | 'proyectos' | 'streaming'>('notas');
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
  const [noteFilter, setNoteFilter] = useState<'activas' | 'fijadas' | 'archivadas'>('activas');

  // Edit note modal state
  const [editingNote, setEditingNote] = useState<Postit | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const [editArchived, setEditArchived] = useState(false);

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

  const activeProjectsCount = (state.projects || []).filter((p) => p.status === 'activo').length;
  const pendingShopCount = (state.notes?.shopping || []).filter((s) => !s.done).length;

  const handleAddStream = (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Number(streamHours);
    if (!hours) return;
    onUpdateState((draft) => {
      const date = streamDate || todayISO();
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
      if (!draft.streaming.sessions) draft.streaming.sessions = [];
      draft.streaming.sessions = draft.streaming.sessions.filter((s) => s.date !== date);
      draft.streaming.sessions.push({ id: uid(), date, hours });
    });
    setStreamHours('');
  };

  const handleAddChecklistItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!checklistLabel.trim()) return;
    onUpdateState((draft) => {
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
      if (!draft.streaming.preStreamChecklist) draft.streaming.preStreamChecklist = [];
      draft.streaming.preStreamChecklist.push({ id: uid(), label: checklistLabel.trim(), done: false });
    });
    setChecklistLabel('');
  };

  const handleAddContent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!contentTitle.trim()) return;
    onUpdateState((draft) => {
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
      if (!draft.streaming.contentPipeline) draft.streaming.contentPipeline = [];
      draft.streaming.contentPipeline.push({ id: uid(), title: contentTitle.trim(), status: 'idea', note: '', updatedAt: new Date().toISOString() });
    });
    setContentTitle('');
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) return;
    const initial = Number(goalInitial) || 0;
    const target = Number(goalTarget) || 0;
    onUpdateState((draft) => {
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
    setGoalName('');
    setGoalInitial('');
    setGoalTarget('');
  };

  const handleUpdateGoal = (g: Goal) => {
    const val = prompt(`Nuevo valor actual para "${g.name}":`, String(g.current));
    if (val === null) return;
    const num = Number(val);
    onUpdateState((draft) => {
      if (!draft.goals) draft.goals = [];
      const targetGoal = draft.goals.find((x) => x.id === g.id);
      if (targetGoal) targetGoal.current = !isNaN(num) ? num : targetGoal.current;
    });
  };

  const handleDeleteGoal = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.goals) draft.goals = [];
      draft.goals = draft.goals.filter((g) => g.id !== id);
    });
  };

  const handleAddPostit = (e: React.FormEvent) => {
    e.preventDefault();
    const content = noteContent.trim() || postitText.trim();
    if (!content) return;
    const rawTags = noteTags.split(',').map((t) => t.trim()).filter(Boolean);
    onUpdateState((draft) => {
      addNote(draft, {
        title: noteTitle.trim() || undefined,
        text: content,
        tags: rawTags.length > 0 ? rawTags : undefined,
        pinned: notePinned,
      });
    });
    setPostitText('');
    setNoteTitle('');
    setNoteContent('');
    setNoteTags('');
    setNotePinned(false);
    setShowAddForm(false);
    showToast('Nota guardada', 'success');
  };

  const handleStartEdit = (note: Postit) => {
    setEditingNote(note);
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
    onUpdateState((draft) => {
      updateNote(draft, editingNote.id, {
        title: editTitle.trim() || undefined,
        text: editText.trim(),
        tags: rawTags.length > 0 ? rawTags : undefined,
        pinned: editPinned,
        archived: editArchived,
      });
    });
    setEditingNote(null);
    showToast('Nota actualizada', 'success');
  };

  const handleTogglePin = (id: string, currentlyPinned: boolean) => {
    onUpdateState((draft) => {
      togglePinNote(draft, id);
    });
    showToast(currentlyPinned ? 'Nota desfijada' : 'Nota fijada arriba', 'info');
  };

  const handleToggleArchive = (id: string, currentlyArchived: boolean) => {
    onUpdateState((draft) => {
      toggleArchiveNote(draft, id);
    });
    showToast(currentlyArchived ? 'Nota restaurada a activas' : 'Nota archivada', 'info');
  };

  const handleConvertToTask = (id: string) => {
    onUpdateState((draft) => {
      convertNoteToTask(draft, id, todayISO());
    });
    showToast('Nota convertida en tarea para Hoy', 'success');
  };

  const handleDeletePostit = (id: string) => {
    onUpdateState((draft) => {
      deleteNote(draft, id);
    });
    showToast('Nota eliminada', 'info');
  };

  const handleAddShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopItem.trim()) return;
    onUpdateState((draft) => {
      if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
      if (!draft.notes.shopping) draft.notes.shopping = [];
      draft.notes.shopping.push({
        id: uid(),
        text: shopItem.trim(),
        done: false,
      });
    });
    setShopItem('');
  };

  const handleToggleShop = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.notes?.shopping) return;
      const item = draft.notes.shopping.find((s) => s.id === id);
      if (item) item.done = !item.done;
    });
  };

  const handleDeleteShop = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.notes?.shopping) return;
      draft.notes.shopping = draft.notes.shopping.filter((s) => s.id !== id);
    });
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkName.trim() || !linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    onUpdateState((draft) => {
      if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
      if (!draft.notes.links) draft.notes.links = [];
      draft.notes.links.push({
        id: uid(),
        name: linkName.trim(),
        url,
      });
    });
    setLinkName('');
    setLinkUrl('');
  };

  const handleDeleteLink = (id: string) => {
    onUpdateState((draft) => {
      if (!draft.notes?.links) return;
      draft.notes.links = draft.notes.links.filter((l) => l.id !== id);
    });
  };

  const handleAddPossession = (event: React.FormEvent) => {
    event.preventDefault();
    if (!possessionName.trim()) return;
    onUpdateState((draft) => {
      if (!draft.notes) draft.notes = { postits: [], shopping: [], links: [], possessions: [] };
      if (!draft.notes.possessions) draft.notes.possessions = [];
      draft.notes.possessions.push({
        id: uid(), name: possessionName.trim(), category: possessionCategory.trim() || 'Otros',
        location: possessionLocation.trim(), receivedAt: possessionDate || null, note: possessionNote.trim(),
      });
    });
    setPossessionName('');
    setPossessionLocation('');
    setPossessionNote('');
  };

  const possessionQuery = possessionSearch.trim().toLocaleLowerCase('es');
  const visiblePossessions = (state.notes?.possessions || []).filter((item) => !possessionQuery || [item.name, item.category, item.location, item.note].some((value) => String(value || '').toLocaleLowerCase('es').includes(possessionQuery)));

  const allNotes = state.notes?.postits || [];
  const totalActiveNotes = allNotes.filter((n) => !n.archived).length;
  const totalPinnedNotes = allNotes.filter((n) => !n.archived && n.pinned).length;
  const totalArchivedNotes = allNotes.filter((n) => n.archived).length;

  const filteredNotes = allNotes.filter((note) => {
    if (noteFilter === 'activas' && note.archived) return false;
    if (noteFilter === 'fijadas' && (note.archived || !note.pinned)) return false;
    if (noteFilter === 'archivadas' && !note.archived) return false;

    const q = noteSearch.trim().toLowerCase();
    if (!q) return true;

    const matchesTitle = note.title ? note.title.toLowerCase().includes(q) : false;
    const matchesText = note.text.toLowerCase().includes(q);
    const matchesTags = note.tags ? note.tags.some((t) => t.toLowerCase().includes(q)) : false;
    const matchesDate = note.date.includes(q);

    return matchesTitle || matchesText || matchesTags || matchesDate;
  });

  const displayedNotes = getSortedNotes(filteredNotes, { includeArchived: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notas & Proyectos"
        subtitle="Proyectos con próximos pasos, metas anuales, notas rápidas, inventario y creación de contenido."
      />

      {/* Subtab navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('notas')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'notas'
              ? 'bg-[var(--text)] text-[var(--bg-elevated)] shadow-sm'
              : 'text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--card)]'
          }`}
        >
          <span>📝 Notas Rápidas</span>
          {totalActiveNotes > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeTab === 'notas'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}
            >
              {totalActiveNotes}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proyectos')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'proyectos'
              ? 'bg-[var(--text)] text-[var(--bg-elevated)] shadow-sm'
              : 'text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--card)]'
          }`}
        >
          <span>🎯 Proyectos & Metas</span>
          {activeProjectsCount > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeTab === 'proyectos'
                  ? 'bg-blue-500 text-white'
                  : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
              }`}
            >
              {activeProjectsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('streaming')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeTab === 'streaming'
              ? 'bg-[var(--text)] text-[var(--bg-elevated)] shadow-sm'
              : 'text-[var(--text-soft)] hover:text-[var(--text)] hover:bg-[var(--card)]'
          }`}
        >
          <span>🎥 Streaming & Contenido</span>
          {status.live && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Tab: Proyectos & Metas */}
      {activeTab === 'proyectos' && (
        <div className="space-y-8">
          {/* Projects Manager */}
          <ProjectsManager state={state} onUpdateState={onUpdateState} />

          {/* Quantitative Goals */}
          <div className="space-y-3 pt-4 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[var(--text)]">Metas Cuantificables 📊</h2>
                <p className="text-xs text-[var(--text-faint)]">Objetivos numéricos vinculados a tu peso, ahorro disponible o seguimiento manual.</p>
              </div>
            </div>

        <form onSubmit={handleAddGoal} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Nombre</label>
            <input
              type="text"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="Ej: Bajar de peso"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Valor inicial</label>
            <input
              type="number"
              value={goalInitial}
              onChange={(e) => setGoalInitial(e.target.value)}
              placeholder="80"
              className="w-24 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Meta</label>
            <input
              type="number"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="72"
              className="w-24 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Vincular a</label>
            <select
              value={goalLinked || ''}
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
            <p className="text-center py-6 text-xs text-[var(--text-faint)] col-span-3">
              Todavía no creaste objetivos.
            </p>
          ) : (
            (state.goals || []).map((g) => {
              const cur = goalCurrentValue(state, g);
              const pct = goalProgressPct(g, cur);
              const isFinancial = g.linked === 'available' || g.linked === 'net_worth' || g.linked === 'resale_profit';

              const fmtVal = (val: number) => {
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
                      onClick={() => handleDeleteGoal(g.id)}
                      className="text-xs text-[var(--text-faint)] hover:text-red-500 px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="font-mono text-2xl font-extrabold text-[var(--text)]">
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
    <div className="space-y-6">
      {/* Post-its / Notas Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <span>Notas & Post-its</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                {totalActiveNotes} {totalActiveNotes === 1 ? 'activa' : 'activas'}
              </span>
            </h2>
            <p className="text-xs text-[var(--text-faint)]">
              Capturas rápidas, ideas, recordatorios y apuntes inmediatos.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold transition shadow-2xs cursor-pointer self-start sm:self-auto"
          >
            <AppIcon name="plus" className="h-3.5 w-3.5 text-white" />
            <span>{showAddForm ? 'Cerrar formulario' : 'Nueva nota'}</span>
          </button>
        </div>

        {/* Quick Add / Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddPostit}
            className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm space-y-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)]">Crear nota</span>
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
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Título (opcional)..."
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)]"
            />

            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Escribí el contenido de la nota..."
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)] resize-y"
              required
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <input
                type="text"
                value={noteTags}
                onChange={(e) => setNoteTags(e.target.value)}
                placeholder="Etiquetas (separadas por comas, ej: ideas, estudio)..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
              />
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
              placeholder="Buscar notas por título, texto o etiqueta..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-[var(--card)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--blue)] outline-none transition"
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
          <div className="flex items-center gap-1 bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border)] text-xs font-bold">
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

        {/* Notes Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
            displayedNotes.map((p) => {
              const relative = formatRelativeTime(p.updatedAt || p.date);
              const isPinned = Boolean(p.pinned);
              const isArchived = Boolean(p.archived);

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-2xl border text-xs space-y-3 flex flex-col justify-between transition-all group ${
                    isPinned
                      ? 'bg-amber-500/10 border-amber-500/30 shadow-2xs'
                      : isArchived
                      ? 'bg-[var(--surface-muted)]/50 border-[var(--border)] opacity-75'
                      : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--blue)]/40 shadow-2xs'
                  }`}
                >
                  {/* Top Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isPinned && (
                        <span className="text-xs shrink-0" title="Nota fijada">📌</span>
                      )}
                      {p.title && (
                        <h3 className={`font-bold text-xs text-[var(--text)] truncate ${state.settings.privacyMode ? 'privacy-sensitive' : ''}`}>
                          {p.title}
                        </h3>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      {/* Pin Toggle */}
                      <button
                        type="button"
                        onClick={() => handleTogglePin(p.id, isPinned)}
                        className={`p-1 rounded-lg transition cursor-pointer ${
                          isPinned
                            ? 'text-amber-600 hover:bg-amber-500/20'
                            : 'text-[var(--text-faint)] hover:text-amber-600 hover:bg-[var(--surface-muted)]'
                        }`}
                        title={isPinned ? 'Desfijar' : 'Fijar arriba'}
                        aria-label={isPinned ? 'Desfijar' : 'Fijar arriba'}
                      >
                        <span className="text-[11px] leading-none">📌</span>
                      </button>

                      {/* Convert to Task */}
                      <button
                        type="button"
                        onClick={() => handleConvertToTask(p.id)}
                        className="p-1 rounded-lg text-[var(--text-faint)] hover:text-emerald-600 hover:bg-emerald-500/10 transition cursor-pointer"
                        title="Convertir en tarea de Hoy"
                        aria-label="Convertir en tarea de Hoy"
                      >
                        <AppIcon name="check" className="h-3 w-3" />
                      </button>

                      {/* Archive Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleArchive(p.id, isArchived)}
                        className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-muted)] transition cursor-pointer"
                        title={isArchived ? 'Desarchivar' : 'Archivar'}
                        aria-label={isArchived ? 'Desarchivar' : 'Archivar'}
                      >
                        <span className="text-[10px] leading-none">{isArchived ? '📤' : '📥'}</span>
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(p)}
                        className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--blue)] hover:bg-blue-500/10 transition cursor-pointer"
                        title="Editar nota"
                        aria-label="Editar nota"
                      >
                        <AppIcon name="edit" className="h-3 w-3" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeletePostit(p.id)}
                        className="p-1 rounded-lg text-[var(--text-faint)] hover:text-rose-600 hover:bg-rose-500/10 transition cursor-pointer"
                        title="Eliminar nota"
                        aria-label="Eliminar nota"
                      >
                        <AppIcon name="trash" className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <p className={`text-[var(--text)] text-xs font-normal whitespace-pre-wrap leading-relaxed ${state.settings.privacyMode ? 'privacy-sensitive' : ''}`}>
                      {p.text}
                    </p>
                  </div>

                  {/* Footer: Tags and Relative Date */}
                  <div className="pt-2 border-t border-[var(--border)]/60 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                    {p.tags && p.tags.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {p.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setNoteSearch(tag)}
                            className="px-1.5 py-0.5 rounded font-medium bg-[var(--surface-muted)] hover:bg-[var(--card)] text-[var(--text-soft)] hover:text-[var(--text)] border border-[var(--border)] transition cursor-pointer"
                            title={`Filtrar por #${tag}`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-center gap-1.5 font-mono text-[var(--text-faint)] shrink-0 ml-auto">
                      {isArchived && (
                        <span className="px-1.5 py-0.2 rounded bg-[var(--surface-muted)] text-[9px] font-sans font-semibold">
                          Archivada
                        </span>
                      )}
                      <span title={p.updatedAt ? `Modificada: ${p.updatedAt}` : `Creada: ${p.date}`}>
                        {relative}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--card)] border border-[var(--border)] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text)]">Editar nota</h3>
              <button
                type="button"
                onClick={() => setEditingNote(null)}
                className="p-1 rounded-lg text-[var(--text-faint)] hover:text-[var(--text)] transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Título (opcional)
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Título de la nota..."
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Contenido
                </label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)] resize-y"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                  Etiquetas (separadas por comas)
                </label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="ideas, recordatorio, trabajo"
                  className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)]"
                />
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
                  onClick={() => setEditingNote(null)}
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

      {/* Mis cosas */}
      <section className="space-y-3 pt-4 border-t border-[var(--border)]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-[var(--text)]">Mis cosas 🎁</h2>
            <p className="text-xs text-[var(--text-soft)]">Registrá regalos y objetos que valorás, dónde están y qué te gusta de tenerlos.</p>
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
          <input value={possessionName} onChange={(event) => setPossessionName(event.target.value)} placeholder="Qué recibiste o querés recordar" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <input value={possessionCategory} onChange={(event) => setPossessionCategory(event.target.value)} placeholder="Categoría" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <input value={possessionLocation} onChange={(event) => setPossessionLocation(event.target.value)} placeholder="Dónde está (opcional)" className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <input type="date" max={todayISO()} value={possessionDate} onChange={(event) => setPossessionDate(event.target.value)} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs" />
          <button className="rounded-xl bg-[var(--blue)] px-4 py-2 text-xs font-extrabold text-white cursor-pointer">Guardar</button>
          <textarea value={possessionNote} onChange={(event) => setPossessionNote(event.target.value)} placeholder="Qué te gusta, quién te lo regaló o por qué lo valorás…" rows={2} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs sm:col-span-2 lg:col-span-5" />
        </form>
        {visiblePossessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-xs text-[var(--text-faint)]">
            {(state.notes?.possessions || []).length ? 'No encontré coincidencias.' : 'Todavía no guardaste nada acá.'}
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
                    onClick={() => onUpdateState((draft) => {
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

      {/* Shopping List & Links (2-column layout) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[var(--border)]">
        {/* Shopping List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text)]">Lista de compras 🛒</h2>
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
                value={shopItem}
                onChange={(e) => setShopItem(e.target.value)}
                placeholder="Ej: Leche, avena..."
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
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
                      onClick={() => handleToggleShop(s.id)}
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
                      onClick={() => handleDeleteShop(s.id)}
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

        {/* Useful Links */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[var(--text)]">Links útiles 🔗</h2>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <form onSubmit={handleAddLink} className="flex flex-wrap gap-2">
              <input
                type="text"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="Nombre (ej: Campus)"
                className="w-32 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-[140px] px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
              >
                ＋
              </button>
            </form>

            <div className="divide-y divide-[var(--border)] max-h-60 overflow-y-auto">
              {(state.notes?.links || []).length === 0 ? (
                <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin links guardados.</p>
              ) : (
                (state.notes?.links || []).map((l) => (
                  <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--blue)] font-bold hover:underline truncate max-w-[200px] sm:max-w-[280px]"
                    >
                      {l.name}
                    </a>
                    <button
                      onClick={() => handleDeleteLink(l.id)}
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
      </div>
    </div>
  )}

  {/* Tab: Streaming & Contenido */}
  {activeTab === 'streaming' && (
    <div className="space-y-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-[var(--text)]">
              {status.live ? `En directo hoy (${status.hours} h)` : 'Sin stream hoy'}
            </h3>
            <p className="text-xs text-[var(--text-faint)]">Monitoreo mensual de directos y producción de contenido.</p>
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
              value={streamDate}
              onChange={(e) => setStreamDate(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Horas</label>
            <input
              type="number"
              step="0.1"
              value={streamHours}
              onChange={(e) => setStreamHours(e.target.value)}
              placeholder="2.5"
              className="w-20 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
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
                <h3 className="text-xs font-extrabold text-[var(--text)]">Checklist pre-stream</h3>
                <p className="text-[10px] text-[var(--text-faint)]">Un toque por punto; reinicialo antes del próximo directo.</p>
              </div>
              <button
                type="button"
                onClick={() => onUpdateState((draft) => (draft.streaming?.preStreamChecklist || []).forEach((item) => { item.done = false; }))}
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
                    onClick={() => onUpdateState((draft) => { const target = (draft.streaming?.preStreamChecklist || []).find((candidate) => candidate.id === item.id); if (target) target.done = !target.done; })}
                    className={`flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs cursor-pointer ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border)] text-transparent'}`}
                  >
                    ✓
                  </button>
                  <span className={`min-w-0 flex-1 text-xs font-semibold ${item.done ? 'line-through' : ''}`}>{item.label}</span>
                  <button
                    type="button"
                    onClick={() => onUpdateState((draft) => { if (draft.streaming?.preStreamChecklist) draft.streaming.preStreamChecklist = draft.streaming.preStreamChecklist.filter((candidate) => candidate.id !== item.id); })}
                    className="text-[10px] text-[var(--text-faint)] hover:text-rose-500 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddChecklistItem} className="mt-2 flex gap-1.5">
              <input
                value={checklistLabel}
                onChange={(event) => setChecklistLabel(event.target.value)}
                placeholder="Nuevo control…"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs"
              />
              <button className="rounded-lg bg-[var(--text)] px-2.5 text-xs font-bold text-[var(--bg)] cursor-pointer">＋</button>
            </form>
          </section>

          <section className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div>
              <h3 className="text-xs font-extrabold text-[var(--text)]">Pipeline de contenido</h3>
              <p className="text-[10px] text-[var(--text-faint)]">De la idea a publicado sin abrir otra herramienta.</p>
            </div>
            <form onSubmit={handleAddContent} className="mt-2 flex gap-1.5">
              <input
                value={contentTitle}
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
                              onChange={(event) => onUpdateState((draft) => { const target = (draft.streaming?.contentPipeline || []).find((candidate) => candidate.id === item.id); if (target) { target.status = event.target.value as typeof item.status; target.updatedAt = new Date().toISOString(); } })}
                              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-1 py-1 text-[9px]"
                            >
                              {pipelineStages.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => onUpdateState((draft) => { if (draft.streaming?.contentPipeline) draft.streaming.contentPipeline = draft.streaming.contentPipeline.filter((candidate) => candidate.id !== item.id); })}
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
