import React, { useState, useEffect } from 'react';
import type { LifeOSState } from '../types';
import { AppIcon } from './AppIcon';
import { showToast } from '../lib/toast';
import { SYNC_MODULES } from '../lib/syncModel';
import {
  provisionZeroKnowledgeKeys,
  unlockMdekWithRecoveryKey,
  loadWrappedKeyEnvelope,
  cryptoSession,
  parseRecoveryKey,
  type WrappedKeyEnvelope,
} from '../lib/cryptoCore';
import {
  executeE2EEMigration,
  executeKeyRotation,
  fetchAccountCapability,
  fetchCloudKeyEnvelope,
  setCloudKeyEnvelope,
  unlockDeviceWithRecoveryKey,
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

interface PrivacySecuritySectionProps {
  state: LifeOSState;
  storageUserId: string | null;
  cloudConnected: boolean;
  onForceSync?: () => void;
}

export const PrivacySecuritySection: React.FC<PrivacySecuritySectionProps> = ({
  state,
  storageUserId,
  cloudConnected,
  onForceSync,
}) => {
  const [capability, setCapability] = useState<AccountSyncCapability | null>(null);
  const [isLoadingCap, setIsLoadingCap] = useState(false);
  const [cloudEnvelopeAvailable, setCloudEnvelopeAvailable] = useState<boolean>(false);
  const [localEnvelope, setLocalEnvelope] = useState<WrappedKeyEnvelope | null>(() =>
    loadWrappedKeyEnvelope(storageUserId)
  );
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
  const [unlockKeyInput, setUnlockKeyInput] = useState<string>('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Key Replacement Modal (Rewrap)
  const [isRewrapModalOpen, setIsRewrapModalOpen] = useState<boolean>(false);
  const [currentKeyForRewrap, setCurrentKeyForRewrap] = useState<string>('');
  const [rewrapResultKey, setRewrapResultKey] = useState<string | null>(null);
  const [rewrapError, setRewrapError] = useState<string | null>(null);

  // Plaintext Inventory & Purge State (Stage E)
  const [plaintextInventory, setPlaintextInventory] = useState<CloudPlaintextInventory | null>(null);
  const [isPurging, setIsPurging] = useState<boolean>(false);

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
    return () => {
      active = false;
    };
  }, [storageUserId, cloudConnected]);

  // Status computation
  const encryptionState = capability?.encryptionState || (localEnvelope ? 'encrypted' : 'plaintext');
  const isEncrypted = encryptionState === 'encrypted';
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
  const handleCopyKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    showToast('Clave de recuperación copiada al portapapeles.');
  };

  // Download Recovery Key as text file with explicit safety warning
  const handleDownloadKeyFile = () => {
    if (!generatedKey) return;
    const blob = new Blob([
      `LIFEOS — CLAVE DE RECUPERACIÓN DE SEGURIDAD\n` +
      `Generada: ${new Date().toLocaleString('es-UY')}\n\n` +
      `Tu Clave de Recuperación:\n` +
      `${generatedKey}\n\n` +
      `AVISO DE SEGURIDAD:\n` +
      `- Este archivo contiene la clave de recuperación completa de 256 bits.\n` +
      `- Cualquier persona que tenga acceso a este archivo y a tu cuenta de Google puede descifrar tus datos personales.\n` +
      `- Guardá este archivo en un pendrive cifrado, gestor de contraseñas o imprimilo en papel y borrá el archivo digital.\n` +
      `- Ni Google, ni los servidores de LifeOS, ni terceros pueden restaurarla por ti.\n`
    ], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifeos-recovery-key-${new Date().toISOString().slice(0, 10)}.txt`;
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
      const unlockedMdek = await unlockMdekWithRecoveryKey(verifyKeyInput, provisionedEnvelope);

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

  // Device Unlock Flow (handles both local envelope and clean second-device cloud recovery)
  const handleUnlockDevice = async () => {
    if (!storageUserId) return;
    setUnlockError(null);
    try {
      const res = await unlockDeviceWithRecoveryKey(
        storageUserId,
        unlockKeyInput,
        localEnvelope || undefined
      );

      setLocalEnvelope(res.envelope);
      showToast('Dispositivo desbloqueado correctamente.');
      setIsUnlockModalOpen(false);
      setUnlockKeyInput('');
      if (onForceSync) onForceSync();
    } catch (err: any) {
      setUnlockError(err?.message || 'Clave de recuperación incorrecta. Comprobá los caracteres.');
    }
  };

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

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <AppIcon name="lock" className="h-4 w-4 text-[var(--blue)]" />
            <h2 className="text-sm font-bold text-[var(--text)]">Privacidad y Protección de Extremo a Extremo</h2>
          </div>
          <p className="text-xs text-[var(--text-soft)]">
            Cifrado del lado del cliente. Tus datos se protegen en tu dispositivo antes de viajar a la nube.
          </p>
        </div>

        {/* State Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isEncrypted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
              Protección activada
            </span>
          ) : isMixed ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Activación en curso
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[var(--surface-muted)] text-[var(--text-faint)] border border-[var(--border)]">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Protección no activada
            </span>
          )}
        </div>
      </div>

      {/* Main Status Panel */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 space-y-3">
        {/* Pending Rotation Fail-Safe Banner (Stage E) */}
        {pendingRotation && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 mb-2">
            <div className="flex items-center gap-2 font-bold text-xs text-amber-700 dark:text-amber-400">
              <AppIcon name="alertTriangle" className="h-4 w-4 shrink-0" />
              <span>La renovación de tu clave quedó pendiente de verificación</span>
            </div>
            <p className="text-[11px] text-[var(--text-soft)] leading-relaxed">
              El cambio de clave se registró en la nube pero no se pudo confirmar la respuesta localmente. Para completar el proceso sin riesgos, ingresá la nueva clave de recuperación que guardaste.
            </p>
            <button
              type="button"
              onClick={() => {
                setResolveError(null);
                setResolveKeyInput('');
                setIsResolveModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
            >
              <AppIcon name="key" className="h-3.5 w-3.5" />
              <span>Verificar nueva clave</span>
            </button>
          </div>
        )}

        {isSecondDeviceNeedingRecovery && (
          <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-2 mb-2">
            <div className="flex items-center gap-2 font-bold text-xs text-[var(--blue)]">
              <AppIcon name="lock" className="h-4 w-4" />
              <span>Nuevo dispositivo detectado: Cuenta protegida con cifrado</span>
            </div>
            <p className="text-[11px] text-[var(--text-soft)] leading-relaxed">
              Tus datos en la nube están cifrados. Para habilitar la sincronización en este navegador, ingresá tu Clave de Recuperación. Se descargará el key envelope asegurado y se activará la sesión.
            </p>
            <button
              type="button"
              onClick={() => setIsUnlockModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
            >
              <AppIcon name="unlock" className="h-3.5 w-3.5" />
              <span>Ingresar Clave de Recuperación y Desbloquear</span>
            </button>
          </div>
        )}

        {isEncrypted ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs font-bold text-[var(--text)]">
                  Tus datos en la nube están completamente cifrados
                </p>
                <p className="text-[11px] text-[var(--text-soft)] max-w-xl">
                  Los 15 módulos de LifeOS están protegidos con AES-256-GCM. Solo tus dispositivos autorizados con la clave de recuperación pueden descifrarlos.
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                  {capability?.encryptedModules?.length || 15} de 15 módulos asegurados
                </span>
              </div>
            </div>

            {/* Session status */}
            <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className={`h-2 w-2 rounded-full ${isSessionUnlocked ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-[var(--text-soft)]">
                  Sesión en este navegador:{' '}
                  <strong className="text-[var(--text)]">
                    {isSessionUnlocked ? 'Desbloqueada y operativa' : 'Bloqueada'}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!isSessionUnlocked && (
                  <button
                    type="button"
                    onClick={() => setIsUnlockModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
                  >
                    <AppIcon name="unlock" className="h-3.5 w-3.5" />
                    <span>Desbloquear con Clave</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsRewrapModalOpen(true);
                    setRewrapResultKey(null);
                    setCurrentKeyForRewrap('');
                    setRewrapError(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                >
                  <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
                  <span>Renovar Clave de Recuperación</span>
                </button>
              </div>
            </div>

            {/* Stage E: Legacy Plaintext Warning & Purge Control */}
            {plaintextInventory && !plaintextInventory.isClean && (
              <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                    <AppIcon name="alertTriangle" className="h-3.5 w-3.5 shrink-0" />
                    <span>Copia histórica sin cifrar pendiente de limpieza</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-soft)]">
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
                  className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl cursor-pointer shadow-2xs transition-colors"
                >
                  <AppIcon name="trash" className="h-3.5 w-3.5" />
                  <span>{isPurging ? 'Purgando...' : 'Purgar Copia Histórica'}</span>
                </button>
              </div>
            )}
          </div>
        ) : isMixed ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Migración de privacidad incompleta o interrumpida
              </p>
              <p className="text-[11px] text-[var(--text-soft)] max-w-xl">
                Se aseguraron {capability?.encryptedModules?.length || 0} de 15 módulos. Podés reanudar el proceso de forma segura sin duplicar datos ni perder revisiones.
              </p>
            </div>
            <div className="pt-2 border-t border-[var(--border)]">
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
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl cursor-pointer shadow-2xs"
              >
                <AppIcon name="rotateCcw" className="h-3.5 w-3.5" />
                <span>Reanudar Migración a Cifrado Completo</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <p className="text-xs font-bold text-[var(--text)]">
                Protegé tus finanzas, notas y tareas con tu propia clave
              </p>
              <p className="text-[11px] text-[var(--text-soft)] leading-relaxed">
                Al activar la protección de extremo a extremo, tus datos se cifran en tu navegador antes de enviarse a la nube. Nadie más, ni siquiera los administradores de la base de datos, puede leer tu contenido personal.
              </p>
            </div>
            <button
              type="button"
              disabled={isLoadingCap || !cloudConnected}
              onClick={() => setWizardStep(1)}
              title={!cloudConnected ? 'Conectá tu cuenta de Google primero' : 'Activar protección de extremo a extremo'}
              className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all shadow-2xs ${
                cloudConnected
                  ? 'bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white cursor-pointer'
                  : 'bg-[var(--surface-muted)] text-[var(--text-faint)] cursor-not-allowed border border-[var(--border)]'
              }`}
            >
              <AppIcon name="lock" className="h-4 w-4" />
              <span>Activar Privacidad</span>
            </button>
          </div>
        )}
      </div>

      {/* Security Scope Guarantee Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-[var(--text)]">
            <span className="text-emerald-500">✓</span>
            <span>Lo que protege activamente</span>
          </div>
          <ul className="text-[11px] text-[var(--text-soft)] space-y-1 list-disc list-inside">
            <li>Finanzas (cuentas, transacciones, compromisos).</li>
            <li>Notas, ideas, tareas, proyectos y contexto personal.</li>
            <li>Agenda, rutinas de gimnasio y registros de estudio.</li>
            <li>Payloads de sincronización en tránsito y en reposo en la nube.</li>
          </ul>
        </div>
        <div className="p-3.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-[var(--text)]">
            <span className="text-[var(--blue)]">ℹ</span>
            <span>Lo que debés saber con transparencia</span>
          </div>
          <ul className="text-[11px] text-[var(--text-soft)] space-y-1 list-disc list-inside">
            <li>La clave de recuperación no se guarda en ningún servidor.</li>
            <li>Si perdés la clave, nadie puede recuperar tus datos en un dispositivo nuevo.</li>
            <li>Metadatos no sensibles (versión de sync, revisiones, timestamps) permanecen legibles para resolver conflictos.</li>
          </ul>
        </div>
      </div>

      {/* Wizard Modal: 4 Steps */}
      {wizardStep > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-[var(--blue)]">
                    <AppIcon name="shield" className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-[var(--text)]">
                    {wizardStep === 1 && 'Paso 1 de 4: ¿Cómo funciona la protección?'}
                    {wizardStep === 2 && 'Paso 2 de 4: Guardá tu Clave de Recuperación'}
                    {wizardStep === 3 && 'Paso 3 de 4: Verificá tu Clave de Recuperación'}
                    {wizardStep === 4 && 'Paso 4 de 4: Migración reanudable por módulos'}
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-soft)]">
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
                  className="text-[var(--text-faint)] hover:text-[var(--text)] p-1 rounded-lg text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Step 1: Explanation */}
            {wizardStep === 1 && (
              <div className="space-y-4 text-xs text-[var(--text-soft)]">
                <p>
                  Vas a activar el cifrado de extremo a extremo para tu cuenta de LifeOS. A partir de este momento, tus datos sensibles se cifrarán en este dispositivo con una clave maestra única (MDEK).
                </p>
                <div className="bg-[var(--surface-muted)] rounded-xl p-4 space-y-2 border border-[var(--border)] text-[11px]">
                  <p className="font-bold text-[var(--text)]">¿Qué significa en la práctica?</p>
                  <ul className="space-y-1.5 list-disc list-inside">
                    <li>La nube de Google/Firebase solo almacenará texto cifrado ilegible.</li>
                    <li>Generaremos una <strong>Clave de Recuperación de 256 bits</strong> en tu navegador.</li>
                    <li>
                      <strong>Importante:</strong> LifeOS no tiene un botón de “Olvidé mi contraseña”. Si cambiás de dispositivo o borrás los datos del navegador sin esta clave, no podremos recuperar tus datos.
                    </li>
                  </ul>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setWizardStep(0)}
                    className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleStartActivation}
                    className="px-4 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
                  >
                    Entendido, Generar mi Clave
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Show Key & Backup */}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <p className="text-xs text-[var(--text-soft)]">
                  Esta es tu Clave de Recuperación. Guardala en un gestor de contraseñas seguro o imprimila en papel.
                </p>

                {/* Key Display Card */}
                <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--blue)]/40 text-center space-y-2 select-all">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">
                    Clave de Recuperación Única (Base58Check)
                  </span>
                  <div className="font-mono text-sm sm:text-base font-extrabold text-[var(--blue)] tracking-wide break-all p-2 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)]">
                    {generatedKey}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-bold rounded-xl text-[var(--text)] cursor-pointer shadow-2xs"
                  >
                    <span>Copiar al Portapapeles</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadKeyFile}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-bold rounded-xl text-[var(--text)] cursor-pointer shadow-2xs"
                  >
                    <span>Descargar archivo de texto (.txt)</span>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
                  ⚠️ En el siguiente paso te pediremos que ingreses esta clave para certificar que la guardaste.
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setWizardStep(3)}
                    className="px-5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
                  >
                    Ya la guardé, Continuar a Verificación
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Verification */}
            {wizardStep === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-[var(--text-soft)]">
                  Pegá o escribí la clave de recuperación que acabás de guardar para confirmar:
                </p>

                <div>
                  <textarea
                    rows={3}
                    value={verifyKeyInput}
                    onChange={(e) => setVerifyKeyInput(e.target.value)}
                    placeholder="Pegá tu clave de recuperación aquí..."
                    className="w-full p-3 font-mono text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                  />
                  {verifyError && (
                    <p className="mt-1.5 text-xs text-rose-500 font-semibold">{verifyError}</p>
                  )}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                  >
                    Volver a ver la clave
                  </button>
                  <button
                    type="button"
                    disabled={!verifyKeyInput.trim()}
                    onClick={handleVerifyKey}
                    className="px-5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    Verificar y Comenzar Migración
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Migration Progress */}
            {wizardStep === 4 && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-[var(--text)]">
                      {isMigrating
                        ? `Cifrando módulo: ${migrationProgress?.currentModule || 'Preparando...'}`
                        : '¡Migración completada!'}
                    </span>
                    <span className="font-mono text-[var(--blue)]">
                      {migrationProgress
                        ? `${migrationProgress.currentIndex} / ${migrationProgress.totalModules}`
                        : '0 / 15'}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2.5 bg-[var(--surface-muted)] rounded-full overflow-hidden border border-[var(--border)]">
                    <div
                      className="h-full bg-[var(--blue)] transition-all duration-300"
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

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[10px] font-mono">
                  {SYNC_MODULES.map((mod) => {
                    const isDone = migrationProgress?.completedModules.includes(mod);
                    const isCurrent = migrationProgress?.currentModule === mod && isMigrating;
                    return (
                      <div
                        key={mod}
                        className={`p-1.5 rounded-lg border text-center truncate ${
                          isDone
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold'
                            : isCurrent
                            ? 'bg-blue-500/10 border-blue-500/30 text-[var(--blue)] font-bold animate-pulse'
                            : 'bg-[var(--surface-muted)] border-[var(--border)] text-[var(--text-faint)]'
                        }`}
                      >
                        {mod}
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-[var(--text-soft)] text-center">
                  {isMigrating
                    ? 'No cierres esta pestaña mientras se actualizan tus módulos de sincronización.'
                    : 'Todos tus datos fueron migrados de forma segura. La nube ahora solo contiene ciphertext.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Desbloqueo de Dispositivo */}
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-[var(--blue)]">
                <AppIcon name="unlock" className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Desbloquear Dispositivo</h3>
                <p className="text-xs text-[var(--text-soft)]">Ingresá tu Clave de Recuperación</p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-soft)]">
              Para descifrar los datos de tu cuenta en este dispositivo, ingresá la Clave de Recuperación que guardaste al activar la protección:
            </p>

            <div>
              <textarea
                rows={3}
                value={unlockKeyInput}
                onChange={(e) => setUnlockKeyInput(e.target.value)}
                placeholder="Pegá tu clave de recuperación..."
                className="w-full p-3 font-mono text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
              />
              {unlockError && (
                <p className="mt-1.5 text-xs text-rose-500 font-semibold">{unlockError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIsUnlockModalOpen(false)}
                className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!unlockKeyInput.trim()}
                onClick={handleUnlockDevice}
                className="px-5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs disabled:opacity-50"
              >
                Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Renovar Clave de Recuperación (Rewrap) */}
      {isRewrapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500">
                <AppIcon name="rotateCcw" className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text)]">Renovar Clave de Recuperación</h3>
                <p className="text-xs text-[var(--text-soft)]">Actualiza la credencial para recuperar esta cuenta en nuevos dispositivos</p>
              </div>
            </div>

            {!rewrapResultKey ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs text-[var(--text-soft)] leading-relaxed">
                    Si necesitás cambiar tu Clave de Recuperación (por rotación periódica o si perdiste tu copia física anterior), podés generar una nueva. Se cambiará la credencial requerida para desbloquear esta cuenta en nuevos dispositivos sin alterar los módulos cifrados en la nube.
                  </p>
                  <div className="p-2.5 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)] text-[11px] text-[var(--text-faint)] leading-relaxed">
                    <strong>Nota técnica:</strong> Esta operación re-envuelve la clave de cifrado (MDEK) con una nueva clave en el servidor. El envelope cloud solo podrá abrirse con la nueva clave. Si sospechás que un tercero obtuvo simultáneamente tu clave física previa y una copia de almacenamiento de tu dispositivo, una revocación total requeriría el re-cifrado completo de los datos.
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider block mb-1">
                    Ingresá tu Clave de Recuperación actual:
                  </label>
                  <textarea
                    rows={2}
                    value={currentKeyForRewrap}
                    onChange={(e) => setCurrentKeyForRewrap(e.target.value)}
                    placeholder="Clave actual..."
                    className="w-full p-2.5 font-mono text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
                  />
                  {rewrapError && (
                    <p className="mt-1.5 text-xs text-rose-500 font-semibold">{rewrapError}</p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setIsRewrapModalOpen(false)}
                    className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!currentKeyForRewrap.trim()}
                    onClick={handleRewrapKey}
                    className="px-5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    Generar Nueva Clave
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs">
                    ✅ Clave de recuperación actualizada. Se cambió la credencial requerida para recuperar esta cuenta en nuevos dispositivos.
                  </div>
                  <p className="text-[11px] text-[var(--text-soft)] px-1">
                    El keyEnvelope cloud actual sólo puede abrirse con la nueva Recovery Key. Guardala en un lugar seguro.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--blue)]/40 text-center space-y-2 select-all">
                  <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">
                    Nueva Clave de Recuperación
                  </span>
                  <div className="font-mono text-sm sm:text-base font-extrabold text-[var(--blue)] tracking-wide break-all p-2 rounded-lg bg-[var(--surface-muted)] border border-[var(--border)]">
                    {rewrapResultKey}
                  </div>
                </div>

                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(rewrapResultKey);
                      showToast('Nueva clave copiada.');
                    }}
                    className="px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-bold rounded-xl text-[var(--text)] cursor-pointer shadow-2xs"
                  >
                    Copiar
                  </button>
                </div>

                <div className="flex justify-end pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setIsRewrapModalOpen(false)}
                    className="px-5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resolve Pending Rotation Modal (Stage E) */}
      {isResolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <AppIcon name="key" className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-bold text-[var(--text)]">Verificar Renovación de Clave Pendiente</h3>
            </div>

            <p className="text-xs text-[var(--text-soft)] leading-relaxed">
              Ingresá la nueva Clave de Recuperación que generaste para confirmar que coincide con el registro protegido en la nube y completar la activación.
            </p>

            {resolveError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
                {resolveError}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="resolve-key-input" className="block text-[11px] font-bold text-[var(--text)]">
                Nueva Clave de Recuperación
              </label>
              <textarea
                id="resolve-key-input"
                rows={3}
                value={resolveKeyInput}
                onChange={(e) => setResolveKeyInput(e.target.value)}
                placeholder="Ej: L8x9... (clave generada)"
                className="w-full p-3 font-mono text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] focus:outline-hidden focus:border-[var(--blue)] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setIsResolveModalOpen(false)}
                className="px-4 py-2 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!resolveKeyInput.trim()}
                onClick={handleResolvePendingRotation}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl cursor-pointer shadow-2xs disabled:opacity-50"
              >
                Confirmar y Completar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
