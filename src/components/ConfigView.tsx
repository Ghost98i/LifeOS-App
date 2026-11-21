import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  Cloud,
  Dumbbell,
  HardDrive,
  Info,
  Radio,
  RotateCcw,
  Search,
  Shield,
  Sliders,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { LifeOSState } from '../types';
import { NAV_ITEMS } from './Sidebar';
import { isModuleHidden, isStreamingEnabled } from '../lib/moduleVisibility';
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
import { PrivacyAmount } from './PrivacyAmount';
import { PrivacySecuritySection } from './PrivacySecuritySection';
import { getDismissedAttentionItems, nextAttentionDismissalTimestamp, type AttentionItem } from '../lib/todayAttention';
import { DismissedAttentionModal } from './DismissedAttentionModal';
import { ListDivider, SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';
import type { AttentionDismissalRecord } from '../types';

export type ConfigTab = 'cuenta' | 'preferencias' | 'copias' | 'diagnostico';

const CONFIG_TABS: ReadonlyArray<{ id: ConfigTab; label: string }> = [
  { id: 'cuenta', label: 'Cuenta y Seguridad' },
  { id: 'preferencias', label: 'Preferencias' },
  { id: 'copias', label: 'Copias y Datos' },
  { id: 'diagnostico', label: 'Diagnóstico' },
];

const resolveTabFromHash = (hash: string): ConfigTab | null => {
  if (hash === '#config-account' || hash === '#security-section') return 'cuenta';
  if (hash === '#config-preferences') return 'preferencias';
  if (hash === '#config-backups') return 'copias';
  if (hash === '#config-diagnostics') return 'diagnostico';
  return null;
};

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
  onDeleteCloudAccount?: () => Promise<void>;
  onDeleteLocalData?: () => void;
  onForceSync?: () => void;
  initialTab?: ConfigTab;
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
  onDeleteCloudAccount,
  onDeleteLocalData,
  onForceSync,
  initialTab = 'cuenta',
}) => {
  const [activeTab, setActiveTab] = useState<ConfigTab>(() => {
    if (typeof window !== 'undefined') {
      const fromHash = resolveTabFromHash(window.location.hash);
      if (fromHash) return fromHash;
    }
    return initialTab;
  });
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
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => { setAvatarError(false); }, [cloudUser?.photoURL]);
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
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const fromHash = resolveTabFromHash(window.location.hash);
      if (fromHash) setActiveTab(fromHash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!importPreview && !isResetModalOpen && !isRestoreModalOpen && !isRepairModalOpen && !isAboutModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (importPreview) setImportPreview(null);
        if (isResetModalOpen) setIsResetModalOpen(false);
        if (isRestoreModalOpen) setIsRestoreModalOpen(false);
        if (isRepairModalOpen) setIsRepairModalOpen(false);
        if (isAboutModalOpen) setIsAboutModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [importPreview, isResetModalOpen, isRestoreModalOpen, isRepairModalOpen, isAboutModalOpen]);

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

  const streamingEnabled = isStreamingEnabled(state);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = onUpdateState((draft) => {
      if (!draft.profile) draft.profile = { name: '', height: 170, bodyCompositionSex: null };
      draft.profile.name = profileName.trim();
      draft.profile.height = Number(profileHeight) || 170;
      draft.profile.bodyCompositionSex = profileBodySex || null;
      if (streamingEnabled) {
        if (!draft.streaming) draft.streaming = { sessions: [], monthlyGoal: 12, preStreamChecklist: [], contentPipeline: [] };
        draft.streaming.monthlyGoal = Number(streamGoal) || 12;
      }
    });
    if (saved === false) return;
    showToast('Configuración guardada.');
  };

  const handleToggleStreaming = () => {
    onUpdateState((draft) => {
      if (!draft.settings) draft.settings = { hiddenTabs: [] } as any;
      draft.settings.streamingEnabled = !streamingEnabled;
    });
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
        dotClass: 'bg-emerald-500',
        label: 'Sincronizado',
        textColor: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/25 bg-emerald-500/10',
      };
    }
    if (syncStatus === 'saving' || syncStatus === 'connecting') {
      return {
        dotClass: 'bg-amber-500 animate-pulse',
        label: syncStatus === 'connecting' ? 'Conectando...' : 'Guardando cambios...',
        textColor: 'text-amber-700 dark:text-amber-300 border-amber-500/25 bg-amber-500/10',
      };
    }
    if (syncStatus === 'conflict') {
      return {
        dotClass: 'bg-rose-500',
        label: 'Conflicto de versiones',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/25 bg-rose-500/10',
      };
    }
    if (syncStatus === 'locked') return { dotClass: 'bg-amber-500', label: 'Sincronización bloqueada', textColor: 'text-amber-700 dark:text-amber-300 border-amber-500/25 bg-amber-500/10' };
    if (syncStatus === 'error') {
      return {
        dotClass: 'bg-rose-500',
        label: 'Error al sincronizar',
        textColor: 'text-rose-700 dark:text-rose-300 border-rose-500/25 bg-rose-500/10',
      };
    }
    if (syncStatus === 'offline') {
      return {
        dotClass: 'bg-slate-400',
        label: 'Sin conexión',
        textColor: 'text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]',
      };
    }
    return {
      dotClass: 'bg-slate-400',
      label: 'Desconectado',
      textColor: 'text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]',
    };
  })();

  const fieldClass =
    'w-full min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100';
  const primaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const secondaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer';

  return (
    <div className="config-refinement max-w-4xl space-y-5 sm:space-y-6">
      <PageHeader
        title="Configuración"
        actions={(
          <button
            type="button"
            onClick={() => setIsAboutModalOpen(true)}
            aria-label="Créditos, privacidad y términos"
            title="Créditos, privacidad y términos"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
          >
            <Info size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      />

      <div role="tablist" aria-label="Secciones de Configuración" className="flex w-full items-center gap-1 overflow-x-auto border-b border-slate-200/80 pb-px dark:border-white/[0.08]">
        {CONFIG_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={`relative min-h-11 shrink-0 whitespace-nowrap px-3 py-2.5 text-sm transition-colors cursor-pointer sm:px-4 ${
                isSelected
                  ? 'font-semibold text-[#4F46E5] dark:text-indigo-300'
                  : 'font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
              {isSelected && (
                <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[#4F46E5]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Alerta prioritaria si hay discrepancia en finanzas */}
      {discrepantShadows.length > 0 && (
        <SurfaceCard className="border-amber-500/35 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Diferencia entre saldos detectada ({discrepantShadows.length} {discrepantShadows.length === 1 ? 'cuenta' : 'cuentas'})
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                El saldo guardado no coincide con los movimientos registrados. Revisá las diferencias antes de corregir.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenRepairModal}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-600 cursor-pointer"
          >
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
            <span>Revisar saldos</span>
          </button>
        </SurfaceCard>
      )}

      {activeTab === 'cuenta' && (
        <div role="tabpanel" aria-label="Cuenta y Seguridad" className="grid grid-cols-1 gap-5">
          {/* Mi cuenta */}
          <SurfaceCard id="config-account" className="p-4 sm:p-5 space-y-4">
            <SectionHeader
              icon={<Cloud size={16} strokeWidth={1.75} />}
              title="Mi cuenta"
            />

            {cloudConfigured ? (
              cloudUser ? (
                <div className="space-y-3 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      {cloudUser.photoURL && !avatarError ? (
                        <img
                          src={cloudUser.photoURL}
                          alt={cloudUser.name}
                          onError={() => setAvatarError(true)}
                          className="h-10 w-10 shrink-0 rounded-full border border-slate-200/80 dark:border-white/[0.08]"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-sm font-semibold text-white">
                          {(cloudUser.name || cloudUser.email || 'C')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">{cloudUser.name || 'Usuario Google'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{cloudUser.email}</p>
                        {lastSyncedAt && (
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Última sincronización: <strong className="text-slate-900 dark:text-slate-100">{lastSyncedAt}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${syncStatusMeta.textColor}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${syncStatusMeta.dotClass}`} />
                      <span>{syncStatusMeta.label}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {onForceSync && (
                      <button type="button" onClick={onForceSync} className={primaryBtnClass}>
                        <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span>Sincronizar ahora</span>
                      </button>
                    )}
                    {onCloudSignOut && (
                      <button
                        type="button"
                        onClick={onCloudSignOut}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200/80 px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-rose-500/40 hover:text-rose-600 dark:border-white/[0.08] dark:text-slate-300 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <span>Cerrar sesión</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    Conectá Google para sincronizar entre tus dispositivos.
                  </p>
                  {onCloudSignIn && (
                    <button type="button" onClick={onCloudSignIn} className={primaryBtnClass}>
                      <Cloud size={15} strokeWidth={1.75} aria-hidden="true" />
                      <span>Conectar con Google</span>
                    </button>
                  )}
                </div>
              )
            ) : (
              <p className="border-t border-slate-100 pt-3 text-sm text-slate-500 dark:border-white/[0.06] dark:text-slate-400">
                Celestian opera en modo local en este dispositivo (sin conexión a Firebase).
              </p>
            )}
          </SurfaceCard>

          {/* Privacidad y Cifrado de Extremo a Extremo */}
          <div id="security-section">
            <PrivacySecuritySection
              state={state}
              storageUserId={effectiveUserId}
              cloudConnected={Boolean(cloudUser)}
              onForceSync={onForceSync}
              onDeleteCloudAccount={onDeleteCloudAccount}
              onDeleteLocalData={onDeleteLocalData}
            />
          </div>
        </div>
      )}

      {activeTab === 'copias' && (
        <div role="tabpanel" aria-label="Copias y Datos" className="space-y-4">
          {/* Backup y Gestión de Datos */}
          <SurfaceCard id="config-backups" className="p-4 sm:p-5 space-y-4">
            <div className="space-y-1">
              <SectionHeader
                icon={<HardDrive size={16} strokeWidth={1.75} />}
                title="Copias de seguridad"
              />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Archivo JSON local; no queda cifrado por la sincronización.
              </p>
              {state.settings?.lastBackupAt && (
                <p className="pt-0.5 text-xs font-medium tabular-nums text-[#4F46E5] dark:text-indigo-400">
                  Última exportación registrada: {state.settings.lastBackupAt}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={onExportJSON} className={primaryBtnClass}>
                <Cloud size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Descargar copia</span>
              </button>

              <label className={secondaryBtnClass}>
                <RotateCcw size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                <span>Importar copia</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Slot de recuperación disponible (flat section, depth = 1) */}
            {recoveryInfo && (
              <div className="border-t border-slate-100 pt-4 space-y-2.5 dark:border-white/[0.06]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Shield size={16} strokeWidth={1.75} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Copia de emergencia en este navegador</h3>
                  </div>
                  <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Lista
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Capturada: {recoveryInfo.meta?.savedAt ? new Date(recoveryInfo.meta.savedAt).toLocaleString('es-UY') : 'Reciente'} · {recoveryInfo.meta?.description || recoveryInfo.meta?.action || 'Copia preventiva'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(true)}
                  className={`${secondaryBtnClass} w-full sm:w-auto`}
                >
                  <RotateCcw size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                  <span>Restaurar copia de emergencia</span>
                </button>
              </div>
            )}
          </SurfaceCard>

          {/* Zona de peligro: Reiniciar datos */}
          <SurfaceCard className="border-rose-500/30 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Reiniciar datos">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reiniciar datos</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Reemplaza los datos actuales por los valores iniciales.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/20 dark:text-rose-400 sm:self-auto cursor-pointer"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Reiniciar datos</span>
            </button>
          </SurfaceCard>
        </div>
      )}

      {activeTab === 'preferencias' && (
        <section id="config-preferences" role="tabpanel" aria-label="Preferencias" className="space-y-4">
          {/* Formulario de Perfil y Metas */}
          <SurfaceCard className="p-4 sm:p-5 space-y-4">
            <SectionHeader icon={<User size={16} strokeWidth={1.75} />} title="Perfil y objetivos" />
            <form onSubmit={handleSaveProfile} className="space-y-4 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="config-name" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Nombre o apodo
                  </label>
                  <input
                    id="config-name"
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Ej: Chino"
                    className={fieldClass}
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="config-height" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Altura (cm)
                  </label>
                  <input
                    id="config-height"
                    type="number"
                    value={profileHeight}
                    onChange={(e) => setProfileHeight(e.target.value)}
                    placeholder="175"
                    className={`${fieldClass} tabular-nums`}
                  />
                </div>

                <div className="min-w-0">
                  <label htmlFor="config-body-sex" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Sexo para cálculos corporales
                  </label>
                  <select
                    id="config-body-sex"
                    value={profileBodySex}
                    onChange={(e) => setProfileBodySex(e.target.value as '' | 'male' | 'female')}
                    className={`${fieldClass} cursor-pointer`}
                  >
                    <option value="">Seleccionar…</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Se guarda en tu perfil y se usa para fórmulas como RFM.</p>
                </div>

                {streamingEnabled && (
                  <div className="min-w-0">
                    <label htmlFor="config-stream-goal" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Transmisiones por mes
                    </label>
                    <input
                      id="config-stream-goal"
                      type="number"
                      value={streamGoal}
                      onChange={(e) => setStreamGoal(e.target.value)}
                      placeholder="12"
                      className={`${fieldClass} tabular-nums`}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                <button type="submit" className={primaryBtnClass}>
                  Guardar cambios
                </button>
              </div>
            </form>
          </SurfaceCard>

          {/* Módulos visibles */}
          <SurfaceCard className="p-4 sm:p-5 space-y-3.5">
            <div className="space-y-1">
              <SectionHeader icon={<Sliders size={16} strokeWidth={1.75} />} title="Módulos visibles" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ocultar un módulo no borra sus datos.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3.5 sm:grid-cols-2 lg:grid-cols-3 dark:border-white/[0.06]">
              {NAV_ITEMS.filter((item) => item.optional).map((item) => {
                const isHidden = isModuleHidden(state, item.id);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleTab(item.id)}
                    aria-pressed={!isHidden}
                    className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer ${
                      !isHidden
                        ? 'border-[#4F46E5]/40 bg-[#4F46E5]/[0.05] text-slate-900 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-slate-100'
                        : 'border-slate-200/80 bg-transparent text-slate-500 hover:border-slate-300 dark:border-white/[0.08] dark:text-slate-400 dark:hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <AppIcon
                        name={item.icon}
                        className={`h-4 w-4 shrink-0 ${!isHidden ? 'text-[#4F46E5] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${
                        !isHidden
                          ? 'border-[#4F46E5]/20 bg-[#4F46E5]/10 text-[#4F46E5] dark:text-indigo-300'
                          : 'border-slate-200/80 bg-slate-50 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400'
                      }`}
                    >
                      {!isHidden ? 'Visible' : 'Oculto'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-3.5 space-y-2 dark:border-white/[0.06]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Herramientas opcionales en Notas
              </p>
              <button
                type="button"
                onClick={handleToggleStreaming}
                aria-pressed={streamingEnabled}
                className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors sm:w-auto sm:min-w-[260px] cursor-pointer ${
                  streamingEnabled
                    ? 'border-[#4F46E5]/40 bg-[#4F46E5]/[0.05] text-slate-900 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-slate-100'
                    : 'border-slate-200/80 bg-transparent text-slate-500 hover:border-slate-300 dark:border-white/[0.08] dark:text-slate-400 dark:hover:border-white/[0.15]'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Radio
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className={`shrink-0 ${streamingEnabled ? 'text-[#4F46E5] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
                  />
                  <span className="truncate">Streaming y contenido</span>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${
                    streamingEnabled
                      ? 'border-[#4F46E5]/20 bg-[#4F46E5]/10 text-[#4F46E5] dark:text-indigo-300'
                      : 'border-slate-200/80 bg-slate-50 text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400'
                  }`}
                >
                  {streamingEnabled ? 'Activo' : 'Oculto'}
                </span>
              </button>
            </div>
          </SurfaceCard>

          {/* Recordatorios de Atención ahora */}
          <SurfaceCard className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <SectionHeader
                  icon={<Bell size={16} strokeWidth={1.75} />}
                  title="Recordatorios de «Atención ahora»"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {dismissedAttentionItems.length === 0
                    ? 'No hay avisos silenciados.'
                    : `Tenés ${dismissedAttentionItems.length === 1 ? '1 aviso silenciado' : `${dismissedAttentionItems.length} avisos silenciados`} para sus ocurrencias actuales.`}
                </p>
              </div>
              {dismissedAttentionItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDismissedModal(true)}
                  className={`${secondaryBtnClass} shrink-0 self-start sm:self-auto`}
                >
                  <RotateCcw size={14} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                  <span>Gestionar avisos silenciados</span>
                </button>
              )}
            </div>
          </SurfaceCard>
        </section>
      )}

      {activeTab === 'diagnostico' && (
        <div role="tabpanel" aria-label="Diagnóstico">
          <SurfaceCard id="config-diagnostics" className="p-4 sm:p-5 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Diagnóstico de datos
              </h2>
            </div>

            {/* Consistencia de Finanzas */}
            <div className="border-t border-slate-100 pt-4 space-y-3 dark:border-white/[0.06]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet size={16} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Consistencia de Finanzas</h3>
                </div>
                {discrepantShadows.length === 0 ? (
                  <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Saldos coincidentes
                  </span>
                ) : (
                  <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {discrepantShadows.length} {discrepantShadows.length === 1 ? 'cuenta divergente' : 'cuentas divergentes'}
                  </span>
                )}
              </div>

              <ListDivider className="text-sm">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Cuentas auditadas</span>
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                    {financeShadows.length} cuenta{financeShadows.length === 1 ? '' : 's'}
                  </strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Estado contable</span>
                  <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                    {financeShadows.length - discrepantShadows.length} coincidente{financeShadows.length - discrepantShadows.length === 1 ? '' : 's'}
                  </strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Transacciones registradas</span>
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">{state.finance?.transactions?.length || 0}</strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Transferencias registradas</span>
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">{state.finance?.transfers?.length || 0}</strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Conciliaciones / Arqueos</span>
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">{state.finance?.reconciliations?.length || 0}</strong>
                </div>
              </ListDivider>

              {discrepantShadows.length > 0 ? (
                <button
                  type="button"
                  onClick={handleOpenRepairModal}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-600 cursor-pointer"
                >
                  <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
                  <span>Revisar y corregir saldos</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenRepairModal}
                  className={`${secondaryBtnClass} w-full`}
                >
                  <Check size={15} strokeWidth={1.75} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Revisar saldos</span>
                </button>
              )}
            </div>

            {/* Consistencia de Gimnasio */}
            {(!isModuleHidden(state, 'gimnasio') || staleGymCount > 0) && (
              <div className="border-t border-slate-100 pt-4 space-y-2.5 dark:border-white/[0.06]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Consistencia de Gimnasio</h3>
                  </div>
                  <span className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400">
                    {sortedGymSessions.length} sesiones
                  </span>
                </div>

                <ListDivider className="text-sm">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 dark:text-slate-400">Sesiones completadas</span>
                    <strong className="tabular-nums text-slate-900 dark:text-slate-100">{sortedGymSessions.filter((s) => s.status === 'completed').length}</strong>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-slate-500 dark:text-slate-400">Sesión activa de hoy</span>
                    <strong className="text-slate-900 dark:text-slate-100">
                      {sortedGymSessions.some((s) => s.date === todayISO() && s.status === 'active') ? 'Sí (en curso)' : 'Ninguna'}
                    </strong>
                  </div>
                  {staleGymCount > 0 && (
                    <div className="flex items-center justify-between py-2 text-amber-700 dark:text-amber-400">
                      <span>Sesiones previas incompletas</span>
                      <strong className="tabular-nums font-semibold">{staleGymCount}</strong>
                    </div>
                  )}
                </ListDivider>
              </div>
            )}

            {/* Diagnóstico técnico y almacenamiento (Divulgación Progresiva) */}
            <details className="group border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 select-none">
                <span className="flex items-center gap-2">
                  <Shield size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                  <span>Almacenamiento y detalles técnicos</span>
                </span>
                <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                  Dispositivo: {deviceId.slice(0, 8)}…
                </span>
              </summary>
              <div className="pt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Almacenamiento Local</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">IndexedDB / LocalStorage</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiagnostics(getStorageDiagnostics(storageUserId))}
                    className={secondaryBtnClass}
                  >
                    <Search size={14} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                    <span>Diagnosticar</span>
                  </button>
                </div>

                {diagnostics && (
                  <ListDivider className="text-sm">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-500 dark:text-slate-400">Motor</span>
                      <strong className="text-slate-900 dark:text-slate-100">{diagnostics.backend}</strong>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-500 dark:text-slate-400">Esquema</span>
                      <strong className="text-slate-900 dark:text-slate-100">v{diagnostics.schemaVersion}</strong>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-500 dark:text-slate-400">Datos</span>
                      <strong className="tabular-nums text-slate-900 dark:text-slate-100">{diagnostics.primaryBytes.toLocaleString('es-UY')} B</strong>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-500 dark:text-slate-400">Recuperación</span>
                      <strong className="tabular-nums text-slate-900 dark:text-slate-100">{diagnostics.recoveryAvailable ? `${diagnostics.recoveryBytes.toLocaleString('es-UY')} B` : 'Sin copia'}</strong>
                    </div>
                  </ListDivider>
                )}
              </div>
            </details>
          </SurfaceCard>
        </div>
      )}

      {/* Modal 1: Revisar copia antes de importar */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Revisar copia antes de importar" className="w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Cloud size={18} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Revisar copia antes de importar</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Archivo seleccionado: <strong className="font-mono text-slate-900 dark:text-slate-100">{importFileName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <ListDivider className="border-t border-slate-100 text-sm dark:border-white/[0.06]">
              <div className="flex justify-between py-2">
                <span className="text-slate-500 dark:text-slate-400">Perfil en backup</span>
                <strong className="text-slate-900 dark:text-slate-100">{importPreview.profileName || 'No especificado'}</strong>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-slate-500 dark:text-slate-400">Versión de esquema</span>
                <strong className="text-slate-900 dark:text-slate-100">v{importPreview.schemaVersion}</strong>
              </div>
              {importPreview.backupDate && (
                <div className="flex justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Fecha de exportación</span>
                  <strong className="text-slate-900 dark:text-slate-100">{importPreview.backupDate}</strong>
                </div>
              )}
            </ListDivider>

            <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Entidades a importar</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Tareas:</span><strong className="tabular-nums text-slate-900 dark:text-slate-100">{importPreview.tasksCount}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Movimientos:</span><strong className="tabular-nums text-slate-900 dark:text-slate-100">{importPreview.transactionsCount}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Cuentas:</span><strong className="tabular-nums text-slate-900 dark:text-slate-100">{importPreview.accountsCount}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Sesiones Gym:</span><strong className="tabular-nums text-slate-900 dark:text-slate-100">{importPreview.gymSessionsCount}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Notas:</span><strong className="tabular-nums text-slate-900 dark:text-slate-100">{importPreview.notesCount}</strong></div>
              </div>
            </div>

            {importPreview.warnings.length > 0 && (
              <div className="border-l-2 border-amber-500 pl-3 py-1 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Shield size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Avisos de compatibilidad</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {importPreview.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="flex items-start gap-2 border-l-2 border-[#4F46E5] pl-3 py-1 text-xs text-slate-600 dark:text-slate-400">
              <Shield size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
              <span>Al confirmar, tus datos actuales se guardarán automáticamente en una copia de recuperación de emergencia antes de aplicar el nuevo archivo.</span>
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" onClick={() => setImportPreview(null)} className={secondaryBtnClass}>
                Cancelar
              </button>
              <button type="button" onClick={handleConfirmImport} className={primaryBtnClass}>
                Confirmar y reemplazar datos
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Modal 2: Confirmar Reinicio de Datos */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Reiniciar datos" className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <Shield size={20} strokeWidth={1.75} className="shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Reiniciar datos</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Operación destructiva</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p>
                Esta acción reemplazará todas las tareas, finanzas, notas y registros de este dispositivo por el estado inicial en blanco de Celestian LifeOS.
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Tu sesión de Google <strong>no</strong> se cerrará.</li>
                <li>Antes del reinicio se guardará una copia de emergencia en este navegador.</li>
                <li>Si estás conectado a la nube, los datos limpios se propagarán a tus otros dispositivos.</li>
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" onClick={() => setIsResetModalOpen(false)} className={secondaryBtnClass}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 cursor-pointer"
              >
                Sí, reiniciar todo
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Modal 3: Confirmar Restauración de Copia de Recuperación */}
      {isRestoreModalOpen && recoveryInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Restaurar copia de emergencia" className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <RotateCcw size={18} strokeWidth={1.75} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Restaurar copia de emergencia</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Recuperación de emergencia</p>
              </div>
            </div>

            <ListDivider className="border-t border-slate-100 text-sm dark:border-white/[0.06]">
              <div className="flex justify-between gap-2 py-2">
                <span className="text-slate-500 dark:text-slate-400">Fecha de captura</span>
                <strong className="text-right text-slate-900 dark:text-slate-100">
                  {recoveryInfo.meta?.savedAt ? new Date(recoveryInfo.meta.savedAt).toLocaleString('es-UY') : 'Desconocida'}
                </strong>
              </div>
              <div className="flex justify-between gap-2 py-2">
                <span className="text-slate-500 dark:text-slate-400">Motivo registrado</span>
                <strong className="text-right text-slate-900 dark:text-slate-100">
                  {recoveryInfo.meta?.description || recoveryInfo.meta?.action || 'Manual'}
                </strong>
              </div>
              <div className="flex justify-between gap-2 py-2">
                <span className="text-slate-500 dark:text-slate-400">Versión de esquema</span>
                <strong className="text-slate-900 dark:text-slate-100">v{recoveryInfo.meta?.schemaVersion || CURRENT_SCHEMA_VERSION}</strong>
              </div>
            </ListDivider>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Esta copia reemplazará tus datos actuales. Antes se guardará una copia de emergencia para poder volver atrás.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" onClick={() => setIsRestoreModalOpen(false)} className={secondaryBtnClass}>
                Cancelar
              </button>
              <button type="button" onClick={handleConfirmRestoreRecovery} className={primaryBtnClass}>
                Restaurar copia
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Modal 4: Reparación de Saldos */}
      {isRepairModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Auditoría y Reparación de Saldos" className="w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wallet size={18} strokeWidth={1.75} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Auditoría y Reparación de Saldos</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Se detectaron discrepancias entre el saldo de las cuentas y el libro contable cerrado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRepairModalOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <ListDivider className="max-h-60 overflow-y-auto border-t border-slate-100 pr-1 dark:border-white/[0.06]">
              {accountDiffs.map((diff) => {
                const diffAmount = diff.difference ?? (diff.computedBalance !== null ? Math.round((diff.computedBalance - diff.currentBalance) * 100) / 100 : null);
                const curPrefix = diff.currency === 'USD' ? 'US$ ' : '$U ';
                return (
                  <div key={diff.id} className="py-3 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{diff.name}</span>
                      <span className="rounded-md border border-slate-200/80 px-1.5 py-0.5 text-xs font-semibold text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
                        {diff.currency}
                      </span>
                    </div>

                    {diff.repairable && diff.computedBalance !== null ? (
                      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <div className="flex justify-between sm:block">
                          <span className="text-slate-500 dark:text-slate-400">Saldo actual:</span>
                          <strong className="block tabular-nums text-slate-900 dark:text-slate-100">
                            <PrivacyAmount>{curPrefix}{diff.currentBalance.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</PrivacyAmount>
                          </strong>
                        </div>
                        <div className="flex justify-between sm:block">
                          <span className="text-slate-500 dark:text-slate-400">Libro contable:</span>
                          <strong className="block tabular-nums text-emerald-700 dark:text-emerald-400">
                            <PrivacyAmount>{curPrefix}{diff.computedBalance.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</PrivacyAmount>
                          </strong>
                        </div>
                        <div className="flex justify-between sm:block">
                          <span className="text-slate-500 dark:text-slate-400">Ajuste:</span>
                          <strong className={`block tabular-nums ${diffAmount && diffAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            <PrivacyAmount>
                              {diffAmount && diffAmount >= 0 ? '+' : ''}
                              {curPrefix}
                              {diffAmount !== null ? diffAmount.toLocaleString('es-UY', { minimumFractionDigits: 2 }) : '0,00'}
                            </PrivacyAmount>
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <div className="border-l-2 border-amber-500 pl-2.5 text-xs text-amber-800 dark:text-amber-300">
                        <strong>Protegida:</strong> {diff.unrepairableReason || 'No se puede reparar automáticamente para evitar pérdida de datos.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </ListDivider>

            <p className="flex items-start gap-2 border-l-2 border-[#4F46E5] pl-3 py-1 text-xs text-slate-600 dark:text-slate-400">
              <Shield size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
              <span>Antes de aplicar la corrección de saldos, Celestian guardará automáticamente una copia en recuperación.</span>
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" onClick={() => setIsRepairModalOpen(false)} className={secondaryBtnClass}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRepairBalances}
                disabled={accountDiffs.every((d) => !d.repairable)}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Aplicar reparación de saldos
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Modal 5: Privacidad y términos */}
      {isAboutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Privacidad y términos" className="w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Privacidad, términos y créditos</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Organización personal con almacenamiento local y sincronización opcional con Google.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[60dvh] overflow-y-auto space-y-3 pr-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              <div className="border-t border-slate-100 pt-3 space-y-1.5 dark:border-white/[0.06]">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Privacidad, seguridad y tratamiento de datos</h4>
                <p>La base de datos local se guarda de forma autónoma en el almacenamiento del navegador. El cifrado de sincronización E2EE protege tus módulos antes de subirlos a Firebase, pero no altera los backups JSON descargados. Recordá guardar periódicamente un respaldo fuera de este dispositivo.</p>
                <p>Al conectar tu cuenta de Google, la sincronización se realiza mediante Firebase. Si activás la protección de extremo a extremo, la clave de recuperación nunca sale de tu navegador.</p>
                <p>El clima consulta Open-Meteo según la ubicación seleccionada. Las funciones de asistencia no envían datos sin tu consentimiento.</p>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1.5 dark:border-white/[0.06]">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Política de privacidad y términos y condiciones</h4>
                <p>Esta descripción refleja el funcionamiento técnico actual de la aplicación. Celestian es una herramienta de productividad personal diseñada con principios de soberanía de datos del usuario.</p>
                <p>Qué datos se guardan, cómo se sincronizan con Firebase y cómo eliminarlos:</p>
                <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-xs font-semibold text-[#4F46E5] underline underline-offset-2 hover:text-[#4338CA] dark:text-indigo-400">
                  Ver política de privacidad completa (nueva pestaña)
                </a>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1 dark:border-white/[0.06]">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Créditos y licencias</h4>
                <p>Iconos de interfaz por Lucide (licencia ISC) e iconos de gimnasio propios de Celestian.</p>
                <a href="/creditos.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-xs font-semibold text-[#4F46E5] underline underline-offset-2 hover:text-[#4338CA] dark:text-indigo-400">
                  Ver atribución y licencias (nueva pestaña)
                </a>
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" onClick={() => setIsAboutModalOpen(false)} className={primaryBtnClass}>
                Cerrar
              </button>
            </div>
          </SurfaceCard>
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
