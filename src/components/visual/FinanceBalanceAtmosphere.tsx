import React from 'react';

interface FinanceBalanceAtmosphereProps {
  className?: string;
  status?: 'healthy' | 'attention' | 'warning' | 'deficit';
}

/**
 * FinanceBalanceAtmosphere
 * Ambient atmospheric graphic for the Finance 2.0 Hero.
 * Conveys financial equilibrium, horizon safety and liquidity flow
 * through elegant SVG spline geometry without runtime charting dependencies.
 */
export const FinanceBalanceAtmosphere: React.FC<FinanceBalanceAtmosphereProps> = ({
  className = '',
  status = 'healthy',
}) => {
  const isDeficit = status === 'deficit';
  const isWarning = status === 'warning' || status === 'attention';

  const strokeColor = isDeficit ? '#F43F5E' : isWarning ? '#F59E0B' : '#10B981';
  const glowColor = isDeficit ? '#E11D48' : isWarning ? '#D97706' : '#059669';
  const secondaryColor = isDeficit ? '#FB7185' : isWarning ? '#FBBF24' : '#06B6D4';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute right-0 top-0 h-full w-full max-w-[280px] sm:max-w-[340px] overflow-hidden select-none -z-0 opacity-40 dark:opacity-55 transition-opacity ${className}`}
    >
      <svg
        className="absolute right-0 top-0 h-full w-full"
        viewBox="0 0 320 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="fin-hero-fill" x1="160" y1="0" x2="160" y2="180" gradientUnits="userSpaceOnUse">
            <stop stopColor={strokeColor} stopOpacity="0.14" />
            <stop offset="0.6" stopColor={strokeColor} stopOpacity="0.04" />
            <stop offset="1" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>

          <linearGradient id="fin-hero-spline" x1="0" y1="90" x2="320" y2="90" gradientUnits="userSpaceOnUse">
            <stop stopColor={strokeColor} stopOpacity="0.1" />
            <stop offset="0.4" stopColor={strokeColor} stopOpacity="0.85" />
            <stop offset="0.85" stopColor={secondaryColor} stopOpacity="0.95" />
            <stop offset="1" stopColor={secondaryColor} stopOpacity="0.3" />
          </linearGradient>

          <filter id="fin-node-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ambient Area Curve */}
        <path
          d="M 0 160 C 60 150 110 135 160 100 C 210 65 260 80 320 40 L 320 180 L 0 180 Z"
          fill="url(#fin-hero-fill)"
        />

        {/* Primary Equilibrium Flow Spline */}
        <path
          d="M 0 160 C 60 150 110 135 160 100 C 210 65 260 80 320 40"
          stroke="url(#fin-hero-spline)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Dynamic Horizon Guides */}
        <path
          d="M 20 140 C 90 120 170 105 240 75 C 280 58 305 48 320 45"
          stroke={secondaryColor}
          strokeOpacity="0.25"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Soft Reserve Anchor Node */}
        <circle cx="160" cy="100" r="4" fill={strokeColor} fillOpacity="0.8" filter="url(#fin-node-glow)" />
        <circle cx="260" cy="80" r="2.5" fill={secondaryColor} fillOpacity="0.7" />
        <circle cx="320" cy="40" r="5" fill={glowColor} fillOpacity="0.85" />
      </svg>
    </div>
  );
};
