import React from 'react';
import alpineDawnScene from '../../assets/dashboard/alpine-dawn-hero.jpg';
import alpineDayScene from '../../assets/dashboard/alpine-day-hero.jpg';
import alpineNightScene from '../../assets/dashboard/alpine-night-hero.jpg';
import alpineSunsetScene from '../../assets/dashboard/alpine-sunset-hero.jpg';
import { DayCyclePeriod, getDayCycleConfig, getDayCyclePeriod } from '../../lib/alpineDayCycle';

interface AlpineDayCycleBackdropProps {
  className?: string;
  forcePeriod?: DayCyclePeriod;
  compact?: boolean;
  sceneSrc?: string;
}

/**
 * Alpine is the first official LifeOS scene preset. Every period uses the same
 * geography and framing, with only the natural light and atmosphere changing.
 */
export const DAY_CYCLE_SCENE_ASSETS: Record<DayCyclePeriod, string> = {
  dawn: alpineDawnScene,
  day: alpineDayScene,
  sunset: alpineSunsetScene,
  night: alpineNightScene,
};

export const AlpineDayCycleBackdrop: React.FC<AlpineDayCycleBackdropProps> = ({
  className = '',
  forcePeriod,
  compact = false,
  sceneSrc,
}) => {
  const period = forcePeriod || getDayCyclePeriod();
  const config = getDayCycleConfig(period);
  const periodScene = DAY_CYCLE_SCENE_ASSETS[period];
  const resolvedScene = sceneSrc || periodScene;
  const [failedScene, setFailedScene] = React.useState<string | null>(null);
  const sceneAvailable = failedScene !== resolvedScene;

  React.useEffect(() => {
    if (typeof Image === 'undefined') return;
    Object.values(DAY_CYCLE_SCENE_ASSETS).forEach((src) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, []);

  return (
    <div
      aria-hidden="true"
      data-day-cycle={period}
      data-scene-status={sceneAvailable ? 'ready' : 'fallback'}
      className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden select-none ${
        compact ? 'z-0 h-full' : '-z-10 h-[420px] sm:h-[480px]'
      } ${className}`}
    >
      {sceneAvailable && (
        <img
          src={resolvedScene}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onError={() => setFailedScene(resolvedScene)}
          className={`absolute inset-0 h-full w-full object-cover hero-scene-${period} opacity-92 saturate-[0.96] contrast-[1.02] transition-opacity duration-500 dark:opacity-96 dark:saturate-[0.95]`}
        />
      )}

      <div
        className="hero-scrim absolute inset-0"
        style={{
          background: sceneAvailable
            ? undefined
            : `radial-gradient(ellipse at 78% 22%, ${config.skyTone.accentGlow} 0%, transparent 42%), radial-gradient(ellipse at 28% 8%, ${config.skyTone.ambientColor} 0%, transparent 58%), var(--hero-bg)`,
        }}
      />

      {!sceneAvailable && (
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[var(--hero-bg)] via-[var(--hero-bg)]/45 to-transparent" />
      )}

      {sceneAvailable && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[var(--hero-bg)]/60 via-[var(--hero-bg)]/15 to-transparent opacity-50" />
      )}
    </div>
  );
};
