import { atom } from 'jotai';

const STORAGE_KEY = 'settings';
export type DateFormat =
  | 'D MMM YYYY'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY/MM/DD'
  | 'YYYY-MM-DD'
  | '';
export type MessageSpacing = '0' | '100' | '200' | '300' | '400' | '500';
export enum MessageLayout {
  Modern = 0,
  Compact = 1,
  Bubble = 2,
}

export interface Settings {
  themeId?: string;
  useSystemTheme: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  monochromeMode?: boolean;
  isMarkdown: boolean;
  editorToolbar: boolean;
  twitterEmoji: boolean;
  pageZoom: number;
  hideActivity: boolean;

  isPeopleDrawer: boolean;
  memberSortFilterIndex: number;
  enterForNewline: boolean;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  mediaAutoLoad: boolean;
  urlPreview: boolean;
  encUrlPreview: boolean;
  showHiddenEvents: boolean;
  legacyUsernameColor: boolean;

  /** Показывать активные треды под комнатами в списке слева. */
  showThreadsInNav: boolean;
  /** Ширина списка чатов в px; без значения действует ширина темы. */
  navWidth?: number;
  /** Ширина боковых панелей тредов и участников в px; без значения — по умолчанию. */
  threadPanelWidth?: number;
  membersDrawerWidth?: number;

  showNotifications: boolean;
  isNotificationSounds: boolean;
  /** Показывать текст сообщения в системном уведомлении. */
  notificationShowContent: boolean;
  /** Громкость звука уведомлений, 0–100. */
  notificationVolume: number;
  /** Звук только для упоминаний и личных сообщений. */
  notificationSoundMentionsOnly: boolean;
  /**
   * Режим «Не беспокоить»: 0 — выключен, -1 — до ручного выключения,
   * иначе — отметка времени (мс), до которой режим активен.
   */
  dndUntil: number;
  /** В режиме «Не беспокоить» всё равно уведомлять об упоминаниях. */
  dndAllowMentions: boolean;
  /** Разрешить входящим звонкам обходить DND и тихие часы. */
  dndAllowCalls: boolean;
  /** Тихие часы по расписанию. */
  quietHoursEnabled: boolean;
  /** Начало и конец тихих часов, «ЧЧ:ММ». */
  quietHoursStart: string;
  quietHoursEnd: string;
  /** Тихие часы весь день в субботу и воскресенье. */
  quietHoursWeekends: boolean;

  hour24Clock: boolean;
  dateFormatString: string;

  developerTools: boolean;
}

const defaultSettings: Settings = {
  themeId: undefined,
  useSystemTheme: true,
  lightThemeId: undefined,
  darkThemeId: undefined,
  monochromeMode: false,
  isMarkdown: true,
  editorToolbar: false,
  twitterEmoji: false,
  pageZoom: 100,
  hideActivity: false,

  isPeopleDrawer: true,
  memberSortFilterIndex: 0,
  enterForNewline: false,
  messageLayout: 0,
  messageSpacing: '400',
  hideMembershipEvents: false,
  hideNickAvatarEvents: true,
  mediaAutoLoad: true,
  urlPreview: true,
  encUrlPreview: false,
  showHiddenEvents: false,
  legacyUsernameColor: false,

  showThreadsInNav: true,

  showNotifications: true,
  isNotificationSounds: true,
  notificationShowContent: true,
  notificationVolume: 70,
  notificationSoundMentionsOnly: false,
  dndUntil: 0,
  dndAllowMentions: false,
  dndAllowCalls: false,
  quietHoursEnabled: false,
  quietHoursStart: '19:00',
  quietHoursEnd: '09:00',
  quietHoursWeekends: false,

  hour24Clock: true,
  dateFormatString: 'D MMM YYYY',

  developerTools: false,
};

export const getSettings = () => {
  try {
    const settings = localStorage.getItem(STORAGE_KEY);
    if (settings === null) return defaultSettings;
    const stored: unknown = JSON.parse(settings);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaultSettings;
    return {
      ...defaultSettings,
      ...(stored as Partial<Settings>),
    };
  } catch {
    return defaultSettings;
  }
};

export const setSettings = (settings: Settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const baseSettings = atom<Settings>(getSettings());
export const settingsAtom = atom<Settings, [Settings], undefined>(
  (get) => get(baseSettings),
  (get, set, update) => {
    set(baseSettings, update);
    setSettings(update);
  }
);
