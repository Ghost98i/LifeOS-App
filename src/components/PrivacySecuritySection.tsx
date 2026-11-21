import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  Key,
  Lock,
  RotateCcw,
  Shield,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type { LifeOSState } from '../types';
import { ContextualHelp } from './ContextualHelp';
import { UnlockDeviceModal } from './UnlockDeviceModal';
import { SurfaceCard } from './ui/SurfacePrimitives';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { showToast } from '../lib/toast';
import { SYNC_MODULES } from '../lib/syncModel';
import {
  provisionZeroKnowledgeKeys,
  unlockMdekWithRecoveryKey,
  loadWrappedKeyEnvelope,
  cryptoSession,
  parseRecoveryKey,
  base64ToBytes,
  deriveKekFromRecoveryKey,
  unwrapMdekWithKek,
  type WrappedKeyEnvelope,
} from '../lib/cryptoCore';
import {
  executeE2EEMigration,
  executeKeyRotation,
  fetchAccountCapability,
  fetchCloudKeyEnvelope,
  setCloudKeyEnvelope,
  getRotationPendingState,
  resolvePendingRotation,
  type AccountSyncCapability,
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
  onForceSync?: () => void;
  onDeleteCloudAccount?: () => Promise<void>;
  onDeleteLocalData?: () => void;
}

export const PrivacySecuritySection: React.FC<PrivacySecuritySectionProps> = ({
  state,
  storageUserId,
  cloudConnected,
  onForceSync,
  onDeleteCloudAccount,
  onDeleteLocalData,
}) => {
  const [capability, setCapability] = useState<AccountSyncCapability | null>(null);
  const [isLoadingCap, setIsLoadingCap] = useState(false);
  const [cloudEnvelopeAvailable, setCloudEnvelopeAvailable] = useState<boolean>(false);
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

  // Wizard state: 0 = Closed, 1 = Intro/Explanation, 2 = Key Generation & Backup, 3 = Verification, 4 = Progress
  const [wizardStep, setWizardStep] = useState<number>(0);
  const [generatedKey, setGeneratedKey] = useState<string>('');
  const [provisionedEnvelope, setProvisionedEnvelope] = useState<WrappedKeyEnvelope | null>(null);
  const [sessionKeyCandidate, setSessionKeyCandidate] = useState<CryptoKey | null>(null);

  // Verification input
  const [verifyKeyInput, setVerifyKeyInput] = useState<string>('');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Migration running state
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);

  // Unlock Modal (when device needs MDEK from local envelope or cloud envelope)
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState<boolean>(false);

  // Key Replacement Modal (Rewrap)
  const [isRewrapModalOpen, setIsRewrapModalOpen] = useState<boolean>(false);
  const [currentKeyForRewrap, setCurrentKeyForRewrap] = useState<string>('');
  const [rewrapResultKey, setRewrapResultKey] = useState<string | null>(null);
  const [rewrapError, setRewrapError] = useState<string | null>(null);

  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadKeyInput, setDownloadKeyInput] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Plaintext Inventory & Purge State (Stage E)
  const [plaintextInventory, setPlaintextInventory] = useState<CloudPlaintextInventory | null>(null);
  const [isPurging, setIsPurging] = useState<boolean>(false);

  // Account & cloud data deletion
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteStage, setDeleteStage] = useState<'confirm' | 'local'>('confirm');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);

  // Rotation Pending Verification State (Stage E fail-safe)
  const [pendingRotation, setPendingRotation] = useState<RotationPendingState | null>(() =>
    storageUserId ? getRotationPendingState(storageUserId) : null
  );
  const [isResolveModalOpen, setIsResolveModalOpen] = useState<boolean>(false);
  const [resolveKeyInput, setResolveKeyInput] = useState<string>('');
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Fetch capability, cloud keyEnvelope, and inventory when user or cloud status changes
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
            setCloudEnvelopeAvailable(Boolean(remoteEnv));
            setPlaintextInventory(inv);
            setPendingRotation(getRotationPendingState(storageUserId));
          }
        })
        .catch(() => {
          if (active) { setCapability(null); setCloudEnvelopeAvailable(false); setPlaintextInventory(null); }
        })
        .finally(() => {
          if (active) setIsLoadingCap(false);
        });
    } else {
      setCapability(null);
      setCloudEnvelopeAvailable(false);
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
  const isSecondDeviceNeedingRecovery = (isEncrypted || isMixed) && !localEnvelope && cloudEnvelopeAvailable;

  // Wizard: Step 1 -> Step 2 (Generate Keys)
  const handleStartActivation = async () => {
    try {
      setVerifyError(null);
      setVerifyKeyInput('');
      const { recoveryKeyFormatted, envelope, sessionMdek } = await provisionZeroKnowledgeKeys(storageUserId);
      setGeneratedKey(recoveryKeyFormatted);
      setProvisionedEnvelope(envelope);
      setSessionKeyCandidate(sessionMdek);
      setWizardStep(2);
    } catch (err: any) {
      showToast(err?.message || 'Error al generar claves de cifrado.', 'error');
    }
  };

  // Copy Recovery Key to Clipboard
  const copyRecoveryKey = async (key: string) => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      showToast('Clave de recuperación copiada al portapapeles.');
    } catch {
      showToast('No se pudo copiar la clave. Seleccionala y copiala manualmente antes de continuar.', 'error');
    }
  };
  const handleCopyKey = () => copyRecoveryKey(generatedKey);

  // Download Recovery Key as text file with explicit safety warning
  const handleDownloadKeyFile = () => {
    if (!generatedKey) return;
    const blob = new Blob([
      `CELESTIAN LIFEOS — CLAVE DE RECUPERACIÓN DE SEGURIDAD\n` +
      `Generada: ${new Date().toLocaleString('es-UY')}\n\n` +
      `Tu Clave de Recuperación:\n` +
      `${generatedKey}\n\n` +
      `AVISO DE SEGURIDAD:\n` +
      `- Este archivo contiene la clave de recuperación completa de 256 bits.\n` +
      `- Cualquier persona que tenga acceso a este archivo y a tu cuenta de Google puede descifrar tus datos personales.\n` +
      `- Guardá este archivo en un pendrive cifrado, gestor de contraseñas o imprimilo en papel y borrá el archivo digital.\n` +
      `- Ni Google, ni los servidores de Celestian LifeOS, ni terceros pueden restaurarla por ti.\n`
    ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `celestian-recovery-key-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Archivo descargado. Recordá mantenerlo en un lugar seguro y privado.');
  };

  // Wizard: Step 3 (Verify User actually backed up the key via unwrap test & Cloud Envelope persistence)
  const handleVerifyKey = async () => {
    if (!provisionedEnvelope || !sessionKeyCandidate || !storageUserId) return;
    setVerifyError(null);

    try {
      // 1. Format validation
      await parseRecoveryKey(verifyKeyInput);

      // 2. Cryptographic unwrap test: prove the input actually unlocks the envelope!
      const unlockedMdek = await unlockMdekWithRecoveryKey(verifyKeyInput, provisionedEnvelope, storageUserId);

      // 3. Persist wrapped key envelope to Cloud Firestore BEFORE starting migration
      await setCloudKeyEnvelope(storageUserId, provisionedEnvelope);

      // 4. Verify that cloud envelope can be retrieved and validated
      const verifiedRemoteEnvelope = await fetchCloudKeyEnvelope(storageUserId);
      if (!verifiedRemoteEnvelope) {
        throw new Error('Fallo al verificar el WrappedKeyEnvelope en la nube. No se puede iniciar la migración.');
      }

      // 5. Successfully unlocked and ready
      cryptoSession.setUnlocked(unlockedMdek, storageUserId);
      setLocalEnvelope(provisionedEnvelope);
      setCloudEnvelopeAvailable(true);

      // Proceed to Step 4 (Migration)
      setWizardStep(4);
      runMigration(unlockedMdek);
    } catch (err: any) {
      setVerifyError(err?.message || 'La clave ingresada no es válida o no coincide con la generada. Verificá los caracteres.');
    }
  };

  // Run the 15-module resumable migration with safe per-module commits
  const runMigration = async (mdek: CryptoKey) => {
    if (!storageUserId) {
      showToast('Sesión de usuario no detectada para migración cloud.', 'error');
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
      showToast('¡Privacidad de extremo a extremo activada exitosamente!');
      if (onForceSync) onForceSync();
      setTimeout(() => {
        setWizardStep(0);
        setIsMigrating(false);
        setMigrationProgress(null);
      }, 1200);
    } catch (err: any) {
      console.error('[Migration] Error:', err);
      showToast(`Error durante la migración: ${err?.message || 'Fallo de red'}`, 'error');
      setIsMigrating(false);
    }
  };

  useEffect(() => {
    if (wizardStep === 0 && !isRewrapModalOpen && !isResolveModalOpen && !isDownloadModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (wizardStep > 0 && !isMigrating) setWizardStep(0);
      if (isRewrapModalOpen) setIsRewrapModalOpen(false);
      if (isResolveModalOpen) setIsResolveModalOpen(false);
      if (isDownloadModalOpen) setIsDownloadModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [wizardStep, isMigrating, isRewrapModalOpen, isResolveModalOpen, isDownloadModalOpen]);

  // Key Replacement (Rewrap) Flow with cloud synchronization and partial failure defense
  const handleRewrapKey = async () => {
    if (!storageUserId) return;
    setRewrapError(null);
    try {
      const { newRecoveryKeyFormatted, newEnvelope } = await executeKeyRotation(
        storageUserId,
        currentKeyForRewrap
      );

      setLocalEnvelope(newEnvelope);
      setRewrapResultKey(newRecoveryKeyFormatted);
      showToast('Clave de recuperación renovada con éxito.');
    } catch (err: any) {
      setRewrapError(err?.message || 'La clave actual no es correcta. No se pudo regenerar.');
    }
  };

  // Plaintext Purge Flow (Stage E)
  const handleExecutePurge = async () => {
    if (!storageUserId) return;
    const sessionMdek = cryptoSession.getKey(storageUserId);
    if (!sessionMdek) {
      showToast('Desbloqueá la sesión antes de ejecutar la purga de datos antiguos.', 'error');
      setIsUnlockModalOpen(true);
      return;
    }

    setIsPurging(true);
    try {
      const result = await executeCloudPlaintextPurge(
        storageUserId,
        sessionMdek,
        state
      );

      if (result.success) {
        showToast('Copia histórica en texto plano purgada con éxito de la nube.');
        const updatedInv = await inventoryCloudPlaintext(storageUserId);
        setPlaintextInventory(updatedInv);
      } else {
        showToast(`Purga parcial completada. Restantes: ${result.remainingPlaintextCount}`, 'info');
      }
    } catch (err: any) {
      showToast(`Error al purgar copia histórica: ${err?.message || err}`, 'error');
    } finally {
      setIsPurging(false);
    }
  };

  // Handle Resolution of Rotation Pending Verification
  const handleResolvePendingRotation = async () => {
    if (!storageUserId) return;
    setResolveError(null);
    try {
      const res = await resolvePendingRotation(storageUserId, resolveKeyInput);
      setLocalEnvelope(res.envelope);
      setPendingRotation(null);
      setIsResolveModalOpen(false);
      setResolveKeyInput('');
      showToast('Rotación de clave verificada y completada con éxito.');
      if (onForceSync) onForceSync();
    } catch (err: any) {
      setResolveError(err?.message || 'La clave ingresada no es correcta o no coincide con la rotación emitida.');
    }
  };

  const handleForgetDevice = async () => {
    if (!storageUserId) return;
    const confirmed = window.confirm(
      '¿Olvidar este dispositivo?\n\nSe eliminarán las credenciales locales de confianza en este navegador. Para volver a desbloquearlo o sincronizar en el futuro, necesitarás tu Clave de Recuperación.'
    );
    if (!confirmed) return;

    await forgetDeviceTrust(storageUserId);
    cryptoSession.lock();
    setIsEnrolled(false);
    showToast('Dispositivo desvinculado. La sesión fue bloqueada en este navegador.');
    if (onForceSync) onForceSync();
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

  const primaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const secondaryBtnClass =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-transparent px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.08] dark:text-slate-200 dark:hover:bg-white/[0.04] cursor-pointer';

  return (
    <SurfaceCard className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Lock size={16} strokeWidth={1.75} className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100">Privacidad y seguridad</h2>
            <ContextualHelp label="Protección de extremo a extremo">
              Cuando activás la protección, tus módulos se cifran en este navegador antes de sincronizarse. Los metadatos y las copias históricas sin cifrar tienen un alcance diferente, explicado más abajo.
            </ContextualHelp>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cifrado de la sincronización y recuperación de acceso.
          </p>
        </div>

        {/* State Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isEncrypted ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {capability ? 'Protección activada' : 'Cifrado en la nube sin verificar'}
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
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              {capability ? 'Cifrado no activado' : 'Cifrado en la nube sin verificar'}
            </span>
          )}
        </div>
      </div>

      {/* Main Status Panel */}
      <div className="border-t border-slate-100 pt-4 space-y-4 dark:border-white/[0.06]">
        {/* Pending Rotation Fail-Safe Banner (Stage E) */}
        {pendingRotation && (
          <div className="border-l-2 border-amber-500 pl-3.5 py-1 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle size={15} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>La renovación de tu clave quedó pendiente de verificación</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              El cambio de clave se registró en la nube pero no se pudo confirmar la respuesta localmente. Para completar el proceso sin riesgos, ingresá la nueva clave de recuperación que guardaste.
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
              <span>Verificar nueva clave</span>
            </button>
          </div>
        )}

        {isSecondDeviceNeedingRecovery && (
          <div className="border-l-2 border-[#4F46E5] pl-3.5 py-1 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#4F46E5] dark:text-indigo-400">
              <Lock size={15} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
              <span>Nuevo dispositivo detectado: Cuenta protegida con cifrado</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Los datos de tu cuenta están cifrados. Ingresá tu clave de recuperación para desbloquearlos y sincronizar desde este navegador.
            </p>
            <button type="button" onClick={() => setIsUnlockModalOpen(true)} className={primaryBtnClass}>
              <Unlock size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Ingresar Clave de Recuperación y Desbloquear</span>
            </button>
          </div>
        )}

        {isEncrypted || isUnverified ? (
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Datos sincronizados
                </p>
                <p className="max-w-xl text-xs text-slate-600 dark:text-slate-400">
                  {isUnverified ? 'Hay una clave local. Todavía no se verificó qué módulos están cifrados en la nube.' : 'El contenido de los módulos protegidos usa AES-256-GCM. Los metadatos de sincronización permanecen legibles y pueden existir copias históricas sin cifrar, indicadas más abajo.'}
                </p>
              </div>
              {capability && (
                <div className="text-right">
                  <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {`${SYNC_MODULES.filter((module) => capability.encryptedModules?.includes(module)).length} de ${SYNC_MODULES.length} módulos verificados`}
                  </span>
                </div>
              )}
            </div>

            {/* Session status */}
            <div className="border-t border-slate-100 pt-3.5 space-y-3 dark:border-white/[0.06]">
              <div className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${isSessionUnlocked ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-slate-600 dark:text-slate-400">
                  Acceso en este navegador:{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {isSessionUnlocked ? 'Desbloqueado' : 'Bloqueado'}
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {!isSessionUnlocked && (
                    <button type="button" onClick={() => setIsUnlockModalOpen(true)} className={primaryBtnClass}>
                      <Unlock size={14} strokeWidth={1.75} aria-hidden="true" />
                      <span>Desbloquear con clave</span>
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
                    <span>Descargar archivo de recuperación</span>
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
                    <span>Renovar clave de recuperación</span>
                  </button>
                </div>

                {(isEnrolled || isSessionUnlocked) && (
                  <button
                    type="button"
                    onClick={handleForgetDevice}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/20 dark:text-rose-400 cursor-pointer"
                    title="Eliminar confianza de este navegador y bloquear sesión"
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    <span>Olvidar este dispositivo</span>
                  </button>
                )}
              </div>
            </div>

            {/* Stage E: Legacy Plaintext Warning & Purge Control */}
            {plaintextInventory && !plaintextInventory.isClean && (
              <div className="flex flex-col justify-between gap-3 border-l-2 border-amber-500 pl-3.5 py-1 sm:flex-row sm:items-center">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                    <span>Copia histórica sin cifrar pendiente de limpieza</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Existen {plaintextInventory.hasLegacyMonolithicState ? '1 copia de estado global v1 ' : ''}
                    {plaintextInventory.plaintextRevisionsCount > 0
                      ? `y ${plaintextInventory.plaintextRevisionsCount} revisiones anteriores en texto plano en la nube.`
                      : 'en la nube.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPurging || !isSessionUnlocked}
                  onClick={handleExecutePurge}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                  <span>{isPurging ? 'Purgando...' : 'Purgar Copia Histórica'}</span>
                </button>
              </div>
            )}
          </div>
        ) : isMixed ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Migración de privacidad incompleta o interrumpida
              </p>
              <p className="max-w-xl text-xs text-slate-600 dark:text-slate-400">
                Se aseguraron {capability?.encryptedModules?.length || 0} de 15 módulos. Podés reanudar el proceso de forma segura sin duplicar datos ni perder revisiones.
              </p>
            </div>
            <div className="border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  const mdek = cryptoSession.getKey(storageUserId);
                  if (mdek) {
                    setWizardStep(4);
                    runMigration(mdek);
                  } else {
                    setIsUnlockModalOpen(true);
                  }
                }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-600 cursor-pointer"
              >
                <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
                <span>Reanudar Migración a Cifrado Completo</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="max-w-xl space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Cifrado de los datos sincronizados
              </p>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Al activarlo, los módulos se cifran antes de sincronizar. La copia de este navegador y los archivos exportados no quedan cifrados por esta función.
              </p>
            </div>
            <div className="shrink-0 space-y-2">
              <button
                type="button"
                disabled={isLoadingCap || !cloudConnected}
                onClick={() => setWizardStep(1)}
                title={!cloudConnected ? 'Conectá tu cuenta de Google primero' : 'Activar protección de extremo a extremo'}
                className={cloudConnected ? primaryBtnClass : 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-500'}
              >
                <Lock size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>Activar cifrado</span>
              </button>
              {!cloudConnected && (
                <a href="#config-account" className="block max-w-52 text-xs font-medium text-[#4F46E5] hover:underline dark:text-indigo-400">
                  Conectá Google para activar el cifrado.
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Security Scope Guarantee - Progressive Disclosure */}
      <details className="group border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        <summary className="flex min-h-10 cursor-pointer items-center justify-between text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 select-none">
          <div className="flex items-center gap-2">
            <Shield size={15} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
            <span>Qué protege el cifrado y cómo recuperar el acceso</span>
          </div>
          <ChevronDown size={15} strokeWidth={1.75} className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid grid-cols-1 gap-4 pt-3 text-xs md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Check size={14} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Alcance al activar</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
              <li>Finanzas (cuentas, transacciones, compromisos).</li>
              <li>Notas, ideas, tareas, proyectos y contexto personal.</li>
              <li>Agenda, rutinas de gimnasio y registros de estudio.</li>
              <li>Cifrado en reposo y en tránsito hacia la nube.</li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
              <Shield size={14} strokeWidth={1.75} className="text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
              <span>Transparencia y responsabilidades</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
              <li>La clave de recuperación solo existe en tu poder; no se almacena en servidores.</li>
              <li>Si perdés la clave, nadie puede recuperarla en un dispositivo nuevo.</li>
              <li>Metadatos no sensibles (versiones, marcas temporales) se conservan para sincronización.</li>
              <li>La base de datos local y los backups JSON exportados no quedan cifrados por esta función.</li>
            </ul>
          </div>
        </div>
      </details>

      {/* Account & cloud data deletion */}
      <div className="border-t border-slate-100 pt-4 space-y-3 dark:border-white/[0.06]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Eliminar cuenta y datos en la nube</p>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Borra de forma permanente los módulos, el historial de revisiones y la envoltura de claves asociados a tu cuenta de Google. La sincronización se detiene primero para que ningún guardado pendiente vuelva a crear esos documentos.
            </p>
            <a
              href="/eliminar-cuenta.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center text-xs font-semibold text-[#4F46E5] hover:underline dark:text-indigo-400"
            >
              Instrucciones públicas, incluso si desinstalaste la app →
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

      {/* Wizard Modal: 4 Steps */}
      {wizardStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Activar cifrado" className="w-full max-w-xl p-5 sm:p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield size={18} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {wizardStep === 1 && 'Paso 1 de 4: ¿Cómo funciona la protección?'}
                    {wizardStep === 2 && 'Paso 2 de 4: Guardá tu Clave de Recuperación'}
                    {wizardStep === 3 && 'Paso 3 de 4: Verificá tu Clave de Recuperación'}
                    {wizardStep === 4 && 'Paso 4 de 4: Migración reanudable por módulos'}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {wizardStep === 1 && 'Información clara antes de comenzar'}
                  {wizardStep === 2 && 'Es imprescindible que respaldes esta clave ahora mismo'}
                  {wizardStep === 3 && 'Comprobemos que conservaste la clave correctamente'}
                  {wizardStep === 4 && 'Commit seguro y verificación criptográfica por módulo'}
                </p>
              </div>
              {!isMigrating && (
                <button
                  type="button"
                  onClick={() => setWizardStep(0)}
                  aria-label="Cerrar"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer"
                >
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              )}
            </div>

            {wizardStep === 1 && (
              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-400">
                <p>
                  Al completar la activación, los módulos se cifrarán en este navegador antes de sincronizarse. Guardá la clave de recuperación para poder acceder desde otro dispositivo.
                </p>
                <div className="border-l-2 border-[#4F46E5] pl-3.5 py-1 space-y-2">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">¿Qué significa en la práctica?</p>
                  <ul className="list-disc list-inside space-y-1.5">
                    <li>El contenido de los módulos migrados se guardará cifrado en Firebase. Los metadatos y las copias históricas pendientes de limpieza pueden permanecer legibles.</li>
                    <li>Generaremos una <strong>Clave de Recuperación de 256 bits</strong> en tu navegador.</li>
                    <li>
                      <strong>Importante:</strong> Celestian LifeOS no tiene un botón de “Olvidé mi contraseña”. Si cambiás de dispositivo o borrás los datos del navegador sin esta clave, no podremos recuperar tus datos.
                    </li>
                  </ul>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setWizardStep(0)} className={secondaryBtnClass}>
                    Cancelar
                  </button>
                  <button type="button" onClick={handleStartActivation} className={primaryBtnClass}>
                    Entendido, Generar mi Clave
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Esta es tu Clave de Recuperación. Guardala en un gestor de contraseñas seguro o imprimila en papel.
                </p>

                <div className="rounded-xl border border-[#4F46E5]/35 bg-slate-50 p-4 text-center space-y-2 select-all dark:bg-white/[0.03]">
                  <span className="block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Clave de Recuperación Única (Base58Check)
                  </span>
                  <div className="font-mono text-sm sm:text-base font-bold text-[#4F46E5] dark:text-indigo-300 tracking-wide break-all">
                    {generatedKey}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button type="button" onClick={handleCopyKey} className={secondaryBtnClass}>
                    <span>Copiar al Portapapeles</span>
                  </button>
                  <button type="button" onClick={handleDownloadKeyFile} className={secondaryBtnClass}>
                    <span>Descargar archivo de texto (.txt)</span>
                  </button>
                </div>

                <p className="border-l-2 border-amber-500 pl-3 py-1 text-xs text-amber-800 dark:text-amber-300">
                  En el siguiente paso te pediremos que ingreses esta clave para certificar que la guardaste.
                </p>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setWizardStep(3)} className={primaryBtnClass}>
                    Ya la guardé, Continuar a Verificación
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Pegá o escribí la clave de recuperación que acabás de guardar para confirmar:
                </p>

                <div>
                  <textarea
                    rows={3}
                    value={verifyKeyInput}
                    onChange={(e) => setVerifyKeyInput(e.target.value)}
                    placeholder="Pegá tu clave de recuperación aquí..."
                    className="w-full rounded-xl border border-slate-200/80 bg-white p-3 font-mono text-xs text-slate-900 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100"
                  />
                  {verifyError && (
                    <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{verifyError}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setWizardStep(2)} className={secondaryBtnClass}>
                    Volver a ver la clave
                  </button>
                  <button type="button" disabled={!verifyKeyInput.trim()} onClick={handleVerifyKey} className={primaryBtnClass}>
                    Verificar y Comenzar Migración
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-900 dark:text-slate-100">
                      {isMigrating
                        ? `Cifrando módulo: ${migrationProgress?.currentModule || 'Preparando...'}`
                        : 'Migración completada'}
                    </span>
                    <span className="font-mono text-[#4F46E5] dark:text-indigo-400">
                      {migrationProgress
                        ? `${migrationProgress.currentIndex} / ${migrationProgress.totalModules}`
                        : '0 / 15'}
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

                <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px] sm:grid-cols-5">
                  {SYNC_MODULES.map((mod) => {
                    const isDone = migrationProgress?.completedModules.includes(mod);
                    const isCurrent = migrationProgress?.currentModule === mod && isMigrating;
                    return (
                      <div
                        key={mod}
                        className={`truncate rounded-lg border p-1.5 text-center ${
                          isDone
                            ? 'border-emerald-500/20 bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-400'
                            : isCurrent
                            ? 'border-[#4F46E5]/30 bg-[#4F46E5]/10 font-semibold text-[#4F46E5] dark:text-indigo-300 animate-pulse'
                            : 'border-slate-200/80 bg-slate-50 text-slate-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-500'
                        }`}
                      >
                        {mod}
                      </div>
                    );
                  })}
                </div>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  {isMigrating
                    ? 'No cierres esta pestaña mientras se actualizan tus módulos de sincronización.'
                    : 'Todos tus datos fueron migrados de forma segura. La nube ahora solo contiene ciphertext.'}
                </p>
              </div>
            )}
          </SurfaceCard>
        </div>
      )}

      {/* Modal: Desbloqueo de Dispositivo */}
      <UnlockDeviceModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        userId={storageUserId}
        envelopeOverride={localEnvelope}
        onUnlocked={(envelope) => {
          setLocalEnvelope(envelope);
          if (storageUserId) isDeviceEnrolled(storageUserId).then(setIsEnrolled).catch(() => {});
          if (onForceSync) onForceSync();
        }}
        showToast={showToast}
      />

      {/* Modal: Renovar clave de recuperación (Rewrap) */}
      {isRewrapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Renovar clave de recuperación" className="w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <RotateCcw size={18} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Renovar clave de recuperación</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Actualiza la credencial para recuperar esta cuenta en nuevos dispositivos</p>
              </div>
            </div>

            {!rewrapResultKey ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Necesitás tu clave actual para generar otra. La nueva clave se usará para desbloquear la cuenta en otros dispositivos; los datos cifrados no cambian.
                  </p>
                  <p className="border-l-2 border-slate-300 pl-3 py-1 text-xs leading-relaxed text-slate-500 dark:border-white/15 dark:text-slate-400">
                    <strong>Alcance de la renovación:</strong> Cambia la clave de recuperación, pero no vuelve a cifrar todos los datos. Si alguien obtuvo la clave anterior junto con una copia del almacenamiento de tu dispositivo, revocar ese acceso requiere volver a cifrar los datos.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Ingresá tu Clave de Recuperación actual:
                  </label>
                  <textarea
                    rows={2}
                    value={currentKeyForRewrap}
                    onChange={(e) => setCurrentKeyForRewrap(e.target.value)}
                    placeholder="Clave actual..."
                    className="w-full rounded-xl border border-slate-200/80 bg-white p-2.5 font-mono text-xs text-slate-900 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100"
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
                    Generar Nueva Clave
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="border-l-2 border-emerald-500 pl-3 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                    Clave de recuperación actualizada. Se cambió la credencial requerida para recuperar esta cuenta en nuevos dispositivos.
                  </div>
                  <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
                    El keyEnvelope cloud actual sólo puede abrirse con la nueva Recovery Key. Guardala en un lugar seguro.
                  </p>
                </div>

                <div className="rounded-xl border border-[#4F46E5]/35 bg-slate-50 p-4 text-center space-y-2 select-all dark:bg-white/[0.03]">
                  <span className="block font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Nueva Clave de Recuperación
                  </span>
                  <div className="font-mono text-sm sm:text-base font-bold text-[#4F46E5] dark:text-indigo-300 tracking-wide break-all">
                    {rewrapResultKey}
                  </div>
                </div>

                <div className="flex justify-center gap-2">
                  <button type="button" onClick={() => copyRecoveryKey(rewrapResultKey)} className={secondaryBtnClass}>
                    Copiar
                  </button>
                </div>

                <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setIsRewrapModalOpen(false)} className={primaryBtnClass}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </SurfaceCard>
        </div>
      )}

      {/* Resolve Pending Rotation Modal (Stage E) */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Verificar nueva clave de recuperación" className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2">
              <Key size={18} strokeWidth={1.75} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Verificar Renovación de Clave Pendiente</h3>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Ingresá la nueva Clave de Recuperación que generaste para confirmar que coincide con el registro protegido en la nube y completar la activación.
            </p>

            {resolveError && (
              <p className="border-l-2 border-rose-500 pl-3 py-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                {resolveError}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="resolve-key-input" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Nueva Clave de Recuperación
              </label>
              <textarea
                id="resolve-key-input"
                rows={3}
                value={resolveKeyInput}
                onChange={(e) => setResolveKeyInput(e.target.value)}
                placeholder="Ej: L8x9... (clave generada)"
                className="w-full rounded-xl border border-slate-200/80 bg-white p-3 font-mono text-xs text-slate-900 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100 resize-none"
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
                Confirmar y Completar
              </button>
            </div>
          </SurfaceCard>
        </div>
      )}

      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <SurfaceCard as="div" role="dialog" aria-modal="true" aria-label="Descargar archivo de recuperación" className="w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <Download size={18} strokeWidth={1.75} className="shrink-0 text-[#4F46E5] dark:text-indigo-400" aria-hidden="true" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Descargar archivo de recuperación</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Ingresá tu clave actual para generar el archivo.</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Este archivo contiene la clave para desbloquear tu cuenta en un dispositivo nuevo. Guardalo en un lugar seguro y privado.
            </p>
            <div>
              <textarea
                rows={3}
                value={downloadKeyInput}
                onChange={(e) => setDownloadKeyInput(e.target.value)}
                placeholder="Pegá tu Clave de Recuperación actual..."
                className="w-full rounded-xl border border-slate-200/80 bg-white p-3 font-mono text-xs text-slate-900 focus:border-[#4F46E5] focus:outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-100"
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
                  if (!localEnvelope || !storageUserId) {
                    setDownloadError('No hay una clave local válida en este dispositivo.');
                    return;
                  }
                  try {
                    // Validar la clave haciendo un unwrap test
                    const rawRecovery = await parseRecoveryKey(downloadKeyInput.trim());
                    const salt = base64ToBytes(localEnvelope.kdf.salt);
                    const kek = await deriveKekFromRecoveryKey(rawRecovery, salt);
                    try {
                      await unwrapMdekWithKek(localEnvelope.wrappedMdek, kek, localEnvelope.aad);
                    } finally {
                      rawRecovery.fill(0);
                    }
                    // Si llega acá, la clave es válida. Generar el archivo.
                    const content = `CELESTIAN LIFEOS — ARCHIVO DE RECUPERACIÓN\nGenerado: ${new Date().toLocaleString('es-UY')}\n\n` +
                      `CLAVE DE RECUPERACIÓN:\n${downloadKeyInput.trim()}\n\n` +
                      `WRAPPED KEY ENVELOPE (No modificar):\n${JSON.stringify(localEnvelope, null, 2)}\n\n` +
                      `AVISO DE SEGURIDAD:\n` +
                      `- Cualquier persona que tenga este archivo y acceso a tu cuenta de Google puede descifrar tus datos.\n` +
                      `- Guardalo en un pendrive cifrado o gestor de contraseñas.\n` +
                      `- Si perdés este archivo y tu clave, tus datos cifrados no se podrán recuperar.\n`;
                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `celestian-recovery-key-${new Date().toISOString().slice(0, 10)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Archivo descargado. Guardalo en un lugar seguro.');
                    setIsDownloadModalOpen(false);
                  } catch {
                    setDownloadError('La clave ingresada no es correcta o no coincide con este dispositivo.');
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
                      Esta acción es permanente y no se puede deshacer. Se eliminarán de Firestore todos los módulos, las revisiones y las claves asociadas a tu cuenta de Google. Después cerraremos tu sesión.
                    </p>
                  </div>
                </div>
                <ul className="list-inside list-disc space-y-1 border-l-2 border-rose-500/40 pl-3 py-1 text-xs text-slate-600 dark:text-slate-400">
                  <li>Módulos sincronizados y su historial de revisiones.</li>
                  <li>Envoltura de claves de cifrado de extremo a extremo.</li>
                  <li>Metadatos de sincronización de esta cuenta.</li>
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
