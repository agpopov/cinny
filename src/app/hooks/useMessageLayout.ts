import { useMemo } from 'react';
import { MessageLayout } from '../state/settings';

export type MessageLayoutItem = {
  name: string;
  layout: MessageLayout;
};

export const useMessageLayoutItems = (): MessageLayoutItem[] =>
  useMemo(
    () => [
      {
        layout: MessageLayout.Modern,
        name: 'Современный',
      },
      {
        layout: MessageLayout.Compact,
        name: 'Компактный',
      },
      {
        layout: MessageLayout.Bubble,
        name: 'Пузыри',
      },
    ],
    []
  );
