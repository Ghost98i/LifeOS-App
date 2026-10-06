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

        {/* Layered Alpine Foothills Fill */}
        <path
          d="M 0 165 C 50 150 90 145 140 120 C 190 95 240 110 320 45 L 320 180 L 0 180 Z"
          fill="url(#fin-hero-fill)"
        />

        {/* Narrative Flow Traverse: Saldo Actual -> -Compromisos -> +Ingresos -> Proyectado */}
        <path
          d="M 0 155 C 50 145 90 150 140 125 C 190 100 240 115 320 45"
          stroke="url(#fin-hero-spline)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Alpine Contour Ridge (Horizon Guide) */}
        <path
          d="M 10 135 C 70 125 150 110 230 75 C 275 55 300 48 320 40"
          stroke={secondaryColor}
          strokeOpacity="0.3"
          strokeWidth="1.2"
          strokeDasharray="4 4"
        />

        {/* Flow Milestones: Anchor Nodes (Saldo -> Compromisos -> Ingresos -> Cumbre Proyectada) */}
        <circle cx="40" cy="148" r="3" fill={strokeColor} fillOpacity="0.6" />
        <circle cx="140" cy="125" r="3.5" fill={isDeficit ? '#f43f5e' : '#f59e0b'} fillOpacity="0.75" />
        <circle cx="230" cy="98" r="3.5" fill="#10b981" fillOpacity="0.8" />
        <circle cx="320" cy="45" r="5" fill={glowColor} fillOpacity="0.9" filter="url(#fin-node-glow)" />
      </svg>
    </div>
  );
};
