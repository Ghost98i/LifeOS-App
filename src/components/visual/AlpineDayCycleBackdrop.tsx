import React from 'react';
import madrugadaScene from '../../../assets/hero/alpine-day-cicle/cervino-panorama-madrugada.webp';
import mananaScene from '../../../assets/hero/alpine-day-cicle/cervino-panorama-manana.webp';
import diaScene from '../../../assets/hero/alpine-day-cicle/cervino-panorama-dia.webp';
import atardecerScene from '../../../assets/hero/alpine-day-cicle/cervino-panorama-atardecer.webp';
import nocheScene from '../../../assets/hero/alpine-day-cicle/cervino-panorama-noche.webp';
import { DayCyclePeriod, getDayCycleConfig, getDayCyclePeriod } from '../../lib/alpineDayCycle';

interface AlpineDayCycleBackdropProps {
  className?: string;
  forcePeriod?: DayCyclePeriod;
  compact?: boolean;
  sceneSrc?: string;
}

export const DAY_CYCLE_SCENE_ASSETS: Record<DayCyclePeriod, string> = {
  predawn: madrugadaScene,
  morning: mananaScene,
  day: diaScene,
  sunset: atardecerScene,
  night: nocheScene,
};

interface ActiveSceneState {
  period: DayCyclePeriod;
  src: string;
}

export const AlpineDayCycleBackdrop: React.FC<AlpineDayCycleBackdropProps> = ({
  className = '',
  forcePeriod,
  compact = false,
  sceneSrc,
}) => {
  const period = forcePeriod || getDayCyclePeriod();
  const config = getDayCycleConfig(period);
  const resolvedScene = sceneSrc || DAY_CYCLE_SCENE_ASSETS[period];
  const [failedScene, setFailedScene] = React.useState<string | null>(null);
  const [previousScene, setPreviousScene] = React.useState<ActiveSceneState | null>(null);
  const currentSceneRef = React.useRef<ActiveSceneState>({ period, src: resolvedScene });
  const sceneAvailable = failedScene !== resolvedScene;

  React.useEffect(() => {
    setFailedScene(null);
    const prev = currentSceneRef.current;
    if (prev.src !== resolvedScene) {
      setPreviousScene(prev);
      currentSceneRef.current = { period, src: resolvedScene };
      const timer = window.setTimeout(() => setPreviousScene(null), 680);
      return () => window.clearTimeout(timer);
    }
    currentSceneRef.current = { period, src: resolvedScene };
    return undefined;
  }, [period, resolvedScene]);

  const renderScenePair = (targetPeriod: DayCyclePeriod, targetSrc: string, isOutgoing: boolean) => {
    const targetConfig = getDayCycleConfig(targetPeriod);
    const sceneVars = {
      '--hero-desktop-pos': targetConfig.focalPoint.desktopPosition,
      '--hero-tablet-pos': targetConfig.focalPoint.tabletPosition,
      '--hero-mobile-pos': targetConfig.focalPoint.mobilePosition,
    } as React.CSSProperties;

    const isCrossfading = !isOutgoing && previousScene !== null && previousScene.src !== targetSrc;

    return (
      <div
        key={`${targetPeriod}-${targetSrc}`}
        style={sceneVars}
        className={`hero-scene-stage hero-scene-${targetPeriod} absolute inset-0 ${
          isOutgoing ? 'hero-scene-outgoing' : isCrossfading ? 'hero-scene-transitioning' : 'hero-scene-active'
        }`}
      >
        <img
          src={targetSrc}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority={isOutgoing ? 'low' : 'high'}
          onError={!isOutgoing ? () => setFailedScene(targetSrc) : undefined}
          className="hero-matterhorn-scene hero-matterhorn-photo select-none"
        />
      </div>
    );
  };

  return (
    <div
      aria-hidden="true"
      data-day-cycle={period}
      data-scene-status={sceneAvailable ? 'ready' : 'fallback'}
      className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden select-none ${compact ? 'z-0 h-full' : '-z-10 h-[420px] sm:h-[480px]'} ${className}`}
    >
      {sceneAvailable && previousScene && previousScene.src !== resolvedScene && renderScenePair(previousScene.period, previousScene.src, true)}
      {sceneAvailable && renderScenePair(period, resolvedScene, false)}
      <div
        className={`hero-scrim hero-scrim-${period} absolute inset-0`}
        style={!sceneAvailable ? { background: `radial-gradient(ellipse at 78% 22%, ${config.skyTone.accentGlow}, transparent 45%), var(--hero-bg)` } : undefined}
      />
    </div>
  );
};
