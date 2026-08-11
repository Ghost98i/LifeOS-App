export type ToastTone = 'success' | 'error' | 'info';

export interface LifeOSToast {
  id: string;
  message: string;
  tone: ToastTone;
}

export const LIFEOS_TOAST_EVENT = 'lifeos:toast';

export function showToast(message: string, tone: ToastTone = 'success'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LifeOSToast>(LIFEOS_TOAST_EVENT, {
    detail: { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, tone },
  }));
}
