import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Lock,
  LockOpen,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  fetchCloudKeyEnvelope,
  setVaultPasswordForAccount,
  unlockDeviceWithRecoveryKey,
  unlockDeviceWithVaultPassword,
} from '../lib/cryptoMigration';
import {
  extractRecoveryKeyFromText,
  hasVaultPassword,
  loadWrappedKeyEnvelope,
  type WrappedKeyEnvelope,
} from '../lib/cryptoCore';
import { triggerHaptic } from '../lib/haptics';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { CompletionCheck } from './ui/CompletionCheck';

const CLEAN_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70';

function blurOnMouseClick(event: React.MouseEvent<HTMLElement>) {
  if (event.detail > 0) {
    event.currentTarget.blur();
  }
}

export interface UnlockDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail?: string | null;
  envelopeOverride?: WrappedKeyEnvelope | null;
  onUnlocked?: (envelope: WrappedKeyEnvelope) => void;
  onRequestDisableLock?: () => void;
  showToast?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const UnlockDeviceModal: React.FC<UnlockDeviceModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  envelopeOverride,
  onUnlocked,
  onRequestDisableLock,
  showToast,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [resolvedEnvelope, setResolvedEnvelope] = useState<WrappedKeyEnvelope | null>(() =>
    envelopeOverride !== undefined ? envelopeOverride : loadWrappedKeyEnvelope(userId)
  );
  const [isLoadingEnvelope, setIsLoadingEnvelope] = useState(false);
  const [mode, setMode] = useState<'password' | 'recovery'>(() => {
    const initialEnv = envelopeOverride !== undefined ? envelopeOverride : loadWrappedKeyEnvelope(userId);
    return hasVaultPassword(initialEnv) ? 'password' : 'recovery';
  });

  // Unlock inputs
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Legacy post-unlock upgrade step
  const [legacyUnlockedEnvelope, setLegacyUnlockedEnvelope] = useState<WrappedKeyEnvelope | null>(null);
  const [legacyRecoverySecret, setLegacyRecoverySecret] = useState<string>('');
  const [showAddPasswordForm, setShowAddPasswordForm] = useState(false);
  const [newVaultPassword, setNewVaultPassword] = useState('');
  const [confirmVaultPassword, setConfirmVaultPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setUnlockError(null);
    setUpgradeError(null);
    setLoadedFileName(null);
    setLegacyUnlockedEnvelope(null);
    setLegacyRecoverySecret('');
    setShowAddPasswordForm(false);
    setNewVaultPassword('');
    setConfirmVaultPassword('');

    const localCandidate =
      envelopeOverride !== undefined ? envelopeOverride : loadWrappedKeyEnvelope(userId);
    if (localCandidate) {
      setResolvedEnvelope(localCandidate);
      setMode(hasVaultPassword(localCandidate) ? 'password' : 'recovery');
      return;
    }
    if (!userId) return;

    setIsLoadingEnvelope(true);
    fetchCloudKeyEnvelope(userId)
      .then((cloudEnv) => {
        if (!active) return;
        setResolvedEnvelope(cloudEnv);
        setMode(hasVaultPassword(cloudEnv) ? 'password' : 'recovery');
      })
      .catch(() => {
        if (active) setMode('recovery');
      })
      .finally(() => {
        if (active) setIsLoadingEnvelope(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, userId, envelopeOverride]);

  const resetAndClose = () => {
    if (isUnlocking || isSavingPassword) return;
    setUnlockError(null);
    setUpgradeError(null);
    setPasswordInput('');
    setRecoveryInput('');
    setLoadedFileName(null);
    setLegacyUnlockedEnvelope(null);
    setLegacyRecoverySecret('');
    setShowAddPasswordForm(false);
    setNewVaultPassword('');
    setConfirmVaultPassword('');
    onClose();
  };

  useDialogFocus(isOpen, dialogRef, resetAndClose);

  if (!isOpen) return null;

  const accountHasPassword = hasVaultPassword(resolvedEnvelope);
  const legacyPwLongEnough = newVaultPassword.length >= 8;
  const legacyPwMatches = confirmVaultPassword.length > 0 && newVaultPassword === confirmVaultPassword;

  const handleUnlockWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !passwordInput || isUnlocking) return;
    setUnlockError(null);
    setIsUnlocking(true);
    try {
      const res = await unlockDeviceWithVaultPassword(
        userId,
        passwordInput,
        resolvedEnvelope || undefined
      );
      triggerHaptic('success');
      showToast?.('Datos desbloqueados en este dispositivo.', 'success');
      setPasswordInput('');
      setIsUnlocking(false);
      onClose();
      onUnlocked?.(res.envelope);
    } catch (err: any) {
      setIsUnlocking(false);
      triggerHaptic('warning');
      const rawMsg = typeof err?.message === 'string' ? err.message.trim() : '';
      const friendly = rawMsg
        ? rawMsg.includes('Tus datos locales')
          ? rawMsg
          : `${rawMsg} Tus datos locales siguen a salvo.`
        : 'Esa contraseña no coincide. Tus datos locales siguen a salvo; revisala o usá tu código de recuperación.';
      setUnlockError(friendly);
    }
  };

  const handleUnlockWithRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !recoveryInput.trim() || isUnlocking) return;
    setUnlockError(null);
    setIsUnlocking(true);
    try {
      const extracted = (await extractRecoveryKeyFromText(recoveryInput)) ?? recoveryInput.trim();
      const res = await unlockDeviceWithRecoveryKey(
        userId,
        extracted,
        resolvedEnvelope || undefined
      );

      setIsUnlocking(false);
      setRecoveryInput('');
      setLoadedFileName(null);
      triggerHaptic('success');
      onUnlocked?.(res.envelope);

      if (!hasVaultPassword(res.envelope)) {
        // Legacy account: offer effortless upgrade to vault password or disabling the extra lock
        setLegacyUnlockedEnvelope(res.envelope);
        setLegacyRecoverySecret(extracted);
        showToast?.('Datos desbloqueados correctamente.', 'success');
      } else {
        showToast?.('Datos desbloqueados en este dispositivo.', 'success');
        onClose();
      }
    } catch (err: any) {
      setIsUnlocking(false);
      triggerHaptic('warning');
      const rawMsg = typeof err?.message === 'string' ? err.message.trim() : '';
      setUnlockError(
        rawMsg
          ? `${rawMsg} Tus datos locales siguen a salvo.`
          : 'No pudimos validar ese código. Tus datos locales siguen a salvo; revisá que esté completo o cargá tu archivo.'
      );
    }
  };

  const handleLoadRecoveryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = typeof ev.target?.result === 'string' ? ev.target.result : '';
      const key = await extractRecoveryKeyFromText(text);
      if (key) {
        setRecoveryInput(key);
        setLoadedFileName(file.name);
        setUnlockError(null);
        triggerHaptic('light');
        showToast?.('Archivo de recuperación cargado. Tocá Desbloquear para continuar.', 'info');
      } else {
        setLoadedFileName(null);
        triggerHaptic('warning');
        setUnlockError('No encontramos un código válido dentro de ese archivo. Tus datos locales siguen a salvo.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleSaveLegacyVaultPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !legacyRecoverySecret || isSavingPassword) return;
    setUpgradeError(null);

    if (newVaultPassword.length < 8) {
      triggerHaptic('warning');
      setUpgradeError('Elegí una contraseña de al menos 8 caracteres.');
      return;
    }
    if (newVaultPassword !== confirmVaultPassword) {
      triggerHaptic('warning');
      setUpgradeError('Las contraseñas no coinciden.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await setVaultPasswordForAccount(userId, {
        newVaultPassword,
        currentRecoveryKey: legacyRecoverySecret,
      });
      setResolvedEnvelope(res.envelope);
      triggerHaptic('success');
      onUnlocked?.(res.envelope);
      showToast?.('Contraseña de bóveda guardada. En tu próximo dispositivo entrás en 1 toque.', 'success');
      setIsSavingPassword(false);
      resetAndClose();
    } catch (err: any) {
      setIsSavingPassword(false);
      triggerHaptic('warning');
      setUpgradeError(err?.message || 'No se pudo guardar la contraseña. Intentá de nuevo.');
    }
  };

  const fieldClass =
    'celestian-clean-field w-full min-h-[44px] rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-slate-100 dark:placeholder:text-slate-500';
  const primaryBtnClass =
    `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${CLEAN_FOCUS}`;
  const secondaryBtnClass =
    `inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/[0.1] dark:bg-transparent dark:text-slate-200 dark:hover:bg-white/[0.05] cursor-pointer disabled:opacity-45 ${CLEAN_FOCUS}`;
  const closeBtnClass =
    `inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-100 cursor-pointer disabled:opacity-40 ${CLEAN_FOCUS}`;

  return (
    <div
      className="celestian-modal-backdrop fixed inset-0 z-[95] flex items-end justify-center sm:items-center bg-black/60 p-0 sm:p-4 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resetAndClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-device-title"
        className="celestian-modal-panel w-full sm:max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-200/80 bg-white p-5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 shadow-2xl space-y-5 dark:border-white/[0.08] dark:bg-[#0D111A] outline-none"
      >
        <div
          aria-hidden="true"
          className="mx-auto -mt-1.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-slate-300/80 dark:bg-white/20 sm:hidden"
        />
        {/* Post-unlock friendly step for legacy recovery-key-only accounts */}
        {legacyUnlockedEnvelope ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Check size={19} strokeWidth={2.2} aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 id="unlock-device-title" className="text-base font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100 leading-snug">
                    Tus datos están desbloqueados
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Para entrar más fácil desde otros dispositivos, podés elegir una mejora rápida:
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  blurOnMouseClick(event);
                  resetAndClose();
                }}
                aria-label="Cerrar"
                title="Cerrar"
                className={closeBtnClass}
              >
                <X size={17} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {!showAddPasswordForm ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={(event) => {
                    blurOnMouseClick(event);
                    setShowAddPasswordForm(true);
                  }}
                  className={`w-full rounded-xl border border-[#4F46E5]/35 bg-[#4F46E5]/[0.04] p-3.5 text-left transition-colors hover:border-[#4F46E5]/60 hover:bg-[#4F46E5]/[0.08] dark:border-[#818CF8]/35 dark:bg-[#4F46E5]/10 dark:hover:bg-[#4F46E5]/16 cursor-pointer space-y-1 ${CLEAN_FOCUS}`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#4F46E5] dark:text-[#818CF8]">
                    <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span>Agregar una contraseña de bóveda</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    Guardala en el gestor de tu navegador para abrir en 1 toque, manteniendo tu código actual como respaldo.
                  </p>
                </button>

                {onRequestDisableLock && (
                  <button
                    type="button"
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      resetAndClose();
                      onRequestDisableLock();
                    }}
                    className={`w-full rounded-xl border border-slate-200/85 bg-white p-3.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/80 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:bg-white/[0.05] cursor-pointer space-y-1 ${CLEAN_FOCUS}`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <LockOpen size={16} strokeWidth={1.75} className="text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>Desactivar el candado adicional</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      Pasá a inicio de sesión en 1 clic con Google sin pedir claves al cambiar de dispositivo.
                    </p>
                  </button>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      resetAndClose();
                    }}
                    className={secondaryBtnClass}
                  >
                    Ahora no, ir a mis datos
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveLegacyVaultPassword} className="space-y-4">
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={userEmail || userId}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                />
                <div className="space-y-1.5">
                  <label htmlFor="legacy-new-vault-password" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Contraseña de bóveda
                  </label>
                  <div className="relative">
                    <input
                      id="legacy-new-vault-password"
                      name="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={newVaultPassword}
                      onChange={(e) => {
                        setNewVaultPassword(e.target.value);
                        if (upgradeError) setUpgradeError(null);
                      }}
                      placeholder="Elegí una contraseña fácil de guardar"
                      className={`${fieldClass} pr-12`}
                      disabled={isSavingPassword}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        blurOnMouseClick(event);
                        triggerHaptic('light');
                        setShowNewPassword((v) => !v);
                      }}
                      aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={showNewPassword}
                      className={`absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer ${CLEAN_FOCUS}`}
                    >
                      {showNewPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="legacy-confirm-vault-password" className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Repetí tu contraseña de bóveda
                  </label>
                  <input
                    id="legacy-confirm-vault-password"
                    name="confirm-password"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmVaultPassword}
                    onChange={(e) => {
                      setConfirmVaultPassword(e.target.value);
                      if (upgradeError) setUpgradeError(null);
                    }}
                    placeholder="Repetí la misma contraseña"
                    className={fieldClass}
                    disabled={isSavingPassword}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <CompletionCheck checked={legacyPwLongEnough} size="sm" />
                    <span className={legacyPwLongEnough ? 'text-slate-900 dark:text-slate-200 font-medium' : ''}>
                      Mínimo 8 caracteres
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CompletionCheck checked={legacyPwMatches} size="sm" />
                    <span className={legacyPwMatches ? 'text-slate-900 dark:text-slate-200 font-medium' : ''}>
                      Las contraseñas coinciden
                    </span>
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  No uses tu PIN bancario ni la contraseña de tu banco. Tu navegador podrá guardarla para abrir en 1 toque.
                </p>

                {upgradeError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-2.5 text-xs font-medium leading-relaxed text-rose-700 dark:text-rose-300"
                  >
                    <AlertTriangle size={15} strokeWidth={1.85} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{upgradeError}</span>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2 pt-3 border-t border-slate-100 sm:flex-row sm:justify-end dark:border-white/[0.06]">
                  <button
                    type="button"
                    disabled={isSavingPassword}
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      setShowAddPasswordForm(false);
                    }}
                    className={secondaryBtnClass}
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPassword || !legacyPwLongEnough || !confirmVaultPassword}
                    onClick={blurOnMouseClick}
                    className={primaryBtnClass}
                  >
                    {isSavingPassword ? 'Guardando…' : 'Guardar contraseña'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Standard Unlock Screen */
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-white/[0.06]">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-[#818CF8]">
                  <Lock size={19} strokeWidth={1.75} aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 id="unlock-device-title" className="text-base font-semibold tracking-[-0.015em] text-slate-900 dark:text-slate-100 leading-snug">
                    Desbloquear tus datos
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {mode === 'password'
                      ? 'Ingresá tu contraseña de bóveda para continuar en este dispositivo.'
                      : accountHasPassword
                      ? 'Ingresá tu código de recuperación o cargá el archivo de respaldo.'
                      : 'Ingresá tu código de recuperación para abrir tu cuenta en este dispositivo.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  blurOnMouseClick(event);
                  resetAndClose();
                }}
                disabled={isUnlocking}
                aria-label="Cerrar"
                title="Cerrar"
                className={closeBtnClass}
              >
                <X size={17} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {isLoadingEnvelope ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                Preparando desbloqueo…
              </div>
            ) : mode === 'password' ? (
              <form onSubmit={handleUnlockWithPassword} className="space-y-4">
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={userEmail || userId}
                  readOnly
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="unlock-vault-password"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Contraseña de bóveda
                  </label>
                  <div className="relative">
                    <input
                      id="unlock-vault-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        if (unlockError) setUnlockError(null);
                      }}
                      placeholder="Tu contraseña de bóveda"
                      className={`${fieldClass} pr-12`}
                      disabled={isUnlocking}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        blurOnMouseClick(event);
                        triggerHaptic('light');
                        setShowPassword((prev) => !prev);
                      }}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={showPassword}
                      className={`absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer ${CLEAN_FOCUS}`}
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                  {unlockError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-2.5 text-xs font-medium leading-relaxed text-rose-700 dark:text-rose-300"
                    >
                      <AlertTriangle size={15} strokeWidth={1.85} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{unlockError}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
                  <button
                    type="button"
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      triggerHaptic('light');
                      setMode('recovery');
                      setUnlockError(null);
                    }}
                    disabled={isUnlocking}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:text-[#4F46E5] dark:text-slate-400 dark:hover:text-[#818CF8] cursor-pointer ${CLEAN_FOCUS}`}
                  >
                    Usar clave o archivo de recuperación
                  </button>
                  <button
                    type="submit"
                    disabled={!passwordInput || isUnlocking}
                    onClick={blurOnMouseClick}
                    className={primaryBtnClass}
                  >
                    {isUnlocking ? 'Desbloqueando…' : 'Desbloquear'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleUnlockWithRecovery} className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="unlock-recovery-key"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Código de recuperación
                  </label>
                  <textarea
                    id="unlock-recovery-key"
                    rows={3}
                    value={recoveryInput}
                    onChange={(e) => {
                      setRecoveryInput(e.target.value);
                      if (loadedFileName) setLoadedFileName(null);
                      if (unlockError) setUnlockError(null);
                    }}
                    placeholder="Pegá tu código de recuperación acá…"
                    spellCheck={false}
                    autoComplete="off"
                    className={`${fieldClass} font-mono text-xs resize-none`}
                    disabled={isUnlocking}
                    autoFocus
                  />

                  {/* Discreet .txt recovery file upload zone */}
                  <button
                    type="button"
                    onClick={(event) => {
                      blurOnMouseClick(event);
                      fileInputRef.current?.click();
                    }}
                    disabled={isUnlocking}
                    className={`w-full min-h-11 rounded-xl border border-dashed border-slate-300/90 bg-slate-50/70 px-3.5 py-2.5 text-left transition-colors hover:border-[#4F46E5]/50 hover:bg-indigo-50/40 dark:border-white/[0.12] dark:bg-white/[0.02] dark:hover:border-[#818CF8]/45 dark:hover:bg-[#4F46E5]/[0.08] flex items-center justify-between gap-3 cursor-pointer disabled:opacity-45 ${CLEAN_FOCUS}`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4F46E5]/10 text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-[#818CF8]">
                        {loadedFileName ? <FileText size={15} strokeWidth={1.75} aria-hidden="true" /> : <Upload size={15} strokeWidth={1.75} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {loadedFileName ? `Cargado: ${loadedFileName}` : 'Cargar archivo de respaldo (.txt)'}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {loadedFileName ? 'Podés cambiarlo o tocar Desbloquear' : 'Detectamos tu clave automáticamente'}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-[#4F46E5] dark:text-[#818CF8]">
                      Elegir
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleLoadRecoveryFile}
                    className="sr-only"
                    aria-label="Cargar archivo de recuperación"
                  />

                  {unlockError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] px-3.5 py-2.5 text-xs font-medium leading-relaxed text-rose-700 dark:text-rose-300"
                    >
                      <AlertTriangle size={15} strokeWidth={1.85} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{unlockError}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
                  {accountHasPassword ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        blurOnMouseClick(event);
                        triggerHaptic('light');
                        setMode('password');
                        setUnlockError(null);
                      }}
                      disabled={isUnlocking}
                      className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-2 text-xs font-semibold text-[#4F46E5] transition-colors hover:underline dark:text-[#818CF8] cursor-pointer ${CLEAN_FOCUS}`}
                    >
                      Usar contraseña de bóveda
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => {
                        blurOnMouseClick(event);
                        resetAndClose();
                      }}
                      disabled={isUnlocking}
                      className={secondaryBtnClass}
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!recoveryInput.trim() || isUnlocking}
                    onClick={blurOnMouseClick}
                    className={primaryBtnClass}
                  >
                    {isUnlocking ? 'Desbloqueando…' : 'Desbloquear'}
                  </button>
                </div>
              </form>
            )}

            <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-600 dark:bg-white/[0.03] dark:text-slate-400">
              <ShieldCheck size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-[#818CF8]" aria-hidden="true" />
              <span>
                Una vez desbloqueado, este dispositivo queda recordado para que no tengas que volver a escribirlo.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
