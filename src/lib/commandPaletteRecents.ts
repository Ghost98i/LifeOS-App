import type { AppIconName } from '../components/AppIcon';
import type { LifeOSState, ViewType } from '../types';
import { isModuleEnabled } from './moduleVisibility';

export const COMMAND_PALETTE_RECENTS_KEY = 'celestian:command-palette:recents:v1';
export const MAX_COMMAND_PALETTE_RECENTS = 5;

export interface PaletteRecentEntry {
  id: string;
  kind: 'action' | 'view' | 'result';
  title: string;
  subtitle?: string;
  iconName: AppIconName;
  module?: ViewType;
  view?: ViewType;
  focusId?: string;
  isSensitive?: boolean;
  timestamp: number;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function isValidEntry(candidate: unknown): candidate is PaletteRecentEntry {
  if (!candidate || typeof candidate !== 'object') return false;
  const record = candidate as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.trim().length > 0 &&
    (record.kind === 'action' || record.kind === 'view' || record.kind === 'result') &&
    typeof record.title === 'string' &&
    record.title.trim().length > 0 &&
    typeof record.iconName === 'string' &&
    typeof record.timestamp === 'number' &&
    Number.isFinite(record.timestamp)
  );
}

export function loadCommandPaletteRecents(): PaletteRecentEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(COMMAND_PALETTE_RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const valid: PaletteRecentEntry[] = [];
    for (const item of parsed) {
      if (!isValidEntry(item) || seen.has(item.id)) continue;
      seen.add(item.id);
      valid.push(item);
      if (valid.length >= MAX_COMMAND_PALETTE_RECENTS) break;
    }
    return valid;
  } catch {
    return [];
  }
}

export function saveCommandPaletteRecents(entries: PaletteRecentEntry[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      COMMAND_PALETTE_RECENTS_KEY,
      JSON.stringify(entries.slice(0, MAX_COMMAND_PALETTE_RECENTS))
    );
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function recordCommandPaletteRecent(
  entry: Omit<PaletteRecentEntry, 'timestamp'>
): PaletteRecentEntry[] {
  const current = loadCommandPaletteRecents();
  const nextEntry: PaletteRecentEntry = {
    ...entry,
    timestamp: Date.now(),
  };
  const deduped = [nextEntry, ...current.filter((item) => item.id !== entry.id)].slice(
    0,
    MAX_COMMAND_PALETTE_RECENTS
  );
  saveCommandPaletteRecents(deduped);
  return deduped;
}

export function clearCommandPaletteRecents(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(COMMAND_PALETTE_RECENTS_KEY);
  } catch {
    // Ignore
  }
}

export function filterCommandPaletteRecents(
  entries: PaletteRecentEntry[],
  state: LifeOSState,
  options?: { cloudConnected?: boolean }
): PaletteRecentEntry[] {
  const cloudConnected = Boolean(options?.cloudConnected);
  return entries.filter((entry) => {
    if (entry.module && !isModuleEnabled(state, entry.module)) return false;
    if (entry.view && !isModuleEnabled(state, entry.view)) return false;
    if (entry.id === 'action-sync' && !cloudConnected) return false;
    return true;
  });
}
