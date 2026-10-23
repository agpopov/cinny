import { t } from 'i18next';
import { useMemo } from 'react';
import { EmojiGroupId } from '../../plugins/emoji';

export type IEmojiGroupLabels = Record<EmojiGroupId, string>;

export const useEmojiGroupLabels = (): IEmojiGroupLabels =>
  useMemo(
    () => ({
      [EmojiGroupId.People]: t('Smileys & People'),
      [EmojiGroupId.Nature]: t('Animals & Nature'),
      [EmojiGroupId.Food]: t('Food & Drinks'),
      [EmojiGroupId.Activity]: t('Activity'),
      [EmojiGroupId.Travel]: t('Travel & Places'),
      [EmojiGroupId.Object]: t('Objects'),
      [EmojiGroupId.Symbol]: t('Symbols'),
      [EmojiGroupId.Flag]: t('Flags'),
    }),
    []
  );
