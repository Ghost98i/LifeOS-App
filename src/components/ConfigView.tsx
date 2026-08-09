import React, { useState } from 'react';
import { LifeOSState, ViewType } from '../types';
import { NAV_ITEMS } from './Sidebar';
import { defaultState } from '../lib/storage';

interface ConfigViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onExportJSON: () => void;
  onImportJSON: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ConfigView: React.FC<ConfigViewProps> = ({
  state,
  onUpdateState,
  onExportJSON,
  onImportJSON,
}) => {
  const [profileName, setProfileName] = useState(state.profile.name || '');
  const [profileHeight, setProfileHeight] = useState(String(state.profile.height || 170));
  const [streamGoal, setStreamGoal] = useState(String(state.streaming.monthlyGoal || 12));

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateState((draft) => {
      draft.profile.name = profileName.trim();
      draft.profile.height = Number(profileHeight) || 170;
      draft.streaming.monthlyGoal = Number(streamGoal) || 12;
    });
    alert('Configuración guardada.');
  };

  const handleToggleTab = (tabId: string) => {
    onUpdateState((draft) => {
      if (!draft.settings.hiddenTabs) draft.settings.hiddenTabs = [];
      if (draft.settings.hiddenTabs.includes(tabId)) {
        draft.settings.hiddenTabs = draft.settings.hiddenTabs.filter((id) => id !== tabId);
      } else {
        draft.settings.hiddenTabs.push(tabId);
      }
    });
  };

  const handleResetData = () => {
    if (confirm('⚠️ ¿Estás seguro de reiniciar TODOS tus datos? Esta acción borra el estado local.')) {
      const def = defaultState();
      onUpdateState(() => def);
      alert('Datos reiniciados a los valores por defecto.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Configuración</h1>
        <p className="text-sm text-[var(--text-soft)]">
          Ajustá tu perfil, módulos visibles y backups de datos.
        </p>
      </div>

      {/* Profile Form */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-[var(--text)]">Perfil y Metas Básicas</h2>
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                Nombre / Apodo
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ej: Chino"
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                Altura (cm) — para IMC
              </label>
              <input
                type="number"
                value={profileHeight}
                onChange={(e) => setProfileHeight(e.target.value)}
                placeholder="175"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                Meta Streams/Mes
              </label>
              <input
                type="number"
                value={streamGoal}
                onChange={(e) => setStreamGoal(e.target.value)}
                placeholder="12"
                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[var(--text)] text-[var(--bg-elevated)] text-xs font-bold rounded-xl hover:opacity-90 cursor-pointer"
          >
            Guardar cambios
          </button>
        </form>
      </div>

      {/* Hidden Tabs Customization */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Personalizar Módulos Visibles</h2>
          <p className="text-xs text-[var(--text-soft)]">
            Elegí qué módulos querés ver en la barra lateral. Podés ocultar los que no utilices.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
          {NAV_ITEMS.filter((item) => item.optional).map((item) => {
            const isHidden = (state.settings.hiddenTabs || []).includes(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleToggleTab(item.id)}
                className={`p-3 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                  !isHidden
                    ? 'bg-[var(--bg-elevated)] border-[var(--blue)] text-[var(--text)]'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-faint)] line-through'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                <span className="text-[10px] font-bold">
                  {!isHidden ? '✓' : 'Oculto'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Backup and Data Management */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Backup y Gestión de Datos</h2>
          <p className="text-xs text-[var(--text-soft)]">
            Tus datos se guardan en el navegador. Exportá un archivo JSON con frecuencia para respaldar tu información.
          </p>
          {state.settings.lastBackupAt && (
            <p className="text-[11px] font-mono text-[var(--blue)] mt-1">
              Último backup exportado: {state.settings.lastBackupAt}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExportJSON}
            className="px-4 py-2 bg-[var(--blue)] text-white text-xs font-bold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
          >
            ⬇ Exportar Backup JSON
          </button>

          <label className="px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-xs font-bold rounded-xl hover:border-[var(--blue)] cursor-pointer transition-colors">
            ⬆ Importar Backup JSON
            <input
              type="file"
              accept=".json"
              onChange={onImportJSON}
              className="hidden"
            />
          </label>
        </div>

        <div className="pt-4 border-t border-[var(--border)]">
          <button
            onClick={handleResetData}
            className="px-3.5 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl hover:bg-red-500/20 cursor-pointer transition-colors"
          >
            ⚠️ Reiniciar datos por defecto
          </button>
        </div>
      </div>
    </div>
  );
};
