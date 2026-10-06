import React from 'react';
import { DayCyclePeriod, getDayCycleConfig, getDayCyclePeriod } from '../../lib/alpineDayCycle';

interface AlpineDayCycleBackdropProps {
  className?: string;
  forcePeriod?: DayCyclePeriod;
}

/**
 * AlpineDayCycleBackdrop
 * Distinct, elegant mountain relief and solar day-cycle atmosphere.
 * Visible in 1-2 seconds through layered silhouettes, crest lighting, and atmospheric sky gradients.
 * 100% SVG and CSS without external dependencies or heavy assets.
 */
export const AlpineDayCycleBackdrop: React.FC<AlpineDayCycleBackdropProps> = ({
  className = '',
  forcePeriod,
}) => {
  const period = forcePeriod || getDayCyclePeriod();
  const config = getDayCycleConfig(period);

  return (
    <div
      aria-hidden="true"
      data-day-cycle={period}
      className={`pointer-events-none absolute inset-x-0 top-0 h-[420px] sm:h-[480px] overflow-hidden -z-10 select-none transition-colors duration-700 ${className}`}
    >
      {/* Dynamic Solar / Lunar Atmosphere Mesh */}
      <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-full max-w-[1600px] h-full">
        {/* Sky Ambient Bloom */}
        <div
          className="absolute -top-8 left-1/4 -translate-x-1/2 w-[700px] h-[360px] rounded-full blur-3xl opacity-75 dark:opacity-85 transition-all duration-700"
          style={{ background: `radial-gradient(ellipse at center, ${config.skyTone.accentGlow} 0%, transparent 70%)` }}
        />

        <div
          className="absolute top-4 right-1/4 w-[560px] h-[300px] rounded-full blur-3xl opacity-50 dark:opacity-70 transition-all duration-700"
          style={{ background: `radial-gradient(ellipse at center, ${config.skyTone.ambientColor} 0%, transparent 70%)` }}
        />

        {/* Alpine Ridges Vector Layer (3 Distinct Mountain Tiers with Crisp Horizon & Sunlight Silhouette) */}
        <svg
          className="absolute inset-x-0 bottom-0 w-full h-[260px] sm:h-[290px] opacity-65 dark:opacity-75 transition-opacity duration-700"
          viewBox="0 0 1440 260"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Distant Peaks Gradient */}
            <linearGradient id={`alpine-back-${period}`} x1="720" y1="20" x2="720" y2="260" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={config.skyTone.mountainRidgeBack} stopOpacity="0.55" />
              <stop offset="60%" stopColor={config.skyTone.mountainRidgeBack} stopOpacity="0.2" />
              <stop offset="100%" stopColor={config.skyTone.mountainRidgeBack} stopOpacity="0.0" />
            </linearGradient>

            {/* Mid Ridges Gradient */}
            <linearGradient id={`alpine-mid-${period}`} x1="720" y1="60" x2="720" y2="260" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={config.skyTone.mountainRidgeMid} stopOpacity="0.65" />
              <stop offset="70%" stopColor={config.skyTone.mountainRidgeMid} stopOpacity="0.25" />
              <stop offset="100%" stopColor={config.skyTone.mountainRidgeMid} stopOpacity="0.0" />
            </linearGradient>

            {/* Foreground Foothills Gradient */}
            <linearGradient id={`alpine-front-${period}`} x1="720" y1="110" x2="720" y2="260" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={config.skyTone.mountainRidgeFront} stopOpacity="0.8" />
              <stop offset="80%" stopColor={config.skyTone.mountainRidgeFront} stopOpacity="0.3" />
              <stop offset="100%" stopColor={config.skyTone.mountainRidgeFront} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Tier 3: Distant High Peaks (Distant Alpine Horizon) */}
          <path
            d="M 0 190 L 120 120 L 240 165 L 360 85 L 500 175 L 660 95 L 820 155 L 990 60 L 1140 145 L 1280 85 L 1440 160 L 1440 260 L 0 260 Z"
            fill={`url(#alpine-back-${period})`}
          />

          {/* Tier 2: Mid-range Ridges & Saddles */}
          <path
            d="M 0 210 L 160 145 L 300 190 L 440 125 L 600 195 L 760 135 L 920 185 L 1060 115 L 1200 180 L 1360 130 L 1440 165 L 1440 260 L 0 260 Z"
            fill={`url(#alpine-mid-${period})`}
          />

          {/* Tier 1: Front Foothills & Traverse Flow */}
          <path
            d="M 0 230 L 140 185 L 290 220 L 430 165 L 580 215 L 730 160 L 880 205 L 1030 150 L 1190 195 L 1330 170 L 1440 195 L 1440 260 L 0 260 Z"
            fill={`url(#alpine-front-${period})`}
          />

          {/* Crest Highlight Strokes: Delicate light rim catching the ridges */}
          <path
            d="M 0 190 L 120 120 L 240 165 L 360 85 L 500 175 L 660 95 L 820 155 L 990 60 L 1140 145 L 1280 85 L 1440 160"
            stroke={config.skyTone.mountainRidgeBack}
            strokeOpacity="0.4"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M 0 210 L 160 145 L 300 190 L 440 125 L 600 195 L 760 135 L 920 185 L 1060 115 L 1200 180 L 1360 130 L 1440 165"
            stroke={config.skyTone.mountainRidgeMid}
            strokeOpacity="0.5"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M 0 230 L 140 185 L 290 220 L 430 165 L 580 215 L 730 160 L 880 205 L 1030 150 L 1190 195 L 1330 170 L 1440 195"
            stroke={config.skyTone.mountainRidgeFront}
            strokeOpacity="0.6"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Focal Summit Beacon (Sun / Moon zenith light over peak 990) */}
          <circle
            cx="990"
            cy="60"
            r="4.5"
            fill={config.skyTone.sunOrMoonColor}
            fillOpacity="0.9"
          />
          <circle
            cx="990"
            cy="60"
            r="12"
            stroke={config.skyTone.sunOrMoonColor}
            strokeOpacity="0.3"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
};
