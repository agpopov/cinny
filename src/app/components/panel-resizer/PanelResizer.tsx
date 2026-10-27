import React, { KeyboardEvent, PointerEvent, RefObject, useRef } from 'react';
import * as css from './PanelResizer.css';
import { PANEL_KEYBOARD_STEP, PanelWidthLimits, clampPanelWidth } from '../../utils/panelWidth';

type PanelResizerProps = {
  panelRef: RefObject<HTMLElement>;
  /** Край панели, за который тянут: Right — у левой панели, Left — у правой. */
  edge: 'Left' | 'Right';
  limits: PanelWidthLimits;
  label: string;
  width?: number;
  onChange: (width: number | undefined) => void;
};
export function PanelResizer({
  panelRef,
  edge,
  limits,
  label,
  width,
  onChange,
}: PanelResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number; width: number; inline: string }>();
  // Dragging the left edge to the left widens the panel.
  const direction = edge === 'Left' ? -1 : 1;

  const currentWidth = () => panelRef.current?.getBoundingClientRect().width ?? width ?? 0;
  // During a drag the width goes straight to the DOM so the panel content does not re-render.
  const setInlineWidth = (value: string) => {
    const panel = panelRef.current;
    if (panel) panel.style.width = value;
  };

  const handlePointerDown = (evt: PointerEvent<HTMLDivElement>) => {
    if (evt.button !== 0) return;
    evt.preventDefault();
    evt.currentTarget.setPointerCapture(evt.pointerId);
    const startWidth = currentWidth();
    drag.current = {
      startX: evt.clientX,
      startWidth,
      width: startWidth,
      inline: panelRef.current?.style.width ?? '',
    };
  };
  const handlePointerMove = (evt: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    state.width = clampPanelWidth(
      state.startWidth + direction * (evt.clientX - state.startX),
      window.innerWidth,
      limits
    );
    setInlineWidth(`${state.width}px`);
  };
  const handlePointerEnd = () => {
    const state = drag.current;
    if (!state) return;
    drag.current = undefined;
    // Hand the width back to React, which applies the saved value with the viewport cap.
    setInlineWidth(state.inline);
    if (state.width !== state.startWidth) onChange(state.width);
  };
  const handleKeyDown = (evt: KeyboardEvent<HTMLDivElement>) => {
    if (evt.key !== 'ArrowLeft' && evt.key !== 'ArrowRight') return;
    evt.preventDefault();
    const step = (evt.key === 'ArrowLeft' ? -1 : 1) * direction * PANEL_KEYBOARD_STEP;
    onChange(clampPanelWidth(currentWidth() + step, window.innerWidth, limits));
  };

  return (
    // A focusable separator is the WAI-ARIA window splitter pattern; the plugin treats separator as static.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/role-supports-aria-props
    <div
      className={css.PanelResizer({ edge })}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={width}
      title="Потяните, чтобы изменить ширину. Двойной щелчок — ширина по умолчанию"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={() => onChange(undefined)}
      onKeyDown={handleKeyDown}
    />
  );
}
