import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { NAV_ITEMS } from './Sidebar';
import {
  CURRENT_SCHEMA_VERSION,
  defaultState,
  getStorageDiagnostics,
  StorageDiagnostics,
} from '../lib/storage';
import { showToast } from '../lib/toast';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';

interface ConfigViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => void;
  onExportJSON: () => void;
  onImportJSON: (e: React.ChangeEvent<HTMLInputElement>) => void;
  storageUserId?: string | null;
  cloudConnected?: boolean;
}

export const ConfigView: React.FC<ConfigViewProps> = ({
  state,
  onUpdateState,
  onExportJSON,
  onImportJSON,
  storageUserId,
  cloudConnected = false,
}) => {
  const [profileName, setProfileName] = useState(state.profile?.name || '');
  const [profileHeight, setProfileHeight] = useState(String(state.profile?.height || 170));
  const [profileBodySex, setProfileBodySex] = useState<'' | 'male' | 'female'>(state.profile?.bodyCompositionSex || '');
  const [streamGoal, setStreamGoal] = useState(String(state.streaming?.monthlyGoal || 12));
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateState((draft) => {
      if (!draft.profile) draft.profile = { name: '', height: 170, bodyCompositionSex: null };
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, platforms: [] };
      draft.profile.name = profileName.trim();
      draft.profile.height = Number(profileHeight) || 170;
      draft.profile.bodyCompositionSex = profileBodySex || null;
      draft.streaming.monthlyGoal = Number(streamGoal) || 12;
    });
    showToast('Configuración guardada.');
  };

  const handleToggleTab = (tabId: string) => {
    onUpdateState((draft) => {
      if (!draft.settings) draft.settings = { hiddenTabs: [] } as any;
      if (!draft.settings.hiddenTabs) draft.settings.hiddenTabs = [];
      if (draft.settings.hiddenTabs.includes(tabId)) {
        draft.settings.hiddenTabs = draft.settings.hiddenTabs.filter((id) => id !== tabId);
      } else {
        draft.settings.hiddenTabs.push(tabId);
      }
    });
  };

  const handleResetData = () => {
    const scope = cloudConnected
      ? 'Se guardará una copia de recuperación y el reinicio se sincronizará con tus otros dispositivos.'
      : 'Se guardará una copia local de recuperación.';
    if (confirm(`⚠️ ¿Estás seguro de reiniciar TODOS tus datos? ${scope}`)) {
      const def = defaultState();
      onUpdateState((draft) => {
        Object.assign(draft, def);
      });
      showToast('Datos reiniciados a los valores por defecto.', 'info');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        category="Sistema & Preferencias"
        title="Configuración"
        subtitle="Ajustá tu perfil, módulos visibles, privacidad y backups de datos."
        badge={
          <span className="font-mono text-[10px] text-[var(--text-faint)] bg-[var(--surface-muted)] px-2 py-0.5 rounded-md border border-[var(--border)]">
            v{CURRENT_SCHEMA_VERSION} · {__LIFEOS_BUILD_ID__}
          </span>
        }
      />

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-sm font-bold text-[var(--text)]">Estado del almacenamiento</h2>
            <p className="text-xs text-[var(--text-soft)]">
              Esquema de datos v{CURRENT_SCHEMA_VERSION}. LifeOS conserva una copia local anterior para recuperación.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDiagnostics(getStorageDiagnostics(storageUserId))}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-bold rounded-xl hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs text-[var(--text)]"
          >
            <AppIcon name="search" className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span>Diagnosticar</span>
          </button>
        </div>

        {diagnostics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--surface-muted)] p-3"><span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Backend</span><strong className="text-[var(--text)]">{diagnostics.backend}</strong></div>
            <div className="rounded-xl bg-[var(--surface-muted)] p-3"><span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Esquema</span><strong className="text-[var(--text)]">v{diagnostics.schemaVersion}</strong></div>
            <div className="rounded-xl bg-[var(--surface-muted)] p-3"><span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Datos actuales</span><strong className="font-mono text-[var(--text)]">{diagnostics.primaryBytes.toLocaleString('es-UY')} bytes</strong></div>
            <div className="rounded-xl bg-[var(--surface-muted)] p-3"><span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Recuperación</span><strong className="font-mono text-[var(--text)]">{diagnostics.recoveryAvailable ? `${diagnostics.recoveryBytes.toLocaleString('es-UY')} bytes` : 'Todavía no creada'}</strong></div>
          </div>
        )}
      </div>

      {/* Profile Form */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-2xs">
        <h2 className="text-sm font-bold text-[var(--text)]">Perfil y Metas Básicas</h2>
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                Nombre / Apodo
              </label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ej: Chino"
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                Altura (cm) — composición corporal
              </label>
              <input
                type="number"
                value={profileHeight}
                onChange={(e) => setProfileHeight(e.target.value)}
                placeholder="175"
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                Sexo para cálculos corporales
              </label>
              <select
                value={profileBodySex}
                onChange={(e) => setProfileBodySex(e.target.value as '' | 'male' | 'female')}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
              >
                <option value="">Elegir una vez…</option>
                <option value="male">Masculino</option>
                <option value="female">Femenino</option>
              </select>
              <p className="mt-1 text-[10px] text-[var(--text-faint)]">Solo se usa para estimar RFM; no se muestra como identidad.</p>
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
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
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
            const isHidden = (state.settings?.hiddenTabs || []).includes(item.id);

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
                  <AppIcon name={item.icon} className="h-4 w-4" />
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
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-[var(--text)]">Backup y Gestión de Datos</h2>
          <p className="text-xs text-[var(--text-soft)]">
            LifeOS conserva una copia en este navegador y, si conectaste Google, la sincroniza entre dispositivos. El JSON sigue siendo tu respaldo portátil independiente.
          </p>
          {state.settings?.lastBackupAt && (
            <p className="text-[11px] font-mono text-[var(--blue)] mt-1">
              Último backup exportado: {state.settings.lastBackupAt}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExportJSON}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            <AppIcon name="cloud" className="h-3.5 w-3.5" />
            <span>Exportar Backup JSON</span>
          </button>

          <label className="flex items-center gap-1.5 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-xs font-bold rounded-xl hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs">
            <AppIcon name="rotateCcw" className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span>Importar Backup JSON</span>
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
            className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl hover:bg-red-500/20 cursor-pointer transition-colors shadow-2xs"
          >
            <AppIcon name="shield" className="h-3.5 w-3.5" />
            <span>Reiniciar datos por defecto</span>
          </button>
        </div>
      </div>
    </div>
  );
};
