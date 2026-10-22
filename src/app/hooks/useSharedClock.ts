import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const snapshot = () => now;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((notify) => notify());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
};

/** One clock for relative dates, active threads and quiet hours, regardless of room count. */
export const useSharedClock = () => useSyncExternalStore(subscribe, snapshot, snapshot);
