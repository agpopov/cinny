import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Direction,
  MatrixClient,
  MatrixEvent,
  NotificationCountType,
  Room,
  RoomEvent,
  Thread,
  ThreadEvent,
} from 'matrix-js-sdk';
import { isFollowedThread } from '../../../utils/room';
import { getEventPreviewText, getSenderName } from '../../../utils/notificationContent';

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const formatReplyCount = (n: number) => `${n} ${pluralRu(n, 'ответ', 'ответа', 'ответов')}`;

export const formatThreadCount = (n: number) => `${n} ${pluralRu(n, 'тред', 'треда', 'тредов')}`;

const pad = (n: number) => n.toString().padStart(2, '0');

/** «только что», «5 мин назад», «вчера в 14:30», «12.10.2026». */
export const formatRelativeTime = (ts: number, now = Date.now()): string => {
  const diff = Math.max(0, now - ts);
  const minute = 60 * 1000;
  if (diff < minute) return 'только что';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} мин назад`;

  const date = new Date(ts);
  const current = new Date(now);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === current.toDateString()) return `сегодня в ${time}`;
  const yesterday = new Date(current);
  yesterday.setDate(current.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `вчера в ${time}`;
  return date.toLocaleDateString('ru-RU');
};

/** Перерисовка при любых изменениях треда (новые ответы, загрузка, прочтение). */
export const useThreadVersion = (room: Room, thread: Thread | undefined): number => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!thread) return undefined;
    const bump = () => setVersion((v) => v + 1);
    const handleRoomEvent = (_e: unknown, threadId?: string) => {
      if (threadId === undefined || threadId === thread.id) bump();
    };
    thread.on(ThreadEvent.Update, bump);
    thread.on(ThreadEvent.NewReply, bump);
    thread.on(RoomEvent.Timeline, bump);
    room.on(RoomEvent.UnreadNotifications, handleRoomEvent);
    room.on(RoomEvent.Receipt, bump);
    return () => {
      thread.removeListener(ThreadEvent.Update, bump);
      thread.removeListener(ThreadEvent.NewReply, bump);
      thread.removeListener(RoomEvent.Timeline, bump);
      room.removeListener(RoomEvent.UnreadNotifications, handleRoomEvent);
      room.removeListener(RoomEvent.Receipt, bump);
    };
  }, [room, thread]);
  return version;
};

export type ThreadUnread = {
  /** Есть непрочитанные ответы. */
  unread: boolean;
  /** Число уведомлений (по правилам push). */
  count: number;
  /** Есть упоминания. */
  highlight: boolean;
};

export const getThreadUnread = (mx: MatrixClient, room: Room, thread: Thread): ThreadUnread => {
  const count = room.getThreadUnreadNotificationCount(thread.id, NotificationCountType.Total);
  const highlightCount = room.getThreadUnreadNotificationCount(
    thread.id,
    NotificationCountType.Highlight
  );
  const lastReply = thread.replyToEvent;
  const myUserId = mx.getSafeUserId();
  const unreadByReceipt =
    !!lastReply &&
    lastReply.getSender() !== myUserId &&
    !thread.hasUserReadEvent(myUserId, lastReply.getId() ?? '');
  return {
    unread: count > 0 || highlightCount > 0 || unreadByReceipt,
    count: Math.max(count, highlightCount),
    highlight: highlightCount > 0,
  };
};

/** Последняя активность в треде — для сортировки списка. */
export const getThreadLastActivity = (thread: Thread): number =>
  thread.replyToEvent?.getTs() ?? thread.rootEvent?.getTs() ?? 0;

export type ThreadLastReply = {
  senderId: string;
  senderName: string;
  text: string;
  ts: number;
};

export const getThreadLastReply = (room: Room, thread: Thread): ThreadLastReply | undefined => {
  const last: MatrixEvent | null = thread.replyToEvent;
  if (!last || last.getId() === thread.id) return undefined;
  const senderId = last.getSender() ?? '';
  return {
    senderId,
    senderName: getSenderName(room, senderId),
    text: last.isRedacted() ? 'Сообщение удалено' : getEventPreviewText(last),
    ts: last.getTs(),
  };
};

/** Подписка на список тредов комнаты (создание, новые ответы, удаление). */
export const useRoomThreads = (room: Room): Thread[] => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    room.on(ThreadEvent.New, bump);
    room.on(ThreadEvent.Update, bump);
    room.on(ThreadEvent.NewReply, bump);
    room.on(ThreadEvent.Delete, bump);
    room.on(RoomEvent.UnreadNotifications, bump);
    room.on(RoomEvent.Receipt, bump);
    return () => {
      room.removeListener(ThreadEvent.New, bump);
      room.removeListener(ThreadEvent.Update, bump);
      room.removeListener(ThreadEvent.NewReply, bump);
      room.removeListener(ThreadEvent.Delete, bump);
      room.removeListener(RoomEvent.UnreadNotifications, bump);
      room.removeListener(RoomEvent.Receipt, bump);
    };
  }, [room]);

  return useMemo(
    () =>
      room
        .getThreads()
        .filter((thread) => !!thread.rootEvent)
        .sort((a, b) => getThreadLastActivity(b) - getThreadLastActivity(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, version]
  );
};

/** Сколько отслеживаемых тредов комнаты с непрочитанным (для значка в шапке). */
export const useUnreadFollowedThreads = (mx: MatrixClient, room: Room) => {
  const threads = useRoomThreads(room);
  return useMemo(() => {
    let unread = 0;
    let highlight = false;
    threads.forEach((thread) => {
      const info = getThreadUnread(mx, room, thread);
      if (!info.unread) return;
      if (info.highlight) highlight = true;
      if (info.highlight || isFollowedThread(room, thread)) unread += 1;
    });
    return { unread, highlight };
  }, [mx, room, threads]);
};

/**
 * Загрузка списка тредов с сервера (все треды комнаты, а не только известные клиенту).
 */
const threadsListTimeline = (room: Room) => room.threadsTimelineSets[0]?.getLiveTimeline();

export const useFetchRoomThreads = (mx: MatrixClient, room: Room) => {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [canLoadMore, setCanLoadMore] = useState(false);

  const updateCanLoadMore = useCallback(() => {
    const timeline = threadsListTimeline(room);
    setCanLoadMore(!!timeline?.getPaginationToken(Direction.Backward));
  }, [room]);

  const load = useCallback(async () => {
    setState('loading');
    try {
      await room.createThreadsTimelineSets();
      await room.fetchRoomThreads();
      setState('done');
    } catch {
      setState('error');
    }
    updateCanLoadMore();
  }, [room, updateCanLoadMore]);

  const loadMore = useCallback(async () => {
    const timeline = threadsListTimeline(room);
    if (!timeline) return;
    setState('loading');
    try {
      await mx.paginateEventTimeline(timeline, { backwards: true, limit: 30 });
      setState('done');
    } catch {
      setState('error');
    }
    updateCanLoadMore();
  }, [mx, room, updateCanLoadMore]);

  useEffect(() => {
    load();
  }, [load]);

  return { state, reload: load, loadMore, canLoadMore };
};
