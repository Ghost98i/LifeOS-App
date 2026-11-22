import React, { useEffect, useRef, useState } from 'react';

export type CompletionCheckSize = 'sm' | 'md';

export interface CompletionCheckProps {
  checked: boolean;
  size?: CompletionCheckSize;
  className?: string;
  /** Optional accessible label when rendered standalone outside an interactive button. */
  label?: string;
}

const SIZE_CLASSES: Record<CompletionCheckSize, { circle: string; icon: string }> = {
  sm: {
    circle: 'h-[18px] w-[18px]',
    icon: 'h-3 w-3',
  },
  md: {
    circle: 'h-5 w-5',
    icon: 'h-3.5 w-3.5',
  },
};

const ANIMATION_RESET_MS = 480;

/**
 * Unified circular completion indicator with pure-CSS + SVG micro-animation.
 * Renders as a non-interactive <span> so it can safely live inside an existing <button>
 * without nesting interactive elements, or standalone with `label`.
 *
 * Animation fires strictly on a live `false -> true` transition via `useRef`,
 * never on initial mount or re-render of already completed items.
 */
export const CompletionCheck: React.FC<CompletionCheckProps> = ({
  checked,
  size = 'md',
  className = '',
  label,
}) => {
  const prevCheckedRef = useRef(checked);
  const [isAnimating, setIsAnimating] = useState(false);

  const isLiveCompletionTransition = !prevCheckedRef.current && checked;
  const shouldAnimate = checked && (isAnimating || isLiveCompletionTransition);

  useEffect(() => {
    const wasChecked = prevCheckedRef.current;
    prevCheckedRef.current = checked;

    if (!wasChecked && checked) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, ANIMATION_RESET_MS);
      return () => clearTimeout(timer);
    }

    if (!checked) {
      setIsAnimating(false);
    }
  }, [checked]);

  const dimensions = SIZE_CLASSES[size];
  const stateClasses = checked
    ? 'border-[#4F46E5] bg-[#4F46E5]'
    : 'border-slate-300 bg-transparent hover:border-[#4F46E5] group-hover:border-[#4F46E5] dark:border-slate-500/50 dark:hover:border-[#4F46E5] dark:group-hover:border-[#4F46E5]';

  const accessibilityProps = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);

  return (
    <span
      {...accessibilityProps}
      data-completion-check="true"
      data-size={size}
      data-state={checked ? 'checked' : 'unchecked'}
      data-animating={shouldAnimate ? 'true' : 'false'}
      className={[
        'completion-check relative inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] select-none active:scale-90 group-active:scale-90',
        dimensions.circle,
        stateClasses,
        shouldAnimate ? 'completion-check--animate' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {shouldAnimate && (
        <span
          aria-hidden="true"
          className="completion-check-halo pointer-events-none absolute inset-0 rounded-full"
        />
      )}
      {checked && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`pointer-events-none shrink-0 ${dimensions.icon}`}
        >
          <path
            d="M4.5 12.5L9.5 17.5L19.5 6.5"
            stroke="#FFFFFF"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              shouldAnimate
                ? 'completion-check-tick completion-check-tick--animate'
                : 'completion-check-tick'
            }
          />
        </svg>
      )}
    </span>
  );
};
