import React, { useState } from 'react';
import { LifeOSState, ViewType } from '../types';
import { playSound } from '../lib/audio';
import { WeatherWidget } from './WeatherWidget';
import {
  todayISO,
  daysBetween,
  fmtMoney,
  stars,
  uid,
} from '../lib/storage';
import {
  findNowAndNext,
  todayItems,
  calcAccountsTotal,
  jobStats,
  resaleStats,
  nextExam,
  currentWeight,
  studyMinutesForDate,
} from '../lib/calculations';

interface DashboardViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
  onExportJSON: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onExportJSON,
}) => {
  const [extraText, setExtraText] = useState('');
  const [extraPriority, setExtraPriority] = useState<'alta' | 'media' | 'baja'>('media');

  const greeting = () => {
    const h = new Date().getHours();
    let g = 'Buenas noches';
    if (h >= 5 && h < 12) g = 'Buenos días';
    else if (h >= 12 && h < 19) g = 'Buenas tardes';
    const name = state.profile.name ? `, ${state.profile.name}` : '';
    return g + name;
  };

  const { current, next } = findNowAndNext(state);
  const disponible = calcAccountsTotal(state);
  const jstats = jobStats(state);
  const rstats = resaleStats(state);
  const exam = nextExam(state);
  const items = todayItems(state);
  const weight = currentWeight(state);
  const studyMin = studyMinutesForDate(state, todayISO());

  const daysSinceBackup = state.settings.lastBackupAt
    ? daysBetween(state.settings.lastBackupAt, todayISO())
    : null;
  const backupUrgent = daysSinceBackup === null || daysSinceBackup >= 3;

  const handleAddExtra = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraText.trim()) return;
    onUpdateState((draft) => {
      draft.todayExtras.push({
        id: uid(),
        date: todayISO(),
        text: extraText.trim(),
        done: false,
        priority: extraPriority,
      });
    });
    setExtraText('');
  };

  const handleToggleItem = (item: ReturnType<typeof todayItems>[0]) => {
    playSound('success');
    onUpdateState((draft) => {
      const iso = todayISO();
      if (item.kind === 'toggle-task-today') {
        if (!draft.taskLog[iso]) draft.taskLog[iso] = {};
        draft.taskLog[iso][item.id] = !draft.taskLog[iso][item.id];
      } else if (item.kind === 'toggle-extra-today') {
        const extra = draft.todayExtras.find((x) => x.id === item.id);
        if (extra) extra.done = !extra.done;
      } else if (item.kind === 'complete-followup') {
        const app = draft.jobs.applications.find((a) => a.id === item.id);
        if (app) {
          app.nextAction = '';
          app.nextActionDate = '';
        }
      }
    });
  };

  const handleDeleteExtra = (id: string) => {
    onUpdateState((draft) => {
      draft.todayExtras = draft.todayExtras.filter((x) => x.id !== id);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">{greeting()} 👋</h1>
          <p className="text-sm text-[var(--text-soft)]">
            {new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="w-full md:w-auto md:min-w-[320px]">
          <WeatherWidget />
        </div>
      </div>

      {backupUrgent && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm font-semibold text-red-600 dark:text-red-400">
            ⚠️ {daysSinceBackup === null ? 'Todavía no exportaste ningún backup.' : `Hace ${daysSinceBackup} día(s) que no exportás un backup.`} Tus datos solo existen acá — exportalos por las dudas.
          </div>
          <button
            onClick={onExportJSON}
            className="px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors shrink-0 cursor-pointer"
          >
            ⬇ Exportar backup ahora
          </button>
        </div>
      )}

      {/* Now & Next Banner */}
      <div className="rounded-2xl p-5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-violet-500/10 border border-[var(--border)] hover:border-[var(--border-hover)] transition-all shadow-xs flex flex-col sm:flex-row items-start sm:items-center gap-4 relative overflow-hidden group">
        <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
        <div className="relative flex-shrink-0 z-10">
          <div className="w-3.5 h-3.5 rounded-full bg-blue-500 relative">
            <div className="absolute -inset-1 rounded-full border-2 border-blue-500 animate-ping opacity-75" />
          </div>
        </div>
        <div className="z-10">
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Ahora</span>
          <p className="text-base font-extrabold text-[var(--text)] tracking-tight">
            {current ? `${current.activity} · ${current.time}` : 'Sin actividad programada'}
          </p>
        </div>
        <div className="sm:ml-auto text-left sm:text-right text-xs text-[var(--text-soft)] z-10">
          <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-faint)]">Próximo</span>
          <div className="font-extrabold text-[var(--text)] text-sm">
            {next ? `${next.time} — ${next.activity}` : '—'}
          </div>
        </div>
      </div>

      {/* Today Checklist */}
      <div className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-all rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-[var(--text)] flex items-center gap-2">
              Hoy
              <span className="text-xs font-bold text-[var(--blue)] bg-[var(--blue-soft)] px-2.5 py-0.5 rounded-lg border border-blue-500/20">
                {items.filter((i) => !i.done).length} pendiente(s)
              </span>
            </h2>
            <p className="text-xs text-[var(--text-soft)] mt-0.5">Ordenado automáticamente por prioridad — lo más urgente, arriba.</p>
          </div>
        </div>

        <form onSubmit={handleAddExtra} className="flex flex-wrap items-end gap-2 p-3 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Agregar algo para hoy</label>
            <input
              type="text"
              value={extraText}
              onChange={(e) => setExtraText(e.target.value)}
              placeholder="Ej: Enviar 2 CV, Reparar laptop..."
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Prioridad</label>
            <select
              value={extraPriority}
              onChange={(e) => setExtraPriority(e.target.value as 'alta' | 'media' | 'baja')}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
          >
            ＋ Agregar
          </button>
        </form>

        <div className="divide-y divide-[var(--border)]">
          {items.length === 0 ? (
            <p className="text-center py-6 text-xs text-[var(--text-faint)] font-medium">No tenés nada cargado para hoy todavía.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center gap-3 group/item hover:bg-[var(--bg)]/50 px-2 rounded-xl transition-colors">
                <button
                  type="button"
                  onClick={() => handleToggleItem(item)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs transition-all shrink-0 cursor-pointer ${
                    item.done
                      ? 'bg-emerald-500 border-emerald-500 text-white scale-105'
                      : 'border-[var(--border)] bg-[var(--bg-elevated)] text-transparent hover:border-[var(--blue)]'
                  }`}
                >
                  ✓
                </button>
                <span className="text-amber-500 text-xs tracking-wider min-w-[65px]">
                  {item.done ? '' : stars(item.priority)}
                </span>
                <span className={`flex-1 text-xs sm:text-sm ${item.done ? 'line-through text-[var(--text-faint)]' : 'text-[var(--text)] font-semibold'}`}>
                  {item.text}
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${
                    item.source === 'agenda'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                      : item.source === 'rutina'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : item.source === 'trabajo'
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  }`}
                >
                  {item.source === 'agenda'
                    ? '📅 agenda'
                    : item.source === 'rutina'
                    ? '🔁 rutina'
                    : item.source === 'trabajo'
                    ? '💼 seguimiento'
                    : '✏️ extra'}
                </span>
                {item.source === 'extra' && (
                  <button
                    onClick={() => handleDeleteExtra(item.id)}
                    className="text-xs text-[var(--text-faint)] hover:text-red-500 px-1 py-0.5 rounded-xs transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panorama Grid */}
      <div>
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Panorama General</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            onClick={() => onNavigate('trabajo')}
            className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--blue)] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">💼 Empleo</span>
            <div className="text-2xl font-black font-mono mt-1 text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">{jstats.ofertasNuevas}</div>
            <p className="text-xs text-[var(--text-soft)] mt-1 font-medium">oferta(s) nueva(s)</p>
          </div>

          <div
            onClick={() => onNavigate('reventa')}
            className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--blue)] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🔁 Reventa</span>
            <div className="text-2xl font-black font-mono mt-1 text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">{rstats.oportunidadesNuevas}</div>
            <p className="text-xs text-[var(--text-soft)] mt-1 font-medium">oportunidad(es)</p>
          </div>

          <div
            onClick={() => onNavigate('finanzas')}
            className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--blue)] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">💰 Disponible</span>
            <div className="text-xl sm:text-2xl font-black font-mono mt-1 text-emerald-600 dark:text-emerald-400">{fmtMoney(disponible)}</div>
          </div>

          <div
            onClick={() => onNavigate('estudios')}
            className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--blue)] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📚 Próximo examen</span>
            <div className="text-sm font-extrabold mt-1 text-[var(--text)] truncate group-hover:text-[var(--blue)] transition-colors">
              {exam ? state.study.subjects.find((s) => s.id === exam.subjectId)?.name || '—' : '—'}
            </div>
            <p className="text-xs text-[var(--text-soft)] mt-1 font-medium">
              {exam ? `${daysBetween(todayISO(), exam.date)} día(s)` : 'sin exámenes'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div>
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Resumen Rápido</h2>
        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => onNavigate('gimnasio')}
            className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--blue)] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">⚖️ Peso Corporal</span>
            <div className="text-xl font-black font-mono mt-1 text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">
              {weight != null ? `${weight} kg` : '—'}
            </div>
          </div>

          <div
            onClick={() => onNavigate('estudios')}
            className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--blue)] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all cursor-pointer group"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📖 Estudio Hoy</span>
            <div className="text-xl font-black font-mono mt-1 text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">{studyMin} min</div>
          </div>
        </div>
      </div>

      <button
        onClick={() => onNavigate('checkout')}
        className="w-full py-4 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold rounded-2xl text-sm transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
      >
        <span>🌙</span> Check-out del Día
      </button>
    </div>
  );
};
