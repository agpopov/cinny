import { atom } from 'jotai';

/**
 * Открыто ли окно настроек пользователя и на какой странице.
 * Страница — значение enum SettingsPages (features/settings), хранится числом,
 * чтобы не тянуть модуль настроек в состояние.
 */
export type UserSettingsModalState = { page?: number } | undefined;

export const userSettingsModalAtom = atom<UserSettingsModalState>(undefined);
