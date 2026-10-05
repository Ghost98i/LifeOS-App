import React from 'react';

/**
 * TodayAtmosphereBackdrop
 * Abstract ambient canvas layer for the Hoy dashboard view.
 * Provides subtle visual depth and artistic direction without CPU loops or heavy assets.
 */
export const TodayAtmosphereBackdrop: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 h-[480px] overflow-hidden -z-10 select-none ${className}`}
    >
      {/* Ambient Radial Mesh Gradients */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-full max-w-[1536px] h-full">
        {/* Primary Zenith Glow (Indigo / Violet) */}
        <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[520px] h-[320px] rounded-full bg-gradient-to-br from-indigo-500/8 via-violet-500/6 to-transparent blur-3xl dark:from-indigo-500/18 dark:via-violet-600/14 dark:to-transparent" />
        
        {/* Warm Ambient Balance (Amber / Rose) */}
        <div className="absolute top-12 right-1/4 translate-x-1/3 w-[460px] h-[280px] rounded-full bg-gradient-to-bl from-amber-500/6 via-orange-500/4 to-transparent blur-3xl dark:from-amber-500/12 dark:via-rose-600/10 dark:to-transparent" />

        {/* Crisp Geometric Horizon Grid (Subtle editorial accent) */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.03] dark:opacity-[0.06]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="atmosphere-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="1" />
              <circle cx="48" cy="0" r="1.5" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#atmosphere-grid)" />
        </svg>
      </div>
    </div>
  );
};
