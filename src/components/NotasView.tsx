import React, { useState } from 'react';
import { LifeOSState, Goal } from '../types';
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

interface NotasViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const NotasView: React.FC<NotasViewProps> = ({ state, onUpdateState }) => {
  const [streamDate, setStreamDate] = useState(todayISO());
  const [streamHours, setStreamHours] = useState('');

  const [goalName, setGoalName] = useState('');
  const [goalInitial, setGoalInitial] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalLinked, setGoalLinked] = useState<'weight' | 'available' | null>(null);

  const [postitText, setPostitText] = useState('');
  const [shopItem, setShopItem] = useState('');

  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const status = todayStreamStatus(state);
  const streamGoal = Number(state.streaming.monthlyGoal || 0);
  const streamCount = streamSessionsInMonth(state, 0).length;
  const streamPct = streamGoal > 0 ? clamp((streamCount / streamGoal) * 100, 0, 100) : 0;

  const handleAddStream = (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Number(streamHours);
    if (!hours) return;
    onUpdateState((draft) => {
      const date = streamDate || todayISO();
      draft.streaming.sessions = draft.streaming.sessions.filter((s) => s.date !== date);
      draft.streaming.sessions.push({ id: uid(), date, hours });
    });
    setStreamHours('');
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalName.trim()) return;
    const initial = Number(goalInitial) || 0;
    const target = Number(goalTarget) || 0;
    onUpdateState((draft) => {
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
      const targetGoal = draft.goals.find((x) => x.id === g.id);
      if (targetGoal) targetGoal.current = !isNaN(num) ? num : targetGoal.current;
    });
  };

  const handleDeleteGoal = (id: string) => {
    onUpdateState((draft) => {
      draft.goals = draft.goals.filter((g) => g.id !== id);
    });
  };

  const handleAddPostit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postitText.trim()) return;
    onUpdateState((draft) => {
      draft.notes.postits.push({
        id: uid(),
        text: postitText.trim(),
        date: todayISO(),
      });
    });
    setPostitText('');
  };

  const handleDeletePostit = (id: string) => {
    onUpdateState((draft) => {
      draft.notes.postits = draft.notes.postits.filter((p) => p.id !== id);
    });
  };

  const handleAddShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopItem.trim()) return;
    onUpdateState((draft) => {
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
      const item = draft.notes.shopping.find((s) => s.id === id);
      if (item) item.done = !item.done;
    });
  };

  const handleDeleteShop = (id: string) => {
    onUpdateState((draft) => {
      draft.notes.shopping = draft.notes.shopping.filter((s) => s.id !== id);
    });
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkName.trim() || !linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//.test(url)) url = 'https://' + url;
    onUpdateState((draft) => {
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
      draft.notes.links = draft.notes.links.filter((l) => l.id !== id);
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Notas & Objetivos</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Objetivos, post-its, lista de compras, links útiles y streaming.
        </p>
      </div>

      {/* Streaming Card */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Streaming 🎥</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-extrabold text-[var(--text)]">
              {status.live ? `${status.hours} h hoy` : 'Sin stream hoy'}
            </span>
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
              ＋
            </button>
          </form>
        </div>
      </div>

      {/* Goals Section */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Objetivos 🎯</h2>

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
              <option value="weight">Peso corporal</option>
              <option value="available">Dinero disponible</option>
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
          {state.goals.length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)] col-span-3">
              Todavía no creaste objetivos.
            </p>
          ) : (
            state.goals.map((g) => {
              const cur = goalCurrentValue(state, g);
              const pct = goalProgressPct(g, cur);

              return (
                <div key={g.id} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 relative overflow-hidden space-y-3">
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
                    {g.linked === 'available' ? fmtMoney(cur) : Number(cur).toFixed(1)}
                    <span className="text-xs font-normal text-[var(--text-faint)] ml-1">
                      / {g.linked === 'available' ? fmtMoney(g.target) : g.target}
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-[var(--bg)] overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      {g.linked === 'weight' ? '⚖️ Peso' : g.linked === 'available' ? '💰 Disponible' : '✋ Manual'}
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

      {/* Post-its Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Post-its</h2>

        <form onSubmit={handleAddPostit} className="flex gap-2 p-3 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <input
            type="text"
            value={postitText}
            onChange={(e) => setPostitText(e.target.value)}
            placeholder="Escribí algo..."
            className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 cursor-pointer"
          >
            ＋
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {state.notes.postits.length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)] col-span-3">Sin post-its.</p>
          ) : (
            [...state.notes.postits]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((p) => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2 relative min-h-[90px] flex flex-col justify-between"
                >
                  <button
                    onClick={() => handleDeletePostit(p.id)}
                    className="absolute top-2 right-2 text-xs text-[var(--text-faint)] hover:text-red-500"
                  >
                    ✕
                  </button>
                  <p className="text-[var(--text)] font-medium pr-4 whitespace-pre-wrap">{p.text}</p>
                  <span className="font-mono text-[10px] text-[var(--text-faint)]">{fmtDate(p.date)}</span>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Shopping List */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--text)]">Lista de compras</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <form onSubmit={handleAddShop} className="flex gap-2">
            <input
              type="text"
              value={shopItem}
              onChange={(e) => setShopItem(e.target.value)}
              placeholder="Ej: Leche"
              className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
            >
              ＋
            </button>
          </form>

          <div className="divide-y divide-[var(--border)]">
            {state.notes.shopping.length === 0 ? (
              <p className="text-center py-4 text-xs text-[var(--text-faint)]">Lista vacía.</p>
            ) : (
              state.notes.shopping.map((s) => (
                <div key={s.id} className="py-2 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => handleToggleShop(s.id)}
                    className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] ${
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
                    className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
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
        <h2 className="text-sm font-bold text-[var(--text)]">Links útiles</h2>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <form onSubmit={handleAddLink} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="Ej: Campus virtual"
              className="w-36 px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 min-w-[180px] px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-lg cursor-pointer"
            >
              ＋
            </button>
          </form>

          <div className="divide-y divide-[var(--border)]">
            {state.notes.links.length === 0 ? (
              <p className="text-center py-4 text-xs text-[var(--text-faint)]">Sin links guardados.</p>
            ) : (
              state.notes.links.map((l) => (
                <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--blue)] font-bold hover:underline truncate max-w-[280px] sm:max-w-[400px]"
                  >
                    {l.name}
                  </a>
                  <button
                    onClick={() => handleDeleteLink(l.id)}
                    className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1"
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
  );
};
