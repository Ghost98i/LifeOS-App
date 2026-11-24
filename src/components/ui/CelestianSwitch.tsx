import React from 'react';

export interface CelestianSwitchProps {
  checked: boolean;
  onChange: (nextChecked: boolean) => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  id?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Unified Celestian indigo switch control (`role="switch"`).
 * Replaces raw native checkboxes and text-pill toggles across forms and settings.
 */
export const CelestianSwitch: React.FC<CelestianSwitchProps> = ({
  checked,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  id,
  disabled = false,
  size = 'md',
  className = '',
}) => {
  const trackSize = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumbSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const thumbOffset = size === 'sm'
    ? (checked ? 'translate-x-4' : 'translate-x-0.5')
    : (checked ? 'translate-x-5' : 'translate-x-0.5');

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${trackSize} shrink-0 items-center rounded-full transition-colors duration-150 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0D111A] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer ${
        checked
          ? 'bg-[#4F46E5] dark:bg-[#4F46E5]'
          : 'bg-slate-200 dark:bg-white/[0.14]'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block ${thumbSize} transform rounded-full bg-white shadow-xs transition-transform duration-150 ${thumbOffset}`}
      />
    </button>
  );
};
