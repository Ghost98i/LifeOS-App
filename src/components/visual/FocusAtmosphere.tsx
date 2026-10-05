import React from 'react';

/**
 * FocusAtmosphere
 * Signature abstract visual element for TodayFocus (Foco del Día).
 * Evokes daily elevation, summit focus, and progressive momentum through
 * ascending geometric isometric planes and fine radiant lines.
 */
export const FocusAtmosphere: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute top-0 right-0 h-44 w-52 sm:w-64 overflow-hidden select-none -z-0 ${className}`}
    >
      {/* Ambient Radial Accent */}
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-gradient-to-bl from-amber-500/15 via-indigo-500/10 to-transparent blur-2xl dark:from-amber-500/22 dark:via-indigo-500/18" />

      {/* Abstract Ascending Geometric Contours (SVG) */}
      <svg
        className="absolute top-0 right-0 h-full w-full opacity-60 dark:opacity-75 transition-opacity"
        viewBox="0 0 256 176"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="focus-crest-1" x1="120" y1="176" x2="256" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F59E0B" stopOpacity="0.35" />
            <stop offset="0.6" stopColor="#6366F1" stopOpacity="0.25" />
            <stop offset="1" stopColor="#3B82F6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="focus-crest-2" x1="160" y1="176" x2="256" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F59E0B" stopOpacity="0.25" />
            <stop offset="0.8" stopColor="#6366F1" stopOpacity="0.1" />
            <stop offset="1" stopColor="#818CF8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="focus-crest-3" x1="190" y1="176" x2="256" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F59E0B" stopOpacity="0.15" />
            <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Outer Radiant Horizon Arc */}
        <path
          d="M 60 176 C 110 90 190 30 256 12"
          stroke="url(#focus-crest-1)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        {/* Primary Ascending Geometric Ridge (Step 01 Zenith) */}
        <path
          d="M 120 176 L 180 96 L 256 64"
          stroke="url(#focus-crest-1)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Secondary Ascending Contour (Step 02 Midpoint) */}
        <path
          d="M 150 176 L 204 112 L 256 94"
          stroke="url(#focus-crest-2)"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Tertiary Ascending Contour (Step 03 Foundation) */}
        <path
          d="M 180 176 L 224 130 L 256 120"
          stroke="url(#focus-crest-3)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Geometric Zenith Summit Point (Subtle Golden Spark) */}
        <circle cx="180" cy="96" r="3" fill="#F59E0B" fillOpacity="0.6" />
        <circle cx="180" cy="96" r="6" stroke="#F59E0B" strokeOpacity="0.25" strokeWidth="1" />
        
        {/* Subtle Focal Radial Ring */}
        <ellipse cx="256" cy="0" rx="90" ry="70" stroke="#6366F1" strokeOpacity="0.12" strokeWidth="1" />
      </svg>
    </div>
  );
};
