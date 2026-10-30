import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { RenderConfig } from '@lottiefiles/dotlottie-react';

type DotLottieReactComponent = typeof import('@lottiefiles/dotlottie-react').DotLottieReact;

let dotLottiePrewarmPromise: Promise<{ default: DotLottieReactComponent }> | null = null;
let resolvedDotLottieComponent: DotLottieReactComponent | null = null;

export function prewarmLifeOSLottie() {
  if (!dotLottiePrewarmPromise && typeof window !== 'undefined') {
    dotLottiePrewarmPromise = import('@lottiefiles/dotlottie-react').then((module) => {
      try {
        const localWasmUrl = new URL('@lottiefiles/dotlottie-web/dotlottie-player.wasm', import.meta.url).href;
        module.setWasmUrl(localWasmUrl);
        void module.DotLottie.preload();
      } catch {
        // Fallback to default loader if URL resolution is unavailable in non-browser test runners
      }
      resolvedDotLottieComponent = module.DotLottieReact;
      return { default: module.DotLottieReact };
    });
  }
  return dotLottiePrewarmPromise;
}

const LazyDotLottie = React.lazy(async () => {
  const prewarmed = prewarmLifeOSLottie();
  if (prewarmed) return prewarmed;
  const module = await import('@lottiefiles/dotlottie-react');
  resolvedDotLottieComponent = module.DotLottieReact;
  return { default: module.DotLottieReact };
});

interface LifeOSLottieProps {
  src: string;
  data?: string;
  label?: string;
  className?: string;
  size?: number;
  speed?: number;
  segment?: [number, number];
  decorative?: boolean;
  renderConfig?: RenderConfig;
  fallback: React.ReactNode;
  onComplete?: () => void;
}

interface DotLottieCompletionSource {
  addEventListener: (type: 'complete', listener: () => void) => void;
  removeEventListener: (type: 'complete', listener: () => void) => void;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Loads the official dotLottie runtime only while a real celebration is visible. */
export const LifeOSLottie: React.FC<LifeOSLottieProps> = ({
  src,
  data,
  label,
  className = '',
  size,
  speed = 1,
  segment,
  decorative = false,
  renderConfig,
  fallback,
  onComplete,
}) => {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const playerRef = useRef<DotLottieCompletionSource | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const handleComplete = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  const setPlayer = useCallback((player: DotLottieCompletionSource | null) => {
    playerRef.current?.removeEventListener('complete', handleComplete);
    playerRef.current = player;
    player?.addEventListener('complete', handleComplete);
  }, [handleComplete]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      onCompleteRef.current?.();
    }
  }, [reducedMotion]);

  useEffect(() => () => {
    playerRef.current?.removeEventListener('complete', handleComplete);
    playerRef.current = null;
  }, [handleComplete]);

  const ResolvedDotLottie = resolvedDotLottieComponent;

  return (
    <div
      className={`lifeos-lottie ${className}`}
      style={size ? { width: size, height: size } : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      {reducedMotion ? (
        fallback
      ) : ResolvedDotLottie ? (
        <ResolvedDotLottie
          src={src}
          data={data}
          autoplay
          loop={false}
          speed={speed}
          segment={segment}
          backgroundColor="#00000000"
          renderConfig={renderConfig}
          dotLottieRefCallback={setPlayer}
        />
      ) : (
        <Suspense fallback={fallback}>
          <LazyDotLottie
            src={src}
            data={data}
            autoplay
            loop={false}
            speed={speed}
            segment={segment}
            backgroundColor="#00000000"
            renderConfig={renderConfig}
            dotLottieRefCallback={setPlayer}
          />
        </Suspense>
      )}
    </div>
  );
};

