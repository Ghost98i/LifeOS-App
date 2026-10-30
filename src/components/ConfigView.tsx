import React, { useEffect, useMemo, useState } from 'react';
import { LifeOSState } from '../types';
import { NAV_ITEMS } from './Sidebar';
import { isModuleHidden } from '../lib/moduleVisibility';
import {
  CURRENT_SCHEMA_VERSION,
  defaultState,
  getStorageDiagnostics,
  inspectBackupJSON,
  loadRecoveryState,
  saveRecoveryState,
  BackupPreviewSummary,
  StorageDiagnostics,
  todayISO,
} from '../lib/storage';
import { getOrCreateDeviceId, type CloudSyncStatus, type CloudUser } from '../lib/cloudSync';
import { cryptoSession } from '../lib/cryptoCore';
import { compareMaterializedBalanceShadow } from '../lib/financeLedger';
import { showToast } from '../lib/toast';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { ContextualHelp } from './ContextualHelp';
import { PrivacyAmount } from './PrivacyAmount';
import { PrivacySecuritySection } from './PrivacySecuritySection';
import { getDismissedAttentionItems, nextAttentionDismissalTimestamp, type AttentionItem } from '../lib/todayAttention';
import { DismissedAttentionModal } from './DismissedAttentionModal';
import type { AttentionDismissalRecord } from '../types';

interface ConfigViewProps {
  state: LifeOSState;
  onUpdateState: (updater: (draft: LifeOSState) => void) => boolean | void;
  onExportJSON: () => void;
  onImportJSON?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImportState?: (importedState: LifeOSState, description?: string) => boolean | void;
  onRestoreRecovery?: () => boolean | void;
  onResetData?: () => boolean | void;
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
  onImportJSON: _onImportJSON,
  onImportState,
  onRestoreRecovery,
  onResetData,
  storageUserId,
  cloudConnected: _cloudConnected = false,
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
  useEffect(() => { setProfileName(state.profile?.name || ''); }, [state.profile?.name]);
  useEffect(() => { setProfileHeight(String(state.profile?.height || 170)); }, [state.profile?.height]);
  useEffect(() => { setProfileBodySex(state.profile?.bodyCompositionSex || ''); }, [state.profile?.bodyCompositionSex]);
  useEffect(() => { setStreamGoal(String(state.streaming?.monthlyGoal || 12)); }, [state.streaming?.monthlyGoal]);
  const [diagnostics, setDiagnostics] = useState<StorageDiagnostics | null>(null);
  const [deviceId] = useState(() => (typeof window !== 'undefined' ? getOrCreateDeviceId() : 'unknown'));
  const [, setSessionNonce] = useState(0);

  useEffect(() => {
    return cryptoSession.subscribe(() => {
      setSessionNonce((n) => n + 1);
    });
  }, []);

  const effectiveUserId = storageUserId || (cloudUser ? cloudUser.uid : null);

  const financeShadows = useMemo(() => (
    (state.finance?.accounts || []).map((acc) =>
      compareMaterializedBalanceShadow(
        acc,
        state.finance?.transactions,
        state.finance?.transfers,
        state.finance?.reconciliations
      )
    )
  ), [state.finance?.accounts, state.finance?.transactions, state.finance?.transfers, state.finance?.reconciliations]);

  const discrepantShadows = financeShadows.filter((s) => !s.matches);

  const sortedGymSessions = [...(state.gym?.sessions || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const staleGymCount = sortedGymSessions.filter((s) => (s.date || '') < todayISO() && s.status === 'active').length;

  // Safe Recovery & Modal States
  const [importPreview, setImportPreview] = useState<BackupPreviewSummary | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [accountDiffs, setAccountDiffs] = useState<Array<{
    id: string;
    name: string;
    currency: string;
    currentBalance: number;
    computedBalance: number | null;
    difference: number | null;
    repairable: boolean;
    unrepairableReason?: string;
  }>>([]);

  const recoveryInfo = loadRecoveryState(storageUserId);

  const [showDismissedModal, setShowDismissedModal] = useState(false);
  const dismissedAttentionItems = useMemo(() => getDismissedAttentionItems(state), [state]);

  const handleRestoreAttentionItem = (item: AttentionItem) => {
    const saved = onUpdateState((draft) => {
      if (!draft.settings) return;
      const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
      const nextTimestamp = nextAttentionDismissalTimestamp(prevRec);
      const nextDismissals = {
        ...(draft.settings.attentionDismissals || {}),
        [item.dismissKey]: { status: 'active' as const, updatedAt: nextTimestamp },
      };
      draft.settings.attentionDismissals = nextDismissals;
      draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
        .filter(([_, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
        .map(([k]) => k)
        .sort();
    });
    if (saved === false) return;
    showToast('Aviso restaurado.', 'success');
  };

  const handleRestoreAllDismissed = () => {
    const now = Date.now();
    const saved = onUpdateState((draft) => {
      if (!draft.settings) return;
      const nextDismissals = { ...(draft.settings.attentionDismissals || {}) };
      for (const item of dismissedAttentionItems) {
        const prevRec = draft.settings.attentionDismissals?.[item.dismissKey];
        const nextTimestamp = nextAttentionDismissalTimestamp(prevRec, now);
        nextDismissals[item.dismissKey] = { status: 'active' as const, updatedAt: nextTimestamp };
      }
      draft.settings.attentionDismissals = nextDismissals;
      draft.settings.dismissedAttentionKeys = Object.entries(nextDismissals)
        .filter(([_, rec]) => (rec as AttentionDismissalRecord)?.status === 'dismissed')
        .map(([k]) => k)
        .sort();
    });
    if (saved === false) return;
    showToast('Todos los avisos fueron restaurados.', 'success');
  };

  useEffect(() => {
    if (!importPreview && !isResetModalOpen && !isRestoreModalOpen && !isRepairModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (importPreview) setImportPreview(null);
        if (isResetModalOpen) setIsResetModalOpen(false);
        if (isRestoreModalOpen) setIsRestoreModalOpen(false);
        if (isRepairModalOpen) setIsRepairModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [importPreview, isResetModalOpen, isRestoreModalOpen, isRepairModalOpen]);

  const handleOpenRepairModal = () => {
    const diffs = (state.finance?.accounts || [])
      .map((acc) => {
        const shadow = compareMaterializedBalanceShadow(
          acc,
          state.finance?.transactions,
          state.finance?.transfers,
          state.finance?.reconciliations
        );
        const currency = (acc.currency || 'UYU').toUpperCase();
        let unrepairableReason: string | undefined;
        if (shadow.missingInitialBalance) {
          unrepairableReason = 'Cuenta sin saldo inicial registrado';
        } else if (shadow.ambiguities.length > 0) {
          unrepairableReason = 'Conciliaciones múltiples en la misma fecha';
        }
        return {
          id: acc.id,
          name: acc.name,
          currency,
          currentBalance: shadow.materializedBalance,
          computedBalance: shadow.reconstructedBalance,
          difference: shadow.difference,
          repairable: shadow.reconstructedBalance !== null && shadow.ambiguities.length === 0 && !shadow.matches,
          unrepairableReason,
        };
      })
      .filter((d) => !d.repairable && d.computedBalance === null || d.difference !== 0 && d.difference !== null);

    if (diffs.length === 0) {
      showToast('✨ Todas las cuentas coinciden exactamente con el libro mayor.');
      return;
    }

    setAccountDiffs(diffs);
    setIsRepairModalOpen(true);
  };

  const handleConfirmRepairBalances = () => {
    if (!saveRecoveryState(state, storageUserId, 'repair_balances', 'Previo a reparación de saldos con libro mayor')) {
      showToast('No se pudo guardar la copia preventiva. La reparación quedó detenida.', 'error');
      return;
    }
    let corrected = 0;
    const saved = onUpdateState((draft) => {
      draft.finance.accounts.forEach((acc) => {
        const shadow = compareMaterializedBalanceShadow(
          acc,
          draft.finance.transactions,
          draft.finance.transfers,
          draft.finance.reconciliations
        );
        if (shadow.reconstructedBalance !== null && shadow.ambiguities.length === 0 && !shadow.matches) {
          acc.balance = shadow.reconstructedBalance;
          corrected++;
        }
      });
    });
    if (saved === false) return;
    setIsRepairModalOpen(false);
    showToast(`✅ Se recalcularon ${corrected} cuenta(s) según el libro mayor cerrado. Copia anterior guardada en recuperación.`);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = onUpdateState((draft) => {
      if (!draft.profile) draft.profile = { name: '', height: 170, bodyCompositionSex: null };
      if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
      draft.profile.name = profileName.trim();
      draft.profile.height = Number(profileHeight) || 170;
      draft.profile.bodyCompositionSex = profileBodySex || null;
      draft.streaming.monthlyGoal = Number(streamGoal) || 12;
    });
    if (saved === false) return;
    showToast('Configuración guardada.');
  };

  const handleToggleTab = (tabId: string) => {
    if (onUpdateState((draft) => {
      if (!draft.settings) draft.settings = { hiddenTabs: [] } as any;
      if (!draft.settings.hiddenTabs) draft.settings.hiddenTabs = [];
      if (draft.settings.hiddenTabs.includes(tabId)) {
        draft.settings.hiddenTabs = draft.settings.hiddenTabs.filter((id) => id !== tabId);
      } else {
        draft.settings.hiddenTabs.push(tabId);
      }
    }) === false) return;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const summary = inspectBackupJSON(text);
        setImportPreview(summary);
        setImportFileName(file.name);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Error al validar el archivo JSON de backup.', 'error');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    if (onImportState) {
      if (onImportState(importPreview.state, `Previo a importar ${importFileName || 'backup'}`) === false) return;
    } else {
      if (!saveRecoveryState(state, storageUserId, 'import_backup', `Previo a importar ${importFileName || 'backup'}`)) {
        showToast('No se pudo guardar una copia previa. La importación quedó detenida.', 'error'); return;
      }
      if (onUpdateState((draft) => {
        Object.assign(draft, importPreview.state);
      }) === false) return;
      showToast('Backup importado correctamente. Copia anterior guardada en recuperación.', 'success');
    }
    setImportPreview(null);
  };

  const handleConfirmReset = () => {
    if (onResetData) {
      if (onResetData() === false) return;
    } else {
      if (!saveRecoveryState(state, storageUserId, 'reset_data', 'Previo a reiniciar datos a valores de fábrica')) {
        showToast('No se pudo guardar una copia previa. El reinicio quedó detenido.', 'error'); return;
      }
      const def = defaultState();
      if (onUpdateState((draft) => {
        Object.assign(draft, def);
      }) === false) return;
      showToast('Datos reiniciados a los valores por defecto. Copia anterior guardada en recuperación.', 'info');
    }
    setIsResetModalOpen(false);
  };

  const handleConfirmRestoreRecovery = () => {
    if (onRestoreRecovery) {
      if (onRestoreRecovery() === false) return;
    } else {
      const rec = loadRecoveryState(storageUserId);
      if (!rec) {
        showToast('No se encontró copia de recuperación.', 'error');
        return;
      }
      if (!saveRecoveryState(state, storageUserId, 'manual_snapshot', 'Previo a restaurar copia de recuperación')) {
        showToast('No se pudo guardar una copia previa. La restauración quedó detenida.', 'error'); return;
      }
      if (onUpdateState((draft) => {
        Object.assign(draft, rec.state);
      }) === false) return;
      showToast('Copia de recuperación restaurada con éxito.', 'success');
    }
    setIsRestoreModalOpen(false);
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
    if (syncStatus === 'locked') return { dotClass: 'bg-amber-500', label: 'Sincronización bloqueada', textColor: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10' };
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
        label: 'Sin conexión',
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
    <div className="config-refinement space-y-5 sm:space-y-6">
      <PageHeader
        title="Configuración"
      />

      <nav aria-label="Secciones de Configuración" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-[var(--border)] pb-3 text-sm font-semibold text-[var(--text-soft)]">
        <a href="#config-account" className="min-h-10 content-center hover:text-[var(--blue)]">Mi cuenta</a>
        <a href="#security-section" className="min-h-10 content-center hover:text-[var(--blue)]">Privacidad y seguridad</a>
        <a href="#config-backups" className="min-h-10 content-center hover:text-[var(--blue)]">Copias de seguridad</a>
        <a href="#config-preferences" className="min-h-10 content-center hover:text-[var(--blue)]">Preferencias</a>
        <a href="#config-diagnostics" className="min-h-10 content-center hover:text-[var(--blue)]">Diagnóstico</a>
      </nav>
      {/* Alerta prioritaria si hay discrepancia en finanzas */}
      {discrepantShadows.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <AppIcon name="alertTriangle" className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300">
                Diferencia entre saldos detectada ({discrepantShadows.length} {discrepantShadows.length === 1 ? 'cuenta' : 'cuentas'})
              </h3>
              <p className="text-[11px] text-[var(--text-soft)]">
                El saldo guardado no coincide con los movimientos registrados. Revisá las diferencias antes de corregir.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenRepairModal}
            className="shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
          >
            <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
            <span>Revisar saldos</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          {/* Mi cuenta */}
          <div id="config-account" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[var(--text)]">Mi cuenta</h2>
                <p className="text-xs text-[var(--text-soft)]">
                  Tu cuenta de Google y el estado de sincronización.
                </p>
              </div>
              <ContextualHelp label="Sincronización con Google">
                Iniciar sesión y sincronizar no demuestran por sí solos que los datos estén cifrados. Consultá el estado del cifrado en Privacidad y seguridad.
              </ContextualHelp>
            </div>

            {cloudConfigured ? (
              cloudUser ? (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                    <div className="flex items-center gap-3 min-w-0">
                      {cloudUser.photoURL ? (
                        <img src={cloudUser.photoURL} alt={cloudUser.name} className="h-10 w-10 rounded-full border border-[var(--border)] shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-[var(--blue)]/20 text-[var(--blue)] flex items-center justify-center font-bold text-sm shrink-0">
                          {cloudUser.name ? cloudUser.name[0].toUpperCase() : 'G'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[var(--text)] break-words">{cloudUser.name || 'Usuario Google'}</p>
                        <p className="text-[11px] text-[var(--text-soft)] break-all">{cloudUser.email}</p>
                        {lastSyncedAt && (
                          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">
                            Última sincronización: <strong className="text-[var(--text)]">{lastSyncedAt}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-bold shrink-0 ${syncStatusMeta.textColor}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${syncStatusMeta.dotClass}`} />
                      <span>{syncStatusMeta.label}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
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
                        className="px-3.5 py-2 border border-[var(--border)] hover:border-red-500/40 text-[var(--text-soft)] hover:text-red-600 dark:hover:text-red-400 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        <span>Cerrar sesión</span>
                      </button>
                    )}
                  </div>
                  {onCloudSignOut && <p className="text-sm text-[var(--text-soft)]">Cerrar sesión detiene la sincronización en este navegador.</p>}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-[var(--text-soft)] leading-relaxed">
                    Conectá Google para sincronizar entre tus dispositivos.
                  </p>
                  {onCloudSignIn && (
                    <button
                      type="button"
                      onClick={onCloudSignIn}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                    >
                      <AppIcon name="cloud" className="h-4 w-4" />
                      <span>Conectar con Google</span>
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="p-3 rounded-xl bg-[var(--surface-muted)] text-xs text-[var(--text-soft)]">
                Celestian opera en modo local en este dispositivo (sin conexión a Firebase).
              </div>
            )}
          </div>

          {/* Privacidad y Cifrado de Extremo a Extremo */}
          <div id="security-section" className="xl:col-start-2 xl:row-start-1 xl:row-span-2">
            <PrivacySecuritySection
              state={state}
              storageUserId={effectiveUserId}
              cloudConnected={Boolean(cloudUser)}
              onForceSync={onForceSync}
            />
          </div>

          {/* Backup y Gestión de Datos */}
          <div id="config-backups" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[var(--text)]">Copias de seguridad</h2>
                <ContextualHelp label="Copias de respaldo">
                  Las copias locales son archivos JSON descargables a tu equipo. Son independientes de la sincronización y del cifrado E2EE en la nube.
                </ContextualHelp>
              </div>
              <p className="text-xs text-[var(--text-soft)]">
                Guardá un archivo JSON fuera de este dispositivo. Esta copia no queda cifrada por la sincronización.
              </p>
              {state.settings?.lastBackupAt && (
                <p className="text-[11px] tabular-nums text-[var(--blue)] mt-1 font-medium">
                  Última exportación registrada: {state.settings.lastBackupAt}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onExportJSON}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
              >
                <AppIcon name="cloud" className="h-3.5 w-3.5" />
                <span>Descargar copia</span>
              </button>

              <label className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] text-xs font-bold rounded-xl hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs">
                <AppIcon name="rotateCcw" className="h-3.5 w-3.5 text-[var(--blue)]" />
                <span>Importar copia</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Slot de recuperación disponible */}
            {recoveryInfo && (
              <div className="bg-[var(--bg-elevated)] border border-emerald-500/30 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AppIcon name="shield" className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-xs font-bold text-[var(--text)]">Copia de emergencia en este navegador</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Lista
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-soft)]">
                  Capturada: {recoveryInfo.meta?.savedAt ? new Date(recoveryInfo.meta.savedAt).toLocaleString('es-UY') : 'Reciente'} · {recoveryInfo.meta?.description || recoveryInfo.meta?.action || 'Copia preventiva'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-bold rounded-xl text-[var(--text)] cursor-pointer transition-colors shadow-2xs"
                >
                  <AppIcon name="rotateCcw" className="h-3.5 w-3.5 text-[var(--blue)]" />
                  <span>Restaurar copia de emergencia</span>
                </button>
              </div>
            )}


          </div>

      </div>
      <section id="config-preferences" className="space-y-4">
        <h2 className="text-lg font-bold text-[var(--text)]">Preferencias</h2>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          {/* Formulario de Perfil y Metas */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-[var(--text)]">Perfil y objetivos</h2>
              <p className="text-xs text-[var(--text-soft)]">
                Datos personales utilizados para estimaciones corporales y objetivos mensuales.
              </p>
            </div>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="config-name" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Nombre o apodo
                  </label>
                  <input id="config-name"
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Ej: Chino"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                  />
                </div>

                <div>
                  <label htmlFor="config-height" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Altura (cm)
                  </label>
                  <input id="config-height"
                    type="number"
                    value={profileHeight}
                    onChange={(e) => setProfileHeight(e.target.value)}
                    placeholder="175"
                    className="w-full px-3 py-2 text-xs tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                  />
                </div>

                <div>
                  <label htmlFor="config-body-sex" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Sexo para cálculos corporales
                  </label>
                  <select id="config-body-sex"
                    value={profileBodySex}
                    onChange={(e) => setProfileBodySex(e.target.value as '' | 'male' | 'female')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)] cursor-pointer"
                  >
                    <option value="">Seleccionar…</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                  </select>
                  <p className="mt-1 text-[10px] text-[var(--text-faint)]">Se guarda en tu perfil y se usa para fórmulas como RFM.</p>
                </div>

                <div>
                  <label htmlFor="config-stream-goal" className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Transmisiones por mes
                  </label>
                  <input id="config-stream-goal"
                    type="number"
                    value={streamGoal}
                    onChange={(e) => setStreamGoal(e.target.value)}
                    placeholder="12"
                    className="w-full px-3 py-2 text-xs tabular-nums rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border)] flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>

<div className="space-y-6">          {/* Módulos visibles */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
            <div>
              <h2 className="text-sm font-bold text-[var(--text)]">Módulos visibles</h2>
              <p className="text-xs text-[var(--text-soft)]">
                Elegí qué módulos mostrar en la barra lateral. Ocultar un módulo no borra sus datos.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
              {NAV_ITEMS.filter((item) => item.optional).map((item) => {
                const isHidden = isModuleHidden(state, item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleTab(item.id)}
                    aria-pressed={!isHidden}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold flex flex-wrap items-center justify-between gap-2 transition-colors cursor-pointer ${
                      !isHidden
                        ? 'bg-[var(--bg-elevated)] border-[var(--blue)] text-[var(--text)] ring-1 ring-[var(--blue)]/30 shadow-2xs'
                        : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-faint)] hover:border-[var(--border-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AppIcon
                        name={item.icon}
                        className={`h-4 w-4 ${!isHidden ? 'text-[var(--blue)]' : 'text-[var(--text-faint)]'}`}
                      />
                      <span>{item.label}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        !isHidden
                          ? 'bg-blue-500/10 text-[var(--blue)] border border-blue-500/20'
                          : 'bg-[var(--surface-muted)] text-[var(--text-faint)] border border-[var(--border)]'
                      }`}
                    >
                      {!isHidden ? 'Visible' : 'Oculto'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recordatorios de Atención ahora */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-3 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                  <AppIcon name="bell" className="h-4 w-4 text-amber-500" />
                  <span>Recordatorios de «Atención ahora»</span>
                </h2>
                <p className="text-xs text-[var(--text-soft)] mt-0.5">
                  {dismissedAttentionItems.length === 0
                    ? 'No hay avisos silenciados.'
                    : `Tenés ${dismissedAttentionItems.length === 1 ? '1 aviso silenciado' : `${dismissedAttentionItems.length} avisos silenciados`} para sus ocurrencias actuales.`}
                </p>
              </div>
              {dismissedAttentionItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDismissedModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--bg-elevated)] text-[var(--text)] transition cursor-pointer shadow-2xs self-start sm:self-auto"
                >
                  <AppIcon name="rotateCcw" className="h-3.5 w-3.5 text-[var(--blue)]" />
                  <span>Gestionar avisos silenciados</span>
                </button>
              )}
            </div>
          </div>
</div>
        </div>
      </section>
          {/* Auditoría y Consistencia */}
          <details id="config-diagnostics" className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
            <summary className="min-h-11 cursor-pointer text-base font-bold text-[var(--text)]">Diagnóstico de datos <span className="ml-2 text-sm font-normal text-[var(--text-soft)]">Saldos y almacenamiento</span></summary>
            {/* Tarjeta Finanzas */}
            <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AppIcon name="wallet" className="h-4 w-4 text-[var(--emerald)]" />
                  <h3 className="text-xs font-bold text-[var(--text)]">Consistencia de Finanzas</h3>
                </div>
                {discrepantShadows.length === 0 ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Saldos coincidentes
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                    {discrepantShadows.length} {discrepantShadows.length === 1 ? 'cuenta divergente' : 'cuentas divergentes'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-[var(--surface-muted)]">
                  <span className="block text-[10px] font-semibold text-[var(--text-faint)] uppercase">Cuentas auditadas</span>
                  <span className="tabular-nums font-bold text-[var(--text)]">
                    {financeShadows.length} cuenta{financeShadows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-muted)]">
                  <span className="block text-[10px] font-semibold text-[var(--text-faint)] uppercase">Estado contable</span>
                  <span className="tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                    {financeShadows.length - discrepantShadows.length} coincidente{financeShadows.length - discrepantShadows.length === 1 ? '' : 's'}
                  </span>
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

              {discrepantShadows.length > 0 ? (
                <button
                  type="button"
                  onClick={handleOpenRepairModal}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-2xs"
                >
                  <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
                  <span>Revisar y corregir saldos</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenRepairModal}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-soft)] hover:text-[var(--text)] font-medium text-xs rounded-xl transition-all cursor-pointer"
                >
                  <AppIcon name="check" className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Revisar saldos</span>
                </button>
              )}
            </div>

            {/* Tarjeta Gimnasio */}
            {(!isModuleHidden(state, 'gimnasio') || staleGymCount > 0) && (
              <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AppIcon name="dumbbell" className="h-4 w-4 text-[var(--purple)]" />
                    <h3 className="text-xs font-bold text-[var(--text)]">Consistencia de Gimnasio</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface-muted)] text-[var(--text-soft)] border border-[var(--border)]">
                    {sortedGymSessions.length} sesiones
                  </span>
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
                  {staleGymCount > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Sesiones previas incompletas:</span>
                      <strong className="font-bold">{staleGymCount}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Diagnóstico técnico y almacenamiento (Divulgación Progresiva) */}
            <details className="pt-2 border-t border-[var(--border)] group">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--text-soft)] hover:text-[var(--text)] flex items-center justify-between py-1 select-none">
                <span className="flex items-center gap-1.5">
                  <AppIcon name="shield" className="h-3.5 w-3.5 text-[var(--blue)]" />
                  <span>Almacenamiento y detalles técnicos</span>
                </span>
                <span className="text-[10px] font-mono text-[var(--text-faint)]">
                  Dispositivo: {deviceId.slice(0, 8)}…
                </span>
              </summary>
              <div className="pt-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text)]">Almacenamiento Local</h3>
                    <p className="text-[11px] text-[var(--text-soft)]">IndexedDB / LocalStorage</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiagnostics(getStorageDiagnostics(storageUserId))}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-bold rounded-xl hover:border-[var(--blue)] cursor-pointer transition-colors shadow-2xs text-[var(--text)]"
                  >
                    <AppIcon name="search" className="h-3.5 w-3.5 text-[var(--blue)]" />
                    <span>Diagnosticar</span>
                  </button>
                </div>

                {diagnostics && (
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="rounded-xl bg-[var(--surface-muted)] p-2.5">
                      <span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Motor</span>
                      <strong className="text-[var(--text)]">{diagnostics.backend}</strong>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-muted)] p-2.5">
                      <span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Esquema</span>
                      <strong className="text-[var(--text)]">v{diagnostics.schemaVersion}</strong>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-muted)] p-2.5">
                      <span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Datos</span>
                      <strong className="tabular-nums text-[var(--text)]">{diagnostics.primaryBytes.toLocaleString('es-UY')} B</strong>
                    </div>
                    <div className="rounded-xl bg-[var(--surface-muted)] p-2.5">
                      <span className="block text-[10px] font-bold uppercase text-[var(--text-faint)]">Recuperación</span>
                      <strong className="tabular-nums text-[var(--text)]">{diagnostics.recoveryAvailable ? `${diagnostics.recoveryBytes.toLocaleString('es-UY')} B` : 'Sin copia'}</strong>
                    </div>
                  </div>
                )}
              </div>
            </details>
          </details>


      <section className="rounded-2xl border border-rose-500/30 p-4 sm:p-5" aria-label="Reiniciar datos">
        <h2 className="text-base font-bold text-[var(--text)]">Reiniciar datos</h2>
        <p className="mt-1 text-sm text-[var(--text-soft)]">Reemplaza los datos actuales por los valores iniciales. Revisá la confirmación antes de continuar.</p>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold rounded-xl hover:bg-red-500/20 cursor-pointer transition-colors shadow-2xs"
              >
                <AppIcon name="trash" className="h-3.5 w-3.5" />
                <span>Reiniciar datos</span>
              </button>
            </div>
      </section>
          {/* Acerca de Celestian, Privacidad y Licencias */}
          <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3" aria-labelledby="about-celestian-title">
            <div className="space-y-1">
              <h2 id="about-celestian-title" className="text-sm font-bold text-[var(--text)]">Acerca de Celestian</h2>
              <p className="text-xs text-[var(--text-soft)]">
                Organización personal con almacenamiento local y sincronización opcional con Google.
              </p>
            </div>
            <div className="space-y-2 pt-1 border-t border-[var(--border)]">
              <details className="text-xs text-[var(--text-soft)] rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/30 p-2.5">
                <summary className="min-h-8 cursor-pointer font-semibold text-[var(--text)] select-none">
                  Privacidad, seguridad y tratamiento de datos
                </summary>
                <div className="space-y-2 pt-2 leading-relaxed border-t border-[var(--border)]/50 mt-1.5">
                  <p>La base de datos local se guarda de forma autónoma en el almacenamiento del navegador. El cifrado de sincronización E2EE protege tus módulos antes de subirlos a Firebase, pero no altera los backups JSON descargados. Recordá guardar periódicamente un respaldo fuera de este dispositivo.</p>
                  <p>Al conectar tu cuenta de Google, la sincronización se realiza mediante Firebase. Si activás la protección de extremo a extremo, la clave de recuperación nunca sale de tu navegador.</p>
                  <p>El clima consulta Open-Meteo según la ubicación seleccionada. Las funciones de asistencia no envían datos sin tu consentimiento.</p>
                </div>
              </details>

              <details className="text-xs text-[var(--text-soft)] rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/30 p-2.5">
                <summary className="min-h-8 cursor-pointer font-semibold text-[var(--text)] select-none">
                  Política de privacidad y términos y condiciones
                </summary>
                <p className="pt-2 leading-relaxed border-t border-[var(--border)]/50 mt-1.5">
                  Esta descripción refleja el funcionamiento técnico actual de la aplicación. Celestian es una herramienta de productividad personal diseñada con principios de soberanía de datos del usuario.
                </p>
              </details>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)]/30 p-2.5 space-y-1.5">
                <h3 className="text-xs font-semibold text-[var(--text)]">Créditos y licencias</h3>
                <p className="text-xs text-[var(--text-soft)]">Iconos por <a href="https://icons8.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--blue)]">Icons8</a>.</p>
                <p className="text-xs text-[var(--text-soft)]">Fotografía panorámica del Hero adaptada de una obra de Andrew Bossi.</p>
                <a href="/creditos.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center text-xs font-semibold text-[var(--blue)] underline underline-offset-2 hover:text-[var(--blue-hover)]">
                  Ver atribución, modificaciones y licencia (nueva pestaña)
                </a>
              </div>
            </div>
          </section>

      {/* Modal 1: Revisar copia antes de importar */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="Revisar copia antes de importar" className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AppIcon name="cloud" className="h-5 w-5 text-[var(--blue)]" />
                  <h3 className="text-base font-bold text-[var(--text)]">Revisar copia antes de importar</h3>
                </div>
                <p className="text-xs text-[var(--text-soft)]">
                  Archivo seleccionado: <strong className="text-[var(--text)] font-mono">{importFileName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-[var(--surface-muted)] rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--text-soft)]">Perfil en backup:</span>
                <strong className="text-[var(--text)]">{importPreview.profileName || 'No especificado'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-soft)]">Versión de esquema:</span>
                <strong className="text-[var(--text)]">v{importPreview.schemaVersion}</strong>
              </div>
              {importPreview.backupDate && (
                <div className="flex justify-between">
                  <span className="text-[var(--text-soft)]">Fecha de exportación:</span>
                  <strong className="text-[var(--text)]">{importPreview.backupDate}</strong>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">Entidades a importar:</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-[var(--surface-muted)] flex justify-between">
                  <span className="text-[var(--text-soft)]">Tareas:</span>
                  <strong className="text-[var(--text)]">{importPreview.tasksCount}</strong>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-muted)] flex justify-between">
                  <span className="text-[var(--text-soft)]">Transacciones:</span>
                  <strong className="text-[var(--text)]">{importPreview.transactionsCount}</strong>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-muted)] flex justify-between">
                  <span className="text-[var(--text-soft)]">Cuentas:</span>
                  <strong className="text-[var(--text)]">{importPreview.accountsCount}</strong>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-muted)] flex justify-between">
                  <span className="text-[var(--text-soft)]">Sesiones Gym:</span>
                  <strong className="text-[var(--text)]">{importPreview.gymSessionsCount}</strong>
                </div>
                <div className="p-2 rounded-lg bg-[var(--surface-muted)] flex justify-between">
                  <span className="text-[var(--text-soft)]">Notas:</span>
                  <strong className="text-[var(--text)]">{importPreview.notesCount}</strong>
                </div>
              </div>
            </div>

            {importPreview.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AppIcon name="shield" className="h-4 w-4" />
                  <span>Avisos de compatibilidad</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {importPreview.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-[var(--text-soft)] flex items-start gap-2">
              <AppIcon name="shield" className="h-4 w-4 text-[var(--blue)] shrink-0 mt-0.5" />
              <span>
                Al confirmar, tus datos actuales se guardarán automáticamente en una copia de recuperación de emergencia antes de aplicar el nuevo archivo.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
              >
                Confirmar y Reemplazar Datos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Confirmar Reinicio de Datos */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="Reiniciar datos" className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                <AppIcon name="shield" className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Reiniciar datos</h3>
                <p className="text-xs text-[var(--text-soft)]">Operación destructiva</p>
              </div>
            </div>

            <div className="text-xs text-[var(--text-soft)] space-y-2">
              <p>
                Esta acción reemplazará todas las tareas, finanzas, notas y registros de este dispositivo por el estado inicial en blanco de Celestian LifeOS.
              </p>
              <ul className="space-y-1 text-[11px] list-disc list-inside">
                <li>Tu sesión de Google <strong>no</strong> se cerrará.</li>
                <li>Antes del reinicio se guardará una copia de emergencia en este navegador.</li>
                <li>Si estás conectado a la nube, los datos limpios se propagarán a tus otros dispositivos.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
              >
                Sí, Reiniciar Todo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Confirmar Restauración de Copia de Recuperación */}
      {isRestoreModalOpen && recoveryInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="Restaurar copia de emergencia" className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <AppIcon name="rotateCcw" className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Restaurar copia de emergencia</h3>
                <p className="text-xs text-[var(--text-soft)]">Recuperación de emergencia</p>
              </div>
            </div>

            <div className="bg-[var(--surface-muted)] rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--text-soft)]">Fecha de captura:</span>
                <strong className="text-[var(--text)]">
                  {recoveryInfo.meta?.savedAt ? new Date(recoveryInfo.meta.savedAt).toLocaleString('es-UY') : 'Desconocida'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-soft)]">Motivo registrado:</span>
                <strong className="text-[var(--text)]">
                  {recoveryInfo.meta?.description || recoveryInfo.meta?.action || 'Manual'}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-soft)]">Versión de esquema:</span>
                <strong className="text-[var(--text)]">v{recoveryInfo.meta?.schemaVersion || CURRENT_SCHEMA_VERSION}</strong>
              </div>
            </div>

            <p className="text-xs text-[var(--text-soft)]">
              Esta copia reemplazará tus datos actuales. Antes se guardará una copia de emergencia para poder volver atrás.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIsRestoreModalOpen(false)}
                className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRestoreRecovery}
                className="px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
              >
                Restaurar Copia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Reparación de Saldos */}
      {isRepairModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-label="Auditoría y Reparación de Saldos" className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <AppIcon name="wallet" className="h-5 w-5 text-amber-500" />
                  <h3 className="text-base font-bold text-[var(--text)]">Auditoría y Reparación de Saldos</h3>
                </div>
                <p className="text-xs text-[var(--text-soft)]">
                  Se detectaron discrepancias entre el saldo de las cuentas y el libro contable cerrado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRepairModalOpen(false)}
                className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {accountDiffs.map((diff) => {
                const diffAmount = diff.difference ?? (diff.computedBalance !== null ? Math.round((diff.computedBalance - diff.currentBalance) * 100) / 100 : null);
                const curPrefix = diff.currency === 'USD' ? 'US$ ' : '$U ';
                return (
                  <div key={diff.id} className="p-3 rounded-xl bg-[var(--surface-muted)] text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text)]">{diff.name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[var(--text-soft)]">
                        {diff.currency}
                      </span>
                    </div>

                    {diff.repairable && diff.computedBalance !== null ? (
                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div>
                          <span className="text-[var(--text-faint)] block">Saldo actual:</span>
                          <strong className="text-[var(--text)]">
                            <PrivacyAmount>{curPrefix}{diff.currentBalance.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</PrivacyAmount>
                          </strong>
                        </div>
                        <div>
                          <span className="text-[var(--text-faint)] block">Libro contable:</span>
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            <PrivacyAmount>{curPrefix}{diff.computedBalance.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</PrivacyAmount>
                          </strong>
                        </div>
                        <div>
                          <span className="text-[var(--text-faint)] block">Ajuste:</span>
                          <strong className={diffAmount && diffAmount >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            <PrivacyAmount>
                              {diffAmount && diffAmount >= 0 ? '+' : ''}
                              {curPrefix}
                              {diffAmount !== null ? diffAmount.toLocaleString('es-UY', { minimumFractionDigits: 2 }) : '0,00'}
                            </PrivacyAmount>
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-600 dark:text-amber-400 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        ⚠️ <strong>Protegida:</strong> {diff.unrepairableReason || 'No se puede reparar automáticamente para evitar pérdida de datos.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-[var(--text-soft)] flex items-start gap-2">
              <AppIcon name="shield" className="h-4 w-4 text-[var(--blue)] shrink-0 mt-0.5" />
              <span>
                Antes de aplicar la corrección de saldos, Celestian guardará automáticamente una copia en recuperación.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIsRepairModalOpen(false)}
                className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRepairBalances}
                disabled={accountDiffs.every((d) => !d.repairable)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-xl cursor-pointer shadow-2xs"
              >
                Aplicar Reparación de Saldos
              </button>
            </div>
          </div>
        </div>
      )}

      <DismissedAttentionModal
        open={showDismissedModal}
        onClose={() => setShowDismissedModal(false)}
        dismissedItems={dismissedAttentionItems}
        onRestoreItem={handleRestoreAttentionItem}
        onRestoreAll={handleRestoreAllDismissed}
      />
    </div>
  );
};
