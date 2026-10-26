import React, { ReactNode, useCallback, useLayoutEffect, useRef } from 'react';
import * as css from './styles.css';

type MessageOptionsProps = {
  visible: boolean;
  children: ReactNode;
};

/** Floating controls must not change message width, wrapping or row height. */
export function MessageOptions({ visible, children }: MessageOptionsProps) {
  const optionsRef = useRef<HTMLDivElement>(null);
  const updatePosition = useCallback(() => {
    const options = optionsRef.current;
    const message = options?.parentElement;
    if (!options || !message) return;

    options.style.right = '0px';
    options.style.top = '0px';
    const time = message.querySelector('time');
    if (!time) return;

    const actions = options.getBoundingClientRect();
    const timestamp = time.getBoundingClientRect();
    if (
      actions.right <= timestamp.left ||
      actions.left >= timestamp.right ||
      actions.bottom <= timestamp.top ||
      actions.top >= timestamp.bottom
    ) {
      return;
    }

    const row = message.getBoundingClientRect();
    const gap = 8;
    const right = row.right - timestamp.left + gap;
    if (row.width - right >= actions.width) {
      options.style.right = `${right}px`;
    } else {
      // Long dates and very narrow panes can leave no horizontal room.
      options.style.top = `${timestamp.bottom - row.top + gap}px`;
    }
  }, []);

  useLayoutEffect(() => {
    const options = optionsRef.current;
    const message = options?.parentElement;
    if (!visible || !options || !message) return undefined;

    // Position before paint; observe only the currently visible controls.
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(message);
    observer.observe(options);
    const time = message.querySelector('time');
    if (time) observer.observe(time);
    return () => observer.disconnect();
  }, [children, visible, updatePosition]);

  return (
    <div ref={optionsRef} className={css.MessageOptionsBase} data-visible={visible}>
      {children}
    </div>
  );
}
