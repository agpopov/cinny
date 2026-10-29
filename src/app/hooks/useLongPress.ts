import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export const useLongPress = (onPress: (x: number, y: number) => void, disabled = false) => {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number }>();
  const pressed = useRef(false);
  const callback = useRef(onPress);
  callback.current = onPress;
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = undefined;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      cancel();
      pressed.current = false;
      if (disabled || event.pointerType === 'mouse' || !event.isPrimary) return;
      if (
        (event.target as Element).closest(
          'button, input, textarea, video, audio, [contenteditable]'
        )
      )
        return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        if (!start.current || !window.getSelection()?.isCollapsed) return;
        pressed.current = true;
        callback.current(start.current.x, start.current.y);
      }, 350);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (
        start.current &&
        Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10
      )
        cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      if (!pressed.current) return;
      pressed.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
};
