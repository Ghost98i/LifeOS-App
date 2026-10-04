import React from 'react';

export interface BentoRadialGaugeProps {
  percentage?: number;
  value?: number;
  max?: number;
  label?: string;
  valueText?: string;
  size?: number;
  strokeWidth?: number;
  variant?: 'peach' | 'blue' | 'green' | 'neutral';
  color?: string;
}

export const BentoRadialGauge: React.FC<BentoRadialGaugeProps> = ({
  percentage,
  value,
  max,
  label,
  valueText,
  size = 88,
  strokeWidth = 8,
  variant = 'peach',
  color,
}) => {
  const computedPercent = (() => {
    if (typeof percentage === 'number' && !Number.isNaN(percentage)) {
      return percentage;
    }
    if (typeof max === 'number' && max > 0 && typeof value === 'number' && !Number.isNaN(value)) {
      return Math.round((value / max) * 100);
    }
    return 0;
  })();

  const clamped = Math.min(100, Math.max(0, computedPercent));
  const radius = Math.max(1, (size - strokeWidth) / 2);
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const colorConfig = {
    peach: {
      track: 'rgba(194, 65, 12, 0.12)',
      progress: color || '#EA580C',
      text: '#7C2D12',
      darkText: '#FDBA74',
    },
    blue: {
      track: 'rgba(37, 99, 235, 0.12)',
      progress: color || '#2563EB',
      text: '#1E3A8A',
      darkText: '#93C5FD',
    },
    green: {
      track: 'rgba(5, 150, 105, 0.12)',
      progress: color || '#059669',
      text: '#064E3B',
      darkText: '#6EE7B7',
    },
    neutral: {
      track: 'var(--border)',
      progress: color || 'var(--text)',
      text: 'var(--text)',
      darkText: 'var(--text)',
    },
  }[variant];

  const displayText = valueText || `${Math.round(clamped)}%`;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colorConfig.track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colorConfig.progress}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none pointer-events-none px-1">
        <span
          className="font-black font-mono tracking-tight text-[var(--text)]"
          style={{ fontSize: size < 52 ? '0.7rem' : size < 70 ? '0.85rem' : '1.1rem' }}
        >
          {displayText}
        </span>
        {label && size >= 64 && (
          <span className="text-[9px] font-semibold text-[var(--text-soft)] mt-0.5 truncate max-w-[70px]">
            {label}
          </span>
        )}
      </div>
    </div>
  );
};
