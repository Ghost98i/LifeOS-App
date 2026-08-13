import React, { useState } from 'react';
import type { DailyPriority, LifeOSState, ViewType } from '../types';
import { playSound } from '../lib/audio';
import { WeatherWidget } from './WeatherWidget';
import { TodayFocus } from './TodayFocus';
import { PersonalContextCard } from './PersonalContextCard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { todayISO, daysBetween, fmtMoney, stars, uid } from '../lib/storage';
import {
  findNowAndNext,
  todayItems,
  calcAccountsTotal,
  jobStats,
  resaleStats,
  nextExam,
  currentWeight,
  studyMinutesForDate,
  type TodayItem,
} from '../lib/calculations';

interface DashboardViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
  onExportJSON: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ state, onUpdateState, onNavigate, onExportJSON }) => {
  const [extraText, setExtraText] = useState('');
  const [extraPriority, setExtraPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const iso = todayISO();
  const { current, next } = findNowAndNext(state);
  const items = todayItems(state);
  const priorities = state.dailyPriorities.filter((item) => item.date === iso);
  const dayClosed = Boolean(state.checkoutLog[iso]?.closedAt);
  const daysSinceBackup = state.settings.lastBackupAt ? daysBetween(state.settings.lastBackupAt, iso) : null;
  const showBackupReminder = daysSinceBackup === null || daysSinceBackup >= 7;

  const greeting = () => {
    const hour = new Date().getHours();
    const phrase = hour >= 5 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    return `${phrase}${state.profile.name ? `, ${state.profile.name}` : ''}`;
  };

  const handleAddExtra = (event: React.FormEvent) => {
    event.preventDefault();
    if (!extraText.trim()) return;
    onUpdateState((draft) => {
      draft.todayExtras.push({ id: uid(), date: iso, text: extraText.trim(), done: false, priority: extraPriority });
    });
    setExtraText('');
  };

  const handleToggleItem = (item: TodayItem) => {
    onUpdateState((draft) => {
      let done = true;
      if (item.kind === 'toggle-task-today') {
        if (!draft.taskLog[iso]) draft.taskLog[iso] = {};
        done = !draft.taskLog[iso][item.id];
        draft.taskLog[iso][item.id] = done;
      } else if (item.kind === 'toggle-extra-today') {
        const extra = draft.todayExtras.find((candidate) => candidate.id === item.id);
        if (extra) { extra.done = !extra.done; done = extra.done; }
      } else {
        const application = draft.jobs.applications.find((candidate) => candidate.id === item.id);
        if (application) { application.nextAction = ''; application.nextActionDate = ''; }
      }
      draft.dailyPriorities
        .filter((priority) => priority.date === iso && priority.sourceItemId === item.id && priority.sourceKind === item.kind)
        .forEach((priority) => { priority.done = done; });
      if (done) playSound('success');
    });
  };

  const handlePinItem = (item: TodayItem) => {
    onUpdateState((draft) => {
      const dayPriorities = draft.dailyPriorities.filter((priority) => priority.date === iso);
      const existing = dayPriorities.find((priority) => priority.sourceItemId === item.id && priority.sourceKind === item.kind);
      if (existing) {
        draft.dailyPriorities = draft.dailyPriorities.filter((priority) => priority.id !== existing.id);
      } else if (dayPriorities.length < 3) {
        draft.dailyPriorities.push({
          id: uid(), date: iso, text: item.text, done: item.done,
          rank: (dayPriorities.length + 1) as 1 | 2 | 3,
          sourceItemId: item.id, sourceKind: item.kind,
        });
      }
      draft.dailyPriorities.filter((priority) => priority.date === iso).sort((a, b) => a.rank - b.rank).forEach((priority, index) => { priority.rank = (index + 1) as 1 | 2 | 3; });
    });
  };

  const handleAddPriority = (text: string) => {
    onUpdateState((draft) => {
      const dayPriorities = draft.dailyPriorities.filter((priority) => priority.date === iso);
      if (dayPriorities.length >= 3) return;
      const extraId = uid();
      draft.todayExtras.push({ id: extraId, date: iso, text, done: false, priority: 'alta' });
      draft.dailyPriorities.push({
        id: uid(), date: iso, text, done: false,
        rank: (dayPriorities.length + 1) as 1 | 2 | 3,
        sourceItemId: extraId, sourceKind: 'toggle-extra-today',
      });
    });
  };

  const handleTogglePriority = (priority: DailyPriority) => {
    const linked = priority.sourceItemId && priority.sourceKind
      ? items.find((item) => item.id === priority.sourceItemId && item.kind === priority.sourceKind)
      : null;
    if (linked) { handleToggleItem(linked); return; }
    onUpdateState((draft) => {
      const target = draft.dailyPriorities.find((item) => item.id === priority.id);
      if (target) { target.done = !target.done; if (target.done) playSound('success'); }
    });
  };

  const handleRemovePriority = (id: string) => {
    onUpdateState((draft) => {
      draft.dailyPriorities = draft.dailyPriorities.filter((priority) => priority.id !== id);
      draft.dailyPriorities.filter((priority) => priority.date === iso).sort((a, b) => a.rank - b.rank).forEach((priority, index) => { priority.rank = (index + 1) as 1 | 2 | 3; });
    });
  };

  const handleDeleteExtra = (id: string) => {
    onUpdateState((draft) => {
      draft.todayExtras = draft.todayExtras.filter((item) => item.id !== id);
      draft.dailyPriorities = draft.dailyPriorities.filter((priority) => priority.sourceItemId !== id);
      draft.dailyPriorities.filter((priority) => priority.date === iso).sort((a, b) => a.rank - b.rank).forEach((priority, index) => { priority.rank = (index + 1) as 1 | 2 | 3; });
    });
  };

  const panorama = [
    { label: '💰 Disponible', value: fmtMoney(calcAccountsTotal(state)), detail: 'en tus cuentas', view: 'finanzas' as ViewType, accent: 'text-emerald-600 dark:text-emerald-400' },
    { label: '💼 Empleo', value: String(jobStats(state).ofertasNuevas), detail: 'oferta(s) nueva(s)', view: 'trabajo' as ViewType },
    { label: '🔁 Reventa', value: String(resaleStats(state).oportunidadesNuevas), detail: 'oportunidad(es)', view: 'reventa' as ViewType },
    { label: '📚 Próximo examen', value: nextExam(state) ? state.study.subjects.find((subject) => subject.id === nextExam(state)?.subjectId)?.name || '—' : '—', detail: nextExam(state) ? `${daysBetween(iso, nextExam(state)!.date)} día(s)` : 'sin exámenes', view: 'estudios' as ViewType },
    { label: '📖 Estudio hoy', value: `${studyMinutesForDate(state, iso)} min`, detail: 'tiempo registrado', view: 'estudios' as ViewType },
    { label: '⚖️ Peso / cuerpo', value: currentWeight(state) != null ? `${currentWeight(state)} kg` : '—', detail: 'último registro', view: 'gimnasio' as ViewType },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{greeting()} 👋</h1>
          <p className="text-sm text-[var(--text-soft)]">{new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <div className="min-w-0 sm:min-w-[300px]"><WeatherWidget /></div>
          <button onClick={() => onNavigate('checkout')} className={`rounded-2xl px-4 py-3 text-sm font-extrabold text-white shadow-sm ${dayClosed ? 'bg-emerald-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
            {dayClosed ? 'Día cerrado ✓' : '🌙 Cerrar día'}
          </button>
        </div>
      </header>

      {showBackupReminder && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-[var(--text-soft)]">
          <span>Respaldo portátil: {daysSinceBackup === null ? 'todavía no hiciste uno' : `último hace ${daysSinceBackup} días`}.</span>
          <button onClick={onExportJSON} className="font-bold text-amber-700 hover:underline dark:text-amber-300">Exportar ahora</button>
        </div>
      )}

      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-blue-500 ring-4 ring-blue-500/15" />
          <div><span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Ahora</span><p className="font-extrabold text-[var(--text)]">{current ? `${current.activity} · ${current.time}` : 'Sin actividad programada'}</p></div>
          <div className="sm:ml-auto sm:text-right"><span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Próximo</span><p className="text-sm font-extrabold text-[var(--text)]">{next ? `${next.time} — ${next.activity}` : '—'}</p></div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-base font-extrabold text-[var(--text)]">Hoy <span className="ml-1 rounded-lg border border-blue-500/20 bg-[var(--blue-soft)] px-2 py-0.5 text-xs text-[var(--blue)]">{items.filter((item) => !item.done).length} pendiente(s)</span></h2><p className="mt-0.5 text-xs text-[var(--text-soft)]">Tu agenda, rutina, extras y seguimientos en un solo lugar.</p></div>
        </div>

        <TodayFocus priorities={priorities} onAdd={handleAddPriority} onToggle={handleTogglePriority} onRemove={handleRemovePriority} />

        <form onSubmit={handleAddExtra} className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-3">
          <label className="min-w-[190px] flex-1"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Agregar algo para hoy</span><input value={extraText} onChange={(event) => setExtraText(event.target.value)} placeholder="Ej: Enviar 2 CV" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs outline-none focus:border-[var(--blue)]" /></label>
          <label><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">Prioridad</span><select value={extraPriority} onChange={(event) => setExtraPriority(event.target.value as typeof extraPriority)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-xs"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
          <button className="rounded-lg bg-[var(--blue)] px-3.5 py-2 text-xs font-bold text-white">＋ Agregar</button>
        </form>

        <div className="divide-y divide-[var(--border)]">
          {items.length === 0 ? <p className="py-5 text-center text-xs text-[var(--text-faint)]">No tenés nada cargado para hoy todavía.</p> : items.map((item) => {
            const pinned = priorities.some((priority) => priority.sourceItemId === item.id && priority.sourceKind === item.kind);
            return <div key={`${item.kind}-${item.id}`} className="group flex items-center gap-2 rounded-xl px-1 py-2.5 hover:bg-[var(--bg)] sm:gap-3">
              <button type="button" onClick={() => handleToggleItem(item)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border)] text-transparent hover:border-[var(--blue)]'}`}>✓</button>
              <span className="hidden min-w-[65px] text-xs tracking-wider text-amber-500 sm:inline">{item.done ? '' : stars(item.priority)}</span>
              <span className={`min-w-0 flex-1 text-xs sm:text-sm ${item.done ? 'text-[var(--text-faint)] line-through' : 'font-semibold text-[var(--text)]'}`}>{item.text}</span>
              <button type="button" onClick={() => handlePinItem(item)} disabled={!pinned && priorities.length >= 3} title={pinned ? 'Quitar de las tres' : priorities.length >= 3 ? 'Ya elegiste tres prioridades' : 'Elegir como una de las tres'} className={`px-1 text-base ${pinned ? 'text-amber-500' : 'text-[var(--text-faint)] hover:text-amber-500'} disabled:cursor-not-allowed disabled:opacity-25`}>{pinned ? '★' : '☆'}</button>
              <span className="hidden rounded-lg border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-soft)] sm:inline-block">{item.source === 'agenda' ? '📅 agenda' : item.source === 'rutina' ? '🔁 rutina' : item.source === 'trabajo' ? '💼 seguimiento' : '✏️ extra'}</span>
              {item.source === 'extra' && <button type="button" onClick={() => handleDeleteExtra(item.id)} className="px-1 text-xs text-[var(--text-faint)] hover:text-red-500">✕</button>}
            </div>;
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PersonalContextCard state={state} onUpdateState={onUpdateState} />
        <WeeklyReviewCard state={state} onUpdateState={onUpdateState} onNavigate={onNavigate} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold text-[var(--text)]">Panorama</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {panorama.map((card) => <button key={card.label} type="button" onClick={() => onNavigate(card.view)} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left shadow-xs hover:border-[var(--blue)] hover:shadow-md"><span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{card.label}</span><strong className={`mt-1 block truncate text-xl font-black ${card.accent || 'text-[var(--text)]'}`} title={card.value}>{card.value}</strong><span className="mt-1 block text-xs text-[var(--text-soft)]">{card.detail}</span></button>)}
        </div>
      </section>

    </div>
  );
};
