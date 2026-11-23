import type { GymActiveTimer, GymSession } from '../types';
import { playSound } from './audio';

export const REST_NOTIFICATION_STORAGE_KEY = 'lifeos_gym_rest_notify_enabled';
const MAX_TRACKED_CYCLES = 24;

export interface RestTimerSnapshot {
  deltaMs: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  isOvertime: boolean;
  isPaused: boolean;
  formatted: string;
  progressRatio: number;
  progressPercent: number;
}

export interface RestNotificationContext {
  exerciseName?: string | null;
  sessionName?: string | null;
  kind?: 'set' | 'exercise';
  tag?: string;
}

const completedCycles = new Set<string>();

export function getRestTimerCycleKey(timer: GymActiveTimer): string {
  return `${timer.sessionId || ''}:${timer.exerciseId || ''}:${timer.setId || ''}:${timer.endsAt}`;
}

export function formatRestTimerClock(deltaMs: number): string {
  if (deltaMs > 0) {
    const totalSeconds = Math.ceil(deltaMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  const overSeconds = Math.floor(Math.abs(deltaMs) / 1000);
  if (overSeconds === 0) return '00:00';
  const minutes = Math.floor(overSeconds / 60);
  const seconds = overSeconds % 60;
  return `+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getRestTimerSnapshot(
  timer: GymActiveTimer | null | undefined,
  nowMs = Date.now()
): RestTimerSnapshot | null {
  if (!timer || !Number.isFinite(timer.endsAt)) return null;

  const isPaused = Boolean(timer.pausedAt);
  let deltaMs: number;
  if (isPaused) {
    if (typeof timer.remainingSecondsWhenPaused === 'number' && Number.isFinite(timer.remainingSecondsWhenPaused)) {
      deltaMs = timer.remainingSecondsWhenPaused * 1000;
    } else {
      deltaMs = timer.endsAt - (timer.pausedAt ?? nowMs);
    }
  } else {
    deltaMs = timer.endsAt - nowMs;
  }

  const isOvertime = deltaMs <= 0;
  const remainingSeconds = isOvertime ? 0 : Math.ceil(deltaMs / 1000);
  const overtimeSeconds = isOvertime ? Math.floor(Math.abs(deltaMs) / 1000) : 0;
  const durationSeconds = Math.max(1, Number.isFinite(timer.durationSeconds) ? timer.durationSeconds : 90);
  const progressRatio = isOvertime ? 1 : Math.max(0, Math.min(1, remainingSeconds / durationSeconds));

  return {
    deltaMs,
    remainingSeconds,
    overtimeSeconds,
    isOvertime,
    isPaused,
    formatted: formatRestTimerClock(deltaMs),
    progressRatio,
    progressPercent: Math.round(progressRatio * 1000) / 10,
  };
}

export function hasRestCycleCompleted(timer: GymActiveTimer | null | undefined): boolean {
  if (!timer) return false;
  return completedCycles.has(getRestTimerCycleKey(timer));
}

export function consumeRestTimerCompletion(
  timer: GymActiveTimer | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!timer || Boolean(timer.pausedAt) || !Number.isFinite(timer.endsAt)) return false;
  if (timer.endsAt > nowMs) return false;
  const key = getRestTimerCycleKey(timer);
  if (completedCycles.has(key)) return false;
  if (completedCycles.size >= MAX_TRACKED_CYCLES) {
    const oldest = completedCycles.values().next().value;
    if (oldest !== undefined) completedCycles.delete(oldest);
  }
  completedCycles.add(key);
  return true;
}

export function resetRestCycleCompletionTracker(): void {
  completedCycles.clear();
}

export function isRestNotificationSupported(): boolean {
  return typeof window !== 'undefined' && typeof Notification !== 'undefined';
}

export function getRestNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isRestNotificationSupported()) return 'unsupported';
  try {
    return Notification.permission;
  } catch {
    return 'unsupported';
  }
}

export function isRestNotificationEnabled(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(REST_NOTIFICATION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setRestNotificationEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(REST_NOTIFICATION_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new Event('lifeos-rest-notification-preference'));
  } catch {
    // Ignore storage errors
  }
}

export async function requestRestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isRestNotificationSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    if (typeof Notification.requestPermission !== 'function') return 'unsupported';
    return await Notification.requestPermission();
  } catch {
    return 'unsupported';
  }
}

export function vibrateRestComplete(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  try {
    return Boolean(navigator.vibrate([120, 70, 120]));
  } catch {
    return false;
  }
}

export function buildRestNotificationBody(context?: RestNotificationContext): string {
  const exercise = context?.exerciseName?.trim();
  const session = context?.sessionName?.trim();
  if (exercise && session) {
    return `${exercise} · ${session}`;
  }
  if (exercise) {
    return `${exercise} · Siguiente serie lista`;
  }
  if (session) {
    return `${session} · Siguiente serie lista`;
  }
  return context?.kind === 'exercise'
    ? 'Descanso de cambio de ejercicio finalizado.'
    : 'Tu descanso finalizó. ¡Siguiente serie lista!';
}

export function sendRestCompleteNotification(context?: RestNotificationContext): boolean {
  if (!isRestNotificationEnabled()) return false;
  if (getRestNotificationPermission() !== 'granted') return false;

  const title = 'Descanso terminado';
  const body = buildRestNotificationBody(context);
  const tag = context?.tag || 'celestian-gym-rest';

  try {
    const notification = new Notification(title, {
      body,
      tag,
      renotify: false,
      silent: true,
    } as NotificationOptions);
    void notification;
    return true;
  } catch {
    // Some mobile browsers require ServiceWorkerRegistration.showNotification
    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof navigator.serviceWorker.getRegistration === 'function') {
        void navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg && typeof reg.showNotification === 'function') {
            return reg.showNotification(title, {
              body,
              tag,
              silent: true,
            });
          }
          return undefined;
        }).catch(() => {});
        return true;
      }
    } catch {
      // Ignore fallback failures
    }
    return false;
  }
}

export function resolveRestTimerContext(
  timer: GymActiveTimer | null | undefined,
  sessions?: GymSession[] | null
): { exerciseName: string | null; sessionName: string | null } {
  if (!timer || !Array.isArray(sessions)) return { exerciseName: null, sessionName: null };
  const session = sessions.find((s) => s.id === timer.sessionId)
    || sessions.find((s) => s.status === 'active');
  if (!session) return { exerciseName: null, sessionName: null };

  const exercise = (timer.exerciseId ? session.exercises.find((e) => e.id === timer.exerciseId) : null)
    || (typeof timer.exerciseIndex === 'number' ? session.exercises[timer.exerciseIndex] : null)
    || null;

  return {
    exerciseName: exercise?.name || null,
    sessionName: session.weekLabel?.trim() || null,
  };
}

export function triggerRestTimerCompletionAlert(
  timer: GymActiveTimer | null | undefined,
  context?: RestNotificationContext,
  nowMs = Date.now()
): boolean {
  if (!consumeRestTimerCompletion(timer, nowMs)) return false;
  playSound('restComplete');
  vibrateRestComplete();
  sendRestCompleteNotification({
    ...context,
    kind: context?.kind ?? timer?.kind,
    tag: context?.tag ?? (timer ? `celestian-gym-rest-${getRestTimerCycleKey(timer)}` : 'celestian-gym-rest'),
  });
  return true;
}
