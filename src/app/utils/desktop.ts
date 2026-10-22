/**
 * Мост к десктопной обёртке (Cinny Desktop на Tauri).
 *
 * В браузере все функции безопасно ничего не делают: `isDesktopApp()` вернёт false.
 * Команды реализованы в `src-tauri/src/desktop.rs` репозитория cinny-desktop.
 */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const isNativeApp = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

/** Android uses native notifications but has no tray or desktop autostart. */
export const isMobileApp = (): boolean =>
  isNativeApp() && /Android|iPhone|iPad/i.test(navigator.userAgent);
export const isDesktopApp = (): boolean => isNativeApp() && !isMobileApp();

export const nativeNotificationPermission = async (request = false): Promise<PermissionState> => {
  if (!isMobileApp()) return 'granted';
  const permission = await invoke<PermissionState | 'prompt-with-rationale'>(
    'native_notification_permission',
    { request }
  );
  return permission === 'prompt-with-rationale' ? 'prompt' : permission;
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

export const desktopSetUnread = (
  total: number,
  highlight: boolean,
  badge?: string,
  hasUnread = total > 0
) => invoke<void>('desktop_set_unread', { payload: { total, highlight, badge, hasUnread } });

export const desktopSetDnd = (active: boolean) => invoke<void>('desktop_set_dnd', { active });

export const desktopGetSettings = () => invoke<DesktopSettings>('desktop_get_settings');

export const desktopSetSettings = (patch: DesktopSettingsPatch) =>
  invoke<DesktopSettings>('desktop_set_settings', { patch });

export const desktopShowWindow = () => invoke<void>('desktop_show_window');

export const onDesktopEvent = async <T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> => {
  if (!isMobileApp()) return listen<T>(event, (e) => handler(e.payload));
  if (event !== DesktopEvent.NotificationClick) return () => undefined;
  let active = true;
  let pending = false;
  const consume = async () => {
    if (!active || pending || document.visibilityState === 'hidden') return;
    pending = true;
    try {
      const target = await invoke<NotificationTarget>('mobile_take_notification_target');
      if (active && typeof target?.roomId === 'string') handler(target as T);
    } finally {
      pending = false;
    }
  };
  const refresh = () => {
    consume().catch(() => undefined);
  };
  // Native Android retains the destination across cold start and sign-in.
  // Reading it after the authenticated UI mounts avoids losing early tap events.
  const timer = window.setInterval(refresh, 1000);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  refresh();
  return () => {
    active = false;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
  };
};

/** Убирает префикс `data:image/png;base64,`. */
export const stripDataUrl = (dataUrl: string): string => {
  const i = dataUrl.indexOf(',');
  return i === -1 ? dataUrl : dataUrl.slice(i + 1);
};
