import { PrimitiveAtom, atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/** Что открыто в боковой панели тредов комнаты. */
export type ThreadPanelState =
  | { view: 'list' }
  | {
      view: 'thread';
      rootId: string;
      /** Сообщение внутри треда, к которому нужно прокрутить. */
      eventId?: string;
      /** Откуда открыли: из списка тредов (показывать «назад») или из ленты. */
      fromList?: boolean;
    };

export const roomIdToThreadPanelAtomFamily = atomFamily<
  string,
  PrimitiveAtom<ThreadPanelState | undefined>
>(() => atom<ThreadPanelState | undefined>(undefined));

export type ThreadListFilter = 'all' | 'mine';
export const threadListFilterAtom = atom<ThreadListFilter>('all');

/** Ключ черновиков для поля ввода треда (сообщение, ответ, вложения). */
export const getThreadDraftKey = (roomId: string, threadId: string) =>
  `${roomId}#thread#${threadId}`;
