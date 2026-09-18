import React, { useState } from 'react';
import { LifeOSState } from '../types';
import { NAV_ITEMS } from './Sidebar';
import {
  CURRENT_SCHEMA_VERSION,
  defaultState,
  fmtDate,
  getStorageDiagnostics,
  StorageDiagnostics,
  todayISO,
} from '../lib/storage';
import { getOrCreateDeviceId, type CloudSyncStatus, type CloudUser } from '../lib/cloudSync';
import { computeAccountBalance } from '../lib/financeFlows';
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
  cloudConfigured?: boolean;
  cloudUser?: CloudUser | null;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string | null;
  onCloudSignIn?: () => void;
  onCloudSignOut?: () => void;
  onForceSync?: () => void;
}

export const ConfigView: React.FC<ConfigViewProps> = ({
  state,
  onUpdateState,
  onExportJSON,
  onImportJSON,
  storageUserId,
  cloudConnected = false,
  cloudConfigured = true,
  cloudUser = null,
  syncStatus = 'signed-out',
  lastSyncedAt = null,
  onCloudSignIn,
  onCloudSignOut,
  onForceSync,
}) => {
  const [profileName, setProfileName] = useState(state.profile?.name || '');
  const [profileHeight, setProfileHeight] = useState(String(state.profile?.height || 170));
  const [profileBodySex, setProfileBodySex] = useState<'' | 'male' | 'female'>(state.profile?.bodyCompositionSex || '');
  const [streamGoal, setStreamGoal] = useState(String(state.streaming?.monthlyGoal || 12));
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);
  const [deviceId] = useState(() => (typeof window !== 'undefined' ? getOrCreateDeviceId() : 'unknown'));

  const totalAccountBalance = (state.finance?.accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0);
  const ledgerTotalBalance = (state.finance?.accounts || []).reduce(
    (s, a) => s + computeAccountBalance(a, state.finance?.transactions, state.finance?.transfers, state.finance?.reconciliations),
    0
  );
  const balanceDifference = Math.round((totalAccountBalance - ledgerTotalBalance) * 100) / 100;

  const sortedGymSessions = [...(state.gym?.sessions || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latestCompletedGym = sortedGymSessions.find((s) => s.status === 'completed') || sortedGymSessions[0] || null;
  const staleGymCount = sortedGymSessions.filter((s) => (s.date || '') < todayISO() && s.status === 'active').length;

  const handleRepairFinanceBalances = () => {
    let corrected = 0;
    onUpdateState((draft) => {
      draft.finance.accounts.forEach((acc) => {
        const computed = computeAccountBalance(
          acc,
          draft.finance.transactions,
          draft.finance.transfers,
          draft.finance.reconciliations
        );
        if (Math.abs(Number(acc.balance || 0) - computed) > 0.001) {
          acc.balance = computed;
          corrected++;
        }
      });
    });
    if (corrected > 0) {
      showToast(`✅ Se recalcularon ${corrected} cuenta(s) según el libro mayor cerrado.`);
    } else {
      showToast('✨ Todas las cuentas coinciden exactamente con el libro mayor.');
    }
  };

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

  const syncStatusMeta = (() => {
    if (syncStatus === 'synced') {
      return {
        dotClass: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
        label: 'Sincronizado',
        textColor: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
      };
    }
    if (syncStatus === 'saving' || syncStatus === 'connecting') {
      return {
        dotClass: 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.7)]',
        label: syncStatus === 'connecting' ? 'Conectando...' : 'Guardando cambios...',
        textColor: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
      };
    }
    if (syncStatus === 'conflict') {
      return {
        dotClass: 'bg-rose-500 animate-ping',
        label: 'Conflicto de versiones',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
      };
    }
    if (syncStatus === 'error') {
      return {
        dotClass: 'bg-rose-500 animate-pulse',
        label: 'Error al sincronizar',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
      };
    }
    if (syncStatus === 'offline') {
      return {
        dotClass: 'bg-slate-400',
        label: 'Sin conexión (Offline)',
        textColor: 'text-[var(--text-faint)] border-[var(--border)] bg-[var(--surface-muted)]',
      };
    }
    return {
      dotClass: 'bg-slate-400',
      label: 'Desconectado',
      textColor: 'text-[var(--text-faint)] border-[var(--border)] bg-[var(--surface-muted)]',
    };
  })();

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

      {/* Sincronización en la Nube (LifeOS Anywhere) */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AppIcon name="cloud" className="h-4 w-4 text-[var(--blue)]" />
              <h2 className="text-sm font-bold text-[var(--text)]">Sincronización en la Nube (LifeOS Anywhere)</h2>
            </div>
            <p className="text-xs text-[var(--text-soft)]">
              Mantené tu PC, celular y otros navegadores sincronizados en tiempo real mediante tu cuenta de Google.
            </p>
          </div>
          {cloudConfigured && (
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-semibold self-start sm:self-auto ${
              cloudUser ? syncStatusMeta.textColor : 'text-[var(--text-faint)] border-[var(--border)] bg-[var(--surface-muted)]'
            }`}>
              <span className={`h-2 w-2 rounded-full shrink-0 ${cloudUser ? syncStatusMeta.dotClass : 'bg-slate-400'}`} />
              <span>{cloudUser ? syncStatusMeta.label : 'Sin conectar'}</span>
            </div>
          )}
        </div>

        {cloudConfigured ? (
          cloudUser ? (
            <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  {cloudUser.photoURL ? (
                    <img src={cloudUser.photoURL} alt={cloudUser.name} className="h-10 w-10 rounded-full border border-[var(--border)] shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[var(--blue)]/20 text-[var(--blue)] flex items-center justify-center font-bold text-sm shrink-0">
                      {cloudUser.name ? cloudUser.name[0].toUpperCase() : 'G'}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-[var(--text)]">{cloudUser.name || 'Usuario Google'}</p>
                    <p className="text-[11px] text-[var(--text-soft)]">{cloudUser.email}</p>
                  </div>
                </div>
                {lastSyncedAt && (
                  <span className="text-[11px] text-[var(--text-faint)]">
                    Última sincronización: <strong className="text-[var(--text)]">{lastSyncedAt}</strong>
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-[var(--border)] flex flex-wrap gap-2.5">
                {onForceSync && (
                  <button
                    type="button"
                    onClick={onForceSync}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                  >
                    <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
                    <span>Sincronizar ahora</span>
                  </button>
                )}
                {onCloudSignOut && (
                  <button
                    type="button"
                    onClick={onCloudSignOut}
                    className="flex items-center gap-1.5 px-3.5 py-2 border border-[var(--border)] hover:border-red-500/40 text-[var(--text-soft)] hover:text-red-600 dark:hover:text-red-400 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    <span>Cerrar sesión de Google</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-[var(--text)]">No has conectado tu cuenta de Google</p>
                <p className="text-[11px] text-[var(--text-soft)] max-w-md">
                  Para que los entrenamientos, gastos y tareas que registres en tu celular aparezcan automáticamente en tu PC (y viceversa) sin tener que mover archivos JSON, conectá tu cuenta de Google.
                </p>
              </div>
              {onCloudSignIn && (
                <button
                  type="button"
                  onClick={onCloudSignIn}
                  className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  <AppIcon name="cloud" className="h-4 w-4" />
                  <span>Conectar con Google</span>
                </button>
              )}
            </div>
          )
        ) : (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3 text-xs text-[var(--text-faint)]">
            LifeOS se está ejecutando en versión portable fuera de línea. La sincronización en la nube está desactivada.
          </div>
        )}
      </div>

      {/* Auditoría Multi-Dispositivo y Consistencia */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AppIcon name="shield" className="h-4 w-4 text-[var(--blue)]" />
              <h2 className="text-sm font-bold text-[var(--text)]">Auditoría Multi-Dispositivo y Consistencia</h2>
            </div>
            <p className="text-xs text-[var(--text-soft)]">
              Verificación en tiempo real de identidad de nodo, libro mayor de finanzas y rutinas de gimnasio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-[var(--text-faint)] bg-[var(--surface-muted)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
              ID Nodo: <strong className="text-[var(--text)]">{deviceId.slice(0, 8)}…</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Tarjeta Finanzas */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AppIcon name="wallet" className="h-4 w-4 text-[var(--emerald)]" />
                <h3 className="text-xs font-bold text-[var(--text)]">Consistencia de Finanzas</h3>
              </div>
              {Math.abs(balanceDifference) < 0.01 ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Libro Mayor Íntegro
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                  Divergencia Detectada
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-[var(--surface-muted)]">
                <span className="block text-[10px] font-semibold text-[var(--text-faint)] uppercase">Saldo Cuentas</span>
                <span className="font-mono font-bold text-[var(--text)]">${totalAccountBalance.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--surface-muted)]">
                <span className="block text-[10px] font-semibold text-[var(--text-faint)] uppercase">Libro Mayor Cerrado</span>
                <span className="font-mono font-bold text-[var(--text)]">${ledgerTotalBalance.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-soft)] space-y-1">
              <div className="flex justify-between">
                <span>Transacciones registradas:</span>
                <strong className="text-[var(--text)]">{state.finance?.transactions?.length || 0}</strong>
              </div>
              <div className="flex justify-between">
                <span>Transferencias registradas:</span>
                <strong className="text-[var(--text)]">{state.finance?.transfers?.length || 0}</strong>
              </div>
              <div className="flex justify-between">
                <span>Conciliaciones / Arqueos:</span>
                <strong className="text-[var(--text)]">{state.finance?.reconciliations?.length || 0}</strong>
              </div>
            </div>

            {Math.abs(balanceDifference) > 0.01 && (
              <div className="pt-2 border-t border-[var(--border)] space-y-2">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Existe una diferencia de <strong>${balanceDifference.toLocaleString('es-UY', { minimumFractionDigits: 2 })} UYU</strong> entre los saldos locales en caché y el libro contable inmutable.
                </p>
                <button
                  type="button"
                  onClick={handleRepairFinanceBalances}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
                  <span>Auditar y Reparar Saldos con Libro Mayor</span>
                </button>
              </div>
            )}
            {Math.abs(balanceDifference) <= 0.01 && (
              <div className="pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handleRepairFinanceBalances}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] font-medium text-xs rounded-xl transition-all cursor-pointer"
                >
                  <AppIcon name="check" className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Recalcular libro mayor</span>
                </button>
              </div>
            )}
          </div>

          {/* Tarjeta Gimnasio */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AppIcon name="dumbbell" className="h-4 w-4 text-[var(--purple)]" />
                <h3 className="text-xs font-bold text-[var(--text)]">Consistencia de Gimnasio</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)] border border-[var(--border)]">
                {sortedGymSessions.length} sesiones
              </span>
            </div>

            <div className="text-xs space-y-2">
              <div className="p-2.5 rounded-lg bg-[var(--surface-muted)]">
                <span className="block text-[10px] font-semibold text-[var(--text-faint)] uppercase">Última rutina registrada</span>
                <span className="font-semibold text-[var(--text)]">
                  {latestCompletedGym ? (
                    <>
                      {fmtDate(latestCompletedGym.date)} · <span className="text-[var(--text-soft)]">{latestCompletedGym.routineName}</span>
                    </>
                  ) : (
                    'Sin sesiones aún'
                  )}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-soft)] space-y-1">
              <div className="flex justify-between">
                <span>Sesiones completadas:</span>
                <strong className="text-[var(--text)]">{sortedGymSessions.filter((s) => s.status === 'completed').length}</strong>
              </div>
              <div className="flex justify-between">
                <span>Sesión activa de hoy:</span>
                <strong className="text-[var(--text)]">
                  {sortedGymSessions.some((s) => s.date === todayISO() && s.status === 'active') ? 'Sí (en curso)' : 'Ninguna'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Sesiones huérfanas de días anteriores:</span>
                <strong className={staleGymCount > 0 ? 'text-amber-500 font-bold' : 'text-[var(--text)]'}>
                  {staleGymCount}
                </strong>
              </div>
            </div>

            {staleGymCount > 0 && (
              <div className="pt-2 border-t border-[var(--border)] text-[11px] text-amber-600 dark:text-amber-400">
                Las sesiones incompletas de días previos están aisladas y no bloquean los entrenamientos de hoy.
              </div>
            )}
          </div>
        </div>
      </div>

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
