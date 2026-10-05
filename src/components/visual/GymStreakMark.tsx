import React from 'react';

interface GymStreakMarkProps {
  days: number;
  status?: 'trained_today' | 'rest_today' | 'pending' | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * GymStreakMark
 * Custom signature mark for gym habit continuity and streak momentum.
 * Replaces generic emoji flames with an engineered geometric forge emblem
 * featuring progressive kinetic chevrons and continuity spark.
 */
export const GymStreakMark: React.FC<GymStreakMarkProps> = ({
  days,
  status = 'pending',
  size = 'md',
  className = '',
}) => {
  const isRest = status === 'rest_today';
  const isCompleted = status === 'trained_today';

  const sizeDimensions = {
    sm: { box: 18, icon: 14 },
    md: { box: 24, icon: 18 },
    lg: { box: 32, icon: 24 },
  }[size];

  // Dynamic color grading based on state
  const palette = isRest
    ? {
        gradientId: 'streak-rest-grad',
        primary: '#38BDF8', // Sky/cyan for active recovery
        secondary: '#64748B',
        fillStart: '#0EA5E9',
        fillEnd: '#6366F1',
        glow: 'rgba(14, 165, 233, 0.25)',
      }
    : isCompleted
    ? {
        gradientId: 'streak-done-grad',
        primary: '#10B981', // Emerald confirmation
        secondary: '#F59E0B',
        fillStart: '#10B981',
        fillEnd: '#059669',
        glow: 'rgba(16, 185, 129, 0.3)',
      }
    : {
        gradientId: 'streak-active-grad',
        primary: '#F97316', // Orange/coral forge momentum
        secondary: '#E11D48',
        fillStart: '#FB923C',
        fillEnd: '#F43F5E',
        glow: 'rgba(249, 115, 22, 0.35)',
      };

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <svg
        width={sizeDimensions.box}
        height={sizeDimensions.box}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-transform duration-200"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={palette.gradientId} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.fillStart} />
            <stop offset="1" stopColor={palette.fillEnd} />
          </linearGradient>
        </defs>

        {/* Outer Kinetic Shield / Forge Arc */}
        <path
          d="M 12 2 C 7 7 4 12 4 16 C 4 20.4 7.6 24 12 24 C 16.4 24 20 20.4 20 16 C 20 12 17 7 12 2 Z"
          fill={`url(#${palette.gradientId})`}
          fillOpacity={isRest ? '0.15' : '0.22'}
          stroke={`url(#${palette.gradientId})`}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />

        {/* Inner Faceted Flame Core (Geometric Forge) */}
        <path
          d="M 12 5.5 L 14.5 11 L 18 12 L 13.5 16.5 L 14.5 21 L 12 18.5 L 9.5 21 L 10.5 16.5 L 6 12 L 9.5 11 Z"
          fill={`url(#${palette.gradientId})`}
          fillOpacity={isRest ? '0.6' : '0.9'}
          stroke="#FFFFFF"
          strokeOpacity="0.3"
          strokeWidth="0.75"
        />

        {/* Central Luminous Continuity Node */}
        <circle cx="12" cy="14" r="2" fill="#FFFFFF" fillOpacity={isRest ? '0.7' : '0.95'} />

        {/* Top Momentum Ascent Dot */}
        {days >= 3 && (
          <circle cx="12" cy="3.5" r="1.2" fill={palette.fillStart} />
        )}
      </svg>
    </div>
  );
};
