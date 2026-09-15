import React, { useState } from 'react';
import { LifeOSState, JobApplication } from '../types';
import {
  todayISO,
  fmtDate,
  ESTADO_LABELS,
  uid,
} from '../lib/storage';
import { jobStats } from '../lib/calculations';
import { JobKanbanBoard } from './JobKanbanBoard';
import { AppIcon } from './AppIcon';

interface TrabajoViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
}

export const TrabajoView: React.FC<TrabajoViewProps> = ({ state, onUpdateState }) => {
  const [empresa, setEmpresa] = useState('');
  const [puesto, setPuesto] = useState('');
  const [estado, setEstado] = useState<JobApplication['estado']>('cv_enviado');
  const [fecha, setFecha] = useState(todayISO());
  const [reclutador, setReclutador] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  const jstats = jobStats(state);

  const handleAddApplication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresa.trim()) return;
    onUpdateState((draft) => {
      draft.jobs.applications.push({
        id: uid(),
        empresa: empresa.trim(),
        puesto: puesto.trim(),
        estado,
        fecha: fecha || todayISO(),
        reclutador: reclutador.trim(),
        notas: '',
        link: '',
        nextAction: '',
        nextActionDate: '',
      });
    });
    setEmpresa('');
    setPuesto('');
    setReclutador('');
  };

  const handleSetEstado = (id: string, newEstado: JobApplication['estado']) => {
    onUpdateState((draft) => {
      const app = draft.jobs.applications.find((a) => a.id === id);
      if (app) app.estado = newEstado;
    });
  };

  const handleSetNextAction = (id: string, nextAction: string) => {
    onUpdateState((draft) => {
      const app = draft.jobs.applications.find((a) => a.id === id);
      if (app) app.nextAction = nextAction;
    });
  };

  const handleSetNextActionDate = (id: string, nextActionDate: string) => {
    onUpdateState((draft) => {
      const app = draft.jobs.applications.find((a) => a.id === id);
      if (app) app.nextActionDate = nextActionDate;
    });
  };

  const handleDeleteApplication = (id: string) => {
    onUpdateState((draft) => {
      draft.jobs.applications = draft.jobs.applications.filter((a) => a.id !== id);
    });
  };

  const handleQuickAddInColumn = (colEstado: JobApplication['estado']) => {
    setEstado(colEstado);
    const el = document.getElementById('qa-focus-trabajo');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el.querySelector('input');
      if (input) input.focus();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Trabajo</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Todo tu proceso de búsqueda laboral, en un solo lugar.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">📨 CVs enviados</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{jstats.cvEnviados}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🎤 Entrevistas</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{jstats.entrevistas}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">🏢 Empresas</span>
          <div className="text-2xl font-extrabold font-mono mt-1 text-[var(--text)]">{jstats.empresas}</div>
        </div>
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-faint)]">⏰ Seguimientos hoy</span>
          <div className={`text-2xl font-extrabold font-mono mt-1 ${jstats.seguimientosPendientes > 0 ? 'text-red-500' : 'text-[var(--text)]'}`}>
            {jstats.seguimientosPendientes}
          </div>
          <p className="text-[11px] text-[var(--text-soft)] mt-0.5">aparecen en el Dashboard</p>
        </div>
      </div>

      {/* Add Form */}
      <div id="qa-focus-trabajo" className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--text)]">Nueva postulación</h2>
        <form onSubmit={handleAddApplication} className="flex flex-wrap items-end gap-2 p-3.5 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl">
          <div className="min-w-[140px] flex-1">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Empresa</label>
            <input
              type="text"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Ej: Scotiabank"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Puesto</label>
            <input
              type="text"
              value={puesto}
              onChange={(e) => setPuesto(e.target.value)}
              placeholder="Ej: Analista"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            >
              {Object.entries(ESTADO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">Reclutador / LinkedIn</label>
            <input
              type="text"
              value={reclutador}
              onChange={(e) => setReclutador(e.target.value)}
              placeholder="Opcional"
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
          >
            ＋ Agregar
          </button>
        </form>
      </div>

      {/* Applications Pipeline Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="text-base font-bold text-[var(--text)] flex items-center gap-2">
              Postulaciones y Pipeline
              <span className="text-xs font-semibold text-[var(--text-faint)] bg-[var(--bg)] px-2.5 py-0.5 rounded-md border border-[var(--border)]">
                {state.jobs.applications.length}
              </span>
            </h2>
            <p className="text-xs text-[var(--text-soft)]">
              Organizado en columnas por fase o en vista de lista detallada.
            </p>
          </div>

          {/* View Switcher: Kanban vs Table */}
          <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <AppIcon name="dashboard" className="h-3.5 w-3.5" />
              <span>Tablero Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                viewMode === 'table'
                  ? 'bg-[var(--card)] text-[var(--text)] shadow-xs'
                  : 'text-[var(--text-soft)] hover:text-[var(--text)]'
              }`}
            >
              <AppIcon name="filter" className="h-3.5 w-3.5" />
              <span>Lista / Tabla</span>
            </button>
          </div>
        </div>

        {/* View content */}
        {viewMode === 'kanban' ? (
          <JobKanbanBoard
            applications={state.jobs.applications}
            onSetEstado={handleSetEstado}
            onSetNextAction={handleSetNextAction}
            onSetNextActionDate={handleSetNextActionDate}
            onDeleteApplication={handleDeleteApplication}
            onQuickAddInColumn={handleQuickAddInColumn}
          />
        ) : (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 overflow-x-auto">
            {state.jobs.applications.length === 0 ? (
              <p className="text-center py-8 text-xs text-[var(--text-faint)]">Sin postulaciones cargadas todavía.</p>
            ) : (
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-faint)] uppercase text-[10px]">
                    <th className="py-2 px-2">Empresa</th>
                    <th className="py-2 px-2">Puesto</th>
                    <th className="py-2 px-2">Estado</th>
                    <th className="py-2 px-2">Fecha</th>
                    <th className="py-2 px-2">Contacto</th>
                    <th className="py-2 px-2">Seguimiento</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {[...state.jobs.applications]
                    .sort((a, b) => b.fecha.localeCompare(a.fecha))
                    .map((a) => (
                      <tr key={a.id} className="hover:bg-[var(--bg)]/50 transition-colors">
                        <td className="py-2.5 px-2">
                          <span className="font-bold text-[var(--text)]">{a.empresa}</span>
                          {a.link && (
                            <div>
                              <a
                                href={a.link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-[var(--blue)] font-medium hover:underline"
                              >
                                ver oferta ↗
                              </a>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          <div>{a.puesto}</div>
                          {a.notas && <div className="text-[11px] text-[var(--text-faint)]">{a.notas}</div>}
                        </td>
                        <td className="py-2.5 px-2">
                          <select
                            value={a.estado}
                            onChange={(e) => handleSetEstado(a.id, e.target.value as any)}
                            className="px-2 py-1 text-xs rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)]"
                          >
                            {Object.entries(ESTADO_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[var(--text-soft)]">{fmtDate(a.fecha)}</td>
                        <td className="py-2.5 px-2 text-[var(--text-soft)]">{a.reclutador || '—'}</td>
                        <td className="py-2.5 px-2 space-y-1">
                          <input
                            type="text"
                            value={a.nextAction || ''}
                            onChange={(e) => handleSetNextAction(a.id, e.target.value)}
                            placeholder="Ej: escribir por LinkedIn"
                            className="w-36 px-2 py-1 text-[11px] rounded-md bg-[var(--bg-elevated)] border border-[var(--border)]"
                          />
                          <input
                            type="date"
                            value={a.nextActionDate || ''}
                            onChange={(e) => handleSetNextActionDate(a.id, e.target.value)}
                            className="w-36 px-2 py-1 text-[11px] rounded-md bg-[var(--bg-elevated)] border border-[var(--border)] block"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <button
                            onClick={() => handleDeleteApplication(a.id)}
                            className="text-[var(--text-faint)] hover:text-red-500 text-xs px-1.5 py-1"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
