import React from 'react';

interface FinanceFlowMarkProps {
  status?: 'healthy' | 'warning' | 'neutral';
  className?: string;
}

/**
 * FinanceFlowMark
 * Ambient abstract micro-visualization for the Finance overview.
 * Evokes dynamic liquidity flow, equilibrium, and reserve depth without
 * cluttering monetary figures or adding heavy charting libraries.
 */
export const FinanceFlowMark: React.FC<FinanceFlowMarkProps> = ({
  status = 'healthy',
  className = '',
}) => {
  const isWarning = status === 'warning';

  const strokeColor = isWarning ? '#F59E0B' : '#10B981';
  const accentColor = isWarning ? '#FB923C' : '#06B6D4';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute right-0 bottom-0 h-28 w-36 sm:w-44 overflow-hidden select-none -z-0 ${className}`}
    >
      <svg
        className="absolute right-0 bottom-0 h-full w-full opacity-30 dark:opacity-45 transition-opacity"
        viewBox="0 0 160 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="finance-flow-grad" x1="0" y1="50" x2="160" y2="50" gradientUnits="userSpaceOnUse">
            <stop stopColor={strokeColor} stopOpacity="0.1" />
            <stop offset="0.5" stopColor={strokeColor} stopOpacity="0.7" />
            <stop offset="1" stopColor={accentColor} stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="finance-fill-grad" x1="80" y1="0" x2="80" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor={strokeColor} stopOpacity="0.12" />
            <stop offset="1" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Shaded Flow Volume (Area under equilibrium) */}
        <path
          d="M 0 85 C 40 70 70 85 100 55 C 130 25 145 35 160 20 L 160 100 L 0 100 Z"
          fill="url(#finance-fill-grad)"
        />

        {/* Primary Harmonic Liquidity Spline */}
        <path
          d="M 0 85 C 40 70 70 85 100 55 C 130 25 145 35 160 20"
          stroke="url(#finance-flow-grad)"
          strokeWidth="1.75"
          strokeLinecap="round"
        />

        {/* Secondary Stabilizing Horizon Curve */}
        <path
          d="M 0 92 C 50 82 85 75 120 62 C 145 52 155 45 160 40"
          stroke={accentColor}
          strokeOpacity="0.3"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        {/* Terminal Equilibrium Pulse Node */}
        <circle cx="160" cy="20" r="3" fill={accentColor} fillOpacity="0.8" />
        <circle cx="100" cy="55" r="2" fill={strokeColor} fillOpacity="0.6" />
      </svg>
    </div>
  );
};
