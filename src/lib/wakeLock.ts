export type WakeLockStatus = 'idle' | 'active' | 'unsupported' | 'denied';

export interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
}

export interface WakeLockDocumentLike {
  visibilityState?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export interface WakeLockManagerOptions {
  navigatorObj?: WakeLockNavigatorLike | null;
  documentObj?: WakeLockDocumentLike | null;
  onStatusChange?: (status: WakeLockStatus) => void;
}

/**
 * Controlador puro y seguro para Screen Wake Lock API.
 * - Previene el apagado de pantalla durante sesiones o descansos activos.
 * - Re-adquiere automáticamente el bloqueo cuando la pestaña vuelve a ser visible.
 * - Si el navegador o el ahorro de batería lo rechazan, degrada con limpieza sin lanzar errores.
 */
export function createWakeLockManager(options: WakeLockManagerOptions = {}) {
  const nav = options.navigatorObj ?? (typeof navigator !== 'undefined' ? (navigator as unknown as WakeLockNavigatorLike) : null);
  const doc = options.documentObj ?? (typeof document !== 'undefined' ? (document as unknown as WakeLockDocumentLike) : null);

  let desired = false;
  let disposed = false;
  let sentinel: WakeLockSentinelLike | null = null;
  let requesting = false;
  let status: WakeLockStatus = 'idle';

  const setStatus = (next: WakeLockStatus) => {
    if (status === next) return;
    status = next;
    options.onStatusChange?.(next);
  };

  const isSupported = Boolean(nav && nav.wakeLock && typeof nav.wakeLock.request === 'function');

  const handleSentinelRelease = () => {
    sentinel = null;
    if (!disposed && desired && doc?.visibilityState === 'visible') {
      setStatus('idle');
    } else if (!desired) {
      setStatus('idle');
    }
  };

  const acquire = async (): Promise<WakeLockStatus> => {
    if (disposed || !desired) {
      setStatus('idle');
      return status;
    }
    if (!isSupported) {
      setStatus('unsupported');
      return status;
    }
    if (doc && doc.visibilityState && doc.visibilityState !== 'visible') {
      return status;
    }
    if (sentinel && !sentinel.released) {
      setStatus('active');
      return status;
    }
    if (requesting) return status;

    requesting = true;
    try {
      const nextSentinel = await nav!.wakeLock!.request('screen');
      if (disposed || !desired) {
        await nextSentinel.release().catch(() => undefined);
        setStatus('idle');
        return status;
      }
      sentinel = nextSentinel;
      sentinel.addEventListener?.('release', handleSentinelRelease);
      setStatus('active');
      return status;
    } catch {
      sentinel = null;
      setStatus('denied');
      return status;
    } finally {
      requesting = false;
    }
  };

  const release = async (): Promise<void> => {
    const current = sentinel;
    sentinel = null;
    if (current) {
      current.removeEventListener?.('release', handleSentinelRelease);
      await current.release().catch(() => undefined);
    }
    if (!disposed) {
      setStatus('idle');
    }
  };

  const handleVisibilityChange = () => {
    if (disposed || !desired) return;
    if (!doc?.visibilityState || doc.visibilityState === 'visible') {
      void acquire();
    }
  };

  let listenersAttached = false;
  const attachListeners = () => {
    if (listenersAttached || !doc?.addEventListener) return;
    doc.addEventListener('visibilitychange', handleVisibilityChange);
    listenersAttached = true;
  };

  const detachListeners = () => {
    if (!listenersAttached || !doc?.removeEventListener) return;
    doc.removeEventListener('visibilitychange', handleVisibilityChange);
    listenersAttached = false;
  };

  return {
    getStatus: () => status,
    isSupported: () => isSupported,
    setActive: async (active: boolean): Promise<WakeLockStatus> => {
      desired = active;
      if (active) {
        attachListeners();
        return acquire();
      }
      detachListeners();
      await release();
      return status;
    },
    dispose: async (): Promise<void> => {
      disposed = true;
      desired = false;
      detachListeners();
      await release();
    },
  };
}
