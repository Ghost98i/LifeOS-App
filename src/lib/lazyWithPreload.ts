import React, { lazy, type ComponentProps, type ComponentType } from 'react';

export interface PreloadableComponent<T extends ComponentType<any>> {
  (props: ComponentProps<T>): React.ReactElement | null;
  preload: () => Promise<{ default: T }>;
}

/**
 * Wraps React.lazy with an idempotent `.preload()` method.
 * Once the module resolves, subsequent renders mount the loaded component
 * synchronously without triggering a Suspense fallback flash.
 */
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let loaded: T | null = null;
  let pending: Promise<{ default: T }> | null = null;

  const load = () => {
    if (!pending) {
      pending = factory()
        .then((mod) => {
          loaded = mod.default;
          return mod;
        })
        .catch((error) => {
          pending = null;
          throw error;
        });
    }
    return pending;
  };

  const LazyComp = lazy(load);

  const Wrapper = ((props: ComponentProps<T>) => {
    if (loaded) {
      return React.createElement(loaded, props);
    }
    return React.createElement(LazyComp, props);
  }) as PreloadableComponent<T>;

  Wrapper.preload = load;
  return Wrapper;
}
