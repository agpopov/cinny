import { useMemo } from 'react';
import { MessageSpacing } from '../state/settings';

export type MessageSpacingItem = {
  name: string;
  spacing: MessageSpacing;
};

export const useMessageSpacingItems = (): MessageSpacingItem[] =>
  useMemo(
    () => [
      {
        spacing: '0',
        name: 'Нет',
      },
      {
        spacing: '100',
        name: 'Минимальное',
      },
      {
        spacing: '200',
        name: 'Очень маленькое',
      },
      {
        spacing: '300',
        name: 'Маленькое',
      },
      {
        spacing: '400',
        name: 'Обычное',
      },
      {
        spacing: '500',
        name: 'Большое',
      },
    ],
    []
  );
