import React, { useState } from 'react';
import { LifeOSState, ViewType } from '../types';
import { playSound } from '../lib/audio';
import { WeatherWidget } from './WeatherWidget';
import { TodayFocus } from './TodayFocus';
import { PersonalContextCard } from './PersonalContextCard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { AppIcon } from './AppIcon';
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
  calcIncomeMonth,
  calcSpentMonth,
  cashFlow30Days,
  todayGymStatus,
  jobStats,
  resaleStats,
  nextExam,
  currentWeight,
} from '../lib/calculations';
import { showToast } from '../lib/toast';

interface DashboardViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onNavigate: (view: ViewType) => void;
  onExportJSON: () => void;
  onOpenSearch?: () => void;
  onOpenCapture?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onUpdateState,
  onNavigate,
  onExportJSON,
  onOpenCapture,
}) => {
  const [extraText, setExtraText] = useState('');
  const [extraPriority, setExtraPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [taskFilter, setTaskFilter] = useState<'all' | 'pending' | 'done'>('all');

  const todayIso = todayISO();
  const greeting = () => {
    const h = new Date().getHours();
    let g = 'Buenas noches';
    if (h >= 5 && h < 12) g = 'Buenos días';
    else if (h >= 12 && h < 19) g = 'Buenas tardes';
    const name = state.profile.name ? `, ${state.profile.name}` : '';
    return g + name;
  };

  const { current, next } = findNowAndNext(state);

  // Financial clarity
  const totalCuentas = calcAccountsTotal(state);
  const cashFlow = cashFlow30Days(state, todayIso);
  const libreProyectado = cashFlow.projectedBalance;
  const ingresoMes = calcIncomeMonth(state, 0);
  const gastoMes = calcSpentMonth(state, 0);
  const balanceMes = ingresoMes - gastoMes;

  // Gym clarity
  const gymStatus = todayGymStatus(state, todayIso);
  const weight = currentWeight(state);

  // General metrics & radar
  const jstats = jobStats(state);
  const rstats = resaleStats(state);
  const exam = nextExam(state);
  const items = todayItems(state);

  const daysSinceBackup = state.settings.lastBackupAt
    ? daysBetween(state.settings.lastBackupAt, todayIso)
    : null;
  const backupUrgent = daysSinceBackup === null || daysSinceBackup >= 3;

  // Today's priorities
  const todayPriorities = state.dailyPriorities.filter((p) => p.date === todayIso);

  const handleAddPriority = (text: string) => {
    onUpdateState((draft) => {
      const existing = draft.dailyPriorities.filter((p) => p.date === todayIso);
      const usedRanks = existing.map((p) => p.rank || 0);
      const nextRank = [1, 2, 3].find((r) => !usedRanks.includes(r)) || existing.length + 1;
      draft.dailyPriorities.push({
        id: uid(),
        date: todayIso,
        text: text.trim(),
        done: false,
        rank: nextRank,
      });
    });
    showToast('Prioridad agregada para hoy.');
  };

  const handleTogglePriority = (priority: typeof todayPriorities[0]) => {
    playSound('success');
    onUpdateState((draft) => {
      const p = draft.dailyPriorities.find((x) => x.id === priority.id);
      if (p) p.done = !p.done;
    });
  };

  const handleRemovePriority = (id: string) => {
    onUpdateState((draft) => {
      draft.dailyPriorities = draft.dailyPriorities.filter((x) => x.id !== id);
    });
  };

  const handleAddExtra = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraText.trim()) return;
    onUpdateState((draft) => {
      draft.todayExtras.push({
        id: uid(),
        date: todayIso,
        text: extraText.trim(),
        done: false,
        priority: extraPriority,
      });
    });
    setExtraText('');
    showToast('Tarea agregada para hoy.');
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

  const handleToggleRestDay = () => {
    onUpdateState((draft) => {
      if (!draft.gym.restDays) draft.gym.restDays = [];
      const idx = draft.gym.restDays.indexOf(todayIso);
      if (idx >= 0) {
        draft.gym.restDays.splice(idx, 1);
        if (draft.checkoutLog[todayIso]) draft.checkoutLog[todayIso].trainedSkipped = false;
        showToast('Descanso cancelado.');
      } else {
        draft.gym.restDays.push(todayIso);
        if (!draft.checkoutLog[todayIso]) draft.checkoutLog[todayIso] = {};
        draft.checkoutLog[todayIso].trainedSkipped = true;
        showToast('Hoy marcado como descanso activo. Racha protegida.');
      }
    });
  };

  const filteredItems = items.filter((item) => {
    if (taskFilter === 'pending') return !item.done;
    if (taskFilter === 'done') return item.done;
    return true;
  });

  const pendingItemsCount = items.filter((i) => !i.done).length;
  const hasUrgentAlerts = jstats.seguimientosPendientes > 0 || (exam && daysBetween(todayIso, exam.date) <= 7) || rstats.oportunidadesNuevas > 0;

  return (
    <div className="space-y-6">
      {/* Top Header Hero */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="eyebrow block mb-0.5 text-[var(--blue)]">Tu centro de operaciones</span>
          <h1 className="page-heading">{greeting()}</h1>
          <p className="page-subtitle capitalize">
            {new Date().toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {onOpenCapture && (
            <button
              type="button"
              onClick={onOpenCapture}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
            >
              <AppIcon name="plus" className="h-3.5 w-3.5" />
              <span>Captura rápida</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('checkout')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-muted)] text-xs font-bold text-[var(--text)] transition-all cursor-pointer shadow-2xs"
            title="Cerrar el día en 30 segundos"
          >
            <AppIcon name="moon" className="h-3.5 w-3.5 text-violet-500" />
            <span>Check-out del Día</span>
          </button>

          <div className="w-full sm:w-auto">
            <WeatherWidget />
          </div>
        </div>
      </div>

      {/* Urgent Backup Alert (Compact) */}
      {backupUrgent && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <AppIcon name="shield" className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {daysSinceBackup === null
                ? 'Todavía no exportaste un backup de tus datos locales.'
                : `Hace ${daysSinceBackup} días que no realizás una copia de seguridad.`}
            </span>
          </div>
          <button
            type="button"
            onClick={onExportJSON}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shrink-0 cursor-pointer shadow-2xs"
          >
            Exportar backup ahora
          </button>
        </div>
      )}

      {/* Timeline Now & Next Minimal Bar */}
      <div className="rounded-2xl p-3.5 sm:px-5 bg-[var(--card)] border border-[var(--border)] shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className={`w-2.5 h-2.5 rounded-full ${current ? 'bg-emerald-500' : 'bg-slate-400'} relative`}>
              {current && <div className="absolute -inset-1 rounded-full border border-emerald-500 animate-ping opacity-75" />}
            </div>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
              {current ? 'Actividad en curso' : 'Ahora'}
            </span>
            <span className="text-xs sm:text-sm font-bold text-[var(--text)] truncate block">
              {current ? `${current.activity} (${current.time})` : 'Tiempo libre / Sin bloque agendado'}
            </span>
          </div>
        </div>

        <div className="border-t sm:border-t-0 sm:border-l border-[var(--border)] pt-2 sm:pt-0 sm:pl-4 sm:text-right shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
            Próximo bloque
          </span>
          <span className="text-xs font-bold text-[var(--text-soft)] block">
            {next ? `${next.time} · ${next.activity}` : 'Jornada completada'}
          </span>
        </div>
      </div>

      {/* Asymmetric 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Focus & Action (7 of 12) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. The 3 Daily Priorities (Star component) */}
          <TodayFocus
            priorities={todayPriorities}
            onAdd={handleAddPriority}
            onToggle={handleTogglePriority}
            onRemove={handleRemovePriority}
          />

          {/* 2. Today's Checklist & Routines Card */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-500/10 text-[var(--blue)]">
                  <AppIcon name="check" className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text)] tracking-tight">
                    Tareas y Rutinas de Hoy
                  </h3>
                  <span className="text-[11px] text-[var(--text-soft)]">
                    {pendingItemsCount === 0 ? '¡Todo listo por hoy!' : `${pendingItemsCount} pendiente(s)`}
                  </span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border)] text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setTaskFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    taskFilter === 'all'
                      ? 'bg-[var(--card)] text-[var(--text)] shadow-2xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Todas ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    taskFilter === 'pending'
                      ? 'bg-[var(--card)] text-[var(--blue)] shadow-2xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Pendientes ({pendingItemsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter('done')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    taskFilter === 'done'
                      ? 'bg-[var(--card)] text-emerald-600 shadow-2xs'
                      : 'text-[var(--text-faint)] hover:text-[var(--text)]'
                  }`}
                >
                  Hechas ({items.length - pendingItemsCount})
                </button>
              </div>
            </div>

            {/* Quick Add Extra Form */}
            <form onSubmit={handleAddExtra} className="flex flex-wrap items-center gap-2 p-2 bg-[var(--surface-muted)] border border-[var(--border)] rounded-xl">
              <input
                type="text"
                value={extraText}
                onChange={(e) => setExtraText(e.target.value)}
                placeholder="＋ Tarea rápida para hoy..."
                className="flex-1 min-w-[160px] px-3 py-1.5 text-xs rounded-lg bg-[var(--card)] border border-[var(--border)] focus:border-[var(--blue)] outline-none text-[var(--text)]"
              />
              <select
                value={extraPriority}
                onChange={(e) => setExtraPriority(e.target.value as 'alta' | 'media' | 'baja')}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] cursor-pointer outline-none"
              >
                <option value="alta">Prioridad Alta</option>
                <option value="media">Prioridad Media</option>
                <option value="baja">Prioridad Baja</option>
              </select>
              <button
                type="submit"
                disabled={!extraText.trim()}
                className="px-3 py-1.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-lg transition-all cursor-pointer disabled:opacity-40"
              >
                Agregar
              </button>
            </form>

            {/* Task Items List */}
            <div className="divide-y divide-[var(--border)]">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--text-faint)] font-medium">
                  {taskFilter === 'pending'
                    ? 'No hay tareas pendientes en este momento.'
                    : taskFilter === 'done'
                    ? 'Aún no completaste tareas hoy.'
                    : 'No tenés actividades registradas para hoy.'}
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="py-2.5 flex items-center gap-3 hover:bg-[var(--surface-muted)]/50 px-2 rounded-xl transition-colors group"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleItem(item)}
                      className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs transition-all shrink-0 cursor-pointer ${
                        item.done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-[var(--border)] bg-[var(--bg-elevated)] text-transparent hover:border-[var(--blue)]'
                      }`}
                      title={item.done ? 'Marcar pendiente' : 'Marcar completada'}
                    >
                      <AppIcon name="check" className="h-3 w-3" />
                    </button>

                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        onClick={() => handleToggleItem(item)}
                        className={`text-xs sm:text-sm cursor-pointer select-none truncate ${
                          item.done
                            ? 'line-through text-[var(--text-faint)]'
                            : 'text-[var(--text)] font-semibold'
                        }`}
                      >
                        {item.text}
                      </span>
                    </div>

                    {!item.done && item.priority && (
                      <span className="text-amber-500 text-[11px] font-mono tracking-wider shrink-0 hidden sm:inline">
                        {stars(item.priority)}
                      </span>
                    )}

                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md shrink-0 border ${
                        item.source === 'agenda'
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                          : item.source === 'rutina'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                          : item.source === 'trabajo'
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      }`}
                    >
                      {item.source}
                    </span>

                    {item.source === 'extra' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExtra(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-faint)] hover:text-rose-500 p-1 transition cursor-pointer"
                        title="Eliminar tarea extra"
                      >
                        <AppIcon name="x" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Radar, Bienestar & Métricas (5 of 12) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Gym Today Status Card */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xs transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl font-bold ${
                    gymStatus.status === 'trained_today'
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : gymStatus.status === 'rest_today'
                      ? 'bg-purple-500/10 text-purple-600'
                      : 'bg-amber-500/10 text-amber-600'
                  }`}
                >
                  <AppIcon
                    name={
                      gymStatus.status === 'trained_today'
                        ? 'checkCircle'
                        : gymStatus.status === 'rest_today'
                        ? 'moon'
                        : 'dumbbell'
                    }
                    className="h-5 w-5"
                  />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--text)]">
                      {gymStatus.status === 'trained_today'
                        ? 'Entrenamiento de Hoy Listo'
                        : gymStatus.status === 'rest_today'
                        ? 'Día de Descanso Activo'
                        : 'Entrenamiento Pendiente'}
                    </h3>
                  </div>
                  <p className="text-[11px] text-[var(--text-soft)] mt-0.5">
                    {gymStatus.status === 'trained_today'
                      ? `${gymStatus.completedSetsCount} series · ${gymStatus.totalVolume.toLocaleString()} kg levantados`
                      : gymStatus.status === 'rest_today'
                      ? 'Racha protegida. Tu cuerpo se está recuperando.'
                      : weight != null
                      ? `Peso corporal: ${weight} kg`
                      : 'Sin registrar sesión hoy todavía.'}
                  </p>
                </div>
              </div>

              <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-[var(--surface-muted)] border border-[var(--border)] text-[var(--text-soft)]">
                <AppIcon name="flame" className="h-3 w-3 text-amber-500" />
                <span>{gymStatus.streakDays}d</span>
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2">
              {gymStatus.status !== 'trained_today' ? (
                <button
                  type="button"
                  onClick={handleToggleRestDay}
                  className="text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  {gymStatus.status === 'rest_today' ? 'Cancelar descanso' : 'Marcar descanso hoy'}
                </button>
              ) : (
                <span className="text-xs font-bold text-emerald-600">✓ Buen entreno hoy</span>
              )}

              <button
                type="button"
                onClick={() => onNavigate('gimnasio')}
                className="px-3 py-1.5 rounded-xl bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                {gymStatus.status === 'trained_today' ? 'Ver sesión →' : 'Ir al Gimnasio →'}
              </button>
            </div>
          </div>

          {/* 2. Compact Intelligent Financial Overview */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <AppIcon name="wallet" className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-[var(--text)]">Panorama Financiero</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('finanzas')}
                className="text-xs font-bold text-[var(--blue)] hover:underline cursor-pointer"
              >
                Detalles →
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Saldo en Cuentas */}
              <div
                onClick={() => onNavigate('finanzas')}
                className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] hover:border-[var(--blue)] transition-all cursor-pointer group"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                  En Cuentas
                </span>
                <div className="text-lg font-black font-mono mt-0.5 text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">
                  {fmtMoney(totalCuentas)}
                </div>
                <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">Bancos + Efectivo</span>
              </div>

              {/* Saldo Libre Proyectado (30d) */}
              <div
                onClick={() => onNavigate('finanzas')}
                className="p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] hover:border-[var(--blue)] transition-all cursor-pointer group"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)] block">
                  Libre 30d
                </span>
                <div className={`text-lg font-black font-mono mt-0.5 ${libreProyectado >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                  {fmtMoney(libreProyectado)}
                </div>
                <span className="text-[10px] text-[var(--text-soft)] block mt-0.5">
                  -{fmtMoney(cashFlow.committed)} fijos
                </span>
              </div>
            </div>

            {/* Mes Balance Bar */}
            <div
              onClick={() => onNavigate('finanzas')}
              className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] cursor-pointer hover:border-[var(--border-hover)] transition-all text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[var(--text-soft)]">Mes actual:</span>
                <span className="font-bold text-[var(--text)]">
                  +{fmtMoney(ingresoMes)} / -{fmtMoney(gastoMes)}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md ${
                  balanceMes >= 0
                    ? 'bg-emerald-500/15 text-emerald-600'
                    : 'bg-rose-500/15 text-rose-600'
                }`}
              >
                {balanceMes >= 0 ? `+${fmtMoney(balanceMes)}` : fmtMoney(balanceMes)}
              </span>
            </div>
          </div>

          {/* 3. Personal Context & Sleep/Energy */}
          <PersonalContextCard state={state} onUpdateState={onUpdateState} />

          {/* 4. Radar de Alertas y Decisiones */}
          {hasUrgentAlerts && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  <AppIcon name="zap" className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">
                  Radar de Decisiones
                </h3>
              </div>

              <div className="space-y-1.5 text-xs">
                {jstats.seguimientosPendientes > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate('trabajo')}
                    className="flex w-full items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 hover:bg-amber-500/15 transition-all text-left cursor-pointer"
                  >
                    <span className="font-medium text-[11px]">
                      💼 {jstats.seguimientosPendientes} seguimiento(s) de empleo vencido(s)
                    </span>
                    <AppIcon name="arrowRight" className="h-3.5 w-3.5 shrink-0 ml-2" />
                  </button>
                )}

                {exam && daysBetween(todayIso, exam.date) <= 7 && (
                  <button
                    type="button"
                    onClick={() => onNavigate('estudios')}
                    className="flex w-full items-center justify-between p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-900 dark:text-purple-200 hover:bg-purple-500/15 transition-all text-left cursor-pointer"
                  >
                    <span className="font-medium text-[11px]">
                      📚 Examen de {state.study.subjects.find((s) => s.id === exam.subjectId)?.name || 'materia'} en {daysBetween(todayIso, exam.date)} día(s)
                    </span>
                    <AppIcon name="arrowRight" className="h-3.5 w-3.5 shrink-0 ml-2" />
                  </button>
                )}

                {rstats.oportunidadesNuevas > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate('reventa')}
                    className="flex w-full items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/15 transition-all text-left cursor-pointer"
                  >
                    <span className="font-medium text-[11px]">
                      🔁 {rstats.oportunidadesNuevas} oportunidad(es) de reventa sin revisar
                    </span>
                    <AppIcon name="arrowRight" className="h-3.5 w-3.5 shrink-0 ml-2" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 5. Weekly Review Card */}
          <WeeklyReviewCard state={state} onUpdateState={onUpdateState} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse p-4 max-w-7xl mx-auto">
      <div className="h-20 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="h-44 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
          <div className="h-80 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
        </div>
        <div className="lg:col-span-5 space-y-6">
          <div className="h-36 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
          <div className="h-48 bg-[var(--card)] rounded-2xl border border-[var(--border)]" />
        </div>
      </div>
    </div>
  );
};
