import { Settings } from '../state/settings';
import { DndMode } from './desktop';

export const DND_FOREVER = -1;

type DndSettings = Pick<
  Settings,
  'dndUntil' | 'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd' | 'quietHoursWeekends'
>;

const parseTime = (value: string): number | undefined => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return undefined;
  return h * 60 + m;
};

/** Попадает ли момент `now` в тихие часы по расписанию. */
export const inQuietHours = (settings: DndSettings, now = new Date()): boolean => {
  if (!settings.quietHoursEnabled) return false;
  const day = now.getDay();
  if (settings.quietHoursWeekends && (day === 0 || day === 6)) return true;

  const start = parseTime(settings.quietHoursStart);
  const end = parseTime(settings.quietHoursEnd);
  if (start === undefined || end === undefined || start === end) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  // Интервал может переходить через полночь (например, 19:00–09:00).
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
};

/** Включён ли ручной режим «Не беспокоить». */
export const manualDndActive = (dndUntil: number, now = Date.now()): boolean =>
  dndUntil === DND_FOREVER || dndUntil > now;

/** Итоговое состояние: ручной режим или тихие часы. */
export const isDndActive = (settings: DndSettings, now = new Date()): boolean =>
  manualDndActive(settings.dndUntil, now.getTime()) || inQuietHours(settings, now);

export const dndUntilFromMode = (mode: DndMode, now = new Date()): number => {
  switch (mode) {
    case 'off':
      return 0;
    case '1h':
      return now.getTime() + 60 * 60 * 1000;
    case '8h':
      return now.getTime() + 8 * 60 * 60 * 1000;
    case 'tomorrow': {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      return t.getTime();
    }
    case 'forever':
      return DND_FOREVER;
    default:
      return 0;
  }
};

const pad = (n: number) => n.toString().padStart(2, '0');

/** Человекочитаемое описание текущего режима. */
export const describeDnd = (settings: DndSettings, now = new Date()): string | undefined => {
  const { dndUntil } = settings;
  if (dndUntil === DND_FOREVER) return 'Включён, пока не выключите';
  if (dndUntil > now.getTime()) {
    const until = new Date(dndUntil);
    const sameDay = until.toDateString() === now.toDateString();
    const time = `${pad(until.getHours())}:${pad(until.getMinutes())}`;
    return sameDay
      ? `Включён до ${time}`
      : `Включён до ${until.toLocaleDateString('ru-RU')} ${time}`;
  }
  if (inQuietHours(settings, now)) return 'Тихие часы по расписанию';
  return undefined;
};
