import { useEffect, useRef } from 'react';

type Layer = { priority: number; dismiss: () => void };
const layers: Layer[] = [];
const marker = '__cinnyDismiss';
let guarded = false;
let consuming = false;

const guard = () => {
  if (guarded || consuming || !layers.length) return;
  window.history.pushState({ ...window.history.state, [marker]: true }, '', window.location.href);
  guarded = true;
};

const onBack = (event: PopStateEvent) => {
  if (consuming) {
    consuming = false;
    event.stopImmediatePropagation();
    guard();
    return;
  }
  if (!guarded) return;
  guarded = false;
  event.stopImmediatePropagation();
  const top = layers.reduce<Layer | undefined>(
    (result, layer) => (!result || layer.priority >= result.priority ? layer : result),
    undefined
  );
  if (top) {
    layers.splice(layers.indexOf(top), 1);
    top.dismiss();
  }
  guard();
};

/** One history guard; Back dismisses the top menu, then the thread, then the room. */
export const useBackDismiss = (active: boolean, dismiss: () => void, priority = 20) => {
  const callback = useRef(dismiss);
  callback.current = dismiss;
  useEffect(() => {
    if (!active) return undefined;
    const layer: Layer = { priority, dismiss: () => callback.current() };
    if (!layers.length && !consuming) window.addEventListener('popstate', onBack, true);
    layers.push(layer);
    guard();
    return () => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (!layers.length && guarded) {
        guarded = false;
        // Navigation may already have replaced the guard with a different route.
        if (window.history.state?.[marker]) {
          consuming = true;
          window.history.back();
        }
      }
    };
  }, [active, priority]);
};
