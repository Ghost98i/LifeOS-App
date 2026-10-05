import React from 'react';

interface ContextWaveProps {
  expanded?: boolean;
  className?: string;
}

/**
 * ContextWave
 * Calm fluid atmospheric wave for PersonalContextCard.
 * Evokes daily equilibrium, sleep rhythms, and mental balance using
 * soothing sky-blue and violet fluid sinusoidal paths.
 */
export const ContextWave: React.FC<ContextWaveProps> = ({
  expanded = false,
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute right-0 top-0 overflow-hidden select-none -z-0 transition-all duration-300 ${
        expanded ? 'h-24 w-44 opacity-40 dark:opacity-55' : 'h-10 w-24 opacity-20 dark:opacity-30'
      } ${className}`}
    >
      <svg
        className="w-full h-full"
        viewBox="0 0 160 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="context-wave-grad" x1="0" y1="40" x2="160" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" stopOpacity="0.2" />
            <stop offset="0.5" stopColor="#818CF8" stopOpacity="0.6" />
            <stop offset="1" stopColor="#A855F7" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id="context-wave-fill" x1="80" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop stopColor="#818CF8" stopOpacity="0.1" />
            <stop offset="1" stopColor="#818CF8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Calm Harmonic Fluid Wave 1 */}
        <path
          d="M 0 35 C 35 15 65 55 100 30 C 130 10 145 25 160 18"
          stroke="url(#context-wave-grad)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Secondary Harmonizer Wave 2 */}
        <path
          d="M 0 48 C 40 30 75 60 115 42 C 140 28 150 35 160 28"
          stroke="#38BDF8"
          strokeOpacity="0.3"
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {expanded && (
          <>
            {/* Shaded Area for gentle depth */}
            <path
              d="M 0 35 C 35 15 65 55 100 30 C 130 10 145 25 160 18 L 160 80 L 0 80 Z"
              fill="url(#context-wave-fill)"
            />
            {/* Gentle Circadian Node */}
            <circle cx="100" cy="30" r="2.5" fill="#818CF8" fillOpacity="0.7" />
          </>
        )}
      </svg>
    </div>
  );
};
