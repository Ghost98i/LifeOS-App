import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  Cloud,
  Download,
  Dumbbell,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  Info,
  KeyRound,
  Lock,
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
import { preloadCloudSync } from '../lib/cloudSyncLoader';
import {
  cryptoSession,
  hasVaultPassword,
  loadWrappedKeyEnvelope,
  unlockMdekWithRecoveryKey,
  unlockMdekWithVaultPassword,
  type WrappedKeyEnvelope,
} from '../lib/cryptoCore';
import { fetchAccountCapability, fetchCloudKeyEnvelope } from '../lib/cryptoMigration';
import { compareMaterializedBalanceShadow } from '../lib/financeLedger';
import { showToast } from '../lib/toast';
import { PageHeader } from './PageHeader';
import { AppIcon } from './AppIcon';
import { PrivacyAmount } from './PrivacyAmount';
import { PrivacySecuritySection } from './PrivacySecuritySection';
import { getDismissedAttentionItems, nextAttentionDismissalTimestamp, type AttentionItem } from '../lib/todayAttention';
import { DismissedAttentionModal } from './DismissedAttentionModal';
import { ListDivider, SectionHeader, SurfaceCard } from './ui/SurfacePrimitives';
import { CelestianSwitch } from './ui/CelestianSwitch';
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

export const formatRecoveryDateTime = (iso?: string): string => {
  if (!iso) return 'Reciente';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Reciente';
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
};

export const humanizeRecoveryReason = (description?: string, action?: string): string => {
  const raw = (description || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('versión remota descartada al elegir datos locales')) {
    return 'Guardada antes de conservar los datos de este dispositivo';
  }
  if (lower.includes('versión local descartada al elegir datos de la nube')) {
    return 'Guardada antes de cargar los datos de la nube';
  }
  if (lower.includes('reiniciar datos') || action === 'reset_data') {
    return 'Guardada antes de reiniciar los datos';
  }
  if (lower.includes('restaurar copia')) {
    return 'Guardada antes de restaurar una copia anterior';
  }
  if (lower.includes('reparación de saldos') || lower.includes('libro mayor') || action === 'repair_balances') {
    return 'Guardada antes de corregir diferencias de saldo';
  }
  if (lower.startsWith('previo a importar') || action === 'import_backup') {
    return 'Guardada antes de importar una copia de seguridad';
  }
  if (lower.includes('e2ee') || lower.includes('cifrado') || lower.includes('candado') || lower.includes('migraci')) {
    return 'Guardada antes de cambiar la configuración de seguridad';
  }
  if (action === 'cloud_conflict' || lower.includes('conflicto')) {
    return 'Guardada antes de resolver diferencias entre dispositivos';
  }
  if (raw && !/^(manual_snapshot|import_backup|reset_data|repair_balances|cloud_conflict)$/i.test(raw)) {
    return raw;
  }
  return 'Guardada automáticamente antes de un cambio importante';
};

export interface ResetVerificationResult {
  ok: boolean;
  error?: string;
}

export async function verifyResetConfirmation(params: {
  envelope: WrappedKeyEnvelope | null;
  confirmationText?: string;
  authMode?: 'password' | 'recovery';
  secret?: string;
}): Promise<ResetVerificationResult> {
  const { envelope, confirmationText = '', authMode = 'password', secret = '' } = params;

  if (!envelope) {
    if (confirmationText.trim().toUpperCase() !== 'REINICIAR') {
      return { ok: false, error: 'Escribí REINICIAR para confirmar el reinicio.' };
    }
    return { ok: true };
  }

  const effectiveMode: 'password' | 'recovery' = hasVaultPassword(envelope) ? authMode : 'recovery';
  const cleanedSecret = effectiveMode === 'recovery' ? secret.trim() : secret;

  if (!cleanedSecret.trim()) {
    return {
      ok: false,
      error:
        effectiveMode === 'password'
          ? 'Ingresá tu contraseña de bóveda para confirmar.'
          : 'Ingresá tu código de recuperación para confirmar.',
    };
  }

  try {
    if (effectiveMode === 'password') {
      await unlockMdekWithVaultPassword(cleanedSecret, envelope);
    } else {
      await unlockMdekWithRecoveryKey(cleanedSecret, envelope);
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        effectiveMode === 'password'
          ? 'Contraseña de bóveda incorrecta. Probá de nuevo o usá tu código de recuperación.'
          : 'El código de recuperación no es correcto o no coincide con esta cuenta.',
    };
  }
}

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
  onE2EEDisabled?: (verifiedState: LifeOSState) => void;
  initialTab?: ConfigTab;
  defaultResetModalOpen?: boolean;
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
  onE2EEDisabled,
  initialTab = 'cuenta',
  defaultResetModalOpen = false,
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
  const [isResetModalOpen, setIsResetModalOpen] = useState(defaultResetModalOpen);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetSecret, setResetSecret] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEnvelope, setResetEnvelope] = useState<WrappedKeyEnvelope | null>(() =>
    typeof localStorage !== 'undefined' ? loadWrappedKeyEnvelope(effectiveUserId) : null
  );
  const [resetAuthMode, setResetAuthMode] = useState<'password' | 'recovery'>(() => {
    const initialEnv = typeof localStorage !== 'undefined' ? loadWrappedKeyEnvelope(effectiveUserId) : null;
    return hasVaultPassword(initialEnv) ? 'password' : 'recovery';
  });
  const [isCheckingResetSecurity, setIsCheckingResetSecurity] = useState(false);
  const [isVerifyingReset, setIsVerifyingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
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

  const closeResetModal = () => {
    if (isVerifyingReset) return;
    setIsResetModalOpen(false);
    setResetConfirmText('');
    setResetSecret('');
    setShowResetPassword(false);
    setResetError(null);
  };

  const openResetModal = () => {
    const localEnv = typeof localStorage !== 'undefined' ? loadWrappedKeyEnvelope(effectiveUserId) : null;
    setResetEnvelope(localEnv);
    setResetAuthMode(hasVaultPassword(localEnv) ? 'password' : 'recovery');
    setResetConfirmText('');
    setResetSecret('');
    setShowResetPassword(false);
    setResetError(null);
    setIsResetModalOpen(true);
  };

  useEffect(() => {
    if (!isResetModalOpen || !cloudUser || !effectiveUserId) {
      setIsCheckingResetSecurity(false);
      return;
    }
    let active = true;
    setIsCheckingResetSecurity(true);
    const localEnv = typeof localStorage !== 'undefined' ? loadWrappedKeyEnvelope(effectiveUserId) : null;
    Promise.all([
      fetchAccountCapability(effectiveUserId),
      fetchCloudKeyEnvelope(effectiveUserId),
    ])
      .then(([cap, remoteEnv]) => {
        if (!active) return;
        const resolvedEnv =
          cap?.encryptionState === 'plaintext' && !remoteEnv
            ? null
            : (remoteEnv || localEnv);
        setResetEnvelope(resolvedEnv);
        setResetAuthMode(hasVaultPassword(resolvedEnv) ? 'password' : 'recovery');
      })
      .catch(() => {
        if (!active) return;
        setResetEnvelope(localEnv);
        setResetAuthMode(hasVaultPassword(localEnv) ? 'password' : 'recovery');
      })
      .finally(() => {
        if (active) setIsCheckingResetSecurity(false);
      });
    return () => {
      active = false;
    };
  }, [isResetModalOpen, cloudUser, effectiveUserId]);

  useEffect(() => {
    if (!importPreview && !isResetModalOpen && !isRestoreModalOpen && !isRepairModalOpen && !isAboutModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (importPreview) setImportPreview(null);
        if (isResetModalOpen && !isVerifyingReset) {
          setIsResetModalOpen(false);
          setResetConfirmText('');
          setResetSecret('');
          setShowResetPassword(false);
          setResetError(null);
        }
        if (isRestoreModalOpen) setIsRestoreModalOpen(false);
        if (isRepairModalOpen) setIsRepairModalOpen(false);
        if (isAboutModalOpen) setIsAboutModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [importPreview, isResetModalOpen, isVerifyingReset, isRestoreModalOpen, isRepairModalOpen, isAboutModalOpen]);

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
      showToast('Todas las cuentas coinciden con los movimientos registrados.');
      return;
    }

    setAccountDiffs(diffs);
    setIsRepairModalOpen(true);
  };

  const handleConfirmRepairBalances = () => {
    if (!saveRecoveryState(state, storageUserId, 'repair_balances', 'Guardada antes de corregir diferencias de saldo')) {
      showToast('No se pudo guardar la copia preventiva. La corrección quedó detenida.', 'error');
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
    showToast(`Se actualizaron ${corrected} cuenta(s) según los movimientos registrados. Guardamos una copia de emergencia previa.`);
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
    reader.onerror = () => {
      showToast('No se pudo leer el archivo seleccionado.', 'error');
      e.target.value = '';
    };
    reader.onload = (event) => {
      try {
        const text = typeof event.target?.result === 'string' ? event.target.result : '';
        const summary = inspectBackupJSON(text);
        setImportPreview(summary);
        setImportFileName(file.name);
      } catch (error) {
        const message = error instanceof Error && /Celestian LifeOS|backup|esquema|registros/i.test(error.message)
          ? error.message
          : 'El archivo de backup está dañado o no es válido para Celestian LifeOS.';
        showToast(message, 'error');
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

  const handleConfirmReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isVerifyingReset || isCheckingResetSecurity) return;
    setResetError(null);
    setIsVerifyingReset(true);
    try {
      const verification = await verifyResetConfirmation({
        envelope: resetEnvelope,
        confirmationText: resetConfirmText,
        authMode: resetAuthMode,
        secret: resetSecret,
      });
      if (!verification.ok) {
        setResetError(verification.error || 'No pudimos validar tu confirmación.');
        return;
      }

      if (onResetData) {
        if (onResetData() === false) return;
      } else {
        if (!saveRecoveryState(state, storageUserId, 'reset_data', 'Previo a reiniciar datos a valores de fábrica')) {
          showToast('No se pudo guardar una copia previa. El reinicio quedó detenido.', 'error');
          return;
        }
        const def = defaultState();
        if (onUpdateState((draft) => {
          Object.assign(draft, def);
        }) === false) return;
        showToast('Datos reiniciados a los valores por defecto. Copia anterior guardada en recuperación.', 'info');
      }
      setIsResetModalOpen(false);
      setResetConfirmText('');
      setResetSecret('');
      setShowResetPassword(false);
      setResetError(null);
    } finally {
      setIsVerifyingReset(false);
    }
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
    'celestian-clean-field w-full min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100';
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
            aria-label="Privacidad, condiciones y créditos"
            title="Privacidad, condiciones y créditos"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-white/[0.08] dark:bg-[#0D111A] dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
          >
            <Info size={17} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      />

      <div role="tablist" aria-label="Secciones de Configuración" className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/75 p-1 dark:border-white/[0.08] dark:bg-white/[0.03]">
        {CONFIG_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm transition-colors outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 cursor-pointer sm:px-4 ${
                isSelected
                  ? 'bg-[#4F46E5] font-semibold text-white'
                  : 'font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {syncStatus === 'offline'
                        ? 'Estás sin conexión. Tus datos siguen guardándose en este dispositivo y podrás conectar Google cuando vuelva internet.'
                        : 'Conectá Google para sincronizar entre tus dispositivos.'}
                    </p>
                    {syncStatus === 'offline' && (
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${syncStatusMeta.textColor}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${syncStatusMeta.dotClass}`} />
                        <span>Sin conexión · Local</span>
                      </span>
                    )}
                  </div>
                  {onCloudSignIn && (
                    <button
                      type="button"
                      onPointerEnter={() => { void preloadCloudSync(); }}
                      onFocus={() => { void preloadCloudSync(); }}
                      onTouchStart={() => { void preloadCloudSync(); }}
                      onClick={onCloudSignIn}
                      className={primaryBtnClass}
                    >
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
              userEmail={cloudUser?.email}
              onForceSync={onForceSync}
              onE2EEDisabled={onE2EEDisabled}
              onDeleteCloudAccount={onDeleteCloudAccount}
              onDeleteLocalData={onDeleteLocalData}
            />
          </div>

          {/* Privacidad, condiciones y créditos */}
          <SurfaceCard className="p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <SectionHeader
                  icon={<FileText size={16} strokeWidth={1.75} />}
                  title="Privacidad, condiciones y créditos"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Información pública sobre tus datos, reglas de uso y licencias de Celestian LifeOS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAboutModalOpen(true)}
                className={`${secondaryBtnClass} self-start sm:self-auto shrink-0 text-xs`}
              >
                <Info size={14} strokeWidth={1.75} className="text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                <span>Ver resumen</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-slate-100 pt-3.5 sm:grid-cols-2 dark:border-white/[0.06]">
              {[
                {
                  href: '/privacidad.html',
                  title: 'Política de privacidad',
                  desc: 'Qué datos se guardan y cómo se protegen.',
                },
                {
                  href: '/privacidad.html#condiciones',
                  title: 'Condiciones de uso',
                  desc: 'Propiedad de tus datos, copias y alcance del servicio.',
                },
                {
                  href: '/eliminar-cuenta.html',
                  title: 'Eliminar cuenta y datos',
                  desc: 'Pasos desde la app o por correo electrónico.',
                },
                {
                  href: '/creditos.html',
                  title: 'Créditos y licencias',
                  desc: 'Íconos, ilustraciones y animaciones.',
                },
              ].map((docLink) => (
                <a
                  key={docLink.href}
                  href={docLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200/80 px-3.5 py-2.5 transition-colors hover:border-[#4F46E5]/40 hover:bg-[#4F46E5]/[0.04] dark:border-white/[0.08] dark:hover:border-[#818CF8]/35 dark:hover:bg-indigo-500/[0.07]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 transition-colors group-hover:text-[#4F46E5] dark:text-slate-100 dark:group-hover:text-[#818CF8]">
                      {docLink.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {docLink.desc}
                    </p>
                  </div>
                  <ExternalLink
                    size={14}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="shrink-0 text-[#4F46E5] dark:text-[#818CF8]"
                  />
                </a>
              ))}
            </div>
          </SurfaceCard>
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
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Descargá una copia completa de tus datos en este equipo para resguardo o cambio de dispositivo. El archivo no lleva contraseña, así que conviene guardarlo en un lugar seguro.
              </p>
              {state.settings?.lastBackupAt && (
                <p className="pt-0.5 text-xs font-medium tabular-nums text-[#4F46E5] dark:text-[#818CF8]">
                  Última exportación registrada: {state.settings.lastBackupAt}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={onExportJSON} className={primaryBtnClass}>
                <Download size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Descargar copia</span>
              </button>

              <label className={secondaryBtnClass}>
                <RotateCcw size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
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
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Respaldo automático que Celestian guarda antes de aplicar un cambio importante, por si necesitás volver atrás.
                </p>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                  {formatRecoveryDateTime(recoveryInfo.meta?.savedAt)} · {humanizeRecoveryReason(recoveryInfo.meta?.description, recoveryInfo.meta?.action)}
                </p>
                <button
                  type="button"
                  onClick={() => setIsRestoreModalOpen(true)}
                  className={`${secondaryBtnClass} w-full sm:w-auto`}
                >
                  <RotateCcw size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                  <span>Restaurar copia de emergencia</span>
                </button>
              </div>
            )}
          </SurfaceCard>

          {/* Zona de peligro: Reiniciar datos */}
          <SurfaceCard className="border-rose-500/30 p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Reiniciar datos">
            <div className="space-y-1 max-w-xl">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reiniciar datos</h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Vacía tus tareas, finanzas, notas, gimnasio y demás módulos para empezar desde cero. Antes de borrar, se guarda automáticamente una copia de emergencia en este navegador.
              </p>
            </div>
            <button
              type="button"
              onClick={openResetModal}
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
                    inputMode="numeric"
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
                  <div className="relative">
                    <select
                      id="config-body-sex"
                      value={profileBodySex}
                      onChange={(e) => setProfileBodySex(e.target.value as '' | 'male' | 'female')}
                      className={`${fieldClass} appearance-none pr-9 cursor-pointer`}
                    >
                      <option value="">Seleccionar…</option>
                      <option value="male">Masculino</option>
                      <option value="female">Femenino</option>
                    </select>
                    <ChevronDown
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Se usa solo para estimaciones opcionales en Gimnasio (como porcentaje estimado de grasa corporal).
                  </p>
                </div>

                {streamingEnabled && (
                  <div className="min-w-0">
                    <label htmlFor="config-stream-goal" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Meta mensual de streams
                    </label>
                    <input
                      id="config-stream-goal"
                      type="number"
                      inputMode="numeric"
                      value={streamGoal}
                      onChange={(e) => setStreamGoal(e.target.value)}
                      placeholder="12"
                      className={`${fieldClass} tabular-nums`}
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Objetivo mensual para tu panel de Streaming y contenido en Notas.
                    </p>
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
                const isVisible = !isModuleHidden(state, item.id);
                const labelId = `module-switch-label-${item.id}`;

                return (
                  <div
                    key={item.id}
                    className={`flex min-h-11 items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                      isVisible
                        ? 'border-[#4F46E5]/30 bg-[#4F46E5]/[0.04] text-slate-900 dark:border-indigo-400/30 dark:bg-indigo-500/[0.08] dark:text-slate-100'
                        : 'border-slate-200/80 bg-transparent text-slate-500 dark:border-white/[0.08] dark:text-slate-400'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <AppIcon
                        name={item.icon}
                        className={`h-4 w-4 shrink-0 ${isVisible ? 'text-[#4F46E5] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
                      />
                      <span id={labelId} className="truncate">{item.label}</span>
                    </div>
                    <CelestianSwitch
                      checked={isVisible}
                      onChange={() => handleToggleTab(item.id)}
                      ariaLabelledBy={labelId}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-3.5 space-y-2 dark:border-white/[0.06]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Herramientas opcionales en Notas
              </p>
              <div
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors sm:w-auto sm:min-w-[280px] sm:inline-flex ${
                  streamingEnabled
                    ? 'border-[#4F46E5]/30 bg-[#4F46E5]/[0.04] text-slate-900 dark:border-indigo-400/30 dark:bg-indigo-500/[0.08] dark:text-slate-100'
                    : 'border-slate-200/80 bg-transparent text-slate-500 dark:border-white/[0.08] dark:text-slate-400'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Radio
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className={`shrink-0 ${streamingEnabled ? 'text-[#4F46E5] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
                  />
                  <span id="streaming-switch-label" className="truncate">Streaming y contenido</span>
                </div>
                <CelestianSwitch
                  checked={streamingEnabled}
                  onChange={handleToggleStreaming}
                  ariaLabelledBy="streaming-switch-label"
                  size="sm"
                />
              </div>
            </div>
          </SurfaceCard>

          {/* Avisos silenciados */}
          <SurfaceCard className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <SectionHeader
                  icon={<Bell size={16} strokeWidth={1.75} />}
                  title="Avisos silenciados"
                />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Acá podés volver a mostrar las alertas que ocultaste en Hoy.{' '}
                  {dismissedAttentionItems.length === 0
                    ? 'No tenés avisos silenciados en este momento.'
                    : `Tenés ${dismissedAttentionItems.length === 1 ? '1 aviso silenciado' : `${dismissedAttentionItems.length} avisos silenciados`}.`}
                </p>
              </div>
              {dismissedAttentionItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDismissedModal(true)}
                  className={`${secondaryBtnClass} shrink-0 self-start sm:self-auto`}
                >
                  <RotateCcw size={14} strokeWidth={1.75} className="text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
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

            {/* Revisión de Finanzas */}
            <div className="border-t border-slate-100 pt-4 space-y-3 dark:border-white/[0.06]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wallet size={16} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Revisión de Finanzas</h3>
                </div>
                {discrepantShadows.length === 0 ? (
                  <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Saldos coincidentes
                  </span>
                ) : (
                  <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {discrepantShadows.length} {discrepantShadows.length === 1 ? 'cuenta con diferencia' : 'cuentas con diferencia'}
                  </span>
                )}
              </div>

              <ListDivider className="text-sm">
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Cuentas revisadas</span>
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">
                    {financeShadows.length} cuenta{financeShadows.length === 1 ? '' : 's'}
                  </strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Saldos</span>
                  <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                    {financeShadows.length - discrepantShadows.length} coincidente{financeShadows.length - discrepantShadows.length === 1 ? '' : 's'}
                  </strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Movimientos</span>
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">{state.finance?.transactions?.length || 0}</strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Transferencias</span>
                  <strong className="tabular-nums text-slate-900 dark:text-slate-100">{state.finance?.transfers?.length || 0}</strong>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-slate-500 dark:text-slate-400">Ajustes de saldo</span>
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

            {/* Revisión de Gimnasio */}
            {(!isModuleHidden(state, 'gimnasio') || staleGymCount > 0) && (
              <div className="border-t border-slate-100 pt-4 space-y-2.5 dark:border-white/[0.06]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Dumbbell size={16} strokeWidth={1.75} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Revisión de Gimnasio</h3>
                  </div>
                  <span className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400">
                    {sortedGymSessions.length} {sortedGymSessions.length === 1 ? 'sesión' : 'sesiones'}
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
                    <div className="py-2 space-y-1">
                      <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                        <span>Sesiones previas incompletas</span>
                        <strong className="tabular-nums font-semibold">{staleGymCount}</strong>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Son entrenamientos abiertos de días anteriores que podés cerrar o descartar en Gimnasio.
                      </p>
                    </div>
                  )}
                </ListDivider>
              </div>
            )}

            {/* Diagnóstico técnico y almacenamiento (Divulgación Progresiva) */}
            <details className="group border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 select-none list-none">
                <span className="flex items-center gap-2">
                  <Shield size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                  <span>Almacenamiento y detalles técnicos</span>
                </span>
                <ChevronDown size={15} strokeWidth={1.75} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="pt-3 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 text-xs dark:border-white/[0.06]">
                  <span className="text-slate-500 dark:text-slate-400">Identificador de este dispositivo</span>
                  <code className="font-mono text-xs text-slate-700 dark:text-slate-300">{deviceId.slice(0, 8)}…</code>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Almacenamiento local</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">IndexedDB / LocalStorage</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiagnostics(getStorageDiagnostics(storageUserId))}
                    className={secondaryBtnClass}
                  >
                    <Search size={14} strokeWidth={1.75} className="text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
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
        <div className="celestian-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Revisar copia antes de importar" className="celestian-modal-panel w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl">
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
      {isResetModalOpen && (() => {
        const requiresE2EE = Boolean(resetEnvelope);
        const envelopeSupportsPassword = hasVaultPassword(resetEnvelope);
        const effectiveAuthMode: 'password' | 'recovery' = envelopeSupportsPassword ? resetAuthMode : 'recovery';
        const isResetSubmitDisabled =
          isVerifyingReset ||
          isCheckingResetSecurity ||
          (requiresE2EE
            ? !resetSecret.trim()
            : resetConfirmText.trim().toUpperCase() !== 'REINICIAR');

        return (
          <div
            className="celestian-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !isVerifyingReset) closeResetModal();
            }}
          >
            <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Reiniciar datos" className="celestian-modal-panel flex w-full max-w-md max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl p-0 shadow-2xl">
              <div aria-hidden="true" className="mx-auto mt-2.5 mb-0.5 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden" />

              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5 sm:px-6 sm:pt-5 dark:border-white/[0.06]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Shield size={20} strokeWidth={1.75} className="shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Reiniciar datos</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Volver a empezar desde cero</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeResetModal}
                  disabled={isVerifyingReset}
                  aria-label="Cerrar"
                  className="inline-flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 active:scale-95 transition dark:hover:bg-white/[0.06] dark:hover:text-slate-100 disabled:opacity-50 cursor-pointer"
                >
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={(e) => { void handleConfirmReset(e); }} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 px-5 py-4 sm:px-6">
                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                    <p>
                      Esta acción vacía tus tareas, finanzas, notas, gimnasio y demás módulos para dejar Celestian LifeOS en blanco.
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Tu sesión de Google <strong>no</strong> se cierra.</li>
                      <li>Antes de reiniciar se guarda automáticamente una copia de emergencia en este navegador.</li>
                      <li>Si tenés sincronización activa, los datos en blanco se actualizarán en tus otros dispositivos.</li>
                    </ul>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-3.5 dark:border-white/[0.06]">
                {requiresE2EE ? (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      name="username"
                      autoComplete="username"
                      value={cloudUser?.email || effectiveUserId || 'celestian-vault'}
                      readOnly
                      tabIndex={-1}
                      aria-hidden="true"
                      className="sr-only"
                    />
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {effectiveAuthMode === 'password' ? (
                        <Lock size={14} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                      ) : (
                        <KeyRound size={14} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
                      )}
                      <label htmlFor="reset-data-secret">
                        {effectiveAuthMode === 'password'
                          ? 'Ingresá tu contraseña de bóveda para confirmar'
                          : 'Ingresá tu código de recuperación para confirmar'}
                      </label>
                    </div>

                    {effectiveAuthMode === 'password' ? (
                      <div className="relative">
                        <input
                          id="reset-data-secret"
                          type={showResetPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={resetSecret}
                          onChange={(e) => {
                            setResetSecret(e.target.value);
                            if (resetError) setResetError(null);
                          }}
                          placeholder="Tu contraseña de bóveda…"
                          disabled={isVerifyingReset || isCheckingResetSecurity}
                          className={`${fieldClass} pr-11`}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword((v) => !v)}
                          aria-label={showResetPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          {showResetPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                        </button>
                      </div>
                    ) : (
                      <textarea
                        id="reset-data-secret"
                        rows={2}
                        value={resetSecret}
                        onChange={(e) => {
                          setResetSecret(e.target.value);
                          if (resetError) setResetError(null);
                        }}
                        placeholder="Pegá tu código de recuperación…"
                        disabled={isVerifyingReset || isCheckingResetSecurity}
                        spellCheck={false}
                        autoComplete="off"
                        className={`${fieldClass} font-mono text-xs resize-none`}
                        autoFocus
                      />
                    )}

                    {envelopeSupportsPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          setResetAuthMode(effectiveAuthMode === 'password' ? 'recovery' : 'password');
                          setResetSecret('');
                          setResetError(null);
                          setShowResetPassword(false);
                        }}
                        disabled={isVerifyingReset}
                        className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] transition-colors hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300 cursor-pointer"
                      >
                        {effectiveAuthMode === 'password'
                          ? 'Usar código de recuperación en su lugar'
                          : 'Usar contraseña de bóveda'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="reset-data-confirmation" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Escribí <strong>REINICIAR</strong> para habilitar el reinicio
                    </label>
                    <input
                      id="reset-data-confirmation"
                      type="text"
                      value={resetConfirmText}
                      onChange={(e) => {
                        setResetConfirmText(e.target.value);
                        if (resetError) setResetError(null);
                      }}
                      placeholder="REINICIAR"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={isVerifyingReset || isCheckingResetSecurity}
                      className={`${fieldClass} font-semibold uppercase tracking-widest`}
                      autoFocus
                    />
                  </div>
                )}

                {resetError && (
                  <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {resetError}
                  </p>
                )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4 dark:border-white/[0.06] dark:bg-[#0D111A]">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    disabled={isVerifyingReset}
                    className={`${secondaryBtnClass} min-h-11 sm:min-h-0 disabled:opacity-50`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isResetSubmitDisabled}
                    className="inline-flex min-h-11 sm:min-h-10 items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {isCheckingResetSecurity
                      ? 'Verificando seguridad…'
                      : isVerifyingReset
                      ? 'Validando…'
                      : 'Sí, reiniciar todo'}
                  </button>
                </div>
              </form>
            </SurfaceCard>
          </div>
        );
      })()}

      {/* Modal 3: Confirmar Restauración de Copia de Recuperación */}
      {isRestoreModalOpen && recoveryInfo && (
        <div className="celestian-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Restaurar copia de emergencia" className="celestian-modal-panel w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <RotateCcw size={18} strokeWidth={1.75} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Restaurar copia de emergencia</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Recuperación de emergencia</p>
              </div>
            </div>

            <ListDivider className="border-t border-slate-100 text-sm dark:border-white/[0.06]">
              <div className="flex justify-between gap-2 py-2">
                <span className="text-slate-500 dark:text-slate-400">Guardada</span>
                <strong className="text-right tabular-nums text-slate-900 dark:text-slate-100">
                  {formatRecoveryDateTime(recoveryInfo.meta?.savedAt)}
                </strong>
              </div>
              <div className="flex justify-between gap-2 py-2">
                <span className="text-slate-500 dark:text-slate-400">Motivo</span>
                <strong className="text-right text-slate-900 dark:text-slate-100">
                  {humanizeRecoveryReason(recoveryInfo.meta?.description, recoveryInfo.meta?.action)}
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
        <div className="celestian-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Revisión y corrección de saldos" className="celestian-modal-panel w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wallet size={18} strokeWidth={1.75} className="text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Revisión y corrección de saldos</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Se encontraron diferencias entre el saldo guardado y la suma de tus movimientos registrados.
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
                          <span className="text-slate-500 dark:text-slate-400">Según movimientos:</span>
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
                        <strong>Protegida:</strong> {diff.unrepairableReason || 'No se puede ajustar automáticamente para evitar pérdida de datos.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </ListDivider>

            <p className="flex items-start gap-2 border-l-2 border-[#4F46E5] pl-3 py-1 text-xs text-slate-600 dark:text-slate-400">
              <Shield size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
              <span>Antes de corregir los saldos, Celestian guardará automáticamente una copia de emergencia en este navegador.</span>
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
                Aplicar corrección
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Modal 5: Privacidad, condiciones y créditos */}
      {isAboutModalOpen && (
        <div className="celestian-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4 backdrop-blur-xs" onClick={() => setIsAboutModalOpen(false)}>
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Privacidad, condiciones y créditos" className="celestian-modal-panel w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Privacidad, condiciones y créditos</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tus datos viven primero en tu dispositivo, con sincronización opcional con Google y sin publicidad ni rastreo.
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
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Cómo cuidamos tus datos</h4>
                <p>Celestian guarda tu información en este dispositivo para que puedas usarla incluso sin cuenta. Si conectás Google, se sincroniza en un espacio privado asociado solo a tu usuario y podés abrirla en 1 clic desde otros dispositivos.</p>
                <p>Si querés una capa extra, en <strong>Cuenta y Seguridad</strong> podés activar el <strong>Candado privado adicional</strong> con tu propia contraseña de bóveda y un respaldo de emergencia.</p>
                <p>El módulo de <strong>IA</strong> arma el contexto en tu dispositivo (con opción para ocultar montos y anonimizar nombres de terceros) y nunca envía tus datos por su cuenta. Las copias descargadas en tu equipo no llevan contraseña: guardalas en un lugar seguro.</p>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2 dark:border-white/[0.06]">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Páginas públicas y condiciones</h4>
                <div className="flex flex-col gap-1">
                  <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300">
                    <span>Política de privacidad</span>
                    <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                  <a href="/privacidad.html#condiciones" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300">
                    <span>Condiciones de uso</span>
                    <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                  <a href="/eliminar-cuenta.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300">
                    <span>Eliminar cuenta y datos</span>
                    <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1.5 dark:border-white/[0.06]">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">Créditos y licencias</h4>
                <p>Íconos de interfaz por Lucide Icons (licencia ISC), ilustraciones de Gimnasio y micro-animaciones originales de Celestian LifeOS y animaciones comunitarias opcionales bajo Lottie Simple License.</p>
                <a href="/creditos.html" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300">
                  <span>Ver créditos y licencias completos</span>
                  <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
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
