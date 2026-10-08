/**
 * Alpine Day-Cycle System
 * Computes temporal daylight periods and themes based on local solar hour:
 * - dawn: 06:00 - 11:59 (celeste suave, dorado tenue, energía ascendente)
 * - day: 12:00 - 17:59 (limpio, claro, contraste activo)
 * - sunset: 18:00 - 19:59 (violeta cálido, ámbar/coral sutil, transición)
 * - night: 20:00 - 05:59 (azul profundo, índigo, calma y foco)
 */

export type DayCyclePeriod = 'dawn' | 'day' | 'sunset' | 'night';

export interface DayCycleConfig {
  period: DayCyclePeriod;
  label: string;
  greetingPrefix: string;
  greeting: (name?: string) => string;
  skyTone: {
    ambientColor: string;
    accentGlow: string;
    mountainRidgeFront: string;
    mountainRidgeMid: string;
    mountainRidgeBack: string;
    sunOrMoonColor: string;
  };
}

export function getDayCyclePeriod(input?: Date | number): DayCyclePeriod {
  let h: number;
  if (typeof input === 'number') {
    h = input;
  } else if (input instanceof Date) {
    h = input.getHours();
  } else {
    h = new Date().getHours();
  }
  if (h >= 6 && h < 12) return 'dawn';
  if (h >= 12 && h < 18) return 'day';
  if (h >= 18 && h < 20) return 'sunset';
  return 'night';
}

export function getDayCycleConfig(period: DayCyclePeriod): DayCycleConfig {
  switch (period) {
    case 'dawn':
      return {
        period: 'dawn',
        label: 'Amanecer',
        greetingPrefix: 'Buenos días',
        greeting: (name) => `Buenos días${name ? `, ${name}` : ''}`,
        skyTone: {
          ambientColor: 'rgba(56, 189, 248, 0.08)',
          accentGlow: 'rgba(251, 191, 36, 0.15)',
          mountainRidgeFront: '#0284c7',
          mountainRidgeMid: '#38bdf8',
          mountainRidgeBack: '#f59e0b',
          sunOrMoonColor: '#fbbf24',
        },
      };
    case 'day':
      return {
        period: 'day',
        label: 'Día',
        greetingPrefix: 'Buenas tardes',
        greeting: (name) => `Buenas tardes${name ? `, ${name}` : ''}`,
        skyTone: {
          ambientColor: 'rgba(59, 130, 246, 0.06)',
          accentGlow: 'rgba(99, 102, 241, 0.09)',
          mountainRidgeFront: '#2563eb',
          mountainRidgeMid: '#60a5fa',
          mountainRidgeBack: '#93c5fd',
          sunOrMoonColor: '#f59e0b',
        },
      };
    case 'sunset':
      return {
        period: 'sunset',
        label: 'Atardecer',
        greetingPrefix: 'Buenas tardes',
        greeting: (name) => `Buenas tardes${name ? `, ${name}` : ''}`,
        skyTone: {
          ambientColor: 'rgba(244, 63, 94, 0.08)',
          accentGlow: 'rgba(245, 158, 11, 0.16)',
          mountainRidgeFront: '#7c3aed',
          mountainRidgeMid: '#f43f5e',
          mountainRidgeBack: '#fb923c',
          sunOrMoonColor: '#fb923c',
        },
      };
    case 'night':
    default:
      return {
        period: 'night',
        label: 'Noche',
        greetingPrefix: 'Buenas noches',
        greeting: (name) => `Buenas noches${name ? `, ${name}` : ''}`,
        skyTone: {
          ambientColor: 'rgba(99, 102, 241, 0.07)',
          accentGlow: 'rgba(129, 140, 248, 0.12)',
          mountainRidgeFront: '#4338ca',
          mountainRidgeMid: '#6366f1',
          mountainRidgeBack: '#312e81',
          sunOrMoonColor: '#c7d2fe',
        },
      };
  }
}
