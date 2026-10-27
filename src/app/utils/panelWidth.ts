// Пределы ширины панелей, которую пользователь задаёт перетаскиванием края.
export type PanelWidthLimits = {
  min: number;
  max: number;
};

export const NAV_WIDTH: PanelWidthLimits = { min: 220, max: 520 };
export const THREAD_PANEL_WIDTH: PanelWidthLimits = { min: 320, max: 800 };
export const MEMBERS_DRAWER_WIDTH: PanelWidthLimits = { min: 220, max: 480 };

/** Панель не занимает больше этой доли окна, чтобы не вытеснять ленту. */
export const PANEL_MAX_VIEWPORT_SHARE = 0.4;
export const PANEL_KEYBOARD_STEP = 16;

export const clampPanelWidth = (
  width: number,
  viewportWidth: number,
  limits: PanelWidthLimits
): number => {
  const max = Math.max(limits.min, Math.min(limits.max, viewportWidth * PANEL_MAX_VIEWPORT_SHARE));
  return Math.round(Math.min(max, Math.max(limits.min, width)));
};

/** Inline-стиль для сохранённой ширины; без значения действует ширина из CSS. */
export const panelWidthStyle = (width: number | undefined, limits: PanelWidthLimits) =>
  width === undefined
    ? undefined
    : {
        width: `min(${width}px, ${PANEL_MAX_VIEWPORT_SHARE * 100}vw)`,
        minWidth: limits.min,
        maxWidth: 'none',
      };
