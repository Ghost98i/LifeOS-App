import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  KeyRound,
  Lock,
  LockOpen,
  RotateCcw,
  Shield,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type { LifeOSState } from '../types';
import { UnlockDeviceModal } from './UnlockDeviceModal';
import { SurfaceCard } from './ui/SurfacePrimitives';
import { CelestianSwitch } from './ui/CelestianSwitch';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { showToast } from '../lib/toast';
import { getHumanModuleLabel, SYNC_MODULES } from '../lib/syncModel';
import {
  provisionZeroKnowledgeKeys,
  loadWrappedKeyEnvelope,
  cryptoSession,
  parseRecoveryKey,
  base64ToBytes,
  deriveKekFromRecoveryKey,
  unwrapMdekWithKek,
  hasVaultPassword,
  type WrappedKeyEnvelope,
} from '../lib/cryptoCore';
import {
  disableE2EEProtection,
  executeE2EEMigration,
  executeKeyRotation,
  fetchAccountCapability,
  fetchCloudKeyEnvelope,
  setCloudKeyEnvelope,
  setVaultPasswordForAccount,
  getRotationPendingState,
  resolvePendingRotation,
  type AccountSyncCapability,
  type DisableE2EEProgress,
  type MigrationProgress,
  type RotationPendingState,
} from '../lib/cryptoMigration';
import {
  inventoryCloudPlaintext,
  executeCloudPlaintextPurge,
  type CloudPlaintextInventory,
} from '../lib/cryptoPurge';
import {
  forgetDeviceTrust,
  isDeviceEnrolled,
} from '../lib/deviceTrust';

interface PrivacySecuritySectionProps {
  state: LifeOSState;
  storageUserId: string | null;
  cloudConnected: boolean;
  userEmail?: string | null;
  onForceSync?: () => void;
  onE2EEDisabled?: (verifiedState: LifeOSState) => void;
  onDeleteCloudAccount?: () => Promise<void>;
  onDeleteLocalData?: () => void;
}

export const PrivacySecuritySection: React.FC<PrivacySecuritySectionProps> = ({
  state,
  storageUserId,
  cloudConnected,
  userEmail,
  onForceSync,
  onE2EEDisabled,
  onDeleteCloudAccount,
  onDeleteLocalData,
}) => {
  const [capability, setCapability] = useState<AccountSyncCapability | null>(null);
  const [isLoadingCap, setIsLoadingCap] = useState(false);
  const [cloudEnvelope, setCloudEnvelope] = useState<WrappedKeyEnvelope | null>(null);
  const [localEnvelope, setLocalEnvelope] = useState<WrappedKeyEnvelope | null>(() =>
    loadWrappedKeyEnvelope(storageUserId)
  );
  const [isEnrolled, setIsEnrolled] = useState<boolean>(false);
  const [, setSessionNonce] = useState(0);

  useEffect(() => {
    return cryptoSession.subscribe(() => {
      setSessionNonce((n) => n + 1);
    });
  }, []);

  const isSessionUnlocked = cryptoSession.isUnlocked(storageUserId);
  const activeEnvelope = localEnvelope || cloudEnvelope;
  const accountHasPassword = hasVaultPassword(activeEnvelope);

  // 2-step guided activation wizard: 0 = Closed, 1 = Vault Password, 2 = Emergency Backup, 3 = Activating progress
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3>(0);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirm, setSetupConfirm] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [provisionedEnvelope, setProvisionedEnvelope] = useState<WrappedKeyEnvelope | null>(null);
  const [sessionKeyCandidate, setSessionKeyCandidate] = useState<CryptoKey | null>(null);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);

  // Migration running state
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);

  // Safe deactivation modal state
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableProgress, setDisableProgress] = useState<DisableE2EEProgress | null>(null);
  const [disableError, setDisableError] = useState<string | null>(null);

  // Add / change vault password modal (for legacy accounts or password updates)
  const [isVaultPwModalOpen, setIsVaultPwModalOpen] = useState(false);
  const [vaultAuthSecret, setVaultAuthSecret] = useState('');
  const [vaultNewPw, setVaultNewPw] = useState('');
  const [vaultConfirmPw, setVaultConfirmPw] = useState('');
  const [showVaultNewPw, setShowVaultNewPw] = useState(false);
  const [vaultPwError, setVaultPwError] = useState<string | null>(null);
  const [isSavingVaultPw, setIsSavingVaultPw] = useState(false);

  // Unlock Modal
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState<boolean>(false);

  // Key Replacement Modal (Rewrap)
  const [isRewrapModalOpen, setIsRewrapModalOpen] = useState<boolean>(false);
  const [currentKeyForRewrap, setCurrentKeyForRewrap] = useState<string>('');
  const [rewrapResultKey, setRewrapResultKey] = useState<string | null>(null);
  const [rewrapError, setRewrapError] = useState<string | null>(null);

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadKeyInput, setDownloadKeyInput] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Plaintext Inventory & Purge State
  const [plaintextInventory, setPlaintextInventory] = useState<CloudPlaintextInventory | null>(null);
  const [isPurging, setIsPurging] = useState<boolean>(false);

  // Account & cloud data deletion (logic preserved strictly)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteStage, setDeleteStage] = useState<'confirm' | 'local'>('confirm');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);

  // Rotation Pending Verification State
  const [pendingRotation, setPendingRotation] = useState<RotationPendingState | null>(() =>
    storageUserId ? getRotationPendingState(storageUserId) : null
  );
  const [isResolveModalOpen, setIsResolveModalOpen] = useState<boolean>(false);
  const [resolveKeyInput, setResolveKeyInput] = useState<string>('');
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (storageUserId && cloudConnected) {
      setIsLoadingCap(true);
      Promise.all([
        fetchAccountCapability(storageUserId),
        fetchCloudKeyEnvelope(storageUserId),
        inventoryCloudPlaintext(storageUserId),
      ])
        .then(([cap, remoteEnv, inv]) => {
          if (active) {
            setCapability(cap);
            setCloudEnvelope(remoteEnv);
            setPlaintextInventory(inv);
            setPendingRotation(getRotationPendingState(storageUserId));
          }
        })
        .catch(() => {
          if (active) {
            setCapability(null);
            setCloudEnvelope(null);
            setPlaintextInventory(null);
          }
        })
        .finally(() => {
          if (active) setIsLoadingCap(false);
        });
    } else {
      setCapability(null);
      setCloudEnvelope(null);
      setPlaintextInventory(null);
      setPendingRotation(null);
    }
    setLocalEnvelope(loadWrappedKeyEnvelope(storageUserId));
    if (storageUserId) {
      isDeviceEnrolled(storageUserId).then((enrolled) => {
        if (active) setIsEnrolled(enrolled);
      });
    } else {
      setIsEnrolled(false);
    }
    return () => {
      active = false;
    };
  }, [storageUserId, cloudConnected]);

  // Status computation
  const encryptionState = capability?.encryptionState || (localEnvelope ? 'unknown' : 'plaintext');
  const isEncrypted = encryptionState === 'encrypted';
  const isUnverified = encryptionState === 'unknown';
  const isMixed = encryptionState === 'mixed';
  const isLockOn = isEncrypted || isMixed;
  const isSecondDeviceNeedingRecovery = (isEncrypted || isMixed) && !localEnvelope && Boolean(cloudEnvelope);

  const openActivationWizard = () => {
    setSetupPassword('');
    setSetupConfirm('');
    setShowSetupPassword(false);
    setSetupError(null);
    setGeneratedKey('');
    setProvisionedEnvelope(null);
    setSessionKeyCandidate(null);
    setBackupAcknowledged(false);
    setWizardStep(1);
  };

  const handleToggleExtraLock = (nextChecked: boolean) => {
    if (!cloudConnected || isLoadingCap) return;
    if (nextChecked) {
      if (isMixed) {
        const mdek = cryptoSession.getKey(storageUserId);
        if (mdek) {
          setWizardStep(3);
          void runMigration(mdek);
        } else {
          setIsUnlockModalOpen(true);
        }
        return;
      }
      openActivationWizard();
    } else {
      setDisableError(null);
      setDisableProgress(null);
      setIsDisableModalOpen(true);
    }
  };

  // Wizard Step 1 -> Step 2: validate password & generate dual-wrapped keys
  const handleCreateVaultPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProvisioning) return;
    setSetupError(null);
    if (setupPassword.length < 8) {
      setSetupError('Elegí una contraseña de al menos 8 caracteres.');
      return;
    }
    if (setupPassword !== setupConfirm) {
      setSetupError('Las contraseñas no coinciden.');
      return;
    }

    setIsProvisioning(true);
    try {
      const { recoveryKeyFormatted, envelope, sessionMdek } = await provisionZeroKnowledgeKeys(
        storageUserId,
        { vaultPassword: setupPassword }
      );
      setGeneratedKey(recoveryKeyFormatted);
      setProvisionedEnvelope(envelope);
      setSessionKeyCandidate(sessionMdek);
      setSetupPassword('');
      setSetupConfirm('');
      setWizardStep(2);
    } catch (err: any) {
      setSetupError(err?.message || 'No se pudo preparar tu contraseña de bóveda.');
    } finally {
      setIsProvisioning(false);
    }
  };

  const copyRecoveryKey = async (key: string) => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setBackupAcknowledged(true);
      showToast('Código de respaldo copiado.', 'success');
    } catch {
      showToast('No se pudo copiar automáticamente. Seleccionalo manualmente antes de continuar.', 'error');
    }
  };

  const handleDownloadKeyFile = (keyToDownload = generatedKey, envToInclude = provisionedEnvelope) => {
    if (!keyToDownload) return;
    const blob = new Blob([
      `CELESTIAN LIFEOS — RESPALDO DE EMERGENCIA\n` +
      `Generado: ${new Date().toLocaleString('es-UY')}\n\n` +
      `CLAVE DE RECUPERACIÓN:\n` +
      `${keyToDownload}\n\n` +
      (envToInclude ? `RESPALDO DE CUENTA (No modificar):\n${JSON.stringify(envToInclude, null, 2)}\n\n` : '') +
      `AVISO:\n` +
      `- Guardá este archivo en un lugar privado solo por si algún día olvidás tu contraseña de bóveda.\n` +
      `- Ni Google ni Celestian pueden restaurar tu contraseña si perdés este respaldo.\n`
    ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `celestian-respaldo-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupAcknowledged(true);
    showToast('Respaldo descargado. Guardalo en un lugar privado.', 'success');
  };

  // Wizard Step 2 -> Step 3: Commit envelope to cloud & migrate all 15 modules
  const handleConfirmAndActivate = async () => {
    if (!provisionedEnvelope || !sessionKeyCandidate || !storageUserId) return;
    setSetupError(null);
    try {
      await setCloudKeyEnvelope(storageUserId, provisionedEnvelope);
      const verifiedRemote = await fetchCloudKeyEnvelope(storageUserId);
      if (!verifiedRemote) {
        throw new Error('No se pudo confirmar el respaldo en la nube. Intentá de nuevo.');
      }
      cryptoSession.setUnlocked(sessionKeyCandidate, storageUserId);
      setLocalEnvelope(verifiedRemote);
      setCloudEnvelope(verifiedRemote);
      setWizardStep(3);
      await runMigration(sessionKeyCandidate);
    } catch (err: any) {
      setSetupError(err?.message || 'No se pudo iniciar la activación. Revisá tu conexión e intentá de nuevo.');
    }
  };

  const runMigration = async (mdek: CryptoKey) => {
    if (!storageUserId) {
      showToast('Conectá tu cuenta de Google primero.', 'error');
      setWizardStep(0);
      return;
    }

    setIsMigrating(true);
    try {
      const result = await executeE2EEMigration(storageUserId, state, mdek, {
        onProgress: (prog) => {
          setMigrationProgress(prog);
        },
      });

      setCapability(result.capability);
      if (storageUserId) isDeviceEnrolled(storageUserId).then(setIsEnrolled).catch(() => {});
      showToast('Candado privado activado. En otros dispositivos entrás con tu contraseña de bóveda.', 'success');
      onForceSync?.();
      setTimeout(() => {
        setWizardStep(0);
        setIsMigrating(false);
        setMigrationProgress(null);
      }, 900);
    } catch (err: any) {
      console.error('[Migration] Error:', err);
      showToast(`No se pudo completar la activación: ${err?.message || 'Revisá tu conexión'}`, 'error');
      setIsMigrating(false);
    }
  };

  // Safe deactivation handler
  const handleConfirmDisableExtraLock = async () => {
    if (!storageUserId || isDisabling) return;
    const sessionMdek = cryptoSession.getKey(storageUserId);
    if (!sessionMdek) {
      setIsDisableModalOpen(false);
      setIsUnlockModalOpen(true);
      showToast('Desbloqueá tus datos primero para poder desactivar el candado privado.', 'info');
      return;
    }

    setDisableError(null);
    setIsDisabling(true);
    try {
      const result = await disableE2EEProtection(storageUserId, sessionMdek, state, {
        onProgress: (prog) => setDisableProgress(prog),
      });
      setCapability({
        version: 1,
        minimumSyncProtocolVersion: 1,
        encryptionState: 'plaintext',
        encryptedModules: [],
        updatedAt: new Date().toISOString(),
      });
      setLocalEnvelope(null);
      setCloudEnvelope(null);
      setIsEnrolled(false);
      setPlaintextInventory(null);
      onE2EEDisabled?.(result.verifiedState);
      showToast('Candado privado desactivado. Tu cuenta ya abre en 1 clic con Google.', 'success');
      setIsDisableModalOpen(false);
      setDisableProgress(null);
      onForceSync?.();
    } catch (err: any) {
      setDisableError(err?.message || 'No se pudo desactivar el candado privado. Tus datos siguen intactos.');
    } finally {
      setIsDisabling(false);
    }
  };

  // Add or change vault password handler
  const handleSaveVaultPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storageUserId || isSavingVaultPw) return;
    setVaultPwError(null);

    if (vaultNewPw.length < 8) {
      setVaultPwError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (vaultNewPw !== vaultConfirmPw) {
      setVaultPwError('Las contraseñas no coinciden.');
      return;
    }
    if (!vaultAuthSecret.trim()) {
      setVaultPwError(
        accountHasPassword
          ? 'Ingresá tu contraseña actual o tu código de recuperación.'
          : 'Ingresá tu código de recuperación actual para confirmar.'
      );
      return;
    }

    setIsSavingVaultPw(true);
    try {
      let useAsRecovery = !accountHasPassword;
      if (accountHasPassword) {
        try {
          await parseRecoveryKey(vaultAuthSecret.trim());
          useAsRecovery = true;
        } catch {
          useAsRecovery = false;
        }
      }

      const res = await setVaultPasswordForAccount(storageUserId, {
        newVaultPassword: vaultNewPw,
        ...(useAsRecovery
          ? { currentRecoveryKey: vaultAuthSecret.trim() }
          : { currentVaultPassword: vaultAuthSecret }),
      });

      setLocalEnvelope(res.envelope);
      setCloudEnvelope(res.envelope);
      setIsVaultPwModalOpen(false);
      setVaultAuthSecret('');
      setVaultNewPw('');
      setVaultConfirmPw('');
      showToast(
        accountHasPassword
          ? 'Contraseña de bóveda actualizada.'
          : 'Contraseña de bóveda creada. En otros dispositivos entrás en 1 toque.',
        'success'
      );
    } catch (err: any) {
      setVaultPwError(err?.message || 'No pudimos verificar tu credencial actual.');
    } finally {
      setIsSavingVaultPw(false);
    }
  };

  useEffect(() => {
    if (
      wizardStep === 0 &&
      !isRewrapModalOpen &&
      !isResolveModalOpen &&
      !isDownloadModalOpen &&
      !isDisableModalOpen &&
      !isVaultPwModalOpen
    ) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (wizardStep > 0 && !isMigrating && !isProvisioning) setWizardStep(0);
      if (isRewrapModalOpen) setIsRewrapModalOpen(false);
      if (isResolveModalOpen) setIsResolveModalOpen(false);
      if (isDownloadModalOpen) setIsDownloadModalOpen(false);
      if (isDisableModalOpen && !isDisabling) setIsDisableModalOpen(false);
      if (isVaultPwModalOpen && !isSavingVaultPw) setIsVaultPwModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    wizardStep,
    isMigrating,
    isProvisioning,
    isRewrapModalOpen,
    isResolveModalOpen,
    isDownloadModalOpen,
    isDisableModalOpen,
    isDisabling,
    isVaultPwModalOpen,
    isSavingVaultPw,
  ]);

  const handleRewrapKey = async () => {
    if (!storageUserId) return;
    setRewrapError(null);
    try {
      const { newRecoveryKeyFormatted, newEnvelope } = await executeKeyRotation(
        storageUserId,
        currentKeyForRewrap
      );
      setLocalEnvelope(newEnvelope);
      setCloudEnvelope(newEnvelope);
      setRewrapResultKey(newRecoveryKeyFormatted);
      showToast('Código de respaldo renovado con éxito.', 'success');
    } catch (err: any) {
      setRewrapError(err?.message || 'El código actual no es correcto. No se pudo renovar.');
    }
  };

  const handleExecutePurge = async () => {
    if (!storageUserId) return;
    const sessionMdek = cryptoSession.getKey(storageUserId);
    if (!sessionMdek) {
      showToast('Desbloqueá tus datos antes de limpiar copias anteriores.', 'error');
      setIsUnlockModalOpen(true);
      return;
    }

    setIsPurging(true);
    try {
      const result = await executeCloudPlaintextPurge(storageUserId, sessionMdek, state);
      if (result.success) {
        showToast('Copias anteriores limpiadas con éxito de la nube.', 'success');
        const updatedInv = await inventoryCloudPlaintext(storageUserId);
        setPlaintextInventory(updatedInv);
      } else {
        showToast(`Limpieza parcial completada. Restantes: ${result.remainingPlaintextCount}`, 'info');
      }
    } catch (err: any) {
      showToast(`No se pudo limpiar la copia anterior: ${err?.message || err}`, 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const handleResolvePendingRotation = async () => {
    if (!storageUserId) return;
    setResolveError(null);
    try {
      const res = await resolvePendingRotation(storageUserId, resolveKeyInput);
      setLocalEnvelope(res.envelope);
      setCloudEnvelope(res.envelope);
      setPendingRotation(null);
      setIsResolveModalOpen(false);
      setResolveKeyInput('');
      showToast('Código de respaldo verificado correctamente.', 'success');
      onForceSync?.();
    } catch (err: any) {
      setResolveError(err?.message || 'El código ingresado no es correcto.');
    }
  };

  const handleForgetDevice = async () => {
    if (!storageUserId) return;
    const confirmed = window.confirm(
      '¿Bloquear y olvidar este dispositivo?\n\nPara volver a ver o sincronizar tus datos acá, tendrás que ingresar tu contraseña de bóveda o tu código de respaldo.'
    );
    if (!confirmed) return;

    await forgetDeviceTrust(storageUserId);
    cryptoSession.lock();
    setIsEnrolled(false);
    showToast('Dispositivo olvidado. Tu sesión quedó bloqueada en este navegador.');
    onForceSync?.();
  };

  const openDeleteModal = () => {
    setDeleteConfirmation('');
    setDeleteError(null);
    setDeleteStage('confirm');
    setIsDeleteOpen(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteOpen(false);
    setDeleteConfirmation('');
    setDeleteError(null);
    setDeleteStage('confirm');
  };

  useDialogFocus(isDeleteOpen, deleteDialogRef, closeDeleteModal);

  const handleDeleteAccount = async () => {
    if (!onDeleteCloudAccount || deleteConfirmation.trim().toUpperCase() !== 'ELIMINAR') return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteCloudAccount();
      setDeleteStage('local');
      showToast('Cuenta y datos en la nube eliminados.', 'success');
    } catch (error) {
      setDeleteError(error instanceof Error
        ? error.message
        : 'No se pudo eliminar la cuenta en la nube. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteLocal = () => {
    onDeleteLocalData?.();
    setIsDeleteOpen(false);
    setDeleteConfirmation('');
    setDeleteStage('confirm');
    showToast('Datos locales eliminados de este dispositivo.', 'success');
  };

  const fieldClass =
    'celestian-clean-field w-full min-h-11 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500';
  const primaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';
  const secondaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

  return (
    <SurfaceCard className="p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Lock size={16} strokeWidth={1.75} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100">
            Privacidad y seguridad
          </h2>
        </div>

        {/* Honest Status Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isEncrypted ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Candado privado activo
            </span>
          ) : isUnverified ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400">
              Cifrado en la nube sin verificar
            </span>
          ) : isMixed ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Activación en curso
            </span>
          ) : !cloudConnected || !capability ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Cifrado en la nube sin verificar
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Protegido con Google
            </span>
          )}
        </div>
      </div>

      {/* Main Opt-in Panel */}
      <div className="border-t border-slate-100 pt-4 space-y-4 dark:border-white/[0.06]">
        {/* Pending Rotation Fail-Safe Banner */}
        {pendingRotation && (
          <div className="border-l-2 border-amber-500 pl-3.5 py-1 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle size={15} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>Quedó pendiente verificar tu nuevo código de respaldo</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              El cambio se guardó en la nube pero se cortó la conexión antes de confirmarlo acá. Ingresá tu nuevo código para terminar sin riesgos.
            </p>
            <button
              type="button"
              onClick={() => {
                setResolveError(null);
                setResolveKeyInput('');
                setIsResolveModalOpen(true);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-600 cursor-pointer"
            >
              <Key size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Verificar nuevo código</span>
            </button>
          </div>
        )}

        {/* Second-device prompt */}
        {isSecondDeviceNeedingRecovery && (
          <div className="border-l-2 border-[#4F46E5] pl-3.5 py-1 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#4F46E5] dark:text-indigo-400">
              <Lock size={15} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>Tu cuenta tiene candado privado activo</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {accountHasPassword
                ? 'Ingresá tu contraseña de bóveda una sola vez para habilitar este dispositivo.'
                : 'Ingresá tu código de recuperación para desbloquear tus datos en este dispositivo.'}
            </p>
            <button type="button" onClick={() => setIsUnlockModalOpen(true)} className={primaryBtnClass}>
              <Unlock size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Desbloquear este dispositivo</span>
            </button>
          </div>
        )}

        {/* Primary Switch Row: Candado privado adicional */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <label
              htmlFor="extra-privacy-lock-switch"
              className="block text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              Candado privado adicional
            </label>
            <p className="max-w-xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              {isUnverified
                ? 'Hay una clave local. Todavía no se verificó qué módulos están protegidos en la nube.'
                : isEncrypted
                ? 'Tus datos se protegen con tu propia contraseña antes de guardarse en la nube.'
                : isMixed
                ? `Activación en pausa (${capability?.encryptedModules?.length || 0} de ${SYNC_MODULES.length} módulos protegidos). Podés reanudarla cuando quieras.`
                : 'Tu cuenta ya está protegida con Google y se abre en 1 clic en cualquier dispositivo.'}
            </p>
            {!cloudConnected && !isUnverified && (
              <a
                href="#config-account"
                className="inline-block pt-1 text-xs font-medium text-[#4F46E5] hover:underline dark:text-indigo-400"
              >
                Conectá tu cuenta de Google para activar el candado privado.
              </a>
            )}
          </div>

          <div className="shrink-0 pt-0.5">
            <CelestianSwitch
              id="extra-privacy-lock-switch"
              checked={isLockOn}
              disabled={!cloudConnected || isLoadingCap || isMigrating || isDisabling}
              onChange={handleToggleExtraLock}
              ariaLabel="Candado privado adicional"
            />
          </div>
        </div>

        {/* Active / Unverified Lock Controls */}
        {(isEncrypted || isUnverified) && (
          <div className="border-t border-slate-100 pt-3.5 space-y-3.5 dark:border-white/[0.06]">
            {/* Legacy upgrade banner: offer adding Vault Password */}
            {isEncrypted && !accountHasPassword && (
              <div className="rounded-xl border border-[#4F46E5]/30 bg-[#4F46E5]/[0.05] p-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between dark:bg-[#4F46E5]/10">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Agregá una contraseña de bóveda
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Así podés entrar en otros dispositivos en 1 toque con tu navegador, sin buscar el código largo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setVaultAuthSecret('');
                    setVaultNewPw('');
                    setVaultConfirmPw('');
                    setVaultPwError(null);
                    setIsVaultPwModalOpen(true);
                  }}
                  className={`${primaryBtnClass} shrink-0`}
                >
                  <KeyRound size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Crear contraseña</span>
                </button>
              </div>
            )}

            {/* Session status & actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isSessionUnlocked ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-slate-600 dark:text-slate-400">
                  Estado en este dispositivo:{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {isSessionUnlocked ? 'Desbloqueado' : 'Bloqueado'}
                  </strong>
                </span>
              </div>
              {capability && isEncrypted && (
                <span className="text-xs font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                  {`${SYNC_MODULES.filter((mod) => capability.encryptedModules?.includes(mod)).length} de ${SYNC_MODULES.length} áreas protegidas`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isSessionUnlocked && (
                <button type="button" onClick={() => setIsUnlockModalOpen(true)} className={primaryBtnClass}>
                  <Unlock size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Desbloquear</span>
                </button>
              )}
              {isEncrypted && accountHasPassword && (
                <button
                  type="button"
                  onClick={() => {
                    setVaultAuthSecret('');
                    setVaultNewPw('');
                    setVaultConfirmPw('');
                    setVaultPwError(null);
                    setIsVaultPwModalOpen(true);
                  }}
                  className={secondaryBtnClass}
                >
                  <KeyRound size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Cambiar contraseña de bóveda</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDownloadKeyInput('');
                  setDownloadError(null);
                  setIsDownloadModalOpen(true);
                }}
                className={secondaryBtnClass}
              >
                <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Descargar respaldo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRewrapModalOpen(true);
                  setRewrapResultKey(null);
                  setCurrentKeyForRewrap('');
                  setRewrapError(null);
                }}
                className={secondaryBtnClass}
              >
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Renovar código de respaldo</span>
              </button>
              {(isEnrolled || isSessionUnlocked) && (
                <button
                  type="button"
                  onClick={handleForgetDevice}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-600 dark:border-white/[0.08] dark:text-slate-300 dark:hover:border-rose-400/35 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                  title="Bloquear este navegador y olvidar la sesión recordada"
                >
                  <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>Olvidar este dispositivo</span>
                </button>
              )}
            </div>

            {/* Legacy Plaintext Cleanup Banner */}
            {plaintextInventory && !plaintextInventory.isClean && (
              <div className="flex flex-col justify-between gap-3 border-l-2 border-amber-500 pl-3.5 py-1 sm:flex-row sm:items-center">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                    <span>Copias anteriores listas para limpiar</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Quedan registros antiguos previos a activar el candado privado en la nube. Podés borrarlos con seguridad.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPurging || !isSessionUnlocked}
                  onClick={handleExecutePurge}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>{isPurging ? 'Limpiando…' : 'Limpiar copias antiguas'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Resume interrupted migration */}
        {isMixed && (
          <div className="border-t border-slate-100 pt-3 flex flex-wrap items-center gap-2 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                const mdek = cryptoSession.getKey(storageUserId);
                if (mdek) {
                  setWizardStep(3);
                  void runMigration(mdek);
                } else {
                  setIsUnlockModalOpen(true);
                }
              }}
              className={primaryBtnClass}
            >
              <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Completar activación</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDisableError(null);
                setDisableProgress(null);
                setIsDisableModalOpen(true);
              }}
              className={secondaryBtnClass}
            >
              <LockOpen size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Cancelar y volver a acceso con Google</span>
            </button>
          </div>
        )}
      </div>

      {/* Informative Collapsible: Cómo funciona tu privacidad (all technical details live here) */}
      <details className="group border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <summary className="flex min-h-10 cursor-pointer items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 select-none">
          <div className="flex items-center gap-2">
            <Shield size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
            <span>Cómo funciona tu privacidad</span>
          </div>
          <ChevronDown size={15} strokeWidth={1.75} className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid grid-cols-1 gap-4 pt-3 text-xs md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Check size={14} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Protección estándar y candado opcional</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
              <li>Por defecto, tu cuenta se protege con Google y se abre en 1 clic en cualquier dispositivo.</li>
              <li>Con el candado privado adicional, tus finanzas, notas, tareas, gimnasio y estudios se cifran con AES-256-GCM antes de subir.</li>
              <li>Tu contraseña de bóveda protege la clave mediante PBKDF2 y una envoltura de claves verificada en tu navegador.</li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Shield size={14} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
              <span>Transparencia y responsabilidades</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
              <li>Tu contraseña de bóveda y tu código de respaldo nunca se guardan en texto legible en servidores.</li>
              <li>Los metadatos de sincronización (fechas y versiones) permanecen legibles para coordinar tus dispositivos.</li>
              <li>La base de datos local y los backups JSON exportados no quedan cifrados por esta función.</li>
            </ul>
          </div>
        </div>
      </details>

      {/* Account & cloud data deletion (strictly preserving deletion behavior) */}
      <div className="border-t border-slate-100 pt-4 space-y-3 dark:border-white/[0.06]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Eliminar cuenta y datos en la nube</p>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Elimina de forma permanente tu información sincronizada en la nube y desconecta tu cuenta de Google de Celestian. Tu cuenta de Google no se ve afectada y, al finalizar, podrás elegir si conservar o borrar los datos locales de este dispositivo.
            </p>
            <a
              href="/eliminar-cuenta.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#4F46E5] transition-colors hover:text-[#4338CA] hover:underline dark:text-[#818CF8] dark:hover:text-indigo-300"
            >
              <span>Instrucciones públicas, incluso si desinstalaste la app</span>
              <ExternalLink size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
            </a>
          </div>
          <button
            type="button"
            onClick={openDeleteModal}
            disabled={!cloudConnected || !onDeleteCloudAccount}
            title={!cloudConnected ? 'Conectá tu cuenta de Google primero' : 'Eliminar la cuenta y los datos en la nube'}
            className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              cloudConnected && onDeleteCloudAccount
                ? 'cursor-pointer border border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400'
                : 'cursor-not-allowed border border-slate-200/80 bg-slate-50 text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-500'
            }`}
          >
            <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Eliminar cuenta y datos en la nube</span>
          </button>
        </div>
      </div>

      {/* Guided 2-Step Activation Modal */}
      {wizardStep > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isMigrating && !isProvisioning) setWizardStep(0);
          }}
        >
          <SurfaceCard
            as="div"
            role="dialog"
            aria-modal="true"
            aria-label="Activar candado privado adicional"
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Shield size={18} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {wizardStep === 1 && 'Paso 1 de 2: Creá tu contraseña de bóveda'}
                    {wizardStep === 2 && 'Paso 2 de 2: Guardá tu respaldo de emergencia'}
                    {wizardStep === 3 && 'Activando candado privado…'}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {wizardStep === 1 && 'La vas a usar si algún día abrís tu cuenta en un dispositivo nuevo.'}
                  {wizardStep === 2 && 'Solo lo vas a necesitar si alguna vez olvidás tu contraseña de bóveda.'}
                  {wizardStep === 3 && 'Protegiendo tus áreas de forma segura…'}
                </p>
              </div>
              {!isMigrating && !isProvisioning && (
                <button
                  type="button"
                  onClick={() => setWizardStep(0)}
                  aria-label="Cerrar"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
                >
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>

            {wizardStep === 1 && (
              <form onSubmit={handleCreateVaultPassword} className="space-y-4">
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={userEmail || storageUserId || 'celestian-vault'}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                />

                <div className="space-y-1.5">
                  <label htmlFor="vault-setup-password" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Contraseña de bóveda (mínimo 8 caracteres)
                  </label>
                  <div className="relative">
                    <input
                      id="vault-setup-password"
                      name="new-password"
                      type={showSetupPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={setupPassword}
                      onChange={(e) => {
                        setSetupPassword(e.target.value);
                        if (setupError) setSetupError(null);
                      }}
                      placeholder="Elegí una contraseña segura"
                      className={`${fieldClass} pr-11`}
                      disabled={isProvisioning}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPassword((v) => !v)}
                      aria-label={showSetupPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showSetupPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="vault-setup-confirm" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Repetí tu contraseña de bóveda
                  </label>
                  <input
                    id="vault-setup-confirm"
                    name="confirm-password"
                    type={showSetupPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={setupConfirm}
                    onChange={(e) => {
                      setSetupConfirm(e.target.value);
                      if (setupError) setSetupError(null);
                    }}
                    placeholder="Repetí la misma contraseña"
                    className={fieldClass}
                    disabled={isProvisioning}
                  />
                </div>

                <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">No uses tu PIN bancario ni la contraseña de tu banco.</p>
                  <p className="text-[11px] opacity-90">
                    Tu navegador o gestor de contraseñas puede guardarla para desbloquear en 1 toque desde otros dispositivos.
                  </p>
                </div>

                {setupError && (
                  <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {setupError}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end dark:border-white/[0.06]">
                  <button type="button" onClick={() => setWizardStep(0)} disabled={isProvisioning} className={secondaryBtnClass}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isProvisioning || setupPassword.length < 8 || !setupConfirm}
                    className={primaryBtnClass}
                  >
                    {isProvisioning ? 'Preparando…' : 'Continuar'}
                  </button>
                </div>
              </form>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Guardá este respaldo en un lugar privado. Solo lo vas a necesitar si alguna vez olvidás tu contraseña de bóveda.
                </p>

                <div className="rounded-xl border border-[#4F46E5]/30 bg-slate-50 p-4 text-center space-y-1.5 select-all dark:bg-white/[0.03]">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Código de respaldo de emergencia
                  </span>
                  <div className="font-mono text-xs sm:text-sm font-bold text-[#4F46E5] dark:text-indigo-300 tracking-wide break-all">
                    {generatedKey}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => void copyRecoveryKey(generatedKey)} className={secondaryBtnClass}>
                    <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Copiar código</span>
                  </button>
                  <button type="button" onClick={() => handleDownloadKeyFile(generatedKey, provisionedEnvelope)} className={secondaryBtnClass}>
                    <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Descargar archivo (.txt)</span>
                  </button>
                </div>

                {setupError && (
                  <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {setupError}
                  </p>
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
                  <button type="button" onClick={() => setWizardStep(1)} className={secondaryBtnClass}>
                    Atrás
                  </button>
                  <button type="button" onClick={() => void handleConfirmAndActivate()} className={primaryBtnClass}>
                    <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>{backupAcknowledged ? 'Activar candado privado' : 'Ya lo guardé, activar candado'}</span>
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-900 dark:text-slate-100">
                      {isMigrating
                        ? `Protegiendo: ${migrationProgress?.currentModule ? getHumanModuleLabel(migrationProgress.currentModule) : 'Preparando…'}`
                        : '¡Candado privado activado!'}
                    </span>
                    <span className="tabular-nums text-[#4F46E5] dark:text-indigo-400">
                      {migrationProgress
                        ? `${migrationProgress.currentIndex} / ${migrationProgress.totalModules}`
                        : `0 / ${SYNC_MODULES.length}`}
                    </span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                    <div
                      className="h-full bg-[#4F46E5] transition-all duration-300"
                      style={{
                        width: `${
                          migrationProgress
                            ? Math.round((migrationProgress.currentIndex / migrationProgress.totalModules) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {isMigrating
                    ? 'Mantené esta pestaña abierta unos segundos mientras protegemos tus datos.'
                    : 'Listo. Tus datos ya están protegidos con tu contraseña de bóveda.'}
                </p>
              </div>
            )}
          </SurfaceCard>
        </div>
      )}

      {/* Safe Deactivation Confirmation Modal */}
      {isDisableModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isDisabling) setIsDisableModalOpen(false);
          }}
        >
          <SurfaceCard
            as="div"
            role="dialog"
            aria-modal="true"
            aria-label="Desactivar candado privado adicional"
            className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5]/12 text-[#4F46E5] dark:text-indigo-400">
                  <LockOpen size={18} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    ¿Desactivar el candado privado adicional?
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Tus datos seguirán protegidos con tu cuenta de Google y podrás abrir tu cuenta en 1 clic desde cualquier dispositivo.
                  </p>
                </div>
              </div>
              {!isDisabling && (
                <button
                  type="button"
                  onClick={() => setIsDisableModalOpen(false)}
                  aria-label="Cerrar"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
                >
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.03] dark:text-slate-400">
              Antes de actualizar la nube, desciframos y verificamos todos tus módulos en este dispositivo y guardamos una copia local de respaldo para que no se pierda nada.
            </div>

            {disableProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>{disableProgress.message}</span>
                  <span className="tabular-nums text-[#4F46E5] dark:text-indigo-400">
                    {disableProgress.completed}/{disableProgress.total}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                  <div
                    className="h-full bg-[#4F46E5] transition-all duration-300"
                    style={{ width: `${Math.round((disableProgress.completed / Math.max(1, disableProgress.total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {disableError && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {disableError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end dark:border-white/[0.06]">
              <button type="button" onClick={() => setIsDisableModalOpen(false)} disabled={isDisabling} className={secondaryBtnClass}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDisabling}
                onClick={() => void handleConfirmDisableExtraLock()}
                className={primaryBtnClass}
              >
                {isDisabling ? 'Actualizando cuenta…' : 'Sí, desactivar candado'}
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Add / Change Vault Password Modal */}
      {isVaultPwModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSavingVaultPw) setIsVaultPwModalOpen(false);
          }}
        >
          <SurfaceCard
            as="div"
            role="dialog"
            aria-modal="true"
            aria-label={accountHasPassword ? 'Cambiar contraseña de bóveda' : 'Crear contraseña de bóveda'}
            className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {accountHasPassword ? 'Cambiar contraseña de bóveda' : 'Crear contraseña de bóveda'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tu código de recuperación de emergencia seguirá funcionando como respaldo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsVaultPwModalOpen(false)}
                disabled={isSavingVaultPw}
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveVaultPassword} className="space-y-3.5">
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={userEmail || storageUserId || 'celestian-vault'}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
              <div className="space-y-1.5">
                <label htmlFor="vault-current-secret" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {accountHasPassword ? 'Contraseña actual (o código de recuperación)' : 'Código de recuperación actual'}
                </label>
                <input
                  id="vault-current-secret"
                  type="password"
                  autoComplete="current-password"
                  value={vaultAuthSecret}
                  onChange={(e) => {
                    setVaultAuthSecret(e.target.value);
                    if (vaultPwError) setVaultPwError(null);
                  }}
                  placeholder={accountHasPassword ? 'Tu contraseña actual…' : 'Pegá tu código de recuperación…'}
                  className={fieldClass}
                  disabled={isSavingVaultPw}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="vault-new-secret" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Nueva contraseña de bóveda (mínimo 8 caracteres)
                </label>
                <div className="relative">
                  <input
                    id="vault-new-secret"
                    name="new-password"
                    type={showVaultNewPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={vaultNewPw}
                    onChange={(e) => {
                      setVaultNewPw(e.target.value);
                      if (vaultPwError) setVaultPwError(null);
                    }}
                    placeholder="Elegí una nueva contraseña"
                    className={`${fieldClass} pr-11`}
                    disabled={isSavingVaultPw}
                  />
                  <button
                    type="button"
                    onClick={() => setShowVaultNewPw((v) => !v)}
                    aria-label={showVaultNewPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showVaultNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="vault-confirm-secret" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Repetí la nueva contraseña
                </label>
                <input
                  id="vault-confirm-secret"
                  name="confirm-password"
                  type={showVaultNewPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={vaultConfirmPw}
                  onChange={(e) => {
                    setVaultConfirmPw(e.target.value);
                    if (vaultPwError) setVaultPwError(null);
                  }}
                  placeholder="Repetí la misma contraseña"
                  className={fieldClass}
                  disabled={isSavingVaultPw}
                />
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                No uses tu PIN bancario ni la contraseña de tu banco.
              </p>

              {vaultPwError && (
                <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {vaultPwError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end dark:border-white/[0.06]">
                <button type="button" onClick={() => setIsVaultPwModalOpen(false)} disabled={isSavingVaultPw} className={secondaryBtnClass}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingVaultPw || !vaultAuthSecret.trim() || vaultNewPw.length < 8 || !vaultConfirmPw}
                  className={primaryBtnClass}
                >
                  {isSavingVaultPw ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </div>
            </form>
          </SurfaceCard>
        </div>
      )}

      {/* Modal: Desbloqueo de Dispositivo */}
      <UnlockDeviceModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        userId={storageUserId || ''}
        userEmail={userEmail}
        envelopeOverride={activeEnvelope}
        onUnlocked={(envelope) => {
          setLocalEnvelope(envelope);
          setCloudEnvelope(envelope);
          if (storageUserId) isDeviceEnrolled(storageUserId).then(setIsEnrolled).catch(() => {});
          onForceSync?.();
        }}
        onRequestDisableLock={() => {
          setDisableError(null);
          setDisableProgress(null);
          setIsDisableModalOpen(true);
        }}
        showToast={showToast}
      />

      {/* Modal: Renovar código de respaldo (Rewrap) */}
      {isRewrapModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsRewrapModalOpen(false);
          }}
        >
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Renovar código de respaldo" className="w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <RotateCcw size={18} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Renovar código de respaldo</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Genera un nuevo código de emergencia para tu cuenta</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRewrapModalOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {!rewrapResultKey ? (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Ingresá tu código de respaldo actual para generar uno nuevo. Tu contraseña de bóveda seguirá funcionando normalmente.
                </p>

                <div>
                  <label htmlFor="rewrap-current-key" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Código de respaldo actual:
                  </label>
                  <textarea
                    id="rewrap-current-key"
                    rows={2}
                    value={currentKeyForRewrap}
                    onChange={(e) => setCurrentKeyForRewrap(e.target.value)}
                    placeholder="Pegá tu código actual…"
                    className={`${fieldClass} font-mono text-xs resize-none`}
                  />
                  {rewrapError && (
                    <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{rewrapError}</p>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setIsRewrapModalOpen(false)} className={secondaryBtnClass}>
                    Cancelar
                  </button>
                  <button type="button" disabled={!currentKeyForRewrap.trim()} onClick={handleRewrapKey} className={primaryBtnClass}>
                    Generar nuevo código
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border-l-2 border-emerald-500 pl-3 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                  Código de respaldo actualizado. Guardalo en un lugar seguro.
                </div>

                <div className="rounded-xl border border-[#4F46E5]/35 bg-slate-50 p-4 text-center space-y-2 select-all dark:bg-white/[0.03]">
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Nuevo código de respaldo
                  </span>
                  <div className="font-mono text-xs sm:text-sm font-bold text-[#4F46E5] dark:text-indigo-300 tracking-wide break-all">
                    {rewrapResultKey}
                  </div>
                </div>

                <div className="flex justify-center gap-2">
                  <button type="button" onClick={() => void copyRecoveryKey(rewrapResultKey)} className={secondaryBtnClass}>
                    <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Copiar</span>
                  </button>
                  <button type="button" onClick={() => handleDownloadKeyFile(rewrapResultKey, localEnvelope)} className={secondaryBtnClass}>
                    <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Descargar (.txt)</span>
                  </button>
                </div>

                <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setIsRewrapModalOpen(false)} className={primaryBtnClass}>
                    Listo
                  </button>
                </div>
              </div>
            )}
          </SurfaceCard>
        </div>
      )}

      {/* Resolve Pending Rotation Modal */}
      {isResolveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsResolveModalOpen(false);
          }}
        >
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Verificar nuevo código de respaldo" className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <Key size={18} strokeWidth={1.75} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Verificar nuevo código de respaldo</h3>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Ingresá el nuevo código que generaste para confirmar que coincide con tu cuenta.
            </p>

            {resolveError && (
              <p className="border-l-2 border-rose-500 pl-3 py-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                {resolveError}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="resolve-key-input" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Nuevo código de respaldo
              </label>
              <textarea
                id="resolve-key-input"
                rows={3}
                value={resolveKeyInput}
                onChange={(e) => setResolveKeyInput(e.target.value)}
                placeholder="Pegá el código generado…"
                className={`${fieldClass} font-mono text-xs resize-none`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" onClick={() => setIsResolveModalOpen(false)} className={secondaryBtnClass}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={!resolveKeyInput.trim()}
                onClick={handleResolvePendingRotation}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Download Recovery File Modal */}
      {isDownloadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-xs"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsDownloadModalOpen(false);
          }}
        >
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Descargar archivo de respaldo" className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Download size={18} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Descargar archivo de respaldo</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Ingresá tu código actual para generar el archivo.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(false)}
                aria-label="Cerrar"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Este archivo te sirve como respaldo de emergencia para desbloquear tu cuenta en un dispositivo nuevo.
            </p>
            <div>
              <textarea
                rows={3}
                value={downloadKeyInput}
                onChange={(e) => setDownloadKeyInput(e.target.value)}
                placeholder="Pegá tu código de respaldo actual…"
                className={`${fieldClass} font-mono text-xs resize-none`}
              />
              {downloadError && <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{downloadError}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button type="button" onClick={() => setIsDownloadModalOpen(false)} className={secondaryBtnClass}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={!downloadKeyInput.trim()}
                onClick={async () => {
                  const targetEnvelope = localEnvelope || cloudEnvelope;
                  if (!targetEnvelope || !storageUserId) {
                    setDownloadError('No encontramos el respaldo de claves de esta cuenta.');
                    return;
                  }
                  try {
                    const rawRecovery = await parseRecoveryKey(downloadKeyInput.trim());
                    const salt = base64ToBytes(targetEnvelope.kdf.salt);
                    const kek = await deriveKekFromRecoveryKey(rawRecovery, salt);
                    try {
                      await unwrapMdekWithKek(targetEnvelope.wrappedMdek, kek, targetEnvelope.aad);
                    } finally {
                      rawRecovery.fill(0);
                    }
                    handleDownloadKeyFile(downloadKeyInput.trim(), targetEnvelope);
                    setIsDownloadModalOpen(false);
                  } catch {
                    setDownloadError('El código ingresado no es correcto o no coincide con esta cuenta.');
                  }
                }}
                className={primaryBtnClass}
              >
                Descargar archivo
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {/* Account Deletion Confirmation Modal (untouched logic) */}
      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div ref={deleteDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Eliminar cuenta y datos" className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-2xl dark:border-white/[0.07] dark:bg-[#0D111A]">
            {deleteStage === 'confirm' ? (
              <>
                <div className="flex items-start gap-2.5">
                  <Trash2 size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Eliminar cuenta y datos en la nube</h3>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      Esta acción es permanente y no se puede deshacer. Se eliminarán de la nube todos tus datos sincronizados, su historial y el acceso del candado privado si lo activaste. Luego cerraremos tu sesión en este dispositivo.
                    </p>
                  </div>
                </div>
                <ul className="list-inside list-disc space-y-1 border-l-2 border-rose-500/40 pl-3 py-1 text-xs text-slate-600 dark:text-slate-400">
                  <li>Todos los módulos sincronizados en la nube y su historial.</li>
                  <li>Tu configuración y acceso del candado privado adicional, si estaba activo.</li>
                  <li>El vínculo de sincronización con este dispositivo (tu cuenta de Google sigue intacta).</li>
                </ul>
                <div className="space-y-1.5">
                  <label htmlFor="delete-account-confirmation" className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Escribí <strong>ELIMINAR</strong> para confirmar
                  </label>
                  <input
                    id="delete-account-confirmation"
                    type="text"
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full min-h-10 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold uppercase tracking-widest text-slate-900 focus:border-rose-500 focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100"
                  />
                </div>
                {deleteError && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{deleteError}</p>}
                <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-3 sm:flex-row dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    disabled={isDeleting}
                    className={`${secondaryBtnClass} disabled:opacity-50`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting || deleteConfirmation.trim().toUpperCase() !== 'ELIMINAR'}
                    onClick={() => { void handleDeleteAccount(); }}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? 'Eliminando…' : 'Eliminar definitivamente'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2.5">
                  <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cuenta y datos en la nube eliminados</h3>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      Tu sesión de Google se cerró. Los datos que quedan en este dispositivo son solo locales y ya no están vinculados a la nube. ¿Querés eliminarlos también?
                    </p>
                  </div>
                </div>
                <div className="flex flex-col-reverse justify-end gap-2 border-t border-slate-100 pt-3 sm:flex-row dark:border-white/[0.06]">
                  <button type="button" onClick={closeDeleteModal} className={secondaryBtnClass}>
                    Conservar datos locales
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteLocal}
                    className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
                  >
                    Eliminar también los datos locales
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </SurfaceCard>
  );
};
