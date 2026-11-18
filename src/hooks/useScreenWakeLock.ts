import { useEffect, useState } from 'react';
import { createWakeLockManager, type WakeLockStatus } from '../lib/wakeLock';

/**
 * Mantiene encendida la pantalla del dispositivo mientras `enabled` sea verdadero
 * (entrenamiento activo o temporizador de descanso en curso), con re-adquisición
 * automática al volver a primer plano y fallback silencioso si no está disponible.
 */
export function useScreenWakeLock(enabled: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('idle');

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    const manager = createWakeLockManager({
      onStatusChange: setStatus,
    });

    void manager.setActive(true);

    const handleFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void manager.setActive(true);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
      }
      void manager.dispose();
    };
  }, [enabled]);

  return status;
}
