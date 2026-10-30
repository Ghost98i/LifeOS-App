/** Local visual periods for the Matterhorn hero. Greeting and image periods
 * intentionally use separate schedules. */
export type DayCyclePeriod = 'predawn' | 'morning' | 'day' | 'sunset' | 'night';

export interface SolarCoordinates {
  latitude: number;
  longitude: number;
}

export interface DayCycleConfig {
  period: DayCyclePeriod;
  label: string;
  skyTone: { ambientColor: string; accentGlow: string };
  focalPoint: {
    /** Desktop object-position preserving Matterhorn summit & right-anchored massif */
    desktopPosition: string;
    /** Tablet object-position */
    tabletPosition: string;
    /** Mobile object-position for the panoramic scenes */
    mobilePosition: string;
  };
}

function localMinutes(input?: Date | number): number {
  if (typeof input === 'number') {
    const minutes = Math.floor(input * 60);
    return ((minutes % 1440) + 1440) % 1440;
  }
  const date = input instanceof Date ? input : new Date();
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Explicit 5-period schedule for the Matterhorn Hero:
 * - Noche (night):       19:30–04:59 -> cervino-panorama-noche.png
 * - Madrugada (predawn): 05:00–06:59 -> cervino-panorama-madrugada.png
 * - Mañana (morning):    07:00–10:59 -> cervino-panorama-manana.png
 * - Mediodía (day):      11:00–16:59 -> cervino-panorama-dia.png
 * - Atardecer (sunset):  17:00–19:29 -> cervino-panorama-atardecer.png
 */
export function getDayCyclePeriod(input?: Date | number, _coordinates?: SolarCoordinates | null): DayCyclePeriod {
  const minutes = localMinutes(input);
  if (minutes < 5 * 60) return 'night';
  if (minutes < 7 * 60) return 'predawn';
  if (minutes < 11 * 60) return 'morning';
  if (minutes < 17 * 60) return 'day';
  if (minutes < 19 * 60 + 30) return 'sunset';
  return 'night';
}

export function getGreetingPrefix(input?: Date | number): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
  const minutes = localMinutes(input);
  if (minutes >= 5 * 60 && minutes < 12 * 60) return 'Buenos días';
  if (minutes >= 12 * 60 && minutes < 19 * 60 + 30) return 'Buenas tardes';
  return 'Buenas noches';
}

export function getLocalGreeting(input?: Date | number, name?: string): string {
  return `${getGreetingPrefix(input)}${name?.trim() ? `, ${name.trim()}` : ''}`;
}

const configs: Record<DayCyclePeriod, DayCycleConfig> = {
  predawn: {
    period: 'predawn',
    label: 'Madrugada',
    skyTone: { ambientColor: 'rgba(37, 51, 95, .28)', accentGlow: 'rgba(246, 232, 231, .24)' },
    focalPoint: { desktopPosition: '70% 14%', tabletPosition: '70% 18%', mobilePosition: '72% 22%' },
  },
  morning: {
    period: 'morning',
    label: 'Mañana',
    skyTone: { ambientColor: 'rgba(95, 151, 194, .18)', accentGlow: 'rgba(255, 232, 185, .28)' },
    focalPoint: { desktopPosition: '70% 14%', tabletPosition: '70% 18%', mobilePosition: '72% 22%' },
  },
  day: {
    period: 'day',
    label: 'Mediodía',
    skyTone: { ambientColor: 'rgba(80, 145, 199, .14)', accentGlow: 'rgba(241, 245, 250, .24)' },
    focalPoint: { desktopPosition: '70% 14%', tabletPosition: '70% 18%', mobilePosition: '72% 22%' },
  },
  sunset: {
    period: 'sunset',
    label: 'Atardecer',
    skyTone: { ambientColor: 'rgba(77, 58, 105, .24)', accentGlow: 'rgba(254, 196, 118, .30)' },
    focalPoint: { desktopPosition: '70% 14%', tabletPosition: '70% 18%', mobilePosition: '72% 22%' },
  },
  night: {
    period: 'night',
    label: 'Noche',
    skyTone: { ambientColor: 'rgba(20, 31, 64, .32)', accentGlow: 'rgba(52, 70, 96, .22)' },
    focalPoint: { desktopPosition: '70% 14%', tabletPosition: '70% 18%', mobilePosition: '72% 22%' },
  },
};

export function getDayCycleConfig(period: DayCyclePeriod): DayCycleConfig {
  return configs[period];
}
