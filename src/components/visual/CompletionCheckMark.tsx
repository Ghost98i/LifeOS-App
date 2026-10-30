import React, { useEffect, useState } from 'react';
import { LifeOSLottie, prewarmLifeOSLottie } from './LifeOSLottie';

export const TASK_PENDING_SVG_SRC = '/motion/lifeos-task-pending.svg';
export const TASK_COMPLETED_SVG_SRC = '/motion/lifeos-task-completed.svg';
export const TASK_COMPLETION_LOTTIE_SRC = '/motion/lifeos-task-completion.json';

/** Backward compatibility references */
export const VIOLET_CHECK_LOTTIE_SRC = TASK_COMPLETION_LOTTIE_SRC;
export const VIOLET_CHECK_DRAW_SEGMENT: [number, number] | undefined = undefined;

let assetsPrewarmed = false;
let prewarmedTaskCompletionData: string | undefined;

export function prewarmCompletionCheckAsset() {
  if (!assetsPrewarmed && typeof window !== 'undefined') {
    assetsPrewarmed = true;

    try {
      const imgPending = new Image();
      imgPending.src = TASK_PENDING_SVG_SRC;
      const imgCompleted = new Image();
      imgCompleted.src = TASK_COMPLETED_SVG_SRC;
    } catch {
      // Ignore if Image constructor is unavailable in non-browser runner
    }

    if (typeof fetch === 'function') {
      fetch(TASK_COMPLETION_LOTTIE_SRC, { credentials: 'same-origin' })
        .then((res) => (res && typeof res.text === 'function' ? res.text() : undefined))
        .then((text) => {
          if (text && text.trim().startsWith('{')) {
            prewarmedTaskCompletionData = text;
          }
        })
        .catch(() => {
          assetsPrewarmed = false;
        });
    }
  }
}

export interface CompletionCheckMarkProps {
  completed?: boolean;
  animate: boolean;
  nonce?: number;
  size?: number;
  className?: string;
  onComplete?: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Three-state visual completion control for routines and activities:
 * 1. Pending: `lifeos-task-pending.svg` (empty outlined violet circle, no animation).
 * 2. Transitioning: `lifeos-task-completion.json` (plays full 28 frames once on confirmed completion).
 * 3. Completed: `lifeos-task-completed.svg` (stable persistent check circle).
 */
export const CompletionCheckMark: React.FC<CompletionCheckMarkProps> = ({
  completed = true,
  animate,
  nonce = 0,
  size = 24,
  className = '',
  onComplete,
}) => {
  const [animatingNonce, setAnimatingNonce] = useState<number | null>(null);
  const [finishedNonce, setFinishedNonce] = useState<number | null>(null);

  // When uncompleted, instantly cancel any active animation and reset state
  useEffect(() => {
    if (!completed) {
      setAnimatingNonce(null);
      setFinishedNonce(null);
    }
  }, [completed]);

  // When transitioning to completed with an active motion nonce, trigger animation
  useEffect(() => {
    if (completed && animate && nonce > 0 && animatingNonce !== nonce && finishedNonce !== nonce) {
      if (prefersReducedMotion()) {
        setFinishedNonce(nonce);
        onComplete?.();
        return;
      }
      void prewarmLifeOSLottie();
      setAnimatingNonce(nonce);
    }
  }, [completed, animate, nonce, animatingNonce, finishedNonce, onComplete]);

  // Defensive fallback timer: ensure UI settles to static SVG even if DotLottie event is delayed
  useEffect(() => {
    if (animatingNonce !== null) {
      const timer = window.setTimeout(() => {
        setFinishedNonce(animatingNonce);
        setAnimatingNonce(null);
        onComplete?.();
      }, 1800);
      return () => window.clearTimeout(timer);
    }
  }, [animatingNonce, onComplete]);

  const showLottie = completed && animatingNonce !== null && finishedNonce !== animatingNonce;

  const pendingElement = (
    <img
      src={TASK_PENDING_SVG_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={`block shrink-0 select-none pointer-events-none ${className || 'h-6 w-6'}`}
      style={{ width: size, height: size }}
    />
  );

  const completedElement = (
    <img
      src={TASK_COMPLETED_SVG_SRC}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={`block shrink-0 select-none pointer-events-none ${className || 'h-6 w-6'}`}
      style={{ width: size, height: size }}
    />
  );

  if (!completed) {
    return pendingElement;
  }

  if (!showLottie) {
    return completedElement;
  }

  return (
    <LifeOSLottie
      key={`check-motion-${animatingNonce}`}
      src={TASK_COMPLETION_LOTTIE_SRC}
      data={prewarmedTaskCompletionData}
      size={size}
      speed={1}
      decorative
      renderConfig={{
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        autoResize: true,
      }}
      fallback={completedElement}
      onComplete={() => {
        setFinishedNonce(animatingNonce);
        setAnimatingNonce(null);
        onComplete?.();
      }}
    />
  );
};
