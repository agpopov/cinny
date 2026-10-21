/**
 * Мост к десктопной обёртке (Cinny Desktop на Tauri).
 *
 * В браузере все функции безопасно ничего не делают: `isDesktopApp()` вернёт false.
 * Команды реализованы в `src-tauri/src/desktop.rs` репозитория cinny-desktop.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export const isDesktopApp = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

export type NotificationTarget = {
  roomId: string;
  eventId?: string;
  threadId?: string;
};

export type DesktopNotifyPayload = {
  title: string;
  body: string;
  attribution?: string;
  /** PNG в base64 без префикса `data:`. */
  icon?: string;
  iconKey?: string;
  target: NotificationTarget;
};

export type DesktopSettings = {
  closeToTray: boolean;
  startMinimized: boolean;
  autostart: boolean;
  platform: string;
};

export type DesktopSettingsPatch = Partial<Omit<DesktopSettings, 'platform'>>;

export type DndMode = 'off' | '1h' | '8h' | 'tomorrow' | 'forever';

export const DesktopEvent = {
  NotificationClick: 'desktop://notification-click',
  Dnd: 'desktop://dnd',
  OpenSettings: 'desktop://open-settings',
} as const;

export const desktopNotify = (payload: DesktopNotifyPayload) =>
  invoke<void>('desktop_notify', { payload });

export const desktopSetUnread = (total: number, highlight: boolean, badge?: string) =>
  invoke<void>('desktop_set_unread', { payload: { total, highlight, badge } });

export const desktopSetDnd = (active: boolean) => invoke<void>('desktop_set_dnd', { active });

export const desktopGetSettings = () => invoke<DesktopSettings>('desktop_get_settings');

export const desktopSetSettings = (patch: DesktopSettingsPatch) =>
  invoke<DesktopSettings>('desktop_set_settings', { patch });

export const desktopShowWindow = () => invoke<void>('desktop_show_window');

export const onDesktopEvent = <T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> => listen<T>(event, (e) => handler(e.payload));

/** Убирает префикс `data:image/png;base64,`. */
export const stripDataUrl = (dataUrl: string): string => {
  const i = dataUrl.indexOf(',');
  return i === -1 ? dataUrl : dataUrl.slice(i + 1);
};
