import { lightTheme } from 'folds';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onDarkFontWeight, onLightFontWeight } from '../../config.css';
import {
  butterTheme,
  darkTheme,
  silverTheme,
  telegramDarkTheme,
  telegramTheme,
} from '../../colors.css';
import { telegramDarkVars, telegramLightVars } from '../styles/telegramTheme.css';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';

export enum ThemeKind {
  Light = 'light',
  Dark = 'dark',
}

export type Theme = {
  id: string;
  kind: ThemeKind;
  classNames: string[];
};

export const LightTheme: Theme = {
  id: 'light-theme',
  kind: ThemeKind.Light,
  classNames: [lightTheme, onLightFontWeight, 'prism-light'],
};

export const SilverTheme: Theme = {
  id: 'silver-theme',
  kind: ThemeKind.Light,
  classNames: ['silver-theme', silverTheme, onLightFontWeight, 'prism-light'],
};
export const TelegramTheme: Theme = {
  id: 'telegram-theme',
  kind: ThemeKind.Light,
  classNames: [
    'telegram-theme',
    telegramTheme,
    telegramLightVars,
    onLightFontWeight,
    'prism-light',
  ],
};
export const TelegramDarkTheme: Theme = {
  id: 'telegram-dark-theme',
  kind: ThemeKind.Dark,
  classNames: [
    'dark-theme',
    'telegram-theme',
    'telegram-dark-theme',
    telegramDarkTheme,
    telegramDarkVars,
    onDarkFontWeight,
    'prism-dark',
  ],
};

/** Both Telegram themes share the `telegram-theme` layout and differ only in colors. */
export const isTelegramTheme = (theme: Theme): boolean =>
  theme.id === TelegramTheme.id || theme.id === TelegramDarkTheme.id;
export const DarkTheme: Theme = {
  id: 'dark-theme',
  kind: ThemeKind.Dark,
  classNames: ['dark-theme', darkTheme, onDarkFontWeight, 'prism-dark'],
};
export const ButterTheme: Theme = {
  id: 'butter-theme',
  kind: ThemeKind.Dark,
  classNames: ['butter-theme', butterTheme, onDarkFontWeight, 'prism-dark'],
};

export const useThemes = (): Theme[] => {
  const themes: Theme[] = useMemo(
    () => [LightTheme, SilverTheme, TelegramTheme, DarkTheme, ButterTheme, TelegramDarkTheme],
    []
  );

  return themes;
};

export const useThemeNames = (): Record<string, string> =>
  useMemo(
    () => ({
      [LightTheme.id]: 'Светлая',
      [SilverTheme.id]: 'Серебристая',
      [TelegramTheme.id]: 'Телеграм',
      [TelegramDarkTheme.id]: 'Телеграм тёмная',
      [DarkTheme.id]: 'Тёмная',
      [ButterTheme.id]: 'Тёплая',
    }),
    []
  );

export const useSystemThemeKind = (): ThemeKind => {
  const darkModeQueryList = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [themeKind, setThemeKind] = useState<ThemeKind>(
    darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light
  );

  useEffect(() => {
    const handleMediaQueryChange = () => {
      setThemeKind(darkModeQueryList.matches ? ThemeKind.Dark : ThemeKind.Light);
    };

    darkModeQueryList.addEventListener('change', handleMediaQueryChange);
    return () => {
      darkModeQueryList.removeEventListener('change', handleMediaQueryChange);
    };
  }, [darkModeQueryList, setThemeKind]);

  return themeKind;
};

export const useActiveTheme = (): Theme => {
  const systemThemeKind = useSystemThemeKind();
  const themes = useThemes();
  const [systemTheme] = useSetting(settingsAtom, 'useSystemTheme');
  const [themeId] = useSetting(settingsAtom, 'themeId');
  const [lightThemeId] = useSetting(settingsAtom, 'lightThemeId');
  const [darkThemeId] = useSetting(settingsAtom, 'darkThemeId');

  if (!systemTheme) {
    const selectedTheme = themes.find((theme) => theme.id === themeId) ?? LightTheme;

    return selectedTheme;
  }

  const selectedTheme =
    systemThemeKind === ThemeKind.Dark
      ? themes.find((theme) => theme.id === darkThemeId) ?? DarkTheme
      : themes.find((theme) => theme.id === lightThemeId) ?? LightTheme;

  return selectedTheme;
};

const ThemeContext = createContext<Theme | null>(null);
export const ThemeContextProvider = ThemeContext.Provider;

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('No theme provided!');
  }

  return theme;
};
