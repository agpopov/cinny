import type { Settings } from '../state/settings';
import { isDndActive } from './dnd';

export type NoticeKind = 'message' | 'invite' | 'call';

export const notificationPolicy = (
  settings: Settings,
  kind: NoticeKind,
  important = false,
  now = new Date()
) => {
  const bypass =
    kind === 'call'
      ? settings.dndAllowCalls
      : kind === 'message' && important && settings.dndAllowMentions;
  const allowed = !isDndActive(settings, now) || bypass;
  return {
    allowed,
    visual: allowed && settings.showNotifications,
    sound:
      allowed &&
      settings.isNotificationSounds &&
      settings.notificationVolume > 0 &&
      (kind !== 'message' || !settings.notificationSoundMentionsOnly || important),
    volume: Number.isFinite(settings.notificationVolume)
      ? Math.min(100, Math.max(0, settings.notificationVolume)) / 100
      : 0,
  };
};

/** One delayed notification per conversation, with bounded pending work. */
export const createNotificationBatcher = <T>(
  deliver: (value: T, count: number) => void,
  delay = 800,
  merge: ((previous: T, next: T) => T) | undefined = undefined
) => {
  const pending = new Map<
    string,
    { value: T; count: number; timer: ReturnType<typeof setTimeout> }
  >();
  return {
    add(key: string, value: T) {
      const item = pending.get(key);
      if (item) {
        item.value = merge ? merge(item.value, value) : value;
        item.count += 1;
        return;
      }
      if (pending.size >= 100) return;
      const entry = {
        value,
        count: 1,
        timer: setTimeout(() => {
          pending.delete(key);
          deliver(entry.value, entry.count);
        }, delay),
      };
      pending.set(key, entry);
    },
    dispose() {
      pending.forEach((entry) => clearTimeout(entry.timer));
      pending.clear();
    },
  };
};
