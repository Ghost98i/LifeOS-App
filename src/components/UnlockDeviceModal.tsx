import React, { useState } from 'react';
import { AppIcon } from './AppIcon';
import { unlockDeviceWithRecoveryKey } from '../lib/cryptoMigration';
import { loadWrappedKeyEnvelope, type WrappedKeyEnvelope } from '../lib/cryptoCore';

export interface UnlockDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  envelopeOverride?: WrappedKeyEnvelope | null;
  onUnlocked?: (envelope: WrappedKeyEnvelope) => void;
  showToast?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export const UnlockDeviceModal: React.FC<UnlockDeviceModalProps> = ({
  isOpen,
  onClose,
  userId,
  envelopeOverride,
  onUnlocked,
  showToast,
}) => {
  const [unlockKeyInput, setUnlockKeyInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  if (!isOpen) return null;

  const handleUnlockDevice = async () => {
    if (!userId || !unlockKeyInput.trim() || isUnlocking) return;
    setUnlockError(null);
    setIsUnlocking(true);
    try {
      const envelope = envelopeOverride !== undefined ? envelopeOverride : loadWrappedKeyEnvelope(userId);
      const res = await unlockDeviceWithRecoveryKey(
        userId,
        unlockKeyInput.trim(),
        envelope || undefined
      );

      if (showToast) {
        showToast('Dispositivo desbloqueado correctamente.', 'success');
      }
      setIsUnlocking(false);
      setUnlockKeyInput('');
      onClose();
      if (onUnlocked) {
        onUnlocked(res.envelope);
      }
    } catch (err: any) {
      setIsUnlocking(false);
      setUnlockError(err?.message || 'Clave de recuperación incorrecta. Comprobá los caracteres.');
    }
  };

  const handleClose = () => {
    if (isUnlocking) return;
    setUnlockError(null);
    setUnlockKeyInput('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Desbloquear este navegador"
        className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
      >
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
            onChange={(e) => {
              setUnlockKeyInput(e.target.value);
              if (unlockError) setUnlockError(null);
            }}
            placeholder="Pegá tu clave de recuperación..."
            className="w-full p-3 font-mono text-xs rounded-xl bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--blue)] outline-hidden text-[var(--text)]"
            disabled={isUnlocking}
            autoFocus
          />
          {unlockError && (
            <p className="mt-1.5 text-xs text-rose-500 font-semibold">{unlockError}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleClose}
            disabled={isUnlocking}
            className="px-4 py-2 border border-[var(--border)] text-xs font-semibold rounded-xl text-[var(--text-soft)] hover:text-[var(--text)] cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!unlockKeyInput.trim() || isUnlocking}
            onClick={handleUnlockDevice}
            className="px-5 py-2 bg-[var(--blue)] hover:bg-[var(--blue-hover)] text-white text-xs font-bold rounded-xl cursor-pointer shadow-2xs disabled:opacity-50"
          >
            {isUnlocking ? 'Desbloqueando...' : 'Desbloquear'}
          </button>
        </div>
      </div>
    </div>
  );
};
