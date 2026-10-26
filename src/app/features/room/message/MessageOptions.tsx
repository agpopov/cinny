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
    options.style.setProperty(css.MessageOptionsTimeSpace, '0px');
    options.dataset.combinedTime = 'false';
    const time = message.querySelector('time');
    if (!time) return;
    const timestampContainer = time.closest<HTMLElement>('[data-message-timestamp]');

    const actions = options.getBoundingClientRect();
    const timestamp = time.getBoundingClientRect();
    const row = message.getBoundingClientRect();
    const gap = 8;
    const right = row.right - timestamp.left + gap;

    if (timestampContainer && right >= 0 && actions.width + right <= row.width) {
      // Extend only the floating menu's background/border into the timestamp
      // area. Its extra padding puts the buttons exactly where they were when
      // the menu sat to the left of the date. Message layout is unaffected.
      options.style.setProperty(css.MessageOptionsTimeSpace, `${right}px`);
      const frame = options.getBoundingClientRect();
      // Position the frame around the timestamp's existing center, including
      // above the row when needed. Hover must never move the timestamp.
      const top = timestamp.top - row.top + (timestamp.height - frame.height) / 2;
      options.style.top = `${top}px`;
      options.dataset.combinedTime = 'true';
      return;
    }

    if (
      actions.right <= timestamp.left ||
      actions.left >= timestamp.right ||
      actions.bottom <= timestamp.top ||
      actions.top >= timestamp.bottom
    ) {
      return;
    }

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
    return () => {
      observer.disconnect();
    };
  }, [children, visible, updatePosition]);

  return (
    <div ref={optionsRef} className={css.MessageOptionsBase} data-visible={visible}>
      {children}
    </div>
  );
}
