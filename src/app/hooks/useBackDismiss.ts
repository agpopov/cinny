import { useEffect, useRef } from 'react';

type Layer = { priority: number; dismiss: () => void };
const layers: Layer[] = [];
const marker = '__cinnyDismiss';
let guarded = false;
let guardedHref = '';
let consuming = false;

const guard = () => {
  if (guarded || consuming || !layers.length) return;
  // Reuse the same guard after reload instead of accumulating duplicate room entries.
  if (!window.history.state?.[marker]) {
    window.history.pushState({ ...window.history.state, [marker]: true }, '', window.location.href);
  }
  guardedHref = window.location.href;
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
  // Hash navigation also emits popstate. Only the duplicate same-URL guard
  // represents Back; a new deep link belongs to the router.
  if (window.location.href !== guardedHref) {
    guarded = false;
    return;
  }
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
  const locationHref = window.location.href;
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
        if (window.history.state?.[marker] && window.location.href === guardedHref) {
          consuming = true;
          window.history.back();
        }
      }
    };
  }, [active, priority, locationHref]);
};
