import { useEffect, useRef } from 'react';

export type IntervalCallback = () => void;

/** A negative delay pauses the interval. No timers are created during render. */
export const useInterval = (callback: IntervalCallback, ms: number): number | undefined => {
  const latest = useRef(callback);
  const id = useRef<number>();
  latest.current = callback;
  useEffect(() => {
    if (ms < 0) return undefined;
    id.current = window.setInterval(() => latest.current(), ms);
    return () => {
      window.clearInterval(id.current);
      id.current = undefined;
    };
  }, [ms]);
  return id.current;
};
