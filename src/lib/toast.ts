export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export interface LifeOSToast {
  id: string;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export const LIFEOS_TOAST_EVENT = 'lifeos:toast';

export function showToast(message: string, tone: ToastTone = 'success', options?: ToastOptions): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LifeOSToast>(LIFEOS_TOAST_EVENT, {
    detail: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message,
      tone,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
      durationMs: options?.durationMs,
    },
  }));
}
