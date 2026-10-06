import React from 'react';
import { AppIcon } from './AppIcon';

export interface SignatureEmptyStateProps {
  title: string;
  description: string;
  iconName?: 'wallet' | 'trendingUp' | 'calendar' | 'sparkles' | 'checkCircle' | 'activity' | 'target' | 'dumbbell' | 'book';
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  motif?: 'finance' | 'today' | 'generic';
  className?: string;
}

/**
 * SignatureEmptyState
 * Editorial, memorable empty state with bespoke vector geometry motifs.
 * Avoids generic stock illustrations and replaces them with LifeOS signature motifs.
 */
export const SignatureEmptyState: React.FC<SignatureEmptyStateProps> = ({
  title,
  description,
  iconName = 'sparkles',
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  motif = 'generic',
  className = '',
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)]/30 p-8 sm:p-10 text-center transition-all ${className}`}
    >
      {/* Background Architectural Watermark (Fine Abstract Geometry) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center select-none -z-0 opacity-[0.06] dark:opacity-[0.1]"
      >
        {motif === 'finance' ? (
          <svg width="280" height="140" viewBox="0 0 280 140" fill="none">
            <path
              d="M 10 120 C 70 110 120 70 170 80 C 220 90 240 30 270 20"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="6 6"
            />
            <circle cx="170" cy="80" r="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="270" cy="20" r="6" fill="currentColor" />
          </svg>
        ) : motif === 'today' ? (
          <svg width="240" height="140" viewBox="0 0 240 140" fill="none">
            <circle cx="120" cy="70" r="50" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
            <circle cx="120" cy="70" r="28" stroke="currentColor" strokeWidth="1.5" />
            <line x1="120" y1="10" x2="120" y2="130" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
          </svg>
        ) : (
          <svg width="240" height="120" viewBox="0 0 240 120" fill="none">
            <rect x="40" y="20" width="160" height="80" rx="16" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6" />
            <line x1="40" y1="60" x2="200" y2="60" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </div>

      {/* Foreground Content */}
      <div className="relative z-10 max-w-md mx-auto space-y-3">
        {/* Emblem Capsule */}
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500/15 via-blue-500/10 to-transparent border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 shadow-2xs">
          <AppIcon name={iconName} className="h-6 w-6" />
        </div>

        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-extrabold text-[var(--text)] tracking-tight">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-soft)] leading-relaxed">
            {description}
          </p>
        </div>

        {/* Action Triggers */}
        {(actionLabel || secondaryActionLabel) && (
          <div className="pt-2 flex items-center justify-center gap-2 flex-wrap">
            {actionLabel && onAction && (
              <button
                type="button"
                onClick={onAction}
                className="primary-button py-1.5 px-3.5 text-xs font-bold cursor-pointer shadow-xs"
              >
                <span>{actionLabel}</span>
              </button>
            )}
            {secondaryActionLabel && onSecondaryAction && (
              <button
                type="button"
                onClick={onSecondaryAction}
                className="secondary-button py-1.5 px-3 text-xs font-bold cursor-pointer"
              >
                <span>{secondaryActionLabel}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
